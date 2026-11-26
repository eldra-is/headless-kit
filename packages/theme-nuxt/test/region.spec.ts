import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_TIMEOUT_MS,
  readStoreRegion,
  REGION_READ_FAILED_WARNING,
  resolveStoreRegion,
  type StoreRegionReader,
} from '../src/runtime/region';

/** An SDK client narrowed to the one method this read calls. */
function reader(getRegion: StoreRegionReader['features']['getRegion']): StoreRegionReader {
  return { features: { getRegion } };
}

const ICELAND = { countryCode: 'IS', formatLocale: 'is-IS', timeZone: 'Atlantic/Reykjavik' };

afterEach(() => {
  vi.useRealTimers();
});

describe('readStoreRegion', () => {
  it('passes the organisation’s regional format through, silently', async () => {
    const warn = vi.fn();

    await expect(
      readStoreRegion(
        reader(async () => ICELAND),
        warn
      )
    ).resolves.toEqual(ICELAND);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing about an organisation that publishes none', async () => {
    // The outcome — the content locale formats everything — is what every site did before the
    // field existed; a line on every such build would teach its reader to ignore warnings.
    const warn = vi.fn();

    await expect(
      readStoreRegion(
        reader(async () => null),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('makes no request, and no noise, without gateway credentials', async () => {
    const warn = vi.fn();

    await expect(readStoreRegion(null, warn)).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('answers null with one warning naming the cause when the read failed', async () => {
    const warn = vi.fn();

    await expect(
      readStoreRegion(
        reader(() => Promise.reject(new Error('connect ECONNREFUSED'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(`${REGION_READ_FAILED_WARNING} (connect ECONNREFUSED)`);
  });

  it('bounds the read, so a gateway that never answers cannot hang the build', async () => {
    expect(READ_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const pending = readStoreRegion(
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
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    await expect(pending).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveStoreRegion', () => {
  it('reads the empty string Nuxt serialises an absent record as', () => {
    expect(resolveStoreRegion('')).toBeNull();
    expect(resolveStoreRegion(null)).toBeNull();
    expect(resolveStoreRegion(undefined)).toBeNull();
    expect(resolveStoreRegion(ICELAND)).toEqual(ICELAND);
    expect(resolveStoreRegion({ ...ICELAND, countryCode: '' })).toEqual({
      ...ICELAND,
      countryCode: '',
    });
  });

  it('refuses any field Intl would throw on, from the runtime config as from the build', () => {
    // Every field ends up in an `Intl` constructor on every price and date; a RangeError there
    // takes the whole render down, so a bad record must read as "none" and fall back.
    const refused: unknown[] = [
      { ...ICELAND, formatLocale: '' },
      { ...ICELAND, formatLocale: 'not a locale!' },
      { ...ICELAND, timeZone: '' },
      { ...ICELAND, timeZone: 'Mars/Olympus_Mons' },
      { ...ICELAND, countryCode: 'ISL' },
      { ...ICELAND, countryCode: 7 },
      { formatLocale: 'is-IS', timeZone: 'Atlantic/Reykjavik' },
    ];
    for (const value of refused) {
      expect(resolveStoreRegion(value), JSON.stringify(value)).toBeNull();
    }
  });
});
