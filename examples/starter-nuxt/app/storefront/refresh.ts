import { applyVolatileSnapshots, collectVolatileTargets } from './volatile';
import type { VolatileKey, VolatileSnapshot } from './types';

/**
 * The page's one volatile refresh, as a collector.
 *
 * A prerendered page paints real values (`types.ts`'s `StorefrontResult` doc comment), and the
 * only thing that can have moved since the build is money and the stock line. So after hydration
 * every storefront result that is *about* products registers itself here, and this fires **one**
 * batched read for the whole page rather than one read per block: a collection grid, a "you may
 * also like" carousel and a hand-picked row of cards are three results asking about overlapping
 * products, and three requests would be three chances to paint three different truths.
 *
 * Framework-free and network-free, like `volatile.ts`: it is handed the batched read
 * (`catalog.volatileByIds`) and *when* to run it (`schedule`, called once, with the first result
 * to register) — the plugin passes one that waits for the app to mount, a spec passes a no-op and
 * calls `refresh()` itself.
 *
 * **Exactly one refresh per page load.** `refresh()` runs once; an entry that registers afterwards
 * (a result created by a client navigation or a search) is ignored, because such a result has just
 * read the live values itself. A block that wants a fresh read on demand calls
 * `StorefrontResult.refresh()`, which is a full reload, not this.
 */

/** What a storefront result lends the collector. Accessors rather than the refs themselves: a
 *  result owns its own `data`/`revalidating` and their types, and the collector only needs to read
 *  a value, write one back, and know whether the result has moved on since it asked. */
export interface VolatileRefreshEntry {
  /** The data the page is currently showing. */
  read(): unknown;
  /** The same data with the fresh volatile values folded in (`applyVolatileSnapshots`). */
  write(next: unknown): void;
  /** `{price, stock}` while the refresh is in flight, empty once it has settled. */
  setRevalidating(keys: ReadonlySet<VolatileKey>): void;
  /**
   * Changes whenever the result reloads. Captured when the refresh is issued and checked again
   * when it answers: a result whose sources changed meanwhile has *fresher* data than the answer,
   * so the answer is dropped rather than written over it.
   */
  token(): number;
  /**
   * A result that cannot go through the batched read refreshes itself with this, and is passed the
   * data it is refreshing. The product detail page is the case that exists: its `variantId` is a
   * *variant's* id (`gateway.ts`'s `mapProductDetails`), which the products list's `id:in:` filter
   * does not match, so it re-reads the product and answers with a snapshot of its own.
   */
  own?(current: unknown): Promise<VolatileSnapshot[]>;
}

export interface VolatileRefresher {
  /** Takes part in this page's refresh. Ignored once `refresh()` has run. */
  register(entry: VolatileRefreshEntry): void;
  /** Runs the page's refresh, once. Safe to call again — the second call does nothing. */
  refresh(): Promise<void>;
}

/** The keys a volatile refresh is about; both move together, so there is one set, not two. */
const REVALIDATING: ReadonlySet<VolatileKey> = new Set<VolatileKey>(['price', 'stock']);
const SETTLED: ReadonlySet<VolatileKey> = new Set<VolatileKey>();

export function createVolatileRefresher(
  volatileByIds: (ids: string[]) => Promise<VolatileSnapshot[]>,
  schedule: (run: () => void) => void
): VolatileRefresher {
  const entries: VolatileRefreshEntry[] = [];
  let ran = false;

  /**
   * One entry's half of the refresh: mark, await, fold in, unmark. A failure is swallowed on
   * purpose — the page already shows a value, and replacing it with an error would be a worse
   * answer than a price that is a few minutes old.
   */
  async function settle(entry: VolatileRefreshEntry, answer: Promise<VolatileSnapshot[]>) {
    const token = entry.token();
    entry.setRevalidating(REVALIDATING);
    try {
      const snapshots = await answer;
      // The result reloaded while this was in flight: its data is newer than this answer.
      if (entry.token() !== token) return;
      entry.write(applyVolatileSnapshots(entry.read(), snapshots));
    } catch {
      // Keep what the page has. `revalidating` still clears below.
    } finally {
      if (entry.token() === token) entry.setRevalidating(SETTLED);
    }
  }

  async function refresh(): Promise<void> {
    if (ran) return;
    ran = true;
    const registered = entries.splice(0);
    const batched: VolatileRefreshEntry[] = [];
    const ids: string[] = [];
    const seen = new Set<string>();
    const work: Array<Promise<void>> = [];

    for (const entry of registered) {
      // Nothing on screen to refresh — a result that answered `null`, or one whose data holds no
      // products at all (a collection's own info, an order). Asking would be a request for
      // nobody.
      const targets = collectVolatileTargets(entry.read());
      if (targets.length === 0) continue;
      if (entry.own !== undefined) {
        work.push(settle(entry, entry.own(entry.read())));
        continue;
      }
      batched.push(entry);
      for (const id of targets) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }

    if (batched.length > 0) {
      // One read for the whole page, shared by every result that took part in it.
      const answer = volatileByIds(ids);
      for (const entry of batched) work.push(settle(entry, answer));
    }
    await Promise.all(work);
  }

  return {
    register(entry) {
      if (ran) return;
      const first = entries.length === 0;
      entries.push(entry);
      if (first) schedule(() => void refresh());
    },
    refresh,
  };
}
