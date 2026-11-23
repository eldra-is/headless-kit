import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { toStorefrontFailure, type StorefrontFailure } from './feedback';
import type { StorefrontAck, StorefrontCartLine, StorefrontCartTotals } from './types';

export interface CartStore {
  lines: Ref<StorefrontCartLine[]>;
  totals: Ref<StorefrontCartTotals | null>;
  count: ComputedRef<number>;
  pending: Ref<boolean>;
  /**
   * The last *run* mutation's failure message, for the cart as a whole — a status, not a per-call
   * answer. A caller asking "did **my** call fail?" reads the value its own call resolved with
   * (every mutation below answers `StorefrontFailure | null`); reading this instead would describe
   * whatever the cart did last, including another block's request and a call that never ran.
   */
  error: Ref<string | null>;
  /** The same failure, structured (`app/storefront/feedback.ts`), with the same caveat. */
  lastFailure: Ref<StorefrontFailure | null>;
  /**
   * The three facts about the cart drawer that two unrelated component trees — the header
   * (`blocks/navigation/Block.vue`) and the cart itself (`blocks/cart/Block.vue`) — have to agree
   * on. **This doc comment is the one place the rules behind them live**; every other file that
   * takes part points here rather than restating them.
   *
   * - `drawerOpen` — is the drawer showing. The bag toggles it, the `Drawer`'s `v-model` follows it,
   *   and the app shell sets it back to `false` on **every** route change: the drawer is mounted in
   *   `app/app.vue`, so no navigation unmounts it, and a modal `<dialog>` left open over the page the
   *   shopper just navigated to makes that page inert and stops it scrolling. The destinations inside
   *   the drawer (each line's product title, Check out when it is same-site, View cart) are ordinary
   *   router links, so one rule in the shell covers all of them and any added later; `popstate` is
   *   covered too, because the router turns it into a route change.
   * - `drawerAvailable` — is a drawer mounted and *live*. It is what turns the header's bag from an
   *   `<a href="/cart">` into a `<button>` that toggles `drawerOpen`. Raised by the hosting block
   *   from `onMounted`, deliberately: on a prerendered page no mount hook has run, so the bag is a
   *   working link in the HTML a static host serves — what a visitor with no JavaScript, and one
   *   reading the page before it hydrates, has — and the swap to a button afterwards is an ordinary
   *   reactive update rather than a hydration correction.
   * - `drawerHosted` — **the theme itself mounts the drawer.** A cart has to be openable from the
   *   header on every route, so the drawer belongs to the shell and not to a page: `app/app.vue`
   *   mounts one `cart` block in its `drawer` variant with `host` set. It declares this flag in its
   *   own `setup()`, before any block on the page is created, so a `drawer`-variant `cart` block an
   *   author placed finds it already true and defers — no `<dialog>` of its own, on the server as
   *   much as in the browser, which is what keeps the generated HTML and the hydrated page at
   *   exactly one drawer. That block still shows its editor placeholder, saying the theme hosts the
   *   drawer. No field and no `block.json` version changes, so nothing migrates on deploy.
   *
   * They are presentation state in a storefront object on purpose: this store is already the channel
   * the header and the cart coordinate the drawer through, and it is built per request
   * (`app/plugins/eldra-storefront.ts`), so nothing leaks between server renders.
   */
  drawerOpen: Ref<boolean>;
  drawerAvailable: Ref<boolean>;
  drawerHosted: Ref<boolean>;
  lastRemoved: Ref<{ line: StorefrontCartLine; index: number } | null>;
  /**
   * Every mutation resolves with **its own** outcome: `null` when it succeeded, or when there was
   * nothing to do (a line that is already gone, an undo with nothing to restore), and the failure
   * when the backend refused it. That is what a block reports to the shopper
   * (`app/composables/useStorefrontFeedback.ts`) — a store-wide field read after the fact cannot say
   * whose call it describes, and says nothing at all about a call that returned early.
   */
  add(i: CartAddInput): Promise<StorefrontFailure | null>;
  setQuantity(lineId: string, quantity: number): Promise<StorefrontFailure | null>;
  remove(lineId: string): Promise<StorefrontFailure | null>;
  undoRemove(): Promise<StorefrontFailure | null>;
  applyDiscount(code: string): Promise<StorefrontAck>;
  removeDiscount(code: string): Promise<StorefrontFailure | null>;
  /** The cart's currency, or `undefined` before there is a cart. */
  currency: Ref<string | undefined>;
  /** Lines with no price in the cart's currency. While there are any, `checkoutUrl` is `null`. */
  notSold: ComputedRef<StorefrontCartLine[]>;
  /** Moves the whole cart to `code`. Nothing to do without a cart, or when it is in `code` already. */
  setCurrency(code: string): Promise<StorefrontFailure | null | undefined>;
  /** The last read of the cart failed (a timeout or 5xx); the basket id is kept. */
  loadFailed: Ref<boolean>;
  /** `none`: no cart. `loaded`: the cart is shown. `unloaded`: a cart is remembered but not read yet, or its read failed. */
  loadState: Ref<CartLoadState>;
  /** Reads the cart again, as another tab may have changed it. */
  reload(): Promise<StorefrontFailure | null>;
  /** Removes every line in `notSold`: "Remove and check out". */
  removeNotSold(): Promise<StorefrontFailure | null>;
  checkoutUrl: ComputedRef<string | null>;
  /**
   * The shopper followed the Check out link. Does nothing here — the link itself does the
   * navigating — and exists as the one hook `app/storefront/analytics.ts` listens on to record a
   * `begin_checkout`, which a source-level wrapper cannot observe from a plain `href`.
   */
  beginCheckout: () => void;
}

