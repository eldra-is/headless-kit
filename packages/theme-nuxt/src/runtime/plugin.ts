import {
  createEldraClient,
  normalizeThemeDesignTokens,
  type EldraRetryOptions,
} from '@eldrajs/theme-core';
import {
  ELDRA_KEY,
  createEldraLinkState,
  createEldraPreviewState,
  registerBlockFields,
  startEldraPreview,
  type EldraContext,
} from '@eldrajs/theme-vue';
import {
  clearNuxtData,
  defineNuxtPlugin,
  injectHead,
  refreshNuxtData,
  useHead,
  useRuntimeConfig,
  useState,
} from 'nuxt/app';
import { nextTick, reactive, watch } from 'vue';
import blockFields from 'virtual:eldra/block-fields';
import manifest from 'virtual:eldra/manifest';
import messages from 'virtual:eldra/messages';
import 'virtual:eldra/tokens.css';
import { useEldraBuildToken } from './composables/useEldraBuildToken';
import { resolveSiteDesignTokens } from './designTokens';
import { createNuxtEldraLocaleState, localeAlternates, type LocaleRouter } from './localeState';
import { localeDisplayName, resolveLocaleRouting, resolveStoreLocales } from './locales';
import { resolveBridgeOrigins } from './origins';
import {
  isPreviewSessionRefused,
  reportPreviewSessionSiteSettingError,
  settlePreviewSessionDrafts,
  settlePreviewSessionSiteSettings,
  startPreviewSession,
  usePreviewSession,
} from './previewSession';
import { afterHeadRendered, type HeadRenderHooks } from './previewSessionHead';
import { sessionReads, type SessionReadsInput } from './previewSessionReads';
import { canonicalRoutePath } from './routePath';
import { primePrerenderedRoutes } from './staticRoutes';

interface RuntimeEldraConfig {
  gatewayUrl: string;
  orgId: string;
  studioOrigins: string[];
  pageSchema: string;
  locale: string | null;
  /** `''` on a site whose organisation configures none — see `./locales.ts`. */
  locales: unknown;
  /** `''` when the platform read failed or found no override — see `./designTokens.ts`. */
  designTokens: unknown;
  /** `null` when the theme configures none: the client's own defaults apply. */
  retry: EldraRetryOptions | null;
}

/** The robots tag a draft preview session's page carries: the preview router's own. */
const PREVIEW_SESSION_ROBOTS = 'noindex, nofollow';

