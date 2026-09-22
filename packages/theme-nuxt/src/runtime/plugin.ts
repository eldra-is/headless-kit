import { createEldraClient, normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import {
  ELDRA_KEY,
  createEldraPreviewState,
  registerBlockFields,
  startEldraPreview,
  type EldraContext,
} from '@eldrajs/theme-vue';
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { reactive } from 'vue';
import blockFields from 'virtual:eldra/block-fields';
import manifest from 'virtual:eldra/manifest';
import 'virtual:eldra/tokens.css';
import { resolveBridgeOrigins } from './origins';

interface RuntimeEldraConfig {
  gatewayUrl: string;
  orgId: string;
  studioOrigins: string[];
  pageSchema: string;
  locale: string | null;
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
    const context: EldraContext = {
      client,
      designTokens: reactive(normalizeThemeDesignTokens(manifest.tokens)),
      preview: createEldraPreviewState(),
    };
    nuxtApp.vueApp.provide(ELDRA_KEY, context);

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
