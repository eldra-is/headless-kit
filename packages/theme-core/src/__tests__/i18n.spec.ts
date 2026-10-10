import { describe, expect, it } from 'vitest';
import {
  EMPTY_THEME_MESSAGES,
  flattenMessages,
  isForbiddenLocaleTag,
  mergeMessageCatalogues,
  resolveMessageCatalogue,
  sanitizeLocaleMessages,
  unflattenMessages,
  type ThemeMessages,
} from '../i18n';

describe('flattenMessages', () => {
  it('flattens nested strings into dotted keys', () => {
    expect(
      flattenMessages({
        header: { menu: 'Menu' },
        cart: { empty: { title: 'Your cart is empty' } },
      })
    ).toEqual({
      'header.menu': 'Menu',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('keeps a placeholder verbatim', () => {
    expect(flattenMessages({ cart: { count: '{count} items' } })).toEqual({
      'cart.count': '{count} items',
    });
  });

  it('skips a non-string leaf rather than throwing', () => {
    expect(
      flattenMessages({ a: 'kept', b: 1, c: true, d: null, e: ['x'] } as Record<string, unknown>)
    ).toEqual({ a: 'kept' });
  });

  it('drops a __proto__/constructor/prototype segment rather than touching the prototype chain', () => {
    const input = JSON.parse('{"__proto__": {"polluted": "x"}, "safe": "kept"}') as Record<
      string,
      unknown
    >;
    const out = flattenMessages(input);
    expect(out).toEqual({ safe: 'kept' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops a nested __proto__ segment too', () => {
    const out = flattenMessages({ a: { __proto__: { polluted: 'x' }, safe: 'kept' } });
    expect(out).toEqual({ 'a.safe': 'kept' });
  });
});

describe('unflattenMessages', () => {
  it('expands dotted keys into nested objects', () => {
    expect(unflattenMessages({ 'header.menu': 'Menu', 'cart.empty.title': 'Empty' })).toEqual({
      header: { menu: 'Menu' },
      cart: { empty: { title: 'Empty' } },
    });
  });

  it('round-trips with flattenMessages for a conflict-free catalogue', () => {
    const nested = { a: { b: 'one', c: { d: 'two' } }, e: 'three' };
    expect(unflattenMessages(flattenMessages(nested))).toEqual(nested);
  });

  it('a deeper key wins over a shallower conflicting one, deterministically', () => {
    // "a" sorts before "a.b" — the shallower key is applied first, then overwritten once the
    // deeper key needs "a" to be an object rather than the leaf the shallower key wrote.
    expect(unflattenMessages({ a: 'leaf', 'a.b': 'nested' })).toEqual({ a: { b: 'nested' } });
  });

  it('refuses a __proto__ segment, at any depth', () => {
    const out = unflattenMessages({ __proto__: 'x', 'a.__proto__.b': 'y', 'a.safe': 'kept' });
    expect(out).toEqual({ a: { safe: 'kept' } });
    expect(Object.keys(out.a as object)).toEqual(['safe']);
    // The real risk a nested __proto__ segment poses: not an own key on the result, but a
    // property written onto Object.prototype itself, invisible to a plain `toEqual` (which
    // compares own enumerable properties only) and visible to every object in the process.
    expect(({} as Record<string, unknown>).b).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('mergeMessageCatalogues', () => {
  const theme: ThemeMessages = {
    defaultLocale: 'en-US',
    locales: {
      'en-US': { 'header.menu': 'Menu', 'cart.empty.title': 'Your cart is empty' },
      'is-IS': { 'header.menu': 'Valmynd' },
    },
  };

  it('is the identity merge with no platform response', () => {
    expect(mergeMessageCatalogues(theme, null)).toEqual(theme);
  });

  it('does not mutate its inputs', () => {
    const snapshot = JSON.parse(JSON.stringify(theme)) as ThemeMessages;
    mergeMessageCatalogues(theme, {
      defaultLocale: 'en-US',
      locales: { 'en-US': { 'header.menu': 'Overridden' } },
    });
    expect(theme).toEqual(snapshot);
  });

  it('platform wins per key, for a locale the theme already ships', () => {
    const merged = mergeMessageCatalogues(theme, {
      defaultLocale: 'en-US',
      locales: { 'en-US': { 'header.menu': 'Overridden menu' } },
    });
    expect(merged.locales['en-US']).toEqual({
      'header.menu': 'Overridden menu',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('adds a locale the theme never shipped whole', () => {
    const merged = mergeMessageCatalogues(theme, {
      defaultLocale: 'en-US',
      locales: { 'fr-FR': { 'header.menu': 'Menu FR' } },
    });
    expect(merged.locales['fr-FR']).toEqual({ 'header.menu': 'Menu FR' });
  });

  it('keeps the theme default locale unchanged (not the platform response’s own field)', () => {
    const merged = mergeMessageCatalogues(theme, {
      defaultLocale: 'fr-FR',
      locales: {},
    });
    expect(merged.defaultLocale).toBe('en-US');
  });

  it('leaves a locale the platform did not answer for untouched', () => {
    const merged = mergeMessageCatalogues(theme, {
      defaultLocale: 'en-US',
      locales: { 'en-US': { 'header.menu': 'Overridden' } },
    });
    expect(merged.locales['is-IS']).toEqual({ 'header.menu': 'Valmynd' });
  });
});

describe('resolveMessageCatalogue', () => {
  const theme: ThemeMessages = {
    defaultLocale: 'en-US',
    locales: {
      'en-US': { 'header.menu': 'Menu', 'cart.empty.title': 'Your cart is empty' },
      'is-IS': { 'header.menu': 'Valmynd' },
    },
  };

  it('produces a full key set for every org locale from the manifest alone (no platform)', () => {
    const resolved = resolveMessageCatalogue(theme, null, ['en-US', 'is-IS'], 'en-US');
    expect(resolved.defaultLocale).toBe('en-US');
    expect(resolved.locales['en-US']).toEqual({
      'header.menu': 'Menu',
      'cart.empty.title': 'Your cart is empty',
    });
    // is-IS fills its missing key from the theme/org default locale.
    expect(resolved.locales['is-IS']).toEqual({
      'header.menu': 'Valmynd',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('falls all the way back to the theme default locale for an org locale the theme never shipped', () => {
    const resolved = resolveMessageCatalogue(theme, null, ['fr-FR'], 'fr-FR');
    expect(resolved.locales['fr-FR']).toEqual({
      'header.menu': 'Menu',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('prefers the org default locale over the theme default locale when they differ', () => {
    const resolved = resolveMessageCatalogue(theme, null, ['fr-FR'], 'is-IS');
    // fr-FR has nothing of its own; org default (is-IS) answers header.menu, theme default
    // (en-US) answers cart.empty.title, which is-IS does not have.
    expect(resolved.locales['fr-FR']).toEqual({
      'header.menu': 'Valmynd',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('always includes the org default locale, even when the caller’s list omits it', () => {
    const resolved = resolveMessageCatalogue(theme, null, [], 'en-US');
    expect(resolved.locales['en-US']).toEqual({
      'header.menu': 'Menu',
      'cart.empty.title': 'Your cart is empty',
    });
  });

  it('handles the empty theme catalogue (no i18n/ directory) gracefully', () => {
    const resolved = resolveMessageCatalogue(EMPTY_THEME_MESSAGES, null, [], 'en-US');
    expect(resolved).toEqual({ defaultLocale: 'en-US', locales: { 'en-US': {} } });
  });

  /**
   * The contract's tier 5 is `theme(themeDefault)` — **no** accompanying override tier, unlike
   * every other link in the chain. An override on the theme's own default locale must never leak
   * into a key that falls all the way through to tier 5 for an unrelated locale: `fr-FR` has
   * nothing of its own, and the org default (`is-IS`) has nothing either, so resolution falls all
   * the way to the theme default locale (`en-US`) — and must land on the theme's own shipped
   * text, not Studio's override of that same locale.
   */
  it('tier 5 reads the theme’s own unmerged default locale, never an override of it', () => {
    // A theme that ships only its own default locale (en-US) — so neither fr-FR (the locale being
    // resolved) nor is-IS (the org default) has anything of its own, theme or override, and
    // resolution falls all the way through to tier 5.
    const onlyDefault: ThemeMessages = {
      defaultLocale: 'en-US',
      locales: { 'en-US': { 'header.menu': 'Menu' } },
    };
    const platform: ThemeMessages = {
      defaultLocale: 'en-US',
      locales: { 'en-US': { 'header.menu': 'Overridden EN' } },
    };
    const resolved = resolveMessageCatalogue(onlyDefault, platform, ['fr-FR'], 'is-IS');
    expect(resolved.locales['fr-FR']).toEqual({ 'header.menu': 'Menu' });
  });
});

describe('isForbiddenLocaleTag / sanitizeLocaleMessages', () => {
  it('names the three prototype-chain keys as forbidden, and nothing else', () => {
    expect(isForbiddenLocaleTag('__proto__')).toBe(true);
    expect(isForbiddenLocaleTag('prototype')).toBe(true);
    expect(isForbiddenLocaleTag('constructor')).toBe(true);
    expect(isForbiddenLocaleTag('en-US')).toBe(false);
  });

  it('refuses a forbidden tag outright, dropping the whole locale', () => {
    expect(sanitizeLocaleMessages('__proto__', { a: 'b' })).toBeNull();
  });

  it('sanitizes a permitted tag’s record: string values only, sorted', () => {
    expect(
      sanitizeLocaleMessages('en-US', { b: '2', a: '1', bad: 3 } as Record<string, unknown>)
    ).toEqual({ a: '1', b: '2' });
  });
});

describe('EMPTY_THEME_MESSAGES', () => {
  it('is the fallback catalogue an empty theme (no i18n/ directory) serves', () => {
    expect(EMPTY_THEME_MESSAGES).toEqual({ defaultLocale: 'en-US', locales: {} });
  });
});
