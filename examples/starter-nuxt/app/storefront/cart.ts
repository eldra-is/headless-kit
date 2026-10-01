import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { StorefrontAck, StorefrontCartLine, StorefrontCartTotals } from './types';

export interface CartStore {
  lines: Ref<StorefrontCartLine[]>;
  totals: Ref<StorefrontCartTotals | null>;
  count: ComputedRef<number>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
  drawerOpen: Ref<boolean>;
  drawerAvailable: Ref<boolean>;
  /**
   * "The theme itself mounts the cart drawer." Set by the app shell (`app/app.vue`), which hosts the
   * one drawer the site has, so a `drawer`-variant `cart` block an author places on a page draws no
   * second one. The shell declares it in its own `setup()` — before any page block is created, on
   * the server as well as in the browser — so that block makes the same decision in the prerendered
   * HTML as it does after hydration.
   *
   * Not the same fact as `drawerAvailable`, which says a drawer is mounted and *live* (it is what
   * turns the header's bag from a link to `/cart` into a button) and is therefore only ever true in
   * the browser, raised from the hosting block's `onMounted`.
   */
  drawerHosted: Ref<boolean>;
  lastRemoved: Ref<{ line: StorefrontCartLine; index: number } | null>;
  add(i: { variantId: string; quantity: number }): Promise<void>;
  setQuantity(lineId: string, quantity: number): Promise<void>;
  remove(lineId: string): Promise<void>;
  undoRemove(): Promise<void>;
  applyDiscount(code: string): Promise<StorefrontAck>;
  removeDiscount(code: string): Promise<void>;
  checkoutUrl: ComputedRef<string | null>;
}

export interface CartSnapshot {
  lines: StorefrontCartLine[];
  totals: StorefrontCartTotals;
}

/**
 * What `createCartStore` needs from whoever actually keeps the cart persisted: a live cart id
 * plus `client.cart.*` for `gateway.ts`, an in-memory Northwind fixture for `demo.ts`. The store
 * itself owns only reactive presentation state (`pending`/`error`, the drawer flags, the
 * optimistic remove/undo pair) — every change that has to survive a reload goes through here.
 */
export interface CartOps {
  /** The cart as it exists when the store is created (e.g. a previously remembered cart id). */
  init(): Promise<CartSnapshot>;
  add(input: { variantId: string; quantity: number }): Promise<CartSnapshot>;
  setQuantity(lineId: string, quantity: number): Promise<CartSnapshot>;
  remove(lineId: string): Promise<CartSnapshot>;
  applyDiscount(code: string): Promise<{ ack: StorefrontAck; snapshot?: CartSnapshot }>;
  removeDiscount(): Promise<CartSnapshot>;
  /** Reactive so a cart id assigned after the first `add()` updates the link immediately. */
  checkoutUrl: Ref<string | null>;
}

function toErrorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : 'Something went wrong.';
}

/**
 * The shared cart engine both `demo.ts` and `gateway.ts` build their `StorefrontSource.cart` from,
 * swapping only `ops` — this is what `cart.spec.ts` exercises directly, against a small fake `ops`
 * it defines itself, so the reactive/undo/pending behaviour is proven once regardless of backend.
 */
export function createCartStore(ops: CartOps): CartStore {
  const lines = ref<StorefrontCartLine[]>([]) as Ref<StorefrontCartLine[]>;
  const totals = ref<StorefrontCartTotals | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);
  const drawerOpen = ref(false);
  const drawerAvailable = ref(false);
  const drawerHosted = ref(false);
  const lastRemoved = ref<{ line: StorefrontCartLine; index: number } | null>(null) as Ref<{
    line: StorefrontCartLine;
    index: number;
  } | null>;

  const count = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
  const checkoutUrl = computed(() => ops.checkoutUrl.value);

  let inFlight = 0;

  async function run(task: () => Promise<CartSnapshot>): Promise<void> {
    inFlight += 1;
    pending.value = true;
    error.value = null;
    try {
      const snapshot = await task();
      lines.value = snapshot.lines;
      totals.value = snapshot.totals;
    } catch (caught) {
      error.value = toErrorMessage(caught);
    } finally {
      inFlight -= 1;
      if (inFlight === 0) pending.value = false;
    }
  }

  // Loads whatever cart already exists (a remembered cart id for the gateway, the Northwind
  // fixture for the demo) as soon as the store is created — no separate "refresh" the caller has
  // to remember to call first.
  void run(() => ops.init());

  return {
    lines,
    totals,
    count,
    pending,
    error,
    drawerOpen,
    drawerAvailable,
    drawerHosted,
    lastRemoved,
    checkoutUrl,
    add: (input) => run(() => ops.add(input)),
    setQuantity: (lineId, quantity) => run(() => ops.setQuantity(lineId, quantity)),
    async remove(lineId) {
      const index = lines.value.findIndex((line) => line.id === lineId);
      if (index === -1) return;
      const line = lines.value[index]!;
      await run(() => ops.remove(lineId));
      if (error.value === null) lastRemoved.value = { line, index };
    },
    async undoRemove() {
      const removed = lastRemoved.value;
      if (!removed) return;
      // Reinsert at the exact index it was removed from — trusting a re-`add()`'s own returned
      // line order would not guarantee that, so this half is local and synchronous.
      lines.value = [
        ...lines.value.slice(0, removed.index),
        removed.line,
        ...lines.value.slice(removed.index),
      ];
      lastRemoved.value = null;
      inFlight += 1;
      pending.value = true;
      error.value = null;
      try {
        const snapshot = await ops.add({
          variantId: removed.line.variantId,
          quantity: removed.line.quantity,
        });
        // Only totals are trusted from the backend here — `lines` stays the locally-restored
        // order above.
        totals.value = snapshot.totals;
      } catch (caught) {
        error.value = toErrorMessage(caught);
      } finally {
        inFlight -= 1;
        if (inFlight === 0) pending.value = false;
      }
    },
    async applyDiscount(code) {
      inFlight += 1;
      pending.value = true;
      error.value = null;
      try {
        const { ack, snapshot } = await ops.applyDiscount(code);
        if (snapshot) {
          lines.value = snapshot.lines;
          totals.value = snapshot.totals;
        }
        return ack;
      } catch (caught) {
        error.value = toErrorMessage(caught);
        return { ok: false, reason: 'failed' };
      } finally {
        inFlight -= 1;
        if (inFlight === 0) pending.value = false;
      }
    },
    // `code` identifies which applied-discount chip the caller removed; a cart only ever carries
    // one discount today, so `ops.removeDiscount()` itself needs no argument.
    removeDiscount: (_code) => run(() => ops.removeDiscount()),
  };
}