export default defineNuxtPlugin({
  name: 'eldra-theme',
  setup(nuxtApp) {
    // Block field metadata: lets theme-core's `isBlockFieldLocalized` (and
    // theme-vue's `useEldraBlockField` wrapper) resolve a field's `localized`
    // flag without the SDK packages importing the virtual module id
    // themselves — they can't, at their own package build time. The theme's own
    // id rides along: Core spells a block entry's schema `<themeId>:<apiId>`
    // and these lookups are keyed by the bare apiId.
    registerBlockFields(blockFields, manifest.theme.id);
    const cfg = useRuntimeConfig().public.eldra as RuntimeEldraConfig;
    // Resolved before the client so its organisation default locale — the
    // store's own `locales.default`, falling back to the routing default for
    // a single-locale site that only ever set `eldra.locale` — can be handed
    // to `createEldraClient` below rather than threaded in after the fact.
    const storeLocales = resolveStoreLocales(cfg.locales);
    const routing = resolveLocaleRouting(storeLocales, cfg.locale);
    const client = createEldraClient({
      gatewayUrl: cfg.gatewayUrl,
      orgId: cfg.orgId,
      stega: true,
      retry: cfg.retry ?? undefined,
      // Server prerender only; `undefined` in the browser. See `./buildToken.ts`.
      buildToken: useEldraBuildToken(),
      defaultLocale: storeLocales?.default ?? routing.default ?? null,
    });
    const preview = createEldraPreviewState();
    /**
     * A draft preview session (`./previewSession.ts`), decided before anything renders: from here
     * on the client's CMS reads go to the preview router's same-origin proxy, and `useEldraPage`
     * answers no route from the build. Browser only; outside a session nothing changes.
     *
     * Once the published prerender is hydrated, every async data entry the **server** filled is
     * read again, once — the route's own (`useEldraPage`) and every `useAsyncData`/`useFetch` the
     * theme made on the page — because each was hydrated from the published payload and would
     * otherwise stay published beside the drafts. Only those: the keys the payload carried a value
     * for, captured here, before anything ran in the browser. An entry that did not run on load (an
     * `immediate: false` form submit, a cart create) is never run by the session. Entries the browser
     * itself started on load (a page with no server render) already read through the session and are
     * waited for, not run again. One more: on a page only the draft has, `useEldraPage`'s route
     * read, which Nuxt counted as hydrated from its `default` and never ran
     * (`./previewSessionReads.ts`). A refresh is never answered from the payload after hydration, so
     * each handler runs again and its CMS reads go through the session. The veil stays up until they
     * have settled and rendered, for at most `PREVIEW_SESSION_DRAFT_TIMEOUT_MS`; after that the
     * session is unavailable.
     */
    const hydratedKeys = import.meta.client
      ? Object.keys(nuxtApp.payload.data ?? {}).filter(
          (key) => nuxtApp.payload.data[key] !== undefined
        )
      : [];
    const readDrafts = async (): Promise<void> => {
      const { reread, inFlight } = sessionReads({
        hydratedKeys,
        asyncData: (nuxtApp as { _asyncData?: SessionReadsInput['asyncData'] })._asyncData ?? {},
        promises:
          (nuxtApp as { _asyncDataPromises?: SessionReadsInput['promises'] })._asyncDataPromises ??
          {},
      });
      await Promise.allSettled([
        reread.length > 0 ? refreshNuxtData(reread) : undefined,
        ...inFlight,
      ]);
    };
    /**
     * The site's saved design tokens and theme texts, read again through the session and put where
     * the build put its own (`./previewSessionSite.ts`, WS-1394), so a saved change shows at once.
     * Session only, in its own chunk, which starts loading as soon as the session starts (beside
     * the veil's); never fatal: one bound covers the chunk and the reads together
     * (`settlePreviewSessionSiteSettings`), and a failure keeps the build's values.
     */
    let siteSettingsChunk: Promise<typeof import('./previewSessionSite')> | undefined;
    const readSiteSettings = (): Promise<void> =>
      settlePreviewSessionSiteSettings((isOpen) =>
        (siteSettingsChunk ?? import('./previewSessionSite')).then(({ readSessionSiteSettings }) =>
          readSessionSiteSettings(client, context, {
            themeMessages: manifest.messages,
            locales: storeLocales,
            isOpen,
            onError: reportPreviewSessionSiteSettingError,
          })
        )
      );
    let sessionHead: HeadRenderHooks | undefined;
    try {
      sessionHead = injectHead(nuxtApp) as unknown as HeadRenderHooks;
    } catch {
      // No head manager: the timer alone waits out a head render.
    }
    const previewSession =
      import.meta.client &&
      startPreviewSession(client, {
        onHydrated: (hydrated) =>
          nuxtApp.hooks.hookOnce('app:suspense:resolve', async () => {
            hydrated();
            // The veil drops once Vue has rendered the drafts and the head manager has written
            // the head after them (`./previewSessionHead.ts`), never on the pinned title.
            // The saved tokens and texts are read beside the drafts, inside the same bound.
            await settlePreviewSessionDrafts(
              () => Promise.allSettled([readDrafts(), readSiteSettings()]),
              () => afterHeadRendered(sessionHead, () => nextTick())
            );
          }),
      });
    if (previewSession) {
      siteSettingsChunk = import('./previewSessionSite');
      // Its failure is the bound's to handle, when the settings are read; never an unhandled one.
      siteSettingsChunk.catch(() => undefined);
      // A session's page is never indexed, whatever the page asks for. The preview router puts
      // `noindex, nofollow` in every document it serves (and sends `X-Robots-Tag`), but the head
      // manager owns `meta[name="robots"]` once the app runs: a page that writes its own (the
      // not-found document a page only the draft has hydrates, a theme's `robots` setting) would
      // remove or replace the router's. The session's own entry, ahead of any page's, keeps it.
      useHead({
        meta: [{ name: 'robots', content: PREVIEW_SESSION_ROBOTS, tagPriority: 'critical' }],
      });
      // A refused session keeps nothing it read: every async data entry — the theme's own as well
      // as the route's — is cleared once the page is hydrated, so neither drafts nor anything
      // published stays rendered under the notice.
      const session = usePreviewSession();
      const stop = watch(
        () => session.hydrated && isPreviewSessionRefused(session.status),
        (refused) => {
          if (!refused) return;
          stop();
          clearNuxtData();
        }
      );
    }
    // Lazily, every time: `$router` is installed by Nuxt's own router plugin and this one may be
    // ordered before it. Nothing reads the locale state during plugin setup, so a getter is enough
    // — and it keeps the state honest after a client navigation, which is the whole point of it.
    const router = (): LocaleRouter | undefined => (nuxtApp as { $router?: LocaleRouter }).$router;
    /**
     * Each supported locale's own name, resolved **once on the server** and carried to the browser
     * in the payload. `Intl.DisplayNames` is ICU data and the two sides do not always have the same
     * of it — Node answers "íslenska (Ísland)" for `is-IS` where a reduced-ICU browser build
     * answers "Icelandic (Iceland)" — so a switcher that let each side compute its own labels
     * hydrated into a mismatch and repainted, on every page carrying a footer. `useState` runs its
     * initialiser only for a key the payload does not already hold, which is exactly the transfer
     * this needs.
     */
    const localeNames = useState<Record<string, string>>('eldra-locale-names', () =>
      Object.fromEntries(routing.supported.map((locale) => [locale, localeDisplayName(locale)]))
    );
    const context: EldraContext = {
      client,
      // The platform's resolved design-token catalog, when the build's own platform read settled
      // with one (`@eldrajs/theme-nuxt`'s module, `readDesignTokens`/`resolveTokens` over
      // `@eldrajs/theme-core`'s `normalizeThemeDesignTokens`) — falling back to the manifest's own
      // `tokens.json`, normalized exactly as a credential-less build already does, when it did not.
      designTokens: reactive(
        resolveSiteDesignTokens(cfg.designTokens) ?? normalizeThemeDesignTokens(manifest.tokens)
      ),
      // Already the merged/resolved catalogue — @eldrajs/theme-nuxt's module (`resolveMessages`,
      // over `@eldrajs/theme-core/i18n`) built this build's content; nothing left to normalize.
      messages: reactive(messages),
      links: createEldraLinkState(),
      locales: createNuxtEldraLocaleState(routing, preview, router, localeNames.value),
      preview,
    };
    nuxtApp.vueApp.provide(ELDRA_KEY, context);

    /**
     * The document's own language, and the alternates that say which other URLs are this page in
     * another one. Both belong to every page of every theme — a theme that had to write them
     * itself would be copying the site's routing into its head block — so the module writes them
     * once here rather than leaving them to a `useHead` in the catch-all page.
     *
     * One reactive entry, not a snapshot: a client navigation between two locales changes both.
     */
    // Absolute when the build knows the site's origin (`siteUrl` module option / `ELDRA_SITE_URL`
    // / the platform's production URL), relative paths otherwise. `''` is how the runtime config
    // serialises "unset".
    const seoSiteUrl = (useRuntimeConfig().public.eldraSeo as { siteUrl?: string } | undefined)
      ?.siteUrl;
    useHead(() => ({
      htmlAttrs: { lang: context.locales?.active ?? undefined },
      link: localeAlternates(
        canonicalRoutePath(router()?.currentRoute.value.path ?? '/'),
        routing,
        seoSiteUrl
      ),
    }));

    // Read the build's prerendered route list now, so the first client navigation already has it
    // synchronously (`./staticRoutes.ts`, and `useEldraPage`'s `getCachedData`). It is one cached
    // fetch of a file Nuxt's own payload plugin asks for anyway, and having it early is the
    // difference between answering an unknown route in the same tick and answering it a tick late.
    // A session answers no route from the build, so it has no use for the list.
    if (import.meta.client && !previewSession) primePrerenderedRoutes();

    // A session is not Studio's canvas: its credential is the router's, and the bridge's preview
    // token is never taken.
    if (import.meta.client && !previewSession && window.parent !== window) {
      const allowedOrigins = resolveBridgeOrigins(cfg.studioOrigins, document.referrer);
      if (allowedOrigins.length === 0) {
        console.warn('[eldra] preview disabled: parent origin is not an allowed Studio origin');
      } else {
        nuxtApp.hook('app:mounted', () => {
          const runtime = startEldraPreview(context, {
            allowedOrigins,
            onNavigate: (path) => {
              void nuxtApp.$router.push(path);
            },
          });
          window.addEventListener('pagehide', () => runtime.destroy(), { once: true });
        });
      }
    }
  },
});
