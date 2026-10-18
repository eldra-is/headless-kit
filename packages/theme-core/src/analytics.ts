/**
 * Framework-free custom-event tracking for the Eldra analytics tracker script
 * (`<gateway>/js/script.js`, see `analyticsTrackerScript` in `@eldrajs/sdk`).
 *
 * The script owns pageviews (including SPA navigations, by patching `history`) and exposes
 * `window.eldra('event', name, { props })` for everything else. This module is the thin, testable
 * layer a theme calls instead of reaching for that global: it coerces props to the string-only
 * shape Core accepts, stays inside Core's limits, holds events until the script has loaded, and is
 * a no-op wherever tracking is off (disabled, a Studio preview frame, the server).
 *
 * Nothing here reads or writes a cookie or storage: the visitor is a salted daily hash computed by
 * the platform, never an identifier kept in the browser.
 */

/** A prop value a theme may pass; stringified (and `null`/`undefined` dropped) before sending. */
export type AnalyticsPropValue = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsPropValue>;

/** Core's ingest limits (`SanitizeProps`): 30 entries, keys up to 60 bytes, values 300 bytes. */
export const ANALYTICS_MAX_PROPS = 30;
export const ANALYTICS_MAX_KEY_BYTES = 60;
export const ANALYTICS_MAX_VALUE_BYTES = 300;
/** Core cuts an event name at 120 bytes. */
export const ANALYTICS_MAX_NAME_BYTES = 120;
/** Events held back before the tracker script has loaded; the oldest are dropped past this. */
export const ANALYTICS_QUEUE_LIMIT = 50;

/** The tracker script's global, as `script.js` installs it. */
export type AnalyticsSender = (
  command: 'event',
  name: string,
  options?: { props?: Record<string, string> }
) => void;

export interface Analytics {
  /** Whether events are sent at all. `false` makes `track` a no-op. */
  readonly enabled: boolean;
  /** Records a named event. Never throws; a failed send is dropped. */
  track(name: string, props?: AnalyticsProps): void;
  /** Sends everything queued while the script was loading. Call once the script has loaded. */
  flush(): void;
}

export interface CreateAnalyticsOptions {
  /** `false` for the server, a preview frame, a dev server or a site that opted out. */
  enabled: boolean;
  /** Resolves the tracker's global; `undefined` until the script has loaded. */
  sender: () => AnalyticsSender | undefined;
}

/** Cuts a string to at most `maxBytes` of UTF-8 without splitting a character. */
export function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let out = '';
  let size = 0;
  for (const char of value) {
    const next = encoder.encode(char).length;
    if (size + next > maxBytes) break;
    out += char;
    size += next;
  }
  return out;
}

/**
 * Coerces a theme's props to what Core stores: strings only, `null`/`undefined`/non-finite numbers
 * dropped, keys and values cut to the ingest limits, at most 30 entries.
 */
export function normalizeAnalyticsProps(props: AnalyticsProps | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (props === undefined) return out;
  for (const [rawKey, raw] of Object.entries(props)) {
    if (Object.keys(out).length >= ANALYTICS_MAX_PROPS) break;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue;
    const key = truncateUtf8(rawKey, ANALYTICS_MAX_KEY_BYTES);
    if (key === '') continue;
    out[key] = truncateUtf8(String(raw), ANALYTICS_MAX_VALUE_BYTES);
  }
  return out;
}

export function createAnalytics(options: CreateAnalyticsOptions): Analytics {
  const queue: Array<{ name: string; props: Record<string, string> }> = [];

  function send(sender: AnalyticsSender, name: string, props: Record<string, string>): void {
    try {
      sender('event', name, { props });
    } catch {
      // Analytics must never break the page.
    }
  }

  return {
    enabled: options.enabled,
    track(rawName, props) {
      if (!options.enabled) return;
      const name = truncateUtf8(rawName.trim(), ANALYTICS_MAX_NAME_BYTES);
      // Pageviews belong to the tracker script; a second source would count every view twice.
      if (name === '' || name === 'pageview') return;
      const normalized = normalizeAnalyticsProps(props);
      const sender = options.sender();
      if (sender === undefined) {
        queue.push({ name, props: normalized });
        if (queue.length > ANALYTICS_QUEUE_LIMIT) queue.shift();
        return;
      }
      send(sender, name, normalized);
    },
    flush() {
      if (!options.enabled) return;
      const sender = options.sender();
      if (sender === undefined) return;
      for (const event of queue.splice(0)) send(sender, event.name, event.props);
    },
  };
}
