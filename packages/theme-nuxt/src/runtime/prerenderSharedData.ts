import { defineNuxtPlugin } from 'nuxt/app';

/**
 * A failed read is never shared between the pages of a prerender (WS-1358).
 *
 * Nuxt shares `useAsyncData` answers between the routes of one `nuxi generate`
 * (`experimental.sharedPrerenderData`, on by default in Nuxt 4): the first route to read a key
 * stores the promise, and every later route with the same key is handed that answer instead of
 * reading again. A read that **fails** is not stored (`@nuxt/nitro-server`'s
 * `runtime/utils/cache.mjs`, `sharedPrerenderCache.set` swallows the rejection), but its key stays
 * marked as shared, so a route that asks after the failure is handed the storage read of a value
 * that was never written — a promise of `null` — and bakes **an empty answer** where the first
 * route baked **an error**. A route that asks while the read is still in flight gets the
 * rejection. Which of the two a page gets depends only on the order the prerender happened to
 * render the routes in, so the same content builds two different pages: a footer's form
 * definition is an error on one build and an empty answer on the next, and on a busy machine the
 * two builds a draft preview compares disagree.
 *
 * This wraps the request's shared cache so a key whose read failed is read again by the next
 * route that asks (its own failure, the same every time), and an answer that succeeded is shared
 * as before. Prerender only; a server render and the browser have no shared cache.
 */
export default defineNuxtPlugin({
  name: 'eldra-prerender-shared-data',
  enforce: 'pre',
  setup(nuxtApp) {
    if (!import.meta.server || !import.meta.prerender) return;
    const context = nuxtApp.ssrContext as Record<string, unknown> | undefined;
    const cache = context?.[SHARED_CACHE];
    if (context === undefined || !isSharedCache(cache)) return;
    context[SHARED_CACHE] = withoutFailedReads(cache);
  },
});

const SHARED_CACHE = '~sharedPrerenderCache';

/** The keys whose last shared read failed, for the whole prerender (one process). */
const failedKeys = new Set<string>();

/** The part of Nuxt's shared prerender cache `useAsyncData` uses. */
export interface SharedPrerenderCache {
  get(key: string): unknown;
  set(key: string, value: Promise<unknown>): unknown;
}

function isSharedCache(value: unknown): value is SharedPrerenderCache {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SharedPrerenderCache).get === 'function' &&
    typeof (value as SharedPrerenderCache).set === 'function'
  );
}

/**
 * `cache`, except that a key whose shared read failed is reported as not shared (`undefined`), so
 * the asking route runs its own read. The failure is recorded before Nuxt's own handler sees it,
 * so no route can ask in between and be handed the empty answer.
 */
export function withoutFailedReads(
  cache: SharedPrerenderCache,
  failed: Set<string> = failedKeys
): SharedPrerenderCache {
  return {
    get: (key) => (failed.has(key) ? undefined : cache.get(key)),
    set: (key, value) => {
      failed.delete(key);
      Promise.resolve(value).catch(() => failed.add(key));
      return cache.set(key, value);
    },
  };
}
