import { describe, expect, it } from 'vitest';
import {
  currencyLabel,
  DEFAULT_LOCALE,
  formatMoney,
  roundMoney,
  toMinorUnits,
} from '../../app/storefront/money';

describe('formatMoney', () => {
  it('formats a major-unit amount as itself', () => {
    // The live defect: a catalog price of 28 is $28.00, not $0.28.
    expect(formatMoney(28, 'USD')).toBe('$28.00');
    expect(formatMoney(96.5, 'USD')).toBe('$96.50');
  });

  it('takes the fraction digits from the currency, so a zero-decimal one renders none', () => {
    expect(formatMoney(28, 'ISK', 'is-IS')).not.toMatch(/[.,]\d\d/);
    expect(formatMoney(28, 'ISK', 'is-IS')).toContain('28');
    expect(formatMoney(28, 'USD', 'en-US')).toBe('$28.00');
  });

  it('formats in the store’s currency, not the locale’s', () => {
    // An Icelandic page of a store that sells in dollars shows dollars, with Icelandic grouping.
    expect(formatMoney(4800, 'USD', 'is-IS')).toContain('4.800');
    expect(formatMoney(4800, 'ISK', 'en-US')).toMatch(/4,800/);
  });

  it('defaults only the locale — never the currency', () => {
    expect(formatMoney(28, 'USD')).toBe(formatMoney(28, 'USD', DEFAULT_LOCALE));
  });

  it('renders a plain number for a store that publishes no currency', () => {
    // No currency is not a currency to guess at: a `$` in front of 4800 ISK is a wrong price,
    // while a bare 4.800 is an incomplete one. And it must not throw — this runs inside
    // `computed`s, where a throw takes the whole block down.
    expect(formatMoney(4800, undefined, 'is-IS')).toBe('4.800');
    expect(formatMoney(4800, undefined, 'en-US')).toBe('4,800');
    expect(formatMoney(4800, undefined)).not.toContain('$');
  });

  it('falls back to a plain decimal and the raw code rather than throwing', () => {
    // `Intl.NumberFormat` throws `RangeError` on a code it does not know.
    expect(formatMoney(28, 'XYZ1')).toBe('28 XYZ1');
    expect(formatMoney(4800, 'XYZ1')).toBe('4,800 XYZ1');
  });
});

describe('the formatter cache', () => {
  it('keeps one currency-and-locale pair from answering for another', () => {
    // `resolveFormat` memoizes `Intl.NumberFormat` per pair, which is the one way this module could
    // start returning a cached answer for the wrong store or the wrong page.
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'USD', 'is-IS')).toBe(formatMoney(1234.5, 'USD', 'is-IS'));
    expect(formatMoney(1234.5, 'USD', 'is-IS')).not.toBe('$1,234.50');
    expect(formatMoney(1234, 'ISK', 'is-IS')).toContain('kr');
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
    // And the digits each pair resolves stay its own.
    expect(toMinorUnits(28, 'USD', 'en-US')).toBe(2800);
    expect(toMinorUnits(28, 'ISK', 'en-US')).toBe(28);
    expect(toMinorUnits(28, 'USD', 'en-US')).toBe(2800);
  });
});

describe('toMinorUnits', () => {
  it('converts for @eldrajs/ui’s minor-unit money inputs', () => {
    expect(toMinorUnits(28, 'USD')).toBe(2800);
    expect(toMinorUnits(96.5, 'USD')).toBe(9650);
  });

  it('uses the currency’s own minor-unit count, not a hard-coded hundred', () => {
    expect(toMinorUnits(28, 'ISK', 'is-IS')).toBe(28);
  });

  it('falls back to two digits with no currency, the same scale <Price> does', () => {
    // `currencyFractionDigits` answers 2 for an absent/unknown code, so the amount this produces
    // and the amount the `<Price>` reading it renders agree even with nothing published.
    expect(toMinorUnits(28, undefined)).toBe(2800);
    expect(toMinorUnits(28, 'XYZ1')).toBe(2800);
  });

  it('rounds, so a float amount never becomes a fractional minor unit', () => {
    expect(toMinorUnits(8.2 * 3, 'USD')).toBe(2460);
  });
});

describe('currencyLabel', () => {
  it('names the currency as code plus symbol, in the given locale', () => {
    // `is-IS` is where `kr.` is actually a sign distinct from the code — the case the footer
    // ships for an ISK store.
    expect(currencyLabel('ISK', 'is-IS')).toBe('ISK kr.');
    expect(currencyLabel('USD', 'en-US')).toBe('USD $');
    expect(currencyLabel('EUR', 'en-US')).toBe('EUR €');
  });

  it('falls back to the code alone when Intl has no symbol distinct from it', () => {
    // `en-US` has no sign for `ISK` beyond the code itself — `ISK ISK` would be noise.
    expect(currencyLabel('ISK', 'en-US')).toBe('ISK');
  });

  it('falls back to the code alone for a code Intl does not recognise, rather than throwing', () => {
    expect(currencyLabel('XYZ1')).toBe('XYZ1');
  });

  it('defaults only the locale — never the code', () => {
    expect(currencyLabel('USD')).toBe(currencyLabel('USD', DEFAULT_LOCALE));
  });
});

describe('roundMoney', () => {
  it('rounds a computed sum back to two decimals', () => {
    // $8.20 × 3 is 24.599999999999998 in floating point, and a total built from it drifts on.
    expect(8.2 * 3).not.toBe(24.6);
    expect(roundMoney(8.2 * 3)).toBe(24.6);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
