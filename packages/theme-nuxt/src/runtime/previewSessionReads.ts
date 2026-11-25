/**
 * Which async data entries a draft preview session reads again once the published prerender is
 * hydrated (WS-1303, WS-1358). `plugin.ts` runs them; this decides them, so it can be tested
 * without a Nuxt app.
 */

/** The prefix of the async data key `useEldraPage` stores one route's resolution under. */
export const PAGE_KEY_PREFIX = 'eldra-page:';

/** The parts of a Nuxt async data entry this reads (`nuxtApp._asyncData[key]`). */
export interface SessionAsyncDataEntry {
  data?: { value?: unknown };
  status?: { value?: string };
  _default?: () => unknown;
}

export interface SessionReadsInput {
  /** The keys the payload carried a value for, captured before anything ran in the browser. */
  hydratedKeys: readonly string[];
  /** `nuxtApp._asyncData`. */
  asyncData: Record<string, SessionAsyncDataEntry | undefined>;
  /** `nuxtApp._asyncDataPromises`. */
  promises: Record<string, Promise<unknown> | undefined>;
}

export interface SessionReads {
  /** Keys to refresh through the session. */
  reread: string[];
  /** Reads the browser itself started on load: waited for, never run again. */
  inFlight: Promise<unknown>[];
}

/**
 * The session's reads:
 *
 * - **every key the payload carried a value for** — hydrated from the published build, and would
 *   stay published beside the drafts;
 * - **a route read Nuxt marked hydrated with nothing from the payload** (`unread`): during
 *   hydration Nuxt counts an entry whose `default` gives a value as hydrated (`success`) and never
 *   fetches it. That is a route the document was not rendered for — a page only the draft has,
 *   opened directly, hydrates the build's not-found document — so its own data was never read.
 *   Only an entry whose data is still its `default` (anything else ran and has its own answer),
 *   and only `useEldraPage`'s (`eldra-page:` keys), which always runs on load: Nuxt marks an
 *   `immediate: false` entry with a `default` the same way, and nothing on the entry says which it
 *   was, so a theme's own entry is never run by the session on that guess — a cart create, a form
 *   submit, runs only when the page runs it.
 *
 * Reads still in flight are waited for, not run again.
 */
export function sessionReads({
  hydratedKeys,
  asyncData,
  promises,
}: SessionReadsInput): SessionReads {
  const inFlight = Object.entries(promises)
    .filter(([key, promise]) => promise !== undefined && !hydratedKeys.includes(key))
    .map(([, promise]) => promise as Promise<unknown>);
  const unread = Object.entries(asyncData)
    .filter(
      ([key, entry]) =>
        key.startsWith(PAGE_KEY_PREFIX) &&
        !hydratedKeys.includes(key) &&
        promises[key] === undefined &&
        entry?.status?.value === 'success' &&
        isStillDefault(entry)
    )
    .map(([key]) => key);
  return { reread: [...hydratedKeys, ...unread], inFlight };
}

function isStillDefault(entry: SessionAsyncDataEntry): boolean {
  if (typeof entry._default !== 'function') return false;
  const value = entry.data?.value;
  const fallback = entry._default();
  if (Object.is(value, fallback)) return true;
  try {
    return JSON.stringify(value) === JSON.stringify(fallback);
  } catch {
    return false;
  }
}
