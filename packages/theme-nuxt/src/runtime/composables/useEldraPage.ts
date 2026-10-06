import { EldraClientError, type EntryDoc } from '@eldrajs/theme-core';
import { useEldra } from '@eldrajs/theme-vue';
import {
  clearNuxtData,
  loadPayload,
  setResponseStatus,
  useAsyncData,
  useRequestEvent,
  useRoute,
  useRouter,
  useRuntimeConfig,
} from 'nuxt/app';
import type { NuxtApp } from 'nuxt/app';
import { computed, getCurrentInstance, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { CatalogRouteRef } from '../catalog';
import { overlayPreviewDrafts } from '../drafts';
import { normalizeLocale } from '../locale';
import {
  localeForPath,
  resolveLocaleRouting,
  resolveStoreLocales,
  stripLocalePrefix,
} from '../locales';
import { isStudioPreviewFrame } from '../origins';
import { EMPTY_ELDRA_ROUTE, resolveEldraRoute, type ResolvedEldraRoute } from '../resolveRoute';
import { canonicalRoutePath } from '../routePath';
import { knownPrerenderedRoutes, prerenderedRoutes } from '../staticRoutes';

/**
 * The async-data key one route's resolution is stored under, in the payload and in
 * `nuxtApp.static.data` alike. The canonical path is the whole key (`../routePath.ts`): a host
 * that answers `/products/x` with a 308 to `/products/x/` must not make the build's answer
 * unreachable under the spelling it served.
 */
const PAGE_KEY_PREFIX = 'eldra-page:';

const routeDataKey = (path: string): string => `${PAGE_KEY_PREFIX}${path}`;

export function useEldraPage(): {
  page: Ref<EntryDoc | null>;
  template: Ref<EntryDoc | null>;
  entry: Ref<EntryDoc | null>;
  catalog: ComputedRef<CatalogRouteRef | null>;
  layout: ComputedRef<unknown | null>;
  blocks: ComputedRef<EntryDoc[]>;
  reusableComponentProjection: ComputedRef<unknown | undefined>;
  links: ComputedRef<ResolvedEldraRoute['links']>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
} {
  const route = useRoute();
  const activePath = createActivePath(route, useRouter());
  /**
   * This render's request, captured **now**, while the Nuxt context is still the current one.
   *
   * `useRequestEvent()` reads `useNuxtApp()`, and the resolution below runs inside an
   * `useAsyncData` handler — after `await`s, where that context is gone unless a site turns
   * `experimental.asyncContext` on. Asking for it there threw out of the `catch` that was reporting
   * the failure, which turned the failure back into an empty resolution: the very not-found shell
   * `reportServerFailure` exists to prevent. `undefined` in the browser.
   */
  const requestEvent = useRequestEvent();
  const ctx = useEldra();
  const cfg = useRuntimeConfig().public.eldra as {
    pageSchema: string;
    routeTemplateSchema: string;
    locale: string | null;
    locales: unknown;
    studioOrigins: string[];
    gatewayUrl: string;
    orgId: string;
  };
  /**
   * How this site's paths and locales line up (`../locales.ts`). Resolved once: the runtime config
   * is baked into the artifact, so it cannot change while a page is open.
   */
  const routing = resolveLocaleRouting(resolveStoreLocales(cfg.locales), cfg.locale);

  /**
   * One request path, split into the locale it names and the path the content is stored at.
   *
   * The **full** path stays the identity everything else keys by — the async-data key, the
   * prerendered-route lookup, the watch — because `/about` and `/is-IS/about` are two routes with
   * two payloads. Only the gateway reads see the stripped path and the locale, because the content
   * is one document: path segments are not translated, so the Icelandic rendering of `/about` is
   * the same entry read with `locale=is-IS`.
   */
  const routeTarget = (path: string): { path: string; locale: string | undefined } => ({
    path: stripLocalePrefix(path, routing),
    locale: localeForPath(path, routing),
  });

  /**
   * The locale this resolution's reads carry.
   *
   * A Studio preview's locale wins: the editor is looking at one locale of a draft and says which,
   * and the preview frame's own path may not name it at all. Otherwise it is the path's — which,
   * for an unprefixed path, is `eldra.locale` and nothing else (a blank one means "no locale",
   * since an empty `?locale=` is a locale the gateway rejects rather than the absence of one).
   */
  const runtimeLocale = (path: string): string | undefined =>
    normalizeLocale(ctx.preview.active ? ctx.preview.locale : null) ?? routeTarget(path).locale;

  /**
   * Whether the build is allowed to answer this route on its own — see `../staticRoutes.ts`.
   *
   * False for anything Studio is looking at: inside an allowed Studio frame the route may be a
   * draft, an unpublished page or a path the deployed artifact has never contained, and the only
   * honest answer is the live one. `preview.active` is the bridge's own confirmation; the frame
   * check is the same question one handshake earlier, so the very first resolution in a preview is
   * dynamic too.
   */
  const buildAnswersRoutes = (): boolean =>
    !ctx.preview.active && !isStudioPreviewFrame(cfg.studioOrigins);

  /**
   * What the **build** already knows about a route, with no round trip of any kind.
   *
   * Two answers live here, and Nuxt calls this synchronously (there is nowhere to await), which is
   * exactly why both have to be synchronous facts rather than requests:
   *
   *  * The prerendered resolution itself. Nuxt's payload plugin loads the destination's
   *    `_payload.json` in `router.beforeResolve` and writes every key in it into
   *    `nuxtApp.static.data` *before* the page component is created
   *    (`nuxt/dist/app/plugins/payload.client.js`), so on a navigation between prerendered routes
   *    the answer is already in memory. Returning it here is what keeps `pending` false: a cached
   *    value makes `useAsyncData` skip the handler outright and start the entry at
   *    `status: 'success'` (`nuxt/dist/app/composables/asyncData.js`, `buildAsyncData`).
   *  * "There is no such route." A path the manifest does not list is not in the artifact, and the
   *    empty route *is* the answer — the theme's not-found shell, rendered in the same tick as the
   *    navigation instead of after five gateway reads that conclude the same thing.
   *
   * The payload branch mirrors Nuxt's own default (`getDefaultCachedData`) deliberately, including
   * skipping it for an explicit refresh; the manifest branch is not a cache and applies whatever
   * the cause.
   */
  const cachedRoute = (
    key: string,
    nuxtApp: NuxtApp,
    context: { cause: string }
  ): ResolvedEldraRoute | undefined => {
    if (context.cause !== 'refresh:manual' && context.cause !== 'refresh:hook') {
      const fromBuild = (
        nuxtApp.isHydrating ? nuxtApp.payload.data[key] : nuxtApp.static.data[key]
      ) as ResolvedEldraRoute | undefined;
      if (fromBuild !== undefined) return fromBuild;
    }
    if (!buildAnswersRoutes()) return undefined;
    const prerendered = knownPrerenderedRoutes();
    if (prerendered === null) return undefined;
    return prerendered.has(key.slice(PAGE_KEY_PREFIX.length)) ? undefined : EMPTY_ELDRA_ROUTE;
  };

  /**
   * How long a 401 on a preview read is held back while the editor is given a
   * chance to mint a fresh preview token. A preview token is one hash per
   * organization, so minting one anywhere else revokes the one this preview is
   * using — and the editor answers `theme:request-failed` by minting again and
   * re-sending `editor:init`, usually within a second. Reporting the first
   * failure immediately replaced the whole page with an error alert for that
   * second, which is what the operator saw: the page gone, only the alert, and
   * (because every keystroke re-reads the drafts) a new alert per keystroke.
   *
   * The grace window is the fallback for an editor that is not going to
   * recover at all — an older Studio, or one that has given up — so a stuck
   * preview still says so instead of quietly serving stale content forever.
   */
  const PREVIEW_AUTH_RECOVERY_GRACE_MS = 10_000;
  /** The first held-back 401 since the last success: which token, and when. */
  let heldPreviewAuthFailure: { tokenRevision: number; at: number } | null = null;

  /**
   * Whether this 401 is still the editor's to fix. The first one is: the token
   * it handed over has been revoked and it has not heard about it yet. A 401
   * that arrives on a *newer* token means the editor already minted and that
   * one was refused too — the retry failed, and the operator has to see it.
   */
  const holdPreviewAuthFailure = (cause: unknown): boolean => {
    if (!ctx.preview.active) return false;
    if (!(cause instanceof EldraClientError) || cause.status !== 401) return false;
    const tokenRevision = ctx.preview.tokenRevision;
    const now = Date.now();
    if (heldPreviewAuthFailure === null) {
      heldPreviewAuthFailure = { tokenRevision, at: now };
      return true;
    }
    if (tokenRevision > heldPreviewAuthFailure.tokenRevision) return false;
    return now - heldPreviewAuthFailure.at <= PREVIEW_AUTH_RECOVERY_GRACE_MS;
  };

  /**
   * A route the server could not resolve must not be answered `200`.
   *
   * `nuxi generate` writes **nothing** for a route whose response is not 200 and names it in the
   * prerender log instead (nitro's prerenderer marks it failed before it reaches `writeFile`), so
   * this is what keeps a page the gateway could not be asked about *out* of the artifact rather
   * than baked into it as the theme's not-found shell under a path a visitor can reach. Set
   * `nitro.prerender.failOnError` to stop the build on it as well.
   *
   * It is deliberately silent for a build with **no credentials at all** (`ELDRA_GATEWAY_URL` /
   * `ELDRA_ORG_ID` unset, the same pair the module tests before it says it is prerendering `/`
   * only): there every route fails by definition, and producing the static shell — the not-found
   * page included — is the whole point of that build.
   */
  const reportServerFailure = (): void => {
    if (!import.meta.server || cfg.gatewayUrl === '' || cfg.orgId === '') return;
    if (requestEvent === undefined) return;
    setResponseStatus(requestEvent, 500, 'Eldra route resolution failed');
  };

  const resolveRouteOutcome = async (): Promise<{
    route: ResolvedEldraRoute;
    /** Keep whatever is on screen: this resolution has no honest answer yet. */
    holdPrevious: boolean;
  }> => {
    const path = activePath();
    // Everything `cachedRoute` answers, asked again with the manifest awaited. It gets here when
    // the manifest had not been read yet — the very first navigation of a page load can outrun it
    // — and when the payload was not in memory, which a prefetch that failed or a payload evicted
    // between navigations both produce. Only then, and only for a route the build does not have,
    // does the gateway hear about it.
    if (buildAnswersRoutes()) {
      const prerendered = await prerenderedRoutes();
      if (prerendered !== null) {
        if (!prerendered.has(path)) return { route: EMPTY_ELDRA_ROUTE, holdPrevious: false };
        const fromBuild = await prerenderedRouteData(path);
        if (fromBuild !== undefined) return { route: fromBuild, holdPrevious: false };
      }
    }
    try {
      const route = await resolveEldraRoute(
        ctx.client,
        cfg,
        routeTarget(path).path,
        runtimeLocale(path)
      );
      heldPreviewAuthFailure = null;
      return { route, holdPrevious: false };
    } catch (cause) {
      if (holdPreviewAuthFailure(cause)) return { route: EMPTY_ELDRA_ROUTE, holdPrevious: true };
      reportServerFailure();
      // The failure is part of the **resolution**, not of this call: see
      // `ResolvedEldraRoute.error`. Returning it here is what lets every other `useEldraPage()`
      // for this route tell "the gateway could not answer" apart from "there is no such page".
      return {
        route: {
          ...EMPTY_ELDRA_ROUTE,
          error: cause instanceof Error ? cause.message : String(cause),
        },
        holdPrevious: false,
      };
    }
  };

  const resolveCurrentRoute = async (): Promise<ResolvedEldraRoute> =>
    (await resolveRouteOutcome()).route;

  const { data: resolvedRoute, pending } = useAsyncData<ResolvedEldraRoute>(
    () => routeDataKey(activePath()),
    resolveCurrentRoute,
    {
      // The same source the key reads, and the **canonical** path in both (`../routePath.ts`): a
      // static host that answers `/products/x` with a 308 to `/products/x/` makes Nuxt re-navigate
      // between the two during hydration, and watching the raw path would make that a route change
      // — a second gateway resolve, `pending` back to true, and the whole block tree torn down and
      // built again while the answer is in flight.
      watch: [() => activePath()],
      default: () => EMPTY_ELDRA_ROUTE,
      getCachedData: cachedRoute,
    }
  );

  const previewResolvedRoute = ref<ResolvedEldraRoute | undefined>(undefined);
  let previewRefreshRequest = 0;
  const resolvePreviewRoute = (): void => {
    if (!ctx.preview.active) return;
    const request = ++previewRefreshRequest;
    const path = activePath();
    const activeKey = routeDataKey(path);
    clearNuxtData((key) => key.startsWith(PAGE_KEY_PREFIX) && key !== activeKey);
    void resolveRouteOutcome().then(({ route, holdPrevious }) => {
      if (request !== previewRefreshRequest || path !== activePath()) return;
      // A held-back 401 (see `holdPreviewAuthFailure`) must not blank the page:
      // what is on screen is the last honest answer, and the editor is about
      // to hand over a fresh token and ask for this resolution again.
      if (holdPrevious) return;
      previewResolvedRoute.value = route;
    });
  };
  watch(() => ctx.preview.refreshRevision, resolvePreviewRoute);
  watch(
    () => ctx.preview.active,
    (active) => {
      if (active) resolvePreviewRoute();
    },
    { immediate: true }
  );
  watch(
    () => activePath(),
    () => {
      previewRefreshRequest += 1;
      previewResolvedRoute.value = undefined;
    }
  );

  const active = computed(
    () => previewResolvedRoute.value ?? resolvedRoute.value ?? EMPTY_ELDRA_ROUTE
  );
  /**
   * Why the resolution on screen has no document, read off the resolution itself rather than
   * remembered by this call — see `ResolvedEldraRoute.error`. `null` for a route that honestly
   * has none, which is what the theme draws its not-found shell for.
   */
  const error = computed<string | null>(() => active.value.error ?? null);
  const page = computed(() => {
    void ctx.preview.revision;
    return overlayPreviewDrafts(
      active.value.page,
      ctx.preview.drafts,
      ctx.preview.draftSchemaApiIds
    );
  });
  const template = computed(() =>
    overlayPreviewDrafts(active.value.template, ctx.preview.drafts, ctx.preview.draftSchemaApiIds)
  );
  const entry = computed(() => overlayEntryDraft(active.value.entry, ctx.preview.drafts));
  const catalog = computed<CatalogRouteRef | null>(() => active.value.catalog);
  // Written into the shared context rather than returned alone, because
  // `useEldraLink()` reads it from there — a block resolves its own links
  // without every theme threading the state down to it. It arrives with the
  // same `useAsyncData` payload the page already carries, so a prerendered page
  // has it before the first render.
  //
  // A resolution with no `links` at all is a payload written by a build that
  // predates this key, which a static host can still be serving; it clears the
  // state rather than throwing, and every link then renders unlinked until the
  // route is resolved again.
  const linkState = computed<ResolvedEldraRoute['links']>(
    () => active.value.links ?? { pages: [], templates: [], targets: new Map() }
  );
  watch(
    linkState,
    (links) => {
      ctx.links.pages = links.pages;
      ctx.links.templates = links.templates;
      ctx.links.targets = links.targets;
    },
    { immediate: true }
  );
  const layout = computed<unknown | null>(
    () => template.value?.data.layout ?? page.value?.data.layout ?? null
  );
  const blocks = computed<EntryDoc[]>(() => {
    const raw = template.value?.data.blocks ?? page.value?.data.blocks;
    return Array.isArray(raw) ? raw.filter(isEntryDoc) : [];
  });
  // Core attaches the projection to whichever document the read returned, and a
  // route resolves exactly one of the two: a static route has a `page` and no
  // `template`, a dynamic one a `template` and no `page`. So this is a fallback
  // and never a merge — `@eldrajs/theme-core`'s expansion refuses a projection
  // carrying a binding the rendered document does not place (`COMPONENT_STALE`),
  // which is what a merged projection would be.
  const reusableComponentProjection = computed<unknown | undefined>(
    () => page.value?.reusableComponentProjection ?? template.value?.reusableComponentProjection
  );

  return {
    page: page as Ref<EntryDoc | null>,
    template: template as Ref<EntryDoc | null>,
    entry: entry as Ref<EntryDoc | null>,
    catalog,
    layout,
    blocks,
    reusableComponentProjection,
    links: linkState,
    pending,
    error: error as Ref<string | null>,
  };
}

/**
 * One prerendered route's resolution, straight out of its `_payload.json`.
 *
 * `loadPayload` is Nuxt's own reader (`nuxt/dist/app/composables/payload`): it checks the manifest
 * itself, fetches `<path>/_payload.json` through the browser cache and revives it with the app's
 * payload revivers, so this is the same value the route's own render was built from. `undefined`
 * whenever it cannot produce one — a payload that failed to load, or one whose keys predate this
 * key — and the caller then falls back to the gateway rather than claiming the page is missing.
 */
async function prerenderedRouteData(path: string): Promise<ResolvedEldraRoute | undefined> {
  try {
    const payload = await loadPayload(path);
    const data = payload?.data as Record<string, unknown> | undefined;
    const value = data?.[routeDataKey(path)];
    return value === undefined ? undefined : (value as ResolvedEldraRoute);
  } catch {
    return undefined;
  }
}

/**
 * The route this call resolves content for, as one reactive getter.
 *
 * It exists because `useRoute()` **inside a package** is not the route the page being created is
 * for. Nuxt hands a page component its own route through an injection whose key is a plain
 * `Symbol()` private to Nuxt's app module (`nuxt/dist/app/components/injections.js`), and a
 * composable shipped in a package does not reach it — `useRoute()` there resolves to
 * `nuxtApp._route`, which `NuxtPage` only syncs **after the destination page's `<Suspense>` has
 * resolved** (`nuxt/dist/pages/runtime/page.js`, `onResolve`: `nuxtApp._route.sync?.()`). A page's
 * blocks are created *inside* that pending branch, so everything in it ran under the route of the
 * page being replaced.
 *
 * That was the whole of the navigation defect: the destination page component resolved the
 * **departing** route, rendered its blocks, ran every storefront read on them again, and only then
 * — one Suspense resolution later — swapped to its own content. Hence the loading flash between
 * two prerendered routes, and the collection reads a click on a product card fired.
 *
 * The router's committed route is what everyone agrees on: `finalizeNavigation` sets it before the
 * destination page renders, and it is one object however many copies of Nuxt's app module a bundle
 * ends up with. So:
 *
 *  * **In a page component** the path is *pinned* to the route the component was created for —
 *    which is exactly the identity `eldraRouteKey` gives `<NuxtPage>`, one page instance per
 *    canonical path. The pin lifts the moment Nuxt's own route agrees with it, and from then on
 *    the lagging route is followed again: that is what keeps a page that is being navigated *away*
 *    from rendering its successor's content for a tick, and it is also why a theme that has not
 *    added the route key yet behaves exactly as it did before rather than freezing.
 *  * **Outside a component** — this composable called from a plugin, for the route context a
 *    storefront hands its blocks — there is no page to pin to and the answer wanted is the
 *    destination, from the moment the navigation is committed.
 */
function createActivePath(
  route: { path: string },
  router: { currentRoute: { value: { path: string } } }
): () => string {
  const committed = (): string => canonicalRoutePath(router.currentRoute.value.path);
  if (getCurrentInstance() === null) return committed;
  let pinned: string | null = committed();
  return () => {
    const settled = canonicalRoutePath(route.path);
    if (pinned === null) return settled;
    if (settled === pinned) {
      pinned = null;
      return settled;
    }
    return pinned;
  };
}

function overlayEntryDraft(
  entry: EntryDoc | null,
  drafts: Readonly<Record<string, Record<string, unknown>>>
): EntryDoc | null {
  if (entry === null) return null;
  const draft = drafts[entry.id];
  return draft === undefined ? entry : { ...entry, data: { ...entry.data, ...draft } };
}

function isEntryDoc(value: unknown): value is EntryDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { data?: unknown }).data === 'object' &&
    (value as { data?: unknown }).data !== null
  );
}
