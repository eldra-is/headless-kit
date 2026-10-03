import { describe, expect, it } from 'vitest';
import { formatCurrency } from '@eldrajs/ui';
import {
  currencyLabel,
  DEFAULT_LOCALE,
  formatMoney,
  roundMoney,
  toMinorUnits,
} from '../../app/storefront/money';

describe('formatMoney', () => {
  it('formats a major-unit amount as itself', () => {
    // The live defect: a catalog price of 28 is $28, not $0.28.
    expect(formatMoney(28, 'USD')).toBe('$28');
    expect(formatMoney(96.5, 'USD')).toBe('$96.5');
  });

  /**
   * Two digit rules, both the formatter's rather than this module's: the **maximum** is the
   * currency's own count, so a zero-decimal currency renders none at all; the **minimum** is 0, so
   * a whole amount renders no trailing zeroes either. The second is `formatCurrency`'s documented
   * contract — the one the private library's currency fields have always had — and this module
   * follows it rather than keeping a second rule of its own.
   */
  it('takes the maximum fraction digits from the currency and the minimum from the util', () => {
    expect(formatMoney(28, 'ISK', 'is-IS')).not.toMatch(/[.,]\d/);
    expect(formatMoney(28, 'ISK', 'is-IS')).toContain('28');
    // Not even for an amount that has a fraction: krónur have no minor unit to show one in.
    expect(formatMoney(28.4, 'ISK', 'en-US')).toBe('kr\u00a028');
    expect(formatMoney(28, 'USD', 'en-US')).toBe('$28');
    expect(formatMoney(28.5, 'USD', 'en-US')).toBe('$28.5');
    expect(formatMoney(28.567, 'USD', 'en-US')).toBe('$28.57');
  });

  it('formats in the store’s currency, not the locale’s', () => {
    // An Icelandic page of a store that sells in dollars shows dollars, with Icelandic grouping.
    expect(formatMoney(4800, 'USD', 'is-IS')).toContain('4.800');
    expect(formatMoney(4800, 'ISK', 'en-US')).toMatch(/4,800/);
  });

  /**
   * The sign, not the digits: this module used to build its own
   * `Intl.NumberFormat({ style: 'currency' })`, which writes the **wide** sign — so a button label
   * read "ISK 2,800" beside a `<Price>` reading "kr 2,800" for the same money. Both now go through
   * `@eldrajs/ui`'s `formatCurrency`, so there is one sign on the page.
   */
  it('writes the currency’s narrow sign, the same one every <Price> writes', () => {
    expect(formatMoney(2800, 'ISK', 'en-US')).toBe('kr\u00a02,800');
    expect(formatMoney(2800, 'ISK', 'is-IS')).toBe('2.800\u00a0kr.');
    expect(formatMoney(28, 'USD', 'en-US')).toBe('$28');
    // `is-IS` writes `$` for dollars narrow, where its wide sign is the code itself.
    expect(formatMoney(28, 'USD', 'is-IS')).toBe('28\u00a0$');
  });

  it('is `@eldrajs/ui`’s own `formatCurrency`, not a second copy of it', () => {
    // Asserted as an identity across every usable pair the theme can see — with the same narrow
    // sign and the same fraction cap this module passes — so the day the package's formatter
    // changes, this module follows it instead of drifting from it.
    for (const [currency, digits] of [
      ['ISK', 0],
      ['USD', 2],
      ['EUR', 2],
    ] as const) {
      for (const locale of ['en-US', 'is-IS']) {
        expect(formatMoney(2800.5, currency, locale)).toBe(
          formatCurrency(2800.5, locale, currency, true, digits)
        );
      }
    }
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
    // `formatCurrency` throws `RangeError` on a code `Intl` does not know, exactly as the private
    // helper it ports does — so the guard is this module's, and it is the same shape `<Price>`
    // falls back to for the identical failure.
    expect(formatMoney(28, 'XYZ1')).toBe('28 XYZ1');
    expect(formatMoney(4800, 'XYZ1')).toBe('4,800 XYZ1');
    expect(() => formatCurrency(28, 'en-US', 'XYZ1')).toThrow(RangeError);
  });
});

describe('the formatter cache', () => {
  it('keeps one currency-and-locale pair from answering for another', () => {
    // `resolveFormat` memoizes `Intl.NumberFormat` per pair, which is the one way this module could
    // start returning a cached answer for the wrong store or the wrong page.
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.5');
    expect(formatMoney(1234.5, 'USD', 'is-IS')).toBe(formatMoney(1234.5, 'USD', 'is-IS'));
    expect(formatMoney(1234.5, 'USD', 'is-IS')).not.toBe('$1,234.5');
    expect(formatMoney(1234, 'ISK', 'is-IS')).toContain('kr');
    expect(formatMoney(1234.5, 'USD', 'en-US')).toBe('$1,234.5');
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
  it('names the currency as code plus its narrow sign, in the given locale', () => {
    // The sign is the one the page's own prices carry: `kr.` on an Icelandic page, `kr` on an
    // English one (the narrow sign for krónur — the wide one there *is* the code).
    expect(currencyLabel('ISK', 'is-IS')).toBe('ISK kr.');
    expect(currencyLabel('ISK', 'en-US')).toBe('ISK kr');
    expect(currencyLabel('USD', 'en-US')).toBe('USD $');
    expect(currencyLabel('USD', 'is-IS')).toBe('USD $');
    expect(currencyLabel('EUR', 'en-US')).toBe('EUR €');
  });

  it('falls back to the code alone when the locale has no sign distinct from it', () => {
    // `CHF` is written as its own code in both the locales this theme ships, and `CHF CHF` would
    // be noise. (Krónur used to land here on an `en-US` page; the narrow sign gave it a `kr`.)
    expect(currencyLabel('CHF', 'en-US')).toBe('CHF');
    expect(currencyLabel('CHF', 'is-IS')).toBe('CHF');
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
