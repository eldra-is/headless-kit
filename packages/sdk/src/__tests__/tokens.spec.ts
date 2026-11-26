import { describe, expect, it } from 'vitest';
import {
  formatToken,
  hasTokens,
  lengthText,
  TOKEN_TEXT_LENGTH,
  minorUnitDigits,
  parseTokens,
  priceNodeToken,
  resolvePriceNode,
  resolveTokens,
  serializeToken,
  toMajorUnits,
  toMinorUnits,
  type ResolveTokensOptions,
} from '../tokens';

const O = '⟦';
const C = '⟧';
const NBSP = ' ';

/** An Icelandic store, regional format `is-IS`: "15.000 kr.". */
const ISK: ResolveTokensOptions = { currency: 'ISK', locale: 'is-IS' };
const EUR: ResolveTokensOptions = { currency: 'EUR', locale: 'en-IE' };

describe('parseTokens', () => {
  it('reads a price with amounts per currency, and a store setting', () => {
    expect(
      parseTokens(
        `Over ${O}price#a3f ISK=1500000 EUR=10000${C} or ${O}store freeShippingThreshold${C}.`
      )
    ).toEqual([
      'Over ',
      { kind: 'price', id: 'a3f', amounts: { ISK: 1500000, EUR: 10000 } },
      ' or ',
      { kind: 'store', name: 'freeShippingThreshold' },
      '.',
    ]);
  });

  it('reads a just-inserted price with no amounts yet', () => {
    expect(parseTokens(`${O}price#k2p${C}`)).toEqual([{ kind: 'price', id: 'k2p', amounts: {} }]);
  });

  it('leaves text without brackets as one run, and empty text as none', () => {
    expect(parseTokens('Free shipping over {{threshold}}')).toEqual([
      'Free shipping over {{threshold}}',
    ]);
    expect(parseTokens('')).toEqual([]);
  });

  it.each([
    ['a lower-case currency', `${O}price#a3f isk=100${C}`],
    ['a negative amount', `${O}price#a3f ISK=-100${C}`],
    ['a fractional amount', `${O}price#a3f EUR=10.5${C}`],
    ['a leading zero', `${O}price#a3f EUR=010${C}`],
    ['a repeated currency', `${O}price#a3f EUR=1 EUR=2${C}`],
    ['two spaces', `${O}price#a3f  EUR=1${C}`],
    ['an id too short', `${O}price#ab EUR=1${C}`],
    ['an id with capitals', `${O}price#A3F EUR=1${C}`],
    ['no id', `${O}price EUR=1${C}`],
    ['an unknown kind', `${O}tax#a3f EUR=1${C}`],
    ['a store token with two names', `${O}store a b${C}`],
    ['an unsafe integer', `${O}price#a3f EUR=99999999999999999999${C}`],
    ['markup inside', `${O}price#a3f <img src=x onerror=alert(1)>${C}`],
  ])('refuses %s', (_, text) => {
    expect(parseTokens(text)).toEqual([{ kind: 'invalid', raw: text }]);
  });

  it('refuses a stray bracket, and a bracket nested in a token', () => {
    expect(parseTokens(`Gift wrap ${O}price#a3f`)).toEqual([
      'Gift wrap ',
      { kind: 'invalid', raw: `${O}price#a3f` },
    ]);
    expect(parseTokens(`${O}${O}store freeShippingThreshold${C}`)).toEqual([
      { kind: 'invalid', raw: O },
      { kind: 'store', name: 'freeShippingThreshold' },
    ]);
  });
});

describe('serializeToken', () => {
  it('writes the token Studio stores, codes sorted, and reads back the same', () => {
    const text = serializeToken({
      kind: 'price',
      id: 'a3f',
      amounts: { ISK: 1500000, EUR: 10000 },
    });
    expect(text).toBe(`${O}price#a3f EUR=10000 ISK=1500000${C}`);
    expect(parseTokens(text)).toEqual([
      { kind: 'price', id: 'a3f', amounts: { EUR: 10000, ISK: 1500000 } },
    ]);
    expect(serializeToken({ kind: 'store', name: 'freeShippingThreshold' })).toBe(
      `${O}store freeShippingThreshold${C}`
    );
  });
});

describe('lengthText', () => {
  it('counts a token as a written price, not as its bracket text', () => {
    const text = `Free delivery over ${O}store freeShippingThreshold${C}`;
    expect(lengthText(text)).toHaveLength('Free delivery over '.length + TOKEN_TEXT_LENGTH);
    expect(lengthText(`${O}price#a3f EUR=10000 ISK=1500000 USD=8000${C}`)).toHaveLength(
      TOKEN_TEXT_LENGTH
    );
    // A malformed token is counted as typed: it is refused on write anyway.
    expect(lengthText(`${O}tax${C}`)).toBe(`${O}tax${C}`);
    expect(lengthText('plain')).toBe('plain');
  });
});

