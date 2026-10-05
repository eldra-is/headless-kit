import { defineNuxtPlugin, useAsyncData, useRouter, useRuntimeConfig } from 'nuxt/app';
import { getCurrentInstance, nextTick, reactive, watchEffect } from 'vue';
import { createEldraClient } from '@eldrajs/sdk';
import {
  STOREFRONT_KEY,
  type StorefrontRoute,
  type StorefrontSource,
  type VolatileSnapshot,
} from '../storefront/types';
import { toStorefrontCommerce } from '../storefront/commerce';
import {
  createGatewayStorefront,
  type StorefrontPrerenderHandle,
  type StorefrontRuntime,
} from '../storefront/gateway';
import { createVolatileRefresher } from '../storefront/refresh';
import {
  prerenderThroughAsyncData,
  type KeyedAsyncData,
  type KeyedAsyncDataOptions,
} from '../storefront/prerender';

/**
 * The only file under `app/storefront/*`'s orbit that touches Nuxt globals (`useRouter`,
 * `useRouter`, `useRuntimeConfig`) — every block reads `useStorefront()` instead, which never
 * does: the route context it exposes is read-only data, and a block may not read the URL itself.
 *
 * Builds the `@eldrajs/sdk` commerce client the theme-nuxt module does not create for you — that
 * module only creates `@eldrajs/theme-core`'s CMS/Studio-bridge client (`ELDRA_KEY`'s
 * `EldraContext.client`), a different, unrelated `EldraClient` with no `catalog`/`cart`/`search`/
 * `orders` at all. Reuses the same gateway URL and org id the module already resolved onto
 * `runtimeConfig.public.eldra` (`@eldrajs/theme-nuxt`'s `module.ts`) rather than asking a customer
 * to configure the same two values twice.
 *
 * `useEldraPage()` is the module's own auto-import (`@eldrajs/theme-nuxt`), called here for one
 * value: `catalog`, the `{ kind, slug }` a catalog-backed route template resolved for this path.
 * It shares Nuxt's `useAsyncData` cache key with `app/pages/[...slug].vue`'s own call, so the page
 * is still resolved once per route.
 *
 * It is also where the storefront's **prerender/refresh runtime** is implemented, for the same
 * reason: both halves are Nuxt's, and `app/storefront/*` may not import Nuxt.
 *
 *   * `prerender` runs a result's first load through `useAsyncData` under a stable key, so
 *     `nuxi generate` awaits it and writes the value into `_payload.json`, and the hydrating
 *     browser reads it back out instead of fetching it again. A result created *after* hydration —
 *     a client navigation, a search as the shopper types — gets `null` and loads live, which is
 *     what it always did.
 *   * `register` collects the page's results into one batched volatile refresh
 *     (`app/storefront/refresh.ts`), fired a tick after the app mounts. Not on the server: a
 *     prerender's values are the freshest there are at the moment it runs.
 *
 * The refresh is scheduled off the app's mount rather than off the plugin, because the commerce
 * blocks are lazily imported components: their `setup()` — and therefore the result they create —
 * can run well after the plugin has finished.
 *
 * `formsEndpoint` is this starter's own optional config — `runtimeConfig.public` is read
 * defensively (not through the module's typed `eldra` key) since a customer may not have declared
 * it in `nuxt.config.ts` yet; see `README.md` for where to add it. There is no checkout URL to
 * configure: the platform hosts the checkout page and the SDK reads where from the platform
 * itself.
 */