/**
 * Both halves of "what to put in the cart". The backend resolves the pair together — one lookup of
 * "this variant, of this product" — so a variant id alone is not enough, and a product id sent as
 * both is a pair that does not exist. A caller gets the pair from a product *detail* read
 * (`StorefrontProduct.productId`/`variantId`) or from a cart line (`StorefrontCartLine`); a product
 * card carries no variant at all, by design (`app/storefront/types.ts`).
 */
export type CartLoadState = 'none' | 'loaded' | 'unloaded';

/** A write refused locally: the cart could not be read, so nothing was sent. */
export const CART_NOT_LOADED = 'CART_NOT_LOADED';

/** A cart read that has not answered after this long counts as failed. */
export const CART_READ_TIMEOUT_MS = 8000;

export interface CartAddInput {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CartSnapshot {
  lines: StorefrontCartLine[];
  totals: StorefrontCartTotals;
  /** The cart's own currency; absent from a backend that does not say. */
  currency?: string;
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
  add(input: CartAddInput): Promise<CartSnapshot>;
  setQuantity(lineId: string, quantity: number): Promise<CartSnapshot>;
  remove(lineId: string): Promise<CartSnapshot>;
  applyDiscount(code: string): Promise<{ ack: StorefrontAck; snapshot?: CartSnapshot }>;
  removeDiscount(): Promise<CartSnapshot>;
  /** Reprices the cart in `code`. Absent: the backend cannot change a cart's currency. */
  setCurrency?(code: string): Promise<CartSnapshot>;
  /** Reactive so a cart id assigned after the first `add()` updates the link immediately. */
  checkoutUrl: Ref<string | null>;
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
  const lastFailure = ref<StorefrontFailure | null>(null);

  /** Every `catch` in this file, so no path can record one half of a failure and not the other —
   *  and the one place the caller's own answer comes from. */
  function fail(caught: unknown): StorefrontFailure {
    const failure = toStorefrontFailure(caught);
    lastFailure.value = failure;
    error.value = failure.message;
    return failure;
  }

  /** Every mutation's start: the previous failure is this mutation's history, not its result. */
  function clearFailure(): void {
    lastFailure.value = null;
    error.value = null;
  }
  const drawerOpen = ref(false);
  const drawerAvailable = ref(false);
  const drawerHosted = ref(false);
  const lastRemoved = ref<{ line: StorefrontCartLine; index: number } | null>(null) as Ref<{
    line: StorefrontCartLine;
    index: number;
  } | null>;

