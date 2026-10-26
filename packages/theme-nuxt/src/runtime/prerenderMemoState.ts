/**
 * The memo's state and its test seam. Internal: **not** in the package `exports`, so a theme cannot
 * switch the memo on in an SSR deployment (which would serve stale lists across requests). Specs
 * import it from `src`.
 */
interface MemoStore {
  memo: Map<string, Promise<unknown>>;
  counters: { loads: number; hits: number };
  forced: boolean | undefined;
}

/**
 * Kept on `globalThis` so every copy of this module in the process shares one store: Nitro loads
 * the prerender bundle beside the module that starts the build, and the module reads the counters
 * for its end-of-build log from the other side. One process is one build; the module clears the
 * store when a prerender starts.
 */
const KEY = Symbol.for('@eldrajs/theme-nuxt:prerender-memo');
const holder = globalThis as unknown as Record<symbol, MemoStore | undefined>;
const store: MemoStore = (holder[KEY] ??= {
  memo: new Map(),
  counters: { loads: 0, hits: 0 },
  forced: undefined,
});
export const memo = store.memo;
export const counters = store.counters;

export function isPrerender(): boolean {
  return store.forced ?? (import.meta.server === true && import.meta.prerender === true);
}

/** Empty the memo and its counters. */
export function clearPrerenderMemo(): void {
  memo.clear();
  counters.loads = 0;
  counters.hits = 0;
}

/** Test seam: `true`/`false` overrides the prerender check, `undefined` restores it. */
export function forcePrerenderMemoForTests(value: boolean | undefined): void {
  store.forced = value;
}
