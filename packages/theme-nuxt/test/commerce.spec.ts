import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NO_CURRENCY_WARNING,
  READ_TIMEOUT_MS,
  readStoreCommerce,
  type StoreCommerceReader,
} from '../src/runtime/commerce';

/** An SDK client narrowed to the one method this read calls. */
function reader(getCommerce: StoreCommerceReader['features']['getCommerce']): StoreCommerceReader {
  return { features: { getCommerce } };
}

const ISK = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };

afterEach(() => {
  vi.useRealTimers();
});

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
    // A gateway that accepts and never answers. Under fake timers, advancing to the bound is what
    // aborts the signal the read was given — and the abort has to come back as `null`, not as a
    // throw out of a module `setup`.
    // Also pins the bound itself: a timeout long enough to outlast any real build would make the
    // rest of this test pass while bounding nothing.
    expect(READ_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const pending = readStoreCommerce(
      reader(
        (_options, context) =>
          new Promise((_resolve, reject) => {
            signal = context?.signal;
            signal?.addEventListener('abort', () => reject(signal?.reason));
          })
      ),
      warn
    );

    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);

    await expect(pending).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(NO_CURRENCY_WARNING);
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

  it('survives an unreachable gateway, naming the cause in the one warning it prints', async () => {
    // The build must finish: a currency nobody can read costs a symbol, not a deploy. And it prints
    // one line, not two — a build log must not read as reporting two separate faults — with the
    // cause in it, since "not configured" and "refused" are different problems.
    const warn = vi.fn();

    await expect(
      readStoreCommerce(
        reader(() => Promise.reject(new Error('fetch failed'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(NO_CURRENCY_WARNING);
    expect(warn.mock.calls[0]?.[0]).toContain('the organisation read failed: fetch failed');
  });

  it('refuses a half-filled answer rather than passing undefined fields on, and says so', async () => {
    // A theme reads `commerce.taxInclusivePricing` as a boolean; `undefined` would read as "prices
    // exclude tax" at every call site that tests it. Discarding a record the organisation did
    // publish is worth naming, though — it is not the same as a store that configured nothing.
    const partials: Array<typeof ISK> = [
      { currency: 'ISK' } as unknown as typeof ISK,
      { ...ISK, currency: '' },
      { ...ISK, defaultTaxRate: '0.24' } as unknown as typeof ISK,
    ];

    for (const partial of partials) {
      const warn = vi.fn();
      await expect(
        readStoreCommerce(
          reader(async () => partial),
          warn
        )
      ).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('incomplete commerce record');
    }
  });
});
