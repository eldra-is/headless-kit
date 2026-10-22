/**
 * A per-build memo for the reads every prerendered route repeats (WS-406).
 *
 * `nuxi generate` resolves each route with a fresh client, so the page list, the route-template
 * list and the category list were read once **per route**: a 130-route build sent the same
 * `categories?page=1&pageSize=100` read about 136 times. The lists do not change while one build
 * runs, so during a prerender the first route to ask starts the read and every later route shares
 * the in-flight promise.
 *
 * Scope, deliberately narrow:
 *
 * - **Prerender only.** Outside `import.meta.prerender` on the server (SSR requests, the browser,
 *   `nuxi dev`) `memoizeForPrerender` just runs the loader: a long-lived server must never answer
 *   from a list a merchant has since edited, and a browser session has no build to share with.
 * - **Keyed by gateway, organisation and locale** (plus the read's name), so two sites or two
 *   locales in one process never share an answer.
 * - **Failures are not remembered.** A rejected read drops its entry so the next route tries again.
 * - **One build.** The map lives in the module that `nuxi generate` loads once, so it ends with the
 *   process; {@link clearPrerenderMemo} empties it for anything that outlives one (tests).
 */

const memo = new Map<string, Promise<unknown>>();
let loads = 0;
let hits = 0;
let forced: boolean | undefined;

function isPrerender(): boolean {
  return forced ?? (import.meta.server === true && import.meta.prerender === true);
}

/** The memo scope for one site and locale, or `null` when the caller has no credentials to key on
 * (such a read is never shared). */
export function prerenderMemoScope(
  gatewayUrl: string | undefined,
  orgId: string | undefined,
  locale: string | undefined
): string | null {
  if (!gatewayUrl || !orgId) return null;
  return `${gatewayUrl}|${orgId}|${locale ?? ''}`;
}

/**
 * Run `load` once per `(scope, name)` for the length of a prerender; run it every time otherwise.
 * A `null` scope never shares.
 */
export function memoizeForPrerender<T>(
  scope: string | null,
  name: string,
  load: () => Promise<T>
): Promise<T> {
  if (scope === null || !isPrerender()) return load();
  const key = `${scope}|${name}`;
  const existing = memo.get(key);
  if (existing !== undefined) {
    hits += 1;
    return existing as Promise<T>;
  }
  loads += 1;
  const pending = load().catch((cause: unknown) => {
    // Only drop our own entry: a newer read may already have replaced it.
    if (memo.get(key) === pending) memo.delete(key);
    throw cause;
  });
  memo.set(key, pending);
  return pending;
}

/** How many reads the memo ran (`loads`) and how many it answered from a shared one (`hits`) —
 * the measure WS-406 asks a build to be able to report. */
export function prerenderMemoStats(): { loads: number; hits: number } {
  return { loads, hits };
}

/** Empty the memo and its counters. */
export function clearPrerenderMemo(): void {
  memo.clear();
  loads = 0;
  hits = 0;
}

/** Test seam: `true`/`false` overrides the prerender check, `undefined` restores it. */
export function forcePrerenderMemoForTests(value: boolean | undefined): void {
  forced = value;
}
