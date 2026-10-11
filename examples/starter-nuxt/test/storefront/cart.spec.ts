import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { EldraHttpError } from '@eldrajs/sdk';
import {
  createCartStore,
  type CartAddInput,
  type CartOps,
  type CartSnapshot,
} from '../../app/storefront/cart';
import type { StorefrontCartLine, StorefrontCartTotals } from '../../app/storefront/types';

function line(overrides: Partial<StorefrontCartLine> = {}): StorefrontCartLine {
  return {
    id: 'line-1',
    productId: 'merino-crew-sweater',
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
  return {
    subtotal,
    discount: null,
    shipping: subtotal > 0 ? 0 : null,
    tax: null,
    total: subtotal,
  };
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
    await store.add({
      productId: added.productId,
      variantId: added.variantId,
      quantity: 2,
    });
    expect(store.count.value).toBe(2);
    expect(store.lines.value).toEqual([added]);
  });

  /** Both halves reach `ops`, unchanged: the backend resolves the pair, so a store that dropped or
   *  substituted either would send a pair that does not exist (`CartAddInput`). */
  it('add() forwards the product id and the variant id to ops as given', async () => {
    const inputs: CartAddInput[] = [];
    const store = createCartStore(
      fakeOps({
        add: async (input) => {
          inputs.push(input);
          return emptySnapshot();
        },
      })
    );
    await settle();
    await store.add({ productId: 'prod-merino', variantId: 'var-oat-m', quantity: 3 });
    expect(inputs).toEqual([{ productId: 'prod-merino', variantId: 'var-oat-m', quantity: 3 }]);
  });

  it('setQuantity() replaces lines/totals from the resolved snapshot', async () => {
    const updated = line({ quantity: 3, lineTotal: 28800 });
    const store = createCartStore(
      fakeOps({ setQuantity: async () => ({ lines: [updated], totals: totalsFor([updated]) }) })
    );
    await settle();
    await store.setQuantity('line-1', 3);
    expect(store.lines.value).toEqual([updated]);
    expect(store.count.value).toBe(3);
  });

  it('remove() stores the removed line and its index in lastRemoved', async () => {
    const a = line({ id: 'a' });
    const b = line({
      id: 'b',
      productId: 'speckled-latte-mug',
      variantId: 'speckled-latte-mug::clay',
    });
    const c = line({
      id: 'c',
      productId: 'walnut-serving-board',
      variantId: 'walnut-serving-board::large',
    });
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
    const b = line({
      id: 'b',
      productId: 'speckled-latte-mug',
      variantId: 'speckled-latte-mug::clay',
    });
    const c = line({
      id: 'c',
      productId: 'walnut-serving-board',
      variantId: 'walnut-serving-board::large',
    });
    const addInputs: CartAddInput[] = [];
    const store = createCartStore(
      fakeOps({
        init: async () => ({ lines: [a, b, c], totals: totalsFor([a, b, c]) }),
        remove: async (lineId) => {
          const remaining = [a, b, c].filter((l) => l.id !== lineId);
          return { lines: remaining, totals: totalsFor(remaining) };
        },
        add: async (input) => {
          addInputs.push(input);
          return { lines: [a, c], totals: totalsFor([a, b, c]) };
        },
      })
    );
    await settle();
    await store.remove('b');
    await store.undoRemove();
    expect(store.lines.value).toEqual([a, b, c]);
    expect(store.lastRemoved.value).toBeNull();
    // The re-add is the removed line's own pair — a line id is not something `ops.add` can take.
    expect(addInputs).toEqual([
      { productId: 'speckled-latte-mug', variantId: 'speckled-latte-mug::clay', quantity: 1 },
    ]);
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

    const call = store.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(store.pending.value).toBe(true);
    gate.resolve(emptySnapshot());
    await call;
    expect(store.pending.value).toBe(false);
  });

  /**
   * A failed mutation has to survive as more than a sentence. The gateway refuses an add it cannot
   * fill with `409 { code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' }`, and `code` is the half
   * every other conflict also carries — so a store that kept only `caught.message` left a block with
   * no way to tell "out of stock" from "your connection dropped", and `message` itself ("Web Studio
   * request failed with 409 Conflict") is not a sentence to show anyone.
   */
  describe('a failed mutation', () => {
    const outOfStock = new EldraHttpError({ status: 409, statusText: 'Conflict' } as Response, {
      code: 'CONFLICT',
      errorId: 'CART_INSUFFICIENT_STOCK',
      detail: 'insufficient stock',
    });

    it('keeps the SDK error’s errorId, code and status in lastFailure', async () => {
      const store = createCartStore(
        fakeOps({
          add: async () => {
            throw outOfStock;
          },
        })
      );
      await settle();
      await store.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

      expect(store.lastFailure.value).toEqual({
        message: outOfStock.message,
        errorId: 'CART_INSUFFICIENT_STOCK',
        code: 'CONFLICT',
        status: 409,
      });
      // …and the string half still works for every existing caller.
      expect(store.error.value).toBe(outOfStock.message);
      expect(store.pending.value).toBe(false);
    });

    it('reports nothing structured for a request that never reached the gateway', async () => {
      const store = createCartStore(
        fakeOps({
          setQuantity: async () => {
            throw new TypeError('Failed to fetch');
          },
        })
      );
      await settle();
      await store.setQuantity('line-1', 2);

      expect(store.lastFailure.value).toEqual({
        message: 'Failed to fetch',
        errorId: null,
        code: null,
        status: null,
      });
    });

    /**
     * The answer a caller branches on is the one its *own* call resolved with. A store-wide field
     * read after awaiting cannot say whose call it describes, and says nothing at all about a call
     * that returned early without asking the backend anything — which is how a refused undo used to
     * make a second press of the same (now empty) Undo button re-raise a refusal already shown.
     */
    it('resolves the failure of the call that failed, and null from a no-op', async () => {
      const a = line({ id: 'a' });
      const store = createCartStore(
        fakeOps({
          init: async () => ({ lines: [a], totals: totalsFor([a]) }),
          remove: async () => emptySnapshot(),
          add: async () => {
            throw outOfStock;
          },
        })
      );
      await settle();

      // A line that is not in the cart asks the backend nothing, so nothing failed.
      expect(await store.remove('not-a-line')).toBeNull();
      expect(await store.remove('a')).toBeNull();

      const refused = await store.undoRemove();
      expect(refused?.errorId).toBe('CART_INSUFFICIENT_STOCK');
      // …and a second press has nothing left to restore, so it reports nothing — even though the
      // store-wide fields still remember the refusal that did happen.
      expect(await store.undoRemove()).toBeNull();
      expect(store.lastFailure.value?.errorId).toBe('CART_INSUFFICIENT_STOCK');
    });

    it('resolves the failure from every other mutation too', async () => {
      const a = line({ id: 'a' });
      const store = createCartStore(
        fakeOps({
          init: async () => ({ lines: [a], totals: totalsFor([a]) }),
          add: async () => {
            throw outOfStock;
          },
          setQuantity: async () => {
            throw outOfStock;
          },
          remove: async () => {
            throw outOfStock;
          },
          removeDiscount: async () => {
            throw outOfStock;
          },
        })
      );
      await settle();

      expect((await store.add({ productId: 'p1', variantId: 'v1', quantity: 1 }))?.status).toBe(
        409
      );
      expect((await store.setQuantity('a', 2))?.status).toBe(409);
      expect((await store.remove('a'))?.status).toBe(409);
      expect((await store.removeDiscount('WINTER15'))?.status).toBe(409);
      // A refused removal leaves nothing to undo: the line is still in the cart.
      expect(store.lastRemoved.value).toBeNull();
    });

    it('is cleared by the next mutation, together with error', async () => {
      let fails = true;
      const store = createCartStore(
        fakeOps({
          add: async () => {
            if (fails) throw outOfStock;
            return emptySnapshot();
          },
        })
      );
      await settle();
      await store.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
      expect(store.lastFailure.value).not.toBeNull();

      fails = false;
      await store.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
      expect(store.lastFailure.value).toBeNull();
      expect(store.error.value).toBeNull();
    });

    it('records the failure of the re-add behind undoRemove', async () => {
      const a = line({ id: 'a' });
      const store = createCartStore(
        fakeOps({
          init: async () => ({ lines: [a], totals: totalsFor([a]) }),
          remove: async () => emptySnapshot(),
          add: async () => {
            throw outOfStock;
          },
        })
      );
      await settle();
      await store.remove('a');
      await store.undoRemove();

      expect(store.lastFailure.value?.errorId).toBe('CART_INSUFFICIENT_STOCK');
      // The line is still back on screen — the restore is local and deliberate (see `undoRemove`),
      // which is exactly why a shopper has to be told the shop could not take it back.
      expect(store.lines.value).toEqual([a]);
    });

    it('records the failure of an applyDiscount that threw, and still answers an ack', async () => {
      const store = createCartStore(
        fakeOps({
          applyDiscount: async () => {
            throw outOfStock;
          },
        })
      );
      await settle();
      expect(await store.applyDiscount('WINTER15')).toEqual({ ok: false, reason: 'failed' });
      expect(store.lastFailure.value?.status).toBe(409);
    });
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
