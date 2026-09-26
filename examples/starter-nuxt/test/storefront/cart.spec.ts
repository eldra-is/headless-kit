import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createCartStore, type CartOps, type CartSnapshot } from '../../app/storefront/cart';
import type { StorefrontCartLine, StorefrontCartTotals } from '../../app/storefront/types';

function line(overrides: Partial<StorefrontCartLine> = {}): StorefrontCartLine {
  return {
    id: 'line-1',
    variantId: 'merino-crew-sweater::oat::m',
    title: 'Merino crew sweater',
    url: '/products/merino-crew-sweater',
    variantLabel: 'Oat / M',
    quantity: 1,
    unitPrice: 9600,
    lineTotal: 9600,
    image: null,
    max: null,
    ...overrides,
  };
}

function totalsFor(lines: StorefrontCartLine[]): StorefrontCartTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  return { subtotal, discount: null, shipping: subtotal > 0 ? 0 : null, tax: null, total: subtotal };
}

function emptySnapshot(): CartSnapshot {
  return { lines: [], totals: totalsFor([]) };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A tiny fake `CartOps` — the same interface `demo.ts` and `gateway.ts` implement — with
 * `applyDiscount` standing in for the Northwind demo's own WINTER15/WINTER51 rule
 * (`eldra-starter-spec/02-blocks.md`'s cart default content) so this proves `createCartStore`'s
 * engine independent of either backend. */
function fakeOps(overrides: Partial<CartOps> = {}): CartOps {
  return {
    init: async () => emptySnapshot(),
    add: async () => emptySnapshot(),
    setQuantity: async () => emptySnapshot(),
    remove: async () => emptySnapshot(),
    applyDiscount: async (code) =>
      code === 'WINTER15' ? { ack: { ok: true } } : { ack: { ok: false, reason: 'invalid' } },
    removeDiscount: async () => emptySnapshot(),
    checkoutUrl: ref<string | null>(null),
    ...overrides,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createCartStore', () => {
  it('starts pending and settles once the initial load resolves', async () => {
    const store = createCartStore(fakeOps());
    expect(store.pending.value).toBe(true);
    await settle();
    expect(store.pending.value).toBe(false);
    expect(store.lines.value).toEqual([]);
  });

  it('add() increments count by the resolved snapshot', async () => {
    const added = line({ quantity: 2, lineTotal: 19200 });
    const snapshot: CartSnapshot = { lines: [added], totals: totalsFor([added]) };
    const store = createCartStore(fakeOps({ add: async () => snapshot }));
    await settle();
    await store.add({ variantId: added.variantId, quantity: 2 });
    expect(store.count.value).toBe(2);
    expect(store.lines.value).toEqual([added]);
  });

  it('setQuantity() replaces lines/totals from the resolved snapshot', async () => {
    const updated = line({ quantity: 3, lineTotal: 28800 });
    const store = createCartStore(fakeOps({ setQuantity: async () => ({ lines: [updated], totals: totalsFor([updated]) }) }));
    await settle();
    await store.setQuantity('line-1', 3);
    expect(store.lines.value).toEqual([updated]);
    expect(store.count.value).toBe(3);
  });

  it('remove() stores the removed line and its index in lastRemoved', async () => {
    const a = line({ id: 'a' });
    const b = line({ id: 'b', variantId: 'speckled-latte-mug::clay' });
    const c = line({ id: 'c', variantId: 'walnut-serving-board::large' });
    const store = createCartStore(
      fakeOps({
        init: async () => ({ lines: [a, b, c], totals: totalsFor([a, b, c]) }),
        remove: async (lineId) => {
          const remaining = [a, b, c].filter((l) => l.id !== lineId);
          return { lines: remaining, totals: totalsFor(remaining) };
        },
      })
    );
    await settle();
    await store.remove('b');
    expect(store.lines.value).toEqual([a, c]);
    expect(store.lastRemoved.value).toEqual({ line: b, index: 1 });
  });

  it('undoRemove() restores the removed line at the same index and clears lastRemoved', async () => {
    const a = line({ id: 'a' });
    const b = line({ id: 'b', variantId: 'speckled-latte-mug::clay' });
    const c = line({ id: 'c', variantId: 'walnut-serving-board::large' });
    const store = createCartStore(
      fakeOps({
        init: async () => ({ lines: [a, b, c], totals: totalsFor([a, b, c]) }),
        remove: async (lineId) => {
          const remaining = [a, b, c].filter((l) => l.id !== lineId);
          return { lines: remaining, totals: totalsFor(remaining) };
        },
        add: async () => ({ lines: [a, c], totals: totalsFor([a, b, c]) }),
      })
    );
    await settle();
    await store.remove('b');
    await store.undoRemove();
    expect(store.lines.value).toEqual([a, b, c]);
    expect(store.lastRemoved.value).toBeNull();
  });

  it('undoRemove() does nothing when there is nothing to restore', async () => {
    const store = createCartStore(fakeOps());
    await settle();
    await store.undoRemove();
    expect(store.lines.value).toEqual([]);
  });

  it('applyDiscount("WINTER51") resolves { ok: false, reason: "invalid" }', async () => {
    const store = createCartStore(fakeOps());
    await settle();
    const ack = await store.applyDiscount('WINTER51');
    expect(ack).toEqual({ ok: false, reason: 'invalid' });
  });

  it('applyDiscount("WINTER15") resolves { ok: true }', async () => {
    const store = createCartStore(fakeOps());
    await settle();
    const ack = await store.applyDiscount('WINTER15');
    expect(ack).toEqual({ ok: true });
  });

  it('pending is true while a call is in flight and false once it resolves', async () => {
    const gate = deferred<CartSnapshot>();
    const store = createCartStore(fakeOps({ add: () => gate.promise }));
    await settle();
    expect(store.pending.value).toBe(false);

    const call = store.add({ variantId: 'v1', quantity: 1 });
    expect(store.pending.value).toBe(true);
    gate.resolve(emptySnapshot());
    await call;
    expect(store.pending.value).toBe(false);
  });

  it('checkoutUrl mirrors the ops-provided ref reactively', async () => {
    const checkoutUrl = ref<string | null>(null);
    const store = createCartStore(fakeOps({ checkoutUrl }));
    await settle();
    expect(store.checkoutUrl.value).toBeNull();
    checkoutUrl.value = '/checkout/abc';
    expect(store.checkoutUrl.value).toBe('/checkout/abc');
  });
});
