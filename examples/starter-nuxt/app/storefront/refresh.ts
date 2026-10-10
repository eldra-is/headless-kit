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
 * **A batch is every result registered before it flushes, and there can be more than one.** It
 * cannot be one batch per *page*, and that was a real defect: a theme's blocks are lazily imported
 * components, so on a generated page the ones whose chunk arrives after the app has mounted create
 * their results after the first batch has already gone out. A one-shot refresher dropped them —
 * the product page's carousel never refreshed a price and never drew the refresh treatment,
 * because `product-detail` had opened and closed the page's only batch a tick earlier.
 *
 * **What is once per page load is the question, not the batch.** A second burst asking again about
 * products the first burst has already re-read was the next defect, live: the deployed product page
 * issued its detail read and its `id:in` batch twice, 35 ms apart, with identical ids. So this keeps
 * a *session* — the whole page load, across every burst:
 *
 *  - `refreshed` — every result that has already taken part. A result registered twice takes part
 *    once.
 *  - `answerFor` — the read that is answering, or has already answered, for one product id. A
 *    target in there is never asked about again; the result that shows it waits for the answer
 *    already on its way and folds in exactly the same values. That is also what makes two results
 *    needing the same detail read cost one request, and what keeps two blocks showing the same
 *    product from painting two different truths.
 *
 * Which results register at all is `gateway.ts`'s decision: only one holding a value the
 * *prerender* produced, never one a client navigation has just read live.
 * `StorefrontResult.refresh()` is a full reload and has nothing to do with any of this.
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
   * data it is refreshing. The product detail page is the case that exists: it needs the
   * variant-level inventory the products list carries none of (`gateway.ts`'s `mapProductDetails`),
   * so it re-reads the product and answers with a snapshot of its own.
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
  /** Every result that has taken part in a refresh this page load, however often it registered. */
  const refreshed = new WeakSet<VolatileRefreshEntry>();
  /**
   * Per product id, the read that is answering — or has answered — for it, for the whole page load.
   * Kept after it settles on purpose: a result that arrives later and shows the same product folds
   * the same answer in instead of asking a second time, and a target whose read *failed* is not
   * retried either (the page keeps the value it was built with, which is the same outcome).
   */
  const answerFor = new Map<string, Promise<readonly VolatileSnapshot[]>>();
  /**
   * The same thing for results that read for themselves (`VolatileRefreshEntry.own`), kept apart
   * from `answerFor` on purpose: the two kinds of read cannot stand in for one another. `own` exists
   * *because* the batched read cannot answer what such a result needs — the product page's
   * variant-level inventory, which the products list carries none of — so a batch answer folded into
   * a detail page would leave it on the stock the page was built with, which is the whole thing the
   * refresh is for. Two detail results over the same product still share one read, through here.
   *
   * (It used to need no saying: a detail product's volatile id was a *variant's*, so no list read
   * could ever match it. Now that every row names the product it is about, they do match.)
   */
  const ownAnswerFor = new Map<string, Promise<readonly VolatileSnapshot[]>>();

  /** Every snapshot the reads this entry is waiting on answer with, as one list. */
  function merged(
    waiting: ReadonlySet<Promise<readonly VolatileSnapshot[]>>
  ): Promise<readonly VolatileSnapshot[]> {
    const reads = [...waiting];
    if (reads.length === 1) return reads[0]!;
    return Promise.all(reads).then((lists) => lists.flat());
  }

  /** Splits an entry's targets into the reads already answering for them and the ids nothing is. */
  function claim(
    pending: ReadonlyMap<string, Promise<readonly VolatileSnapshot[]>>,
    targets: readonly string[]
  ): { waiting: Set<Promise<readonly VolatileSnapshot[]>>; missing: string[] } {
    const waiting = new Set<Promise<readonly VolatileSnapshot[]>>();
    const missing: string[] = [];
    for (const id of targets) {
      const answered = pending.get(id);
      if (answered === undefined) missing.push(id);
      else waiting.add(answered);
    }
    return { waiting, missing };
  }

  /**
   * One entry's half of the refresh: mark, await, fold in, unmark. A failure is swallowed on
   * purpose — the page already shows a value, and replacing it with an error would be a worse
   * answer than a price that is a few minutes old.
   */
  async function settle(
    entry: VolatileRefreshEntry,
    answer: Promise<readonly VolatileSnapshot[]>
  ): Promise<void> {
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
    const ids: string[] = [];
    const work: Array<Promise<void>> = [];
    // This flush's batched read, promised before it is issued so the ids it will answer for can be
    // claimed in `answerFor` as the entries are walked — a second entry in the same flush showing
    // the same product then waits for this one read rather than adding a second.
    let answerBatch!: (snapshots: readonly VolatileSnapshot[]) => void;
    let failBatch!: (cause: unknown) => void;
    const batch = new Promise<readonly VolatileSnapshot[]>((resolve, reject) => {
      answerBatch = resolve;
      failBatch = reject;
    });

    for (const entry of registered) {
      // A result that has already taken part in this page's refresh. Registering twice is a block
      // creating its results twice (a remount, a second render pass), not a second thing to ask.
      if (refreshed.has(entry)) continue;
      refreshed.add(entry);
      // Nothing on screen to refresh — a result that answered `null`, or one whose data holds no
      // products at all (a collection's own info, an order). Asking would be a request for
      // nobody.
      const targets = collectVolatileTargets(entry.read());
      if (targets.length === 0) continue;

      // A result that reads for itself asks its own question, shared only with another result that
      // would ask exactly the same one (`ownAnswerFor`), never with the batch.
      if (entry.own !== undefined) {
        const { waiting, missing } = claim(ownAnswerFor, targets);
        if (missing.length > 0) {
          const read = Promise.resolve(entry.own(entry.read()));
          for (const id of missing) ownAnswerFor.set(id, read);
          waiting.add(read);
        }
        work.push(settle(entry, merged(waiting)));
        continue;
      }

      const { waiting, missing } = claim(answerFor, targets);
      // Nothing missing: every value it shows is already being re-read, or has been. Fold that
      // answer in rather than asking again.
      if (missing.length > 0) {
        for (const id of missing) answerFor.set(id, batch);
        ids.push(...missing);
        waiting.add(batch);
      }
      work.push(settle(entry, merged(waiting)));
    }

    // One read for every id this flush is the first to ask about, shared by every result in it.
    if (ids.length > 0) volatileByIds(ids).then(answerBatch, failBatch);
    else answerBatch([]);
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
