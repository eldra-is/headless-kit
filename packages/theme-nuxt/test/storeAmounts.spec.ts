import { describe, expect, it, vi } from 'vitest';
import {
  STORE_AMOUNTS_READ_FAILED_WARNING,
  readStoreAmounts,
  toStoreAmounts,
} from '../src/runtime/storeAmounts';

/** WS-1473: the store's amounts for `⟦store …⟧` price tokens, read once at build time. */
describe('readStoreAmounts', () => {
  it("bakes in every currency's threshold the gateway publishes", async () => {
    const warn = vi.fn();
    const amounts = await readStoreAmounts(
      {
        features: {
          getStoreAmounts: async () => ({
            freeShippingThreshold: { ISK: 15000, EUR: 10000 },
          }),
        },
      },
      warn
    );
    expect(amounts).toEqual({
      freeShippingThreshold: { ISK: 15000, EUR: 10000 },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers null with one warning when the read fails, and null without credentials', async () => {
    const warn = vi.fn();
    const amounts = await readStoreAmounts(
      {
        features: {
          getStoreAmounts: async () => {
            throw new Error('503');
          },
        },
      },
      warn
    );
    expect(amounts).toBeNull();
    expect(warn).toHaveBeenCalledWith(`${STORE_AMOUNTS_READ_FAILED_WARNING} (503)`);
    expect(await readStoreAmounts(null, warn)).toBeNull();
  });

  it('keeps only currency codes with non-negative integer amounts', () => {
    expect(
      toStoreAmounts({
        freeShippingThreshold: { ISK: 15000, eur: 1, USD: -1, GBP: 1.5 },
        junk: [1],
      })
    ).toEqual({ freeShippingThreshold: { ISK: 15000 } });
    expect(toStoreAmounts(null)).toBeNull();
  });
});
