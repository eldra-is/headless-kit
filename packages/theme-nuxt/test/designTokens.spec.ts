import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESIGN_TOKENS_WARNING,
  READ_TIMEOUT_MS,
  readDesignTokens,
  resolveSiteDesignTokens,
  type DesignTokensReader,
  type ThemeDesignTokens,
} from '../src/runtime/designTokens';

/** An SDK client narrowed to the one method this read calls. */
function reader(request: DesignTokensReader['request']): DesignTokensReader {
  return { request };
}

const RESOLVED: ThemeDesignTokens = {
  colors: { primary: { label: 'Primary', value: '#ff6600', allowSiteOverride: true } },
  containers: {
    content: { label: 'Content', maxWidth: '70rem', gutter: { normal: '2rem' } },
    full: { label: 'Full', maxWidth: 'none', gutter: { normal: '2rem' } },
    narrow: { label: 'Narrow', maxWidth: '40rem', gutter: { normal: '1rem' } },
    wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('readDesignTokens', () => {
  it('passes the platform’s resolved catalog through, normalized', async () => {
    const warn = vi.fn();

    await expect(
      readDesignTokens(
        reader(async () => ({ revision: 3, resolved: RESOLVED })),
        warn
      )
    ).resolves.toEqual(RESOLVED);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once and answers null with no client at all', async () => {
    const warn = vi.fn();

    await expect(readDesignTokens(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(DESIGN_TOKENS_WARNING);
  });

  it('survives an unreachable gateway, naming the cause in the one warning it prints', async () => {
    const warn = vi.fn();

    await expect(
      readDesignTokens(
        reader(() => Promise.reject(new Error('fetch failed'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(DESIGN_TOKENS_WARNING);
    expect(warn.mock.calls[0]?.[0]).toContain('fetch failed');
  });

  it('refuses a malformed response rather than passing it on, and says so', async () => {
    const malformed: unknown[] = [
      { revision: 1 }, // no `resolved`
      { resolved: RESOLVED }, // no `revision`
      { revision: 'one', resolved: RESOLVED }, // wrong type
      { revision: 1, resolved: null },
      { revision: 1, resolved: 'nope' }, // `resolved` is not an object at all
      // `resolved` fails theme-core's own `normalizeThemeDesignTokens` — a non-object `colors`:
      { revision: 1, resolved: { colors: 'nope', containers: {} } },
      // a non-empty catalog missing a required container (`full`):
      {
        revision: 1,
        resolved: {
          colors: {},
          containers: {
            narrow: { label: 'Narrow', maxWidth: '40rem', gutter: { normal: '1rem' } },
            content: { label: 'Content', maxWidth: '64rem', gutter: { normal: '2rem' } },
            wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
          },
        },
      },
      // `full`'s `maxWidth` must be `'none'`:
      {
        revision: 1,
        resolved: {
          colors: {},
          containers: {
            narrow: { label: 'Narrow', maxWidth: '40rem', gutter: { normal: '1rem' } },
            content: { label: 'Content', maxWidth: '64rem', gutter: { normal: '2rem' } },
            wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
            full: { label: 'Full', maxWidth: '10rem', gutter: { normal: '2rem' } },
          },
        },
      },
      null,
      'not an object',
    ];
    for (const response of malformed) {
      const warn = vi.fn();
      await expect(
        readDesignTokens(
          reader(async () => response),
          warn
        )
      ).resolves.toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('unusable response');
    }
  });

  it('bounds the read, so a gateway that never answers cannot hang the build', async () => {
    expect(READ_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const pending = readDesignTokens(
      reader(
        (options) =>
          new Promise((_resolve, reject) => {
            signal = options.signal;
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

describe('resolveSiteDesignTokens', () => {
  it('re-validates and returns the value Nitro serialised', () => {
    expect(resolveSiteDesignTokens(RESOLVED)).toEqual(RESOLVED);
  });

  it('treats an absent runtime-config key — `null`, `undefined` or `\'\'` — as no override', () => {
    expect(resolveSiteDesignTokens(null)).toBeNull();
    expect(resolveSiteDesignTokens(undefined)).toBeNull();
    expect(resolveSiteDesignTokens('')).toBeNull();
  });

  it('treats a value that fails the theme’s own validation as no override, rather than throwing', () => {
    expect(resolveSiteDesignTokens({ colors: 'nope', containers: {} })).toBeNull();
    expect(resolveSiteDesignTokens('not an object')).toBeNull();
    expect(resolveSiteDesignTokens(42)).toBeNull();
  });
});
