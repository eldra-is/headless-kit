import type { Analytics, AnalyticsSender } from '@eldrajs/theme-core';
import { analyticsTrackerScript } from '@eldrajs/sdk';

/** What reaches the browser in `runtimeConfig.public.eldra.analytics`. */
export interface AnalyticsRuntimeConfig {
  /** The build's decision: a production build with an organisation and no opt-out. */
  enabled: boolean;
  /** A first-party origin that receives events instead of the gateway. */
  eventOrigin: string | null;
}

/** The module's `analytics` option. */
export type AnalyticsOption = false | { enabled?: boolean; eventOrigin?: string };

export interface AnalyticsBuildInput {
  option: AnalyticsOption | undefined;
  /** `ELDRA_ANALYTICS` (`off` opts out) and `ELDRA_ANALYTICS_ORIGIN`, so a deploy can override. */
  env: Record<string, string | undefined>;
  dev: boolean;
  production: boolean;
  orgId: string;
  warn?: (message: string) => void;
}

/** `value` when it is a bare origin (`https://host[:port]`, no path), otherwise `null`. */
export function parseEventOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value
      ? value
      : null;
  } catch {
    return null;
  }
}

/**
 * Decides at build time whether the deployed site reports, and where to. Reporting is on only for
 * a production build (never `nuxi dev`, never a preview build, which is the Studio preview host's)
 * that has an organisation id — a credential-less build has nothing to report to — and has not
 * opted out. An invalid `eventOrigin` is warned about and ignored, like the module's other
 * fail-soft platform reads.
 */
export function resolveAnalyticsConfig(input: AnalyticsBuildInput): AnalyticsRuntimeConfig {
  const warn = input.warn ?? ((message: string) => console.warn(message));
  const option = input.option;
  const optedOut =
    option === false ||
    (option !== undefined && option.enabled === false) ||
    input.env.ELDRA_ANALYTICS?.trim().toLowerCase() === 'off';
  const rawOrigin =
    (input.env.ELDRA_ANALYTICS_ORIGIN ?? '').trim() ||
    (option !== undefined && option !== false ? (option.eventOrigin ?? '') : '');
  let eventOrigin: string | null = null;
  if (rawOrigin !== '') {
    eventOrigin = parseEventOrigin(rawOrigin);
    if (eventOrigin === null) {
      warn(
        `[eldra] analytics.eventOrigin "${rawOrigin}" is not an origin (https://host, no path) — ignored`
      );
    }
  }
  return {
    enabled: !optedOut && !input.dev && input.production && input.orgId !== '',
    eventOrigin,
  };
}

/**
 * Whether this document reports: a browser (never the server), not a dev server, a build that
 * decided to report, and not a Studio preview frame.
 */
export function shouldReport(input: {
  client: boolean;
  dev: boolean;
  config: AnalyticsRuntimeConfig | undefined;
  studioPreviewFrame: boolean;
}): boolean {
  return input.client && !input.dev && input.config?.enabled === true && !input.studioPreviewFrame;
}

/**
 * Appends the tracker `<script>` to the document, once. Returns `false` when the config yields no
 * tag (no organisation) or one is already there. `onLoad` runs when the script has loaded, which
 * is when events queued before it can be sent.
 */
export function installTrackerScript(
  doc: Document,
  config: { gatewayUrl: string; orgId: string; eventOrigin: string | null },
  onLoad: () => void
): boolean {
  if (doc.querySelector('script[data-org][src$="/js/script.js"]') !== null) return false;
  const attrs = analyticsTrackerScript({
    apiBaseUrl: config.gatewayUrl || undefined,
    orgId: config.orgId,
    eventOrigin: config.eventOrigin ?? undefined,
  });
  if (attrs === undefined) return false;
  const tag = doc.createElement('script');
  tag.src = attrs.src;
  tag.defer = true;
  tag.crossOrigin = attrs.crossorigin;
  tag.setAttribute('data-org', attrs['data-org']);
  if (attrs['data-api'] !== undefined) tag.setAttribute('data-api', attrs['data-api']);
  tag.addEventListener('load', onLoad, { once: true });
  doc.head.appendChild(tag);
  return true;
}

/** The tracker's global, once `script.js` has installed it. */
export function trackerGlobal(win: { eldra?: AnalyticsSender }): AnalyticsSender | undefined {
  return typeof win.eldra === 'function' ? win.eldra : undefined;
}

/** The shape `useEldraAnalytics()` returns. */
export type EldraAnalytics = Pick<Analytics, 'track' | 'enabled'>;
