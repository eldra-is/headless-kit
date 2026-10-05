import { createEldraClient, normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import {
  ELDRA_KEY,
  createEldraLinkState,
  createEldraPreviewState,
  registerBlockFields,
  startEldraPreview,
  type EldraContext,
} from '@eldrajs/theme-vue';
import { defineNuxtPlugin, useHead, useRuntimeConfig } from 'nuxt/app';
import { reactive } from 'vue';
import blockFields from 'virtual:eldra/block-fields';
import manifest from 'virtual:eldra/manifest';
import 'virtual:eldra/tokens.css';
import { createNuxtEldraLocaleState, localeAlternates, type LocaleRouter } from './localeState';
import { resolveLocaleRouting, resolveStoreLocales } from './locales';
import { resolveBridgeOrigins } from './origins';
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
}

export default defineNuxtPlugin({
  name: 'eldra-theme',
  setup(nuxtApp) {
    // Block field metadata: lets theme-core's `isBlockFieldLocalized` (and
    // theme-vue's `useEldraBlockField` wrapper) resolve a field's `localized`
    // flag without the SDK packages importing the virtual module id
    // themselves — they can't, at their own package build time.
    registerBlockFields(blockFields);
    const cfg = useRuntimeConfig().public.eldra as RuntimeEldraConfig;
    const client = createEldraClient({ gatewayUrl: cfg.gatewayUrl, orgId: cfg.orgId, stega: true });
    const preview = createEldraPreviewState();
    const routing = resolveLocaleRouting(resolveStoreLocales(cfg.locales), cfg.locale);
    // Lazily, every time: `$router` is installed by Nuxt's own router plugin and this one may be
    // ordered before it. Nothing reads the locale state during plugin setup, so a getter is enough
    // — and it keeps the state honest after a client navigation, which is the whole point of it.
    const router = (): LocaleRouter | undefined => (nuxtApp as { $router?: LocaleRouter }).$router;
    const context: EldraContext = {
      client,
      designTokens: reactive(normalizeThemeDesignTokens(manifest.tokens)),
      links: createEldraLinkState(),
      locales: createNuxtEldraLocaleState(routing, preview, router),
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
    useHead(() => ({
      htmlAttrs: { lang: context.locales?.active ?? undefined },
      link: localeAlternates(canonicalRoutePath(router()?.currentRoute.value.path ?? '/'), routing),
    }));

    // Read the build's prerendered route list now, so the first client navigation already has it
    // synchronously (`./staticRoutes.ts`, and `useEldraPage`'s `getCachedData`). It is one cached
    // fetch of a file Nuxt's own payload plugin asks for anyway, and having it early is the
    // difference between answering an unknown route in the same tick and answering it a tick late.
    if (import.meta.client) primePrerenderedRoutes();

    if (import.meta.client && window.parent !== window) {
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
