import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  READ_TIMEOUT_MS,
  readThemeMessages,
  resolveSiteMessages,
  THEME_MESSAGES_WARNING,
  type ThemeMessagesReader,
} from '../src/runtime/messages';
import type { ThemeMessages } from '@eldrajs/theme-core/i18n';
import type { StoreLocales } from '../src/runtime/locales';

/** An SDK client narrowed to the one method this read calls. */
function reader(request: ThemeMessagesReader['request']): ThemeMessagesReader {
  return { request };
}

const OVERRIDE: ThemeMessages = {
  defaultLocale: 'en-US',
  locales: { 'en-US': { 'header.menu': 'Overridden menu' } },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('readThemeMessages', () => {
  it('passes the platform’s own overrides through', async () => {
    const warn = vi.fn();

    await expect(
      readThemeMessages(
        reader(async () => OVERRIDE),
        warn
      )
    ).resolves.toEqual(OVERRIDE);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once and answers null with no client at all', async () => {
    const warn = vi.fn();

    await expect(readThemeMessages(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(THEME_MESSAGES_WARNING);
  });

  it('survives an unreachable gateway, naming the cause in the one warning it prints', async () => {
    const warn = vi.fn();

    await expect(
      readThemeMessages(
        reader(() => Promise.reject(new Error('fetch failed'))),
        warn
      )
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(THEME_MESSAGES_WARNING);
    expect(warn.mock.calls[0]?.[0]).toContain('fetch failed');
  });

  it('refuses a malformed response rather than passing it on, and says so', async () => {
    const malformed: unknown[] = [
      { defaultLocale: '', locales: {} },
      { defaultLocale: 'en-US', locales: { 'en-US': { key: 1 } } },
      { defaultLocale: 'en-US' },
      null,
      'not an object',
    ];
    for (const response of malformed) {
      const warn = vi.fn();
      await expect(
        readThemeMessages(
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
    const pending = readThemeMessages(
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

describe('resolveSiteMessages', () => {
  const theme: ThemeMessages = {
    defaultLocale: 'en-US',
    locales: {
      'en-US': { 'header.menu': 'Menu', 'cart.empty.title': 'Your cart is empty' },
      'is-IS': { 'header.menu': 'Valmynd' },
    },
  };

  it('is manifest-only with no gateway (platform: null), falling back to the theme’s own locales', () => {
    const resolved = resolveSiteMessages(theme, null, null);
    expect(resolved).toEqual({
      defaultLocale: 'en-US',
      locales: {
        'en-US': { 'header.menu': 'Menu', 'cart.empty.title': 'Your cart is empty' },
        'is-IS': { 'header.menu': 'Valmynd', 'cart.empty.title': 'Your cart is empty' },
      },
    });
  });

  it('merges the platform’s overrides and resolves over the organisation’s locales', () => {
    const locales: StoreLocales = { default: 'en-US', supported: ['en-US', 'fr-FR'] };
    const resolved = resolveSiteMessages(
      theme,
      { defaultLocale: 'en-US', locales: { 'en-US': { 'header.menu': 'Overridden menu' } } },
      locales
    );
    expect(resolved.defaultLocale).toBe('en-US');
    expect(resolved.locales['en-US']).toEqual({
      'header.menu': 'Overridden menu',
      'cart.empty.title': 'Your cart is empty',
    });
    // fr-FR is an organisation locale the theme never shipped: falls all the way back to the
    // theme's own default locale (no platform override exists for it in this response).
    expect(resolved.locales['fr-FR']).toEqual({
      'header.menu': 'Overridden menu',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('falls back to the theme’s default locale when the organisation’s locales read failed', () => {
    const resolved = resolveSiteMessages(theme, null, null);
    expect(resolved.defaultLocale).toBe('en-US');
  });
});
