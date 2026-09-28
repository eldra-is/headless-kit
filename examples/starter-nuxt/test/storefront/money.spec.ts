import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  formatMoney,
  roundMoney,
  toMinorUnits,
} from '../../app/storefront/money';

describe('formatMoney', () => {
  it('formats a major-unit amount as itself', () => {
    // The live defect: a catalog price of 28 is $28.00, not $0.28.
    expect(formatMoney(28)).toBe('$28.00');
    expect(formatMoney(96.5)).toBe('$96.50');
  });

  it('takes the fraction digits from the currency, so a zero-decimal one renders none', () => {
    expect(formatMoney(28, 'ISK', 'is-IS')).not.toMatch(/[.,]\d\d/);
    expect(formatMoney(28, 'ISK', 'is-IS')).toContain('28');
    expect(formatMoney(28, 'USD', 'en-US')).toBe('$28.00');
  });

  it('defaults to the theme’s own currency and locale', () => {
    expect(formatMoney(28)).toBe(formatMoney(28, DEFAULT_CURRENCY, DEFAULT_LOCALE));
  });

  it('falls back to a plain decimal and the raw code rather than throwing', () => {
    // `Intl.NumberFormat` throws `RangeError` on a code it does not know, and this runs inside
    // `computed`s where a throw takes the whole block down.
    expect(formatMoney(28, 'XYZ1')).toBe('28 XYZ1');
  });
});

describe('toMinorUnits', () => {
  it('converts for @eldrajs/ui’s minor-unit money inputs', () => {
    expect(toMinorUnits(28)).toBe(2800);
    expect(toMinorUnits(96.5)).toBe(9650);
  });

  it('uses the currency’s own minor-unit count, not a hard-coded hundred', () => {
    expect(toMinorUnits(28, 'ISK', 'is-IS')).toBe(28);
  });

  it('rounds, so a float amount never becomes a fractional minor unit', () => {
    expect(toMinorUnits(8.2 * 3)).toBe(2460);
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
