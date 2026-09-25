import { describe, expect, it } from 'vitest';
import { createNumberFormat, formatNumber, parseLocaleNumber } from '../number-format';

describe('createNumberFormat', () => {
  it('returns a real Intl.NumberFormat', () => {
    const nf = createNumberFormat({ locale: 'en-US' });
    expect(nf).toBeInstanceOf(Intl.NumberFormat);
  });

  it('defaults to the decimal style', () => {
    const nf = createNumberFormat({ locale: 'en-US' });
    expect(nf.resolvedOptions().style).toBe('decimal');
  });

  it('defaults the currency to USD when style is currency and none is given', () => {
    const nf = createNumberFormat({ locale: 'en-US', style: 'currency' });
    expect(nf.resolvedOptions().currency).toBe('USD');
  });

  it('passes maxFraction/minFraction through as maximum/minimumFractionDigits', () => {
    const nf = createNumberFormat({ locale: 'en-US', maxFraction: 0, minFraction: 0 });
    const resolved = nf.resolvedOptions();
    expect(resolved.maximumFractionDigits).toBe(0);
    expect(resolved.minimumFractionDigits).toBe(0);
  });

  it('sets narrowSymbol currency display when narrow is true', () => {
    const nf = createNumberFormat({
      locale: 'en-US',
      style: 'currency',
      currency: 'USD',
      narrow: true,
    });
    expect(nf.resolvedOptions().currencyDisplay).toBe('narrowSymbol');
  });

  it('sets narrow unit display when narrow is true', () => {
    const nf = createNumberFormat({
      locale: 'en-US',
      style: 'unit',
      unit: 'kilogram',
      narrow: true,
    });
    expect(nf.resolvedOptions().unitDisplay).toBe('narrow');
  });
});

describe('formatNumber', () => {
  it('a currency with 0 fraction digits (ISK has none) shows no decimal point', () => {
    // Assert against this Node's own Intl output, not a hard-coded string: ICU data (and the
    // exact currency symbol placement, spacing character) can differ by runtime/version.
    const expected = new Intl.NumberFormat('is-IS', { style: 'currency', currency: 'ISK' }).format(
      12345
    );
    expect(formatNumber(12345, { locale: 'is-IS', style: 'currency', currency: 'ISK' })).toBe(
      expected
    );
    // ISK's own minimumFractionDigits/maximumFractionDigits are 0 without this package setting
    // anything: confirms the "0 fraction digits" claim rather than merely matching Node's string.
    const resolved = createNumberFormat({
      locale: 'is-IS',
      style: 'currency',
      currency: 'ISK',
    }).resolvedOptions();
    expect(resolved.minimumFractionDigits).toBe(0);
    expect(resolved.maximumFractionDigits).toBe(0);
  });

  it('formats en-US currency as $12.00', () => {
    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      12
    );
    expect(formatNumber(12, { locale: 'en-US', style: 'currency', currency: 'USD' })).toBe(
      expected
    );
    expect(expected).toBe('$12.00');
  });

  it('formats is-IS currency as "12.345 kr." (note: a non-breaking space before "kr.")', () => {
    const expected = new Intl.NumberFormat('is-IS', { style: 'currency', currency: 'ISK' }).format(
      12345
    );
    expect(formatNumber(12345, { locale: 'is-IS', style: 'currency', currency: 'ISK' })).toBe(
      expected
    );
    // The literal between the grouped integer and the currency symbol is U+00A0 (non-breaking
    // space), not a plain U+0020 — this Node's ICU data confirms the brief's own note.
    expect(expected).toContain(' kr.');
    expect(expected.replace(' ', ' ')).toBe('12.345 kr.');
  });

  it('formats a plain decimal under is-IS with . grouping and , decimals', () => {
    const expected = new Intl.NumberFormat('is-IS').format(12345.6);
    expect(formatNumber(12345.6, { locale: 'is-IS' })).toBe(expected);
  });
});

describe('parseLocaleNumber', () => {
  it('parses an is-IS grouped, comma-decimal string ("1.234,56")', () => {
    expect(parseLocaleNumber('1.234,56', 'is-IS')).toBe(1234.56);
  });

  it('parses an en-US grouped, period-decimal string ("1,234.56")', () => {
    expect(parseLocaleNumber('1,234.56', 'en-US')).toBe(1234.56);
  });

  it('parses a plain integer with no separators under either locale', () => {
    expect(parseLocaleNumber('12', 'is-IS')).toBe(12);
    expect(parseLocaleNumber('12', 'en-US')).toBe(12);
  });

  it('parses a negative number', () => {
    expect(parseLocaleNumber('-5', 'en-US')).toBe(-5);
  });

  it('parses text with stray whitespace around it', () => {
    expect(parseLocaleNumber('  1,234.56  ', 'en-US')).toBe(1234.56);
  });

  it('returns null for empty text', () => {
    expect(parseLocaleNumber('', 'en-US')).toBeNull();
    expect(parseLocaleNumber('   ', 'en-US')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseLocaleNumber('abc', 'en-US')).toBeNull();
  });

  it('returns null for a bare separator', () => {
    expect(parseLocaleNumber('-', 'en-US')).toBeNull();
    expect(parseLocaleNumber('.', 'en-US')).toBeNull();
  });

  it('round-trips formatNumber output back to the original value under is-IS', () => {
    const formatted = formatNumber(1234.56, { locale: 'is-IS', minFraction: 2, maxFraction: 2 });
    expect(parseLocaleNumber(formatted, 'is-IS')).toBe(1234.56);
  });

  it('round-trips formatNumber output back to the original value under en-US', () => {
    const formatted = formatNumber(1234.56, { locale: 'en-US', minFraction: 2, maxFraction: 2 });
    expect(parseLocaleNumber(formatted, 'en-US')).toBe(1234.56);
  });
});

/**
 * A number whose fraction has not been typed yet. `QuantityStepper` parses on blur, so a customer
 * who deleted the digits after the decimal point and tabbed away handed this function `"12."` —
 * which returned `null`, and the field committed an empty value. The number is 12; only the
 * fraction is missing.
 */
describe('parseLocaleNumber — a trailing separator', () => {
  it('reads a trailing decimal point as the whole number, in either locale', () => {
    expect(parseLocaleNumber('12.', 'en-US')).toBe(12);
    expect(parseLocaleNumber('12,', 'is-IS')).toBe(12);
    expect(parseLocaleNumber('-12.', 'en-US')).toBe(-12);
    expect(parseLocaleNumber('-12,', 'is-IS')).toBe(-12);
    expect(parseLocaleNumber('1,234.', 'en-US')).toBe(1234);
    expect(parseLocaleNumber('1.234,', 'is-IS')).toBe(1234);
  });

  it('still refuses a separator with no number in front of it', () => {
    for (const locale of ['en-US', 'is-IS']) {
      expect(parseLocaleNumber('-', locale)).toBeNull();
      expect(parseLocaleNumber('.', locale)).toBeNull();
      expect(parseLocaleNumber(',', locale)).toBeNull();
      expect(parseLocaleNumber('-.', locale)).toBeNull();
      expect(parseLocaleNumber('-,', locale)).toBeNull();
      expect(parseLocaleNumber('', locale)).toBeNull();
    }
  });

  it('leaves a leading separator alone, which was already a number', () => {
    expect(parseLocaleNumber('.5', 'en-US')).toBe(0.5);
    expect(parseLocaleNumber(',5', 'is-IS')).toBe(0.5);
  });
});