  const currency = ref<string | undefined>(undefined);
  const count = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0));
  const notSold = computed(() => lines.value.filter((line) => line.soldInCurrency === false));
  const checkoutUrl = computed(() => (notSold.value.length > 0 ? null : ops.checkoutUrl.value));

  // Every write runs through one queue, in the shopper's order, one request at a time, so the last
  // answer applied is always the newest server state.
  let tail: Promise<unknown> = Promise.resolve();
  let queuedWrites = 0;
  let reads = 0;
  let writeEpoch = 0;
  let reading: Promise<unknown> = Promise.resolve();
  let latestRead = 0;
  const loadFailed = ref(false);
  const loadState = ref<CartLoadState>('unloaded');
  const notLoaded: StorefrontFailure = {
    message: 'The cart could not be read.',
    errorId: CART_NOT_LOADED,
    code: null,
    status: null,
  };
  const settleBusy = (): void => {
    pending.value = queuedWrites > 0 || reads > 0;
  };

  function apply(snapshot: CartSnapshot): void {
    lines.value = snapshot.lines;
    totals.value = snapshot.totals;
    currency.value = snapshot.currency;
    loadFailed.value = false;
    loadState.value =
      snapshot.currency !== undefined || snapshot.lines.length > 0 ? 'loaded' : 'none';
  }

  function serial<T>(task: () => Promise<T>, refused: () => T): Promise<T> {
    queuedWrites += 1;
    pending.value = true;
    const next = tail.then(async () => {
      // A write waits for a read in flight, and a failed read is tried once more first; a cart that
      // still cannot be read takes no write, so a write never lands in a cart the page has not shown.
      await reading;
      if (loadFailed.value) await read();
      if (loadFailed.value) {
        queuedWrites -= 1;
        settleBusy();
        lastFailure.value = notLoaded;
        error.value = notLoaded.message;
        return refused();
      }
      writeEpoch += 1;
      try {
        return await task();
      } finally {
        writeEpoch += 1;
        queuedWrites -= 1;
        settleBusy();
      }
    });
    tail = next.catch(() => undefined);
    return next;
  }

  async function attempt(task: () => Promise<CartSnapshot>): Promise<StorefrontFailure | null> {
    clearFailure();
    try {
      apply(await task());
      return null;
    } catch (caught) {
      return fail(caught);
    }
  }

  const run = (task: () => Promise<CartSnapshot>): Promise<StorefrontFailure | null> =>
    serial(
      () => attempt(task),
      () => notLoaded
    );

  /** Only the newest read applies, and only when no write started or settled since it was sent. */
  function read(): Promise<StorefrontFailure | null> {
    const issuedAt = writeEpoch;
    latestRead += 1;
    const mine = latestRead;
    reads += 1;
    pending.value = true;
    clearFailure();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('The cart read timed out.')), CART_READ_TIMEOUT_MS);
    });
    const answer = Promise.race([ops.init(), timedOut]).then(
      (snapshot) => {
        if (mine === latestRead && writeEpoch === issuedAt) apply(snapshot);
        return null;
      },
      (caught: unknown) => {
        if (mine !== latestRead) return null;
        loadFailed.value = true;
        if (loadState.value !== 'none') loadState.value = 'unloaded';
        return fail(caught);
      }
    );
    const settled = answer.finally(() => {
      clearTimeout(timer);
      reads -= 1;
      settleBusy();
    });
    reading = settled;
    return settled;
  }

  // Consecutive currency choices waiting in the queue collapse into the last one; only that one is
  // sent, and the choices it replaced answer `undefined`.
  type MoveAnswer = StorefrontFailure | null | undefined;
  let waitingMove: {
    code: string;
    callers: Array<{ code: string; resolve: (answer: MoveAnswer) => void }>;
  } | null = null;

  function moveCurrency(code: string): Promise<MoveAnswer> {
    const change = ops.setCurrency;
    // A backend that cannot move a cart still answers in turn, after the read the choice waited for.
    if (change === undefined) {
      return serial(
        async () => null,
        () => notLoaded
      );
    }
    const joining = waitingMove;
    if (joining !== null) {
      joining.code = code;
      return new Promise((resolve) => joining.callers.push({ code, resolve }));
    }
    const move = {
      code,
      callers: [] as Array<{ code: string; resolve: (answer: MoveAnswer) => void }>,
    };
    waitingMove = move;
    const own = new Promise<MoveAnswer>((resolve) => move.callers.push({ code, resolve }));
    void serial(
      async () => {
        waitingMove = null;
        const target = move.code;
        const before = currency.value;
        const failure =
          before === undefined || before === target ? null : await attempt(() => change(target));
        if (failure === null && before !== target && currency.value === target) {
          lastRemoved.value = null;
        }
        for (const caller of move.callers) {
          if (caller.code !== target) caller.resolve(undefined);
        }
        [...move.callers]
          .reverse()
          .find((caller) => caller.code === target)
          ?.resolve(failure);
        for (const caller of move.callers) caller.resolve(undefined);
      },
      () => {
        waitingMove = null;
        [...move.callers].reverse()[0]?.resolve(notLoaded);
        for (const caller of move.callers) caller.resolve(undefined);
      }
    );
    return own;
  }

  // Loads whatever cart already exists (a remembered cart id for the gateway, the Northwind
  // fixture for the demo) as soon as the store is created — no separate "refresh" the caller has
  // to remember to call first.
  void read();

  return {
    lines,
    totals,
    count,
    pending,
    error,
    lastFailure,
    drawerOpen,
    drawerAvailable,
    drawerHosted,
    lastRemoved,
    checkoutUrl,
    beginCheckout: () => undefined,
    add: (input) => run(() => ops.add(input)),
    setQuantity: (lineId, quantity) => run(() => ops.setQuantity(lineId, quantity)),
    async remove(lineId) {
      const index = lines.value.findIndex((line) => line.id === lineId);
      // Already gone — nothing was asked of the backend, so nothing failed.
      if (index === -1) return null;
      const line = lines.value[index]!;
      const failure = await run(() => ops.remove(lineId));
      if (failure === null) lastRemoved.value = { line, index };
      return failure;
    },
    async undoRemove() {
      const removed = lastRemoved.value;
      if (!removed) return null;
      lastRemoved.value = null;
      // The restored line comes from the server's answer, in the cart's currency, put back where it was.
      return run(async () => {
        const snapshot = await ops.add({
          productId: removed.line.productId,
          variantId: removed.line.variantId,
          quantity: removed.line.quantity,
        });
        const at = snapshot.lines.findIndex((line) => line.variantId === removed.line.variantId);
        if (at === -1) return snapshot;
        const others = snapshot.lines.filter((_line, index) => index !== at);
        others.splice(Math.min(removed.index, others.length), 0, snapshot.lines[at]!);
        return { ...snapshot, lines: others };
      });
    },
    applyDiscount: (code) =>
      serial(
        async () => {
          clearFailure();
          try {
            const { ack, snapshot } = await ops.applyDiscount(code);
            if (snapshot) apply(snapshot);
            return ack;
          } catch (caught) {
            fail(caught);
            return { ok: false, reason: 'failed' } as StorefrontAck;
          }
        },
        () => ({ ok: false, reason: 'failed' }) as StorefrontAck
      ),
    // `code` identifies which applied-discount chip the caller removed; a cart only ever carries
    // one discount today, so `ops.removeDiscount()` itself needs no argument.
    removeDiscount: (_code) => run(() => ops.removeDiscount()),
    currency,
    notSold,
    setCurrency: moveCurrency,
    loadFailed,
    loadState,
    reload: read,
    removeNotSold: () =>
      serial(
        async () => {
          for (const line of [...notSold.value]) {
            const failure = await attempt(() => ops.remove(line.id));
            if (failure !== null) return failure;
          }
          return null;
        },
        () => notLoaded
      ),
  };
}