describe('minor units', () => {
  it("follows each currency's own count", () => {
    expect(minorUnitDigits('ISK')).toBe(0);
    expect(minorUnitDigits('EUR')).toBe(2);
    expect(minorUnitDigits('KWD')).toBe(3);
    expect(toMajorUnits(1500000, 'ISK')).toBe(1500000);
    expect(toMajorUnits(10050, 'EUR')).toBe(100.5);
    expect(toMinorUnits(100.5, 'EUR')).toBe(10050);
    expect(toMinorUnits(0.1 + 0.2, 'EUR')).toBe(30);
  });
});

describe('resolveTokens', () => {
  const text = `Free shipping over ${O}price#a3f ISK=15000 EUR=10000${C}!`;

  it("writes the shopper's currency in the regional format, never another currency's amount", () => {
    expect(resolveTokens(text, ISK)).toBe(`Free shipping over 15.000${NBSP}kr.!`);
    expect(resolveTokens(text, EUR)).toBe('Free shipping over €100.00!');
  });

  it("fills a store setting from the store's own amounts", () => {
    expect(
      resolveTokens(`Free shipping over ${O}store freeShippingThreshold${C}.`, {
        ...ISK,
        storeAmounts: { freeShippingThreshold: { ISK: 15000 } },
      })
    ).toBe(`Free shipping over 15.000${NBSP}kr..`);
  });

  it('leaves out only the sentence holding a token that cannot be written', () => {
    const two = `Made in Reykjavík. Free shipping over ${O}price#a3f ISK=15000${C}. Returns are free.`;
    expect(resolveTokens(two, ISK)).toBe(
      `Made in Reykjavík. Free shipping over 15.000${NBSP}kr.. Returns are free.`
    );
    // No euro amount: the shipping sentence goes, the others stay, nothing is converted.
    expect(resolveTokens(two, EUR)).toBe('Made in Reykjavík. Returns are free.');
    // No currency at all (a store that publishes none): nothing resolves.
    expect(resolveTokens(two, { currency: null, locale: 'is-IS' })).toBe(
      'Made in Reykjavík. Returns are free.'
    );
    // An unknown setting, a store with no amounts, and a malformed token never print raw.
    expect(resolveTokens(`Hi. Over ${O}store giftWrap${C}.`, ISK)).toBe('Hi.');
    expect(resolveTokens(`Hi. Over ${O}store freeShippingThreshold${C}.`, ISK)).toBe('Hi.');
    expect(resolveTokens(`Hi. Over ${O}price#a3f ISK=-1${C}.`, ISK)).toBe('Hi.');
  });

  it("keeps the builder preview's payload when its sentence is left out", () => {
    const payload = '﻿​‌​﻿';
    const out = resolveTokens(`Hi. Over ${O}price#a3f ISK=1${C}.${payload}`, EUR);
    expect(out).toBe(`Hi.${payload}`);
  });

  it('returns text without tokens untouched, including Studio variables', () => {
    const plain = 'Hello {{customer.firstName}}. ';
    expect(resolveTokens(plain, ISK)).toBe(plain);
    expect(hasTokens(plain)).toBe(false);
  });

  it("takes the theme's own formatter", () => {
    expect(
      resolveTokens(text, {
        ...EUR,
        format: (amount, currency) => `${currency}:${amount}`,
      })
    ).toBe('Free shipping over EUR:100!');
  });

  it('never lets a formatter that throws take the page down', () => {
    expect(
      formatToken(
        { kind: 'price', id: 'a3f', amounts: { ISK: 1 } },
        {
          ...ISK,
          format: () => {
            throw new RangeError('no');
          },
        }
      )
    ).toBeNull();
  });
});

describe('rich-text price nodes', () => {
  it('reads a price and a store setting from node attributes', () => {
    expect(priceNodeToken({ id: 'a3f', amounts: { ISK: 15000 } })).toEqual({
      kind: 'price',
      id: 'a3f',
      amounts: { ISK: 15000 },
    });
    expect(priceNodeToken({ setting: 'freeShippingThreshold' })).toEqual({
      kind: 'store',
      name: 'freeShippingThreshold',
    });
    expect(resolvePriceNode({ id: 'a3f', amounts: { ISK: 15000 } }, ISK)).toBe(`15.000${NBSP}kr.`);
  });

  it.each([
    ['no attributes', null],
    ['a bad id', { id: 'X', amounts: {} }],
    ['amounts as a list', { id: 'a3f', amounts: [1] }],
    ['a string amount', { id: 'a3f', amounts: { ISK: '1' } }],
    ['a negative amount', { id: 'a3f', amounts: { ISK: -1 } }],
    ['a bad code', { id: 'a3f', amounts: { isk: 1 } }],
  ])('refuses %s', (_, attrs) => {
    expect(priceNodeToken(attrs)).toBeNull();
    expect(resolvePriceNode(attrs, ISK)).toBeNull();
  });
});
