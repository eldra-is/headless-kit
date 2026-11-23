/**
 * A draft preview session shows the site's saved design tokens and theme texts (WS-1394): read
 * through the session after hydration and put where the build put its own, never fatally.
 */
import { normalizeThemeDesignTokens, type EldraClient } from '@eldrajs/theme-core';
import { resolveMessageCatalogue, type ThemeMessages } from '@eldrajs/theme-core/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import {
  SESSION_SITE_SETTINGS_TIMEOUT_MS,
  assignDesignTokens,
  assignMessages,
  readSessionSiteSettings,
} from '../src/runtime/previewSessionSite';

const color = (label: string, value: string) => ({
  label,
  value,
  group: 'Surface',
  allowSiteOverride: true,
});
const container = (label: string, maxWidth: string) => ({
  label,
  maxWidth,
  gutter: { normal: '2rem', tablet: '1.5rem', mobile: '1rem' },
  allowSiteOverride: true,
});
const CONTAINERS = {
  narrow: container('Narrow', '40rem'),
  content: container('Content', '64rem'),
  wide: container('Wide', '80rem'),
  full: container('Full', 'none'),
};
const BAKED = normalizeThemeDesignTokens({
  colors: {
    primary: color('Primary', '#111111'),
    surface: color('Surface', '#ffffff'),
  },
  containers: CONTAINERS,
});
const SAVED = normalizeThemeDesignTokens({
  colors: {
    primary: color('Primary', '#0b57d0'),
    surface: color('Surface', '#ffffff'),
  },
  containers: CONTAINERS,
});
const THEME: ThemeMessages = {
  defaultLocale: 'en-US',
  locales: { 'en-US': { 'header.menu': 'Menu' }, 'is-IS': { 'header.menu': 'Valmynd' } },
};
const LOCALES = { default: 'en-US', supported: ['en-US', 'is-IS'] };

function context() {
  return {
    designTokens: reactive(structuredClone(BAKED)),
    messages: reactive(
      resolveMessageCatalogue(THEME, null, LOCALES.supported, LOCALES.default)
    ) as ThemeMessages,
  };
}

function client(
  answers: Record<string, () => Promise<unknown>>
): Pick<EldraClient, 'getSiteSetting'> {
  return { getSiteSetting: vi.fn((path: string) => answers[path]!()) };
}

const options = (warn = vi.fn()) => ({ themeMessages: THEME, locales: LOCALES, warn });

describe('readSessionSiteSettings', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('puts the saved tokens and the resolved saved texts into the context', async () => {
    const ctx = context();
    const warn = vi.fn();
    await readSessionSiteSettings(
      client({
        '/site/v1/design-tokens': async () => ({ revision: 3, resolved: SAVED }),
        '/site/v1/theme-messages': async () => ({
          defaultLocale: 'en-US',
          locales: { 'en-US': { 'header.menu': 'Browse' } },
        }),
      }),
      ctx,
      options(warn)
    );
    expect(ctx.designTokens.colors.primary?.value).toBe('#0b57d0');
    // Resolved as a build resolves them: the override, and the theme's text where none is saved.
    expect(ctx.messages.locales['en-US']).toEqual({ 'header.menu': 'Browse' });
    expect(ctx.messages.locales['is-IS']).toEqual({ 'header.menu': 'Valmynd' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps the build’s values when a read fails or answers something unusable', async () => {
    const ctx = context();
    const before = JSON.stringify(ctx);
    const warn = vi.fn();
    await readSessionSiteSettings(
      client({
        '/site/v1/design-tokens': async () => {
          throw new Error('404 PREVIEW_GATEWAY_PATH_NOT_ALLOWED');
        },
        '/site/v1/theme-messages': async () => ({ locales: 'nope' }),
      }),
      ctx,
      options(warn)
    );
    expect(JSON.stringify(ctx)).toBe(before);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('gives up at its bound and drops an answer that arrives after it', async () => {
    vi.useFakeTimers();
    const ctx = context();
    let answer = (_: unknown): void => undefined;
    const reading = readSessionSiteSettings(
      client({
        '/site/v1/design-tokens': () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
        '/site/v1/theme-messages': () => new Promise(() => undefined),
      }),
      ctx,
      options()
    );
    await vi.advanceTimersByTimeAsync(SESSION_SITE_SETTINGS_TIMEOUT_MS);
    await reading;
    answer({ revision: 3, resolved: SAVED });
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.designTokens.colors.primary?.value).toBe('#111111');
  });

  it('does nothing with a client that has no site reads', async () => {
    const ctx = context();
    const before = JSON.stringify(ctx);
    await readSessionSiteSettings({}, ctx, options());
    expect(JSON.stringify(ctx)).toBe(before);
  });
});

describe('assigning in place', () => {
  it('replaces the reactive catalog in place, in the answer’s key order, and leaves an equal one', () => {
    const target = reactive(structuredClone(BAKED));
    const colors = target.colors;
    expect(assignDesignTokens(target, structuredClone(BAKED))).toBe(false);
    const reordered = normalizeThemeDesignTokens({
      colors: {
        surface: color('Surface', '#ffffff'),
        primary: color('Primary', '#0b57d0'),
      },
      containers: CONTAINERS,
      allowCustomColors: true,
    });
    expect(assignDesignTokens(target, reordered)).toBe(true);
    expect(target.colors).toBe(colors);
    expect(Object.keys(target.colors)).toEqual(Object.keys(reordered.colors));
    expect(target.allowCustomColors).toBe(true);
  });

  it('replaces only the locales that changed', () => {
    const target = reactive(structuredClone(THEME));
    const isIS = target.locales['is-IS'];
    expect(assignMessages(target, structuredClone(THEME))).toBe(false);
    expect(
      assignMessages(target, {
        defaultLocale: 'en-US',
        locales: { 'en-US': { 'header.menu': 'Browse' }, 'is-IS': { 'header.menu': 'Valmynd' } },
      })
    ).toBe(true);
    expect(target.locales['en-US']).toEqual({ 'header.menu': 'Browse' });
    expect(target.locales['is-IS']).toBe(isIS);
  });
});
