import { describe, expect, it, vi } from 'vitest';
import {
  NO_CURRENCY_WARNING,
  readStoreCommerce,
  type StoreCommerceReader,
} from '../src/runtime/commerce';

/** An SDK client narrowed to the one method this read calls. */
function reader(getCommerce: StoreCommerceReader['features']['getCommerce']): StoreCommerceReader {
  return { features: { getCommerce } };
}

const ISK = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };

describe('readStoreCommerce', () => {
  it('passes the store’s own currency through to the runtime config', async () => {
    const warn = vi.fn();

    await expect(
      readStoreCommerce(
        reader(async () => ISK),
        warn
      )
    ).resolves.toEqual(ISK);
    expect(warn).not.toHaveBeenCalled();
  });

  it('bounds the read, so a gateway that never answers cannot hang the build', async () => {
    const signals: Array<AbortSignal | undefined> = [];

    await readStoreCommerce(
      reader(async (_options, context) => {
        signals.push(context?.signal);
        return ISK;
      }),
      vi.fn()
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it('warns once and answers null for a store that publishes no commerce', async () => {
    const warn = vi.fn();

    await expect(
      readStoreCommerce(
        reader(async () => null),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(NO_CURRENCY_WARNING);
  });

  it('warns once and answers null with no client at all', async () => {
    // A site built without gateway credentials: no request to make, same outcome.
    const warn = vi.fn();

    await expect(readStoreCommerce(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(NO_CURRENCY_WARNING);
  });

  it('survives an unreachable gateway, naming the failure beside the warning', async () => {
    // The build must finish: a currency nobody can read costs a symbol, not a deploy.
    const warn = vi.fn();

    await expect(
      readStoreCommerce(
        reader(() => Promise.reject(new Error('fetch failed'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('fetch failed');
    expect(warn).toHaveBeenLastCalledWith(NO_CURRENCY_WARNING);
  });

  it('refuses a half-filled answer rather than passing undefined fields on', async () => {
    // A theme reads `commerce.taxInclusivePricing` as a boolean; `undefined` would read as "prices
    // exclude tax" at every call site that tests it.
    const warn = vi.fn();
    const partial = { currency: 'ISK' } as unknown as typeof ISK;

    await expect(
      readStoreCommerce(
        reader(async () => partial),
        warn
      )
    ).resolves.toBeNull();
    await expect(
      readStoreCommerce(
        reader(async () => ({ ...ISK, currency: '' })),
        warn
      )
    ).resolves.toBeNull();
    await expect(
      readStoreCommerce(
        reader(async () => ({ ...ISK, defaultTaxRate: '0.24' }) as unknown as typeof ISK),
        warn
      )
    ).resolves.toBeNull();
  });
});
