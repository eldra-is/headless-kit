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
 * (`catalog.volatileByIds`) and *when* to run it (`schedule`, called once per pending batch, with
 * the result that opened it) — the plugin passes one that waits for the app to mount, a spec
 * passes a no-op and calls `refresh()` itself.
 *
 * **One read per batch, and a batch is every result registered before it flushes.** It cannot be
 * one read per *page*, and that was a real defect: a theme's blocks are lazily imported
 * components, so on a generated page the ones whose chunk arrives after the app has mounted create
 * their results after the first batch has already gone out. A one-shot refresher dropped them —
 * the product page's carousel never refreshed a price and never drew the refresh treatment,
 * because `product-detail` had opened and closed the page's only batch a tick earlier. So a result
 * that registers after a flush opens the next batch instead of being ignored, and the results that
 * register together — every card-bearing block in one hydration pass — still share one request.
 *
 * **Every entry refreshes exactly once.** A flush takes the pending entries with it, and a result
 * registers once, when it is created; `StorefrontResult.refresh()` is a full reload and has
 * nothing to do with this. Which results register at all is `gateway.ts`'s decision: only one
 * holding a value the *prerender* produced, never one a client navigation has just read live.
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
  /** Joins the pending batch, opening one when there is none. */
  register(entry: VolatileRefreshEntry): void;
  /** Flushes the pending batch now. Nothing pending, nothing happens. */
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
  /** A flush is already scheduled for the entries collected so far. */
  let armed = false;

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
    armed = false;
    const registered = entries.splice(0);
    if (registered.length === 0) return;
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
      // One read for this batch, shared by every result that took part in it.
      const answer = volatileByIds(ids);
      for (const entry of batched) work.push(settle(entry, answer));
    }
    await Promise.all(work);
  }

  return {
    register(entry) {
      entries.push(entry);
      if (armed) return;
      armed = true;
      schedule(() => void refresh());
    },
    refresh,
  };
}
