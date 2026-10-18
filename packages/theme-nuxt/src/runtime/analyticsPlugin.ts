import { createAnalytics, type AnalyticsSender } from '@eldrajs/theme-core';
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import {
  installTrackerScript,
  shouldReport,
  trackerGlobal,
  type AnalyticsRuntimeConfig,
} from './analytics';
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
    const config = cfg.analytics;
    const active = shouldReport({
      client: import.meta.client,
      dev: import.meta.dev,
      config,
      studioPreviewFrame: isStudioPreviewFrame(cfg.studioOrigins),
    });
    const analytics = createAnalytics({
      enabled: active,
      sender: () =>
        import.meta.client ? trackerGlobal(window as { eldra?: AnalyticsSender }) : undefined,
    });
    if (active && config !== undefined) {
      installTrackerScript(
        document,
        { gatewayUrl: cfg.gatewayUrl, orgId: cfg.orgId, eventOrigin: config.eventOrigin },
        () => analytics.flush()
      );
    }
    nuxtApp.provide('eldraAnalytics', analytics);
  },
});