export default defineNuxtPlugin({
  name: 'eldra-storefront',
  setup(nuxtApp) {
    const router = useRouter();
    // The router's **committed** route, not `useRoute()`.
    //
    // `useRoute()` is Nuxt's app-level route, and `NuxtPage` syncs that only once the destination
    // page's `<Suspense>` has resolved (`nuxt/dist/pages/runtime/page.js`, `onResolve`). A page's
    // blocks are lazily imported components created *inside* that pending branch, so every
    // storefront result on the page being navigated to would be created under the route context of
    // the page it replaces: a product page whose `productHandle` is still `null` and whose
    // `collectionHandle` is still the collection the shopper clicked from. That is a result keyed
    // differently from the one the build prerendered — so it misses the payload — and then a
    // second, live read the moment the route catches up.
    //
    // `router.currentRoute` is the destination from the moment the navigation is confirmed, which
    // is before any of that happens.
    const activeRoute = router.currentRoute;
    // The catalog object a route template matched, when this path is served by one
    // (`schemaApiId: 'catalog:product' | 'catalog:collection'`); `null` on every other route.
    const { catalog } = useEldraPage();
    // Which content locale this page is — the locale its path prefix names, or the one a Studio
    // preview is driving (`@eldrajs/theme-nuxt`, auto-imported like `useEldraPage`).
    const activeLocale = useEldraLocale();

    function firstOf(value: string | string[] | undefined | null): string | null {
      if (Array.isArray(value)) return value[0] ?? null;
      return value ?? null;
    }

    const route: StorefrontRoute = reactive({
      productHandle: null,
      collectionHandle: null,
      orderToken: null,
      query: null,
      page: 1,
      sort: null,
      columns: null,
      filters: {},
      setQuery(patch: Record<string, string | string[] | null>) {
        const nextQuery: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(activeRoute.value.query)) {
          if (value !== null && value !== undefined) nextQuery[key] = value as string | string[];
        }
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) delete nextQuery[key];
          else nextQuery[key] = value;
        }
        void router.push({ query: nextQuery });
      },
    });

    // Query keys with their own typed `StorefrontRoute` field — everything else lands in
    // `route.filters` (see that field's own doc comment in `types.ts`).
    const RESERVED_QUERY_KEYS = new Set(['q', 'page', 'token', 'sort', 'columns']);

    // Resolved generically off the current path/query since this starter's own commerce page
    // routes are just `/products/:handle`, `/collections/:handle` and an order
    // status page reading `?token=`/`?q=`/`?page=` — a page can still override `productHandle`/
    // `collectionHandle` with its own field before falling back to this.
    //
    // The product/collection handle has two sources, in this order:
    //
    // 1. The catalog route template that matched (`useEldraPage().catalog`). This is the
    //    authoritative one: the template owns its own `routePattern`, so a merchant who seeds or
    //    edits it to `/shop/:slug` still gets `productHandle` set, and the pattern's parameter is
    //    resolved by the same code that loaded the object.
    // 2. The `/products/` / `/collections/` path prefix, for a path this theme serves without a
    //    catalog template behind it — the storefront pages a site has before its first deploy
    //    seeds the templates, and the demo/Storybook routes.
    watchEffect(() => {
      const handle = firstOf(activeRoute.value.params.handle as string | string[] | undefined);
      const match = catalog.value;
      if (match === null) {
        route.productHandle = activeRoute.value.path.startsWith('/products/') ? handle : null;
        route.collectionHandle = activeRoute.value.path.startsWith('/collections/') ? handle : null;
      } else {
        route.productHandle = match.kind === 'product' ? match.slug : null;
        route.collectionHandle = match.kind === 'collection' ? match.slug : null;
      }
      route.orderToken = firstOf(activeRoute.value.query.token as string | string[] | undefined);
      route.query = firstOf(activeRoute.value.query.q as string | string[] | undefined);
      const page = Number(firstOf(activeRoute.value.query.page as string | string[] | undefined));
      route.page = Number.isFinite(page) && page > 0 ? page : 1;
      route.sort = firstOf(activeRoute.value.query.sort as string | string[] | undefined);
      route.columns = firstOf(activeRoute.value.query.columns as string | string[] | undefined);

      const filters: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(activeRoute.value.query)) {
        if (RESERVED_QUERY_KEYS.has(key) || value === null || value === undefined) continue;
        filters[key] = Array.isArray(value) ? (value as string[]) : [value as string];
      }
      route.filters = filters;
    });

    const publicConfig = useRuntimeConfig().public as unknown as {
      eldra?: { gatewayUrl?: string; orgId?: string; commerce?: unknown };
      formsEndpoint?: string;
    };

    const client = createEldraClient({
      apiBaseUrl: publicConfig.eldra?.gatewayUrl || undefined,
      orgId: publicConfig.eldra?.orgId || undefined,
    });

    let source: StorefrontSource | null = null;

    // The blocks' results are created while the app hydrates; the app is mounted once they all
    // are. `nextTick` after that gives every result registered in the same render a seat in the
    // one batch — the point of collecting them at all.
    let mounted = false;
    const afterMount: Array<() => void> = [];
    nuxtApp.hook('app:mounted', () => {
      mounted = true;
      for (const run of afterMount.splice(0)) run();
    });

    const refresher = createVolatileRefresher(
      (ids: string[]): Promise<VolatileSnapshot[]> =>
        source === null ? Promise.resolve([]) : source.catalog.volatileByIds(ids),
      (run) => {
        const schedule = (): void => void nextTick(run);
        if (mounted) schedule();
        else afterMount.push(schedule);
      }
    );

    /**
     * Nuxt's own keyed async data, narrowed to the shape `app/storefront/prerender.ts` works
     * against — which is also where the two options that matter, and why, are written down. The
     * cast is the one thing that needs saying here: `useAsyncData` re-describes its data as
     * `PickFrom<T, KeysOf<T>>` for its `pick` option, which tells this caller nothing it does not
     * already know — the value is whatever the load returned.
     */
    function keyedAsyncData<T>(
      key: string,
      load: () => Promise<T | null>,
      options: KeyedAsyncDataOptions
    ): KeyedAsyncData<T> {
      const handle = useAsyncData<T | null>(key, load, options);
      return {
        data: handle.data as unknown as { value: T | null | undefined },
        error: handle.error,
        status: handle.status,
        execute: () => handle.execute(),
        settled: handle,
      };
    }

    const runtime: StorefrontRuntime = {
      prerender<T>(
        key: string,
        load: () => Promise<T | null>
      ): StorefrontPrerenderHandle<T> | null {
        // `useAsyncData` outside a component's `setup()` has no server-prefetch to register on.
        if (getCurrentInstance() === null) return null;
        // After hydration, only when the build actually answered this key. Nuxt's payload plugin
        // loads the destination's `_payload.json` in `router.beforeResolve` and writes every key in
        // it into `nuxtApp.static.data` before the page component exists
        // (`nuxt/dist/app/plugins/payload.client.js`), so on a navigation to a **prerendered**
        // route the answer this result wants is already in memory — reading it back is what makes
        // a client navigation land on real prices instead of a skeleton, and what leaves the page
        // with the same one batched volatile refresh a hard load makes.
        //
        // A key that is not there is a route the build does not have (a preview, a dev server) or
        // a result the build could not know about (a search as the shopper types): it loads live,
        // exactly as it always did, and stays out of the volatile refresh because it has just read
        // the live values itself (`app/storefront/gateway.ts`'s `ranUnderPrerender`).
        if (import.meta.client && !nuxtApp.isHydrating && !(key in nuxtApp.static.data))
          return null;
        return prerenderThroughAsyncData<T>(keyedAsyncData, key, load);
      },
      // Only the browser refreshes: on the server the read that just ran *is* the live value.
      register: import.meta.client ? (entry) => refresher.register(entry) : undefined,
    };

    source = createGatewayStorefront(client, {
      route,
      // What the store sells in, as the platform published it — the module read it once during the
      // build (`@eldrajs/theme-nuxt`), so a prerendered page already has it. `app/plugins/
      // eldra-ui-messages.ts` provides the currency half to `@eldrajs/ui`; this puts the whole
      // record on `useStorefront()` for the blocks that need the tax-inclusive flag.
      commerce: toStorefrontCommerce(publicConfig.eldra?.commerce),
      // The page's own content locale, read fresh on every call so it follows a language switch.
      // Every catalog, search and order read carries it, and it is part of each result's cache key
      // — see `withContentLocale` in `app/storefront/gateway.ts`. `undefined` on a single-locale
      // store, which is what every read sent before locales existed.
      locale: () => activeLocale.active ?? undefined,
      formsEndpoint: publicConfig.formsEndpoint,
      runtime,
    });

    nuxtApp.vueApp.provide(STOREFRONT_KEY, source);
  },
});
