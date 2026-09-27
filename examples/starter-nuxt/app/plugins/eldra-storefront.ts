import { defineNuxtPlugin, useRoute, useRouter, useRuntimeConfig } from 'nuxt/app';
import { reactive, watchEffect } from 'vue';
import { createEldraClient } from '@eldrajs/sdk';
import { STOREFRONT_KEY, type StorefrontRoute } from '../storefront/types';
import { createGatewayStorefront } from '../storefront/gateway';

/**
 * The only file under `app/storefront/*`'s orbit that touches Nuxt globals (`useRoute`,
 * `useRouter`, `useRuntimeConfig`) — every block reads `useStorefront()` instead, which never
 * does (design doc §"Storefront source": "the route context ... a block may not read the URL").
 *
 * Builds the `@eldrajs/sdk` commerce client the theme-nuxt module does not create for you — that
 * module only creates `@eldrajs/theme-core`'s CMS/Studio-bridge client (`ELDRA_KEY`'s
 * `EldraContext.client`), a different, unrelated `EldraClient` with no `catalog`/`cart`/`search`/
 * `orders` at all. Reuses the same gateway URL and org id the module already resolved onto
 * `runtimeConfig.public.eldra` (`@eldrajs/theme-nuxt`'s `module.ts`) rather than asking a customer
 * to configure the same two values twice.
 *
 * `formsEndpoint`/`checkoutUrl` are this starter's own optional config — `runtimeConfig.public` is
 * read defensively (not through the module's typed `eldra` key) since a customer may not have
 * declared them in `nuxt.config.ts` yet; see `README.md` for where to add them.
 */
export default defineNuxtPlugin({
  name: 'eldra-storefront',
  setup(nuxtApp) {
    const router = useRouter();
    const activeRoute = useRoute();

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
        for (const [key, value] of Object.entries(activeRoute.query)) {
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

    // Resolved generically off the current path/query until this starter's own commerce page
    // routes land (plan tasks 36–39): `/products/:handle`, `/collections/:handle` and an order
    // status page reading `?token=`/`?q=`/`?page=` — a page can still override `productHandle`/
    // `collectionHandle` with its own field before falling back to this.
    watchEffect(() => {
      const handle = firstOf(activeRoute.params.handle as string | string[] | undefined);
      route.productHandle = activeRoute.path.startsWith('/products/') ? handle : null;
      route.collectionHandle = activeRoute.path.startsWith('/collections/') ? handle : null;
      route.orderToken = firstOf(activeRoute.query.token as string | string[] | undefined);
      route.query = firstOf(activeRoute.query.q as string | string[] | undefined);
      const page = Number(firstOf(activeRoute.query.page as string | string[] | undefined));
      route.page = Number.isFinite(page) && page > 0 ? page : 1;
      route.sort = firstOf(activeRoute.query.sort as string | string[] | undefined);
      route.columns = firstOf(activeRoute.query.columns as string | string[] | undefined);

      const filters: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(activeRoute.query)) {
        if (RESERVED_QUERY_KEYS.has(key) || value === null || value === undefined) continue;
        filters[key] = Array.isArray(value) ? (value as string[]) : [value as string];
      }
      route.filters = filters;
    });

    const publicConfig = useRuntimeConfig().public as unknown as {
      eldra?: { gatewayUrl?: string; orgId?: string };
      formsEndpoint?: string;
      checkoutUrl?: string;
    };

    const client = createEldraClient({
      apiBaseUrl: publicConfig.eldra?.gatewayUrl || undefined,
      orgId: publicConfig.eldra?.orgId || undefined,
    });

    const source = createGatewayStorefront(client, {
      route,
      formsEndpoint: publicConfig.formsEndpoint,
      checkoutUrl: publicConfig.checkoutUrl,
    });

    nuxtApp.vueApp.provide(STOREFRONT_KEY, source);
  },
});
