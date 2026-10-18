import type { AnalyticsSender } from '@eldrajs/theme-core';
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { setupAnalytics, type AnalyticsRuntimeConfig } from './analytics';
import { isStudioPreviewFrame } from './origins';

interface RuntimeEldraConfig {
  gatewayUrl: string;
  orgId: string;
  studioOrigins: string[];
  analytics?: AnalyticsRuntimeConfig;
}

/**
 * Loads the Eldra tracker on the deployed site and provides `$eldraAnalytics`
 * (`useEldraAnalytics()`).
 *
 * The tag is added **at runtime**, not written into the generated HTML, because the Studio preview
 * serves the same bundle in an iframe and a static `<script>` cannot decide not to run there. The
 * build has already decided everything it can (`resolveAnalyticsConfig`: production build, an
 * organisation, no opt-out); what is left is the one thing only the browser knows — whether this
 * document is a Studio preview frame, which never reports.
 *
 * The tracker handles pageviews itself, including client-side navigations (it patches
 * `history.pushState`), so no router hook is needed here.
 */
export default defineNuxtPlugin({
  name: 'eldra-analytics',
  setup(nuxtApp) {
    const cfg = useRuntimeConfig().public.eldra as RuntimeEldraConfig;
    const analytics = setupAnalytics({
      client: import.meta.client,
      dev: import.meta.dev,
      config: cfg.analytics,
      isFrame: import.meta.client && isStudioPreviewFrame(cfg.studioOrigins),
      gatewayUrl: cfg.gatewayUrl,
      orgId: cfg.orgId,
      hostname: import.meta.client ? window.location.hostname : undefined,
      doc: import.meta.client ? document : undefined,
      win: import.meta.client ? (window as { eldra?: AnalyticsSender }) : undefined,
    });
    nuxtApp.provide('eldraAnalytics', analytics);
  },
});
