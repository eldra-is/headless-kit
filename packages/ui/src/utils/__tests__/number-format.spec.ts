import { describe, expect, it } from 'vitest';
import { withoutIcuDataFor } from '../../test/intlStub';
import {
  createNumberFormat,
  currencyFractionDigits,
  currencySymbol,
  defaultUnitFormat,
  formatCurrency,
  formatNumber,
  formatUnit,
  localeSeparators,
  parseLocaleNumber,
  type UnitFormatOptions,
} from '../number-format';

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
    // space), not a plain U+0020, which is why every assertion in this file spells it `\u00a0`
    // rather than typing the character: an invisible one in a `toBe` is a trap, and any tool that
    // normalises whitespace turns it into an assertion that can never pass.
    expect(expected).toContain('\u00a0kr.');
    expect(expected.replace('\u00a0', ' ')).toBe('12.345 kr.');
  });

  it('formats a plain decimal under is-IS with . grouping and , decimals', () => {
    const expected = new Intl.NumberFormat('is-IS').format(12345.6);
    expect(formatNumber(12345.6, { locale: 'is-IS' })).toBe(expected);
  });
});

/**
 * The private library's own rule, written out from its documented option set rather than imported
 * (this package may never depend on that one): `style: 'currency'`, `minimumFractionDigits: 0`,
 * `maximumFractionDigits: maxFraction`, `currencyDisplay: narrow ? 'narrowSymbol' : 'symbol'`.
 *
 * Every expectation below is computed through this, the same way the private tests compute theirs,
 * so a runtime whose ICU data differs from this machine's cannot make the parity table lie — and
 * so that the day either side changes, the table fails instead of the two drifting apart silently.
 */
function privateRule(
  value: number,
  locale = 'en-US',
  currency = 'USD',
  narrowSymbol = true,
  maxFraction = 2
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFraction,
    currencyDisplay: narrowSymbol ? 'narrowSymbol' : 'symbol',
  }).format(value);
}

/**
 * The canonical copy of the private library's `formatCurrency`, which is expected to import this
 * one and delete its own — so the contract under test is *identity with that function*, not merely
 * "formats money sensibly". The reason it is here at all: `style: 'currency'` on its own renders
 * the *wide* sign, so a theme that built its own formatter showed "ISK 2,800" beside a
 * `CurrencyInput` showing "kr 2,800" for the same money.
 */
describe('formatCurrency', () => {
  it('renders the narrow sign by default', () => {
    // "kr", not "ISK" — and the literal between sign and digits is U+00A0, the locale's own.
    expect(formatCurrency(2800, 'en-US', 'ISK')).toBe('kr\u00a02,800');
  });

  it('renders the locale’s own placement and separators', () => {
    // `is-IS` writes the sign last and groups with "." — and its narrow sign for ISK is the same
    // "kr." as its wide one, which is why this locale could never have caught the defect alone.
    expect(formatCurrency(2800, 'is-IS', 'ISK')).toBe('2.800\u00a0kr.');
  });

  it('writes no minimum fraction digits, which is part of the contract', () => {
    // `minimumFractionDigits: 0`: "$28", never "$28.00" — the rule a currency *field* wants, and
    // the one the private helper has. A caller that wants the currency's own count passes it.
    expect(formatCurrency(28, 'en-US', 'USD')).toBe('$28');
    expect(formatCurrency(28.5, 'en-US', 'USD')).toBe('$28.5');
    expect(formatCurrency(28.567, 'en-US', 'USD')).toBe('$28.57');
  });

  it('defaults maxFraction to 2 whatever the currency, and takes the caller’s otherwise', () => {
    // BHD has three minor-unit digits; the default rounds it to two, and `currencyFractionDigits`
    // is how `Price` asks for its own.
    expect(formatCurrency(1234.567, 'en-US', 'BHD')).toBe(privateRule(1234.567, 'en-US', 'BHD'));
    expect(formatCurrency(1234.567, 'en-US', 'BHD', true, 3)).toBe(
      privateRule(1234.567, 'en-US', 'BHD', true, 3)
    );
    expect(formatCurrency(1234.567, 'en-US', 'BHD', true, 3)).toContain('.567');
    // And a zero-decimal currency is *not* exempt from the default: `maxFraction` is the caller's
    // business, not the currency's, so 2800.4 krónur prints its fraction unless the caller says 0.
    // This is the whole reason `Price` passes `currencyFractionDigits` rather than letting the
    // default stand.
    expect(formatCurrency(2800.4, 'en-US', 'ISK')).toBe(privateRule(2800.4, 'en-US', 'ISK'));
    expect(formatCurrency(2800.4, 'en-US', 'ISK')).toBe('kr\u00a02,800.4');
    expect(formatCurrency(2800.4, 'en-US', 'ISK', true, 0)).toBe('kr\u00a02,800');
  });

  it('renders the wide sign when narrowSymbol is false', () => {
    expect(formatCurrency(2800, 'en-US', 'ISK', false)).toBe('ISK\u00a02,800');
  });

  it('defaults every argument but the value, the same defaults the private helper has', () => {
    // `locale = 'en-US'`, `currency = 'USD'`, `narrowSymbol = true`, `maxFraction = 2`.
    expect(formatCurrency(28)).toBe(formatCurrency(28, 'en-US', 'USD', true, 2));
    expect(formatCurrency(28)).toBe('$28');
  });

  /**
   * The parity table. Every currency-and-locale pair the two libraries can see, both signs, a value
   * with no fraction, one with a short fraction, one needing rounding, and a grouped one.
   */
  it('is identical to the private library’s own implementation', () => {
    for (const currency of ['ISK', 'USD', 'EUR']) {
      for (const locale of ['en-US', 'is-IS']) {
        for (const narrowSymbol of [true, false]) {
          for (const value of [0, 28, 28.5, 28.567, 2800, 1234567.89]) {
            expect(formatCurrency(value, locale, currency, narrowSymbol)).toBe(
              privateRule(value, locale, currency, narrowSymbol)
            );
          }
        }
      }
    }
  });

  it('is identical to the private library’s own implementation at other fraction caps', () => {
    for (const maxFraction of [0, 1, 3]) {
      for (const value of [28, 28.5, 28.567]) {
        expect(formatCurrency(value, 'en-US', 'USD', true, maxFraction)).toBe(
          privateRule(value, 'en-US', 'USD', true, maxFraction)
        );
      }
    }
  });

  it('is `formatUnit` with isCurrency, and nothing else', () => {
    expect(formatCurrency(2800, 'en-US', 'ISK', true, 2)).toBe(
      formatUnit(2800, {
        locale: 'en-US',
        isCurrency: true,
        currency: 'ISK',
        maxFraction: 2,
        narrow: true,
      })
    );
  });

  it('throws for an unrecognised currency code, exactly as the private helper does', () => {
    // Not softened: a public copy that swallowed an error its original raises is a different
    // function. `Price` and the starter's own money module each guard it.
    expect(() => formatCurrency(1234, 'en-US', 'XYZ1')).toThrow(RangeError);
    expect(() => formatCurrency(1234, 'en-US', '')).toThrow(RangeError);
  });

  it('keeps throwing for a bad code, rather than caching the failure', () => {
    // The formatter cache must only ever hold a construction that succeeded.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => formatCurrency(1234, 'en-US', 'XYZ1')).toThrow(RangeError);
    }
  });
});

/**
 * The sixth parameter, and the one addition to the ported signature: the display rule. A price list
 * in which one row reads `$96` and the next `$96.50` is not a column of money, so a *displayed*
 * amount asks for the currency's own count as the minimum as well as the maximum; a currency
 * *field* omits it and keeps the private helper's unpadded output.
 */
describe('formatCurrency — minFraction', () => {
  it('pads to minFraction when it is given', () => {
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, 2)).toBe('$28.00');
    expect(formatCurrency(28.5, 'en-US', 'USD', true, 2, 2)).toBe('$28.50');
    expect(formatCurrency(28.567, 'en-US', 'USD', true, 2, 2)).toBe('$28.57');
  });

  it('is the private helper exactly when it is omitted', () => {
    // Omitted and explicitly `undefined` both mean "the private behaviour", so a caller forwarding
    // an optional value cannot accidentally change the contract.
    for (const value of [28, 28.5, 28.567]) {
      expect(formatCurrency(value, 'en-US', 'USD')).toBe(privateRule(value, 'en-US', 'USD'));
      expect(formatCurrency(value, 'en-US', 'USD', true, 2, undefined)).toBe(
        privateRule(value, 'en-US', 'USD')
      );
    }
    expect(formatCurrency(28, 'en-US', 'USD')).toBe('$28');
  });

  it('leaves a zero-decimal currency alone, there being nothing to pad to', () => {
    expect(formatCurrency(2800, 'en-US', 'ISK', true, 0, 0)).toBe('kr\u00a02,800');
    expect(formatCurrency(2800, 'en-US', 'ISK', true, 0, 0)).toBe(
      formatCurrency(2800, 'en-US', 'ISK', true, 0)
    );
  });

  it('pads a three-decimal currency to its own three', () => {
    expect(formatCurrency(1234.5, 'en-US', 'BHD', true, 3, 3)).toContain('.500');
  });

  it('reaches `formatUnit` as its own option, and narrows nothing by itself', () => {
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, 2)).toBe(
      formatUnit(28, {
        locale: 'en-US',
        isCurrency: true,
        currency: 'USD',
        maxFraction: 2,
        narrow: true,
        minFraction: 2,
      })
    );
  });
});

/**
 * `formatUnit` memoises the formatters it builds, which is the one piece of state in this module.
 * It must be invisible: same arguments, same answer, and one shape's entry never answering for
 * another's.
 */
describe('the formatter cache', () => {
  it('answers the same for a repeated call', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(formatCurrency(28, 'en-US', 'USD', true, 2, 2)).toBe('$28.00');
      expect(formatCurrency(28, 'en-US', 'USD')).toBe('$28');
    }
  });

  it('keeps every input that changes the output in its key', () => {
    // Each pair differs in exactly one argument, so a key missing that argument would make the
    // second call answer with the first one's formatter.
    expect(formatCurrency(28, 'en-US', 'USD')).not.toBe(formatCurrency(28, 'is-IS', 'USD'));
    expect(formatCurrency(28, 'en-US', 'USD')).not.toBe(formatCurrency(28, 'en-US', 'EUR'));
    expect(formatCurrency(2800, 'en-US', 'ISK', true)).not.toBe(
      formatCurrency(2800, 'en-US', 'ISK', false)
    );
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, 2)).not.toBe(
      formatCurrency(28, 'en-US', 'USD', true, 2)
    );
    expect(formatCurrency(28.567, 'en-US', 'USD', true, 1)).not.toBe(
      formatCurrency(28.567, 'en-US', 'USD', true, 2)
    );
    // A unit and a currency of the same locale and digits are different shapes too.
    expect(formatUnit(28, { locale: 'en-US', unit: 'kilogram' })).not.toBe(
      formatUnit(28, { locale: 'en-US', isCurrency: true, currency: 'USD' })
    );
    expect(formatUnit(28, { locale: 'en-US', unit: 'kilogram' })).not.toBe(
      formatUnit(28, { locale: 'en-US', unit: 'meter' })
    );
  });

  /**
   * One option at a time against the all-defaults call, so every value in `UNIT_FORMAT_DEFAULTS` is
   * accounted for: six of the seven must change the output, which they can only do if the key names
   * the resolved value rather than the one the caller happened to pass. (The constant's completeness
   * is a compile-time matter — it `satisfies Required<UnitFormatOptions>`, so an option added to the
   * interface without a default stops the build.)
   *
   * `narrow` is the exception and the one case worth stating: a unit's display is pinned to
   * `"short"`, so it changes nothing here and is deliberately absent from the unit key. Its own
   * branch is covered above.
   */
  it('names every defaulted option that can change the output', () => {
    const base = formatUnit(28.5, {});
    const variants: Array<[string, UnitFormatOptions, boolean]> = [
      ['locale', { locale: 'is-IS' }, true],
      ['unit', { unit: 'kilogram' }, true],
      ['maxFraction', { maxFraction: 0 }, true],
      ['isCurrency', { isCurrency: true }, true],
      ['currency', { isCurrency: true, currency: 'ISK' }, true],
      ['minFraction', { minFraction: 2 }, true],
      // Pinned to `"short"` for a unit, so this one cannot and must not matter.
      ['narrow', { narrow: true }, false],
    ];
    for (const [name, options, differs] of variants) {
      const formatted = formatUnit(28.5, options);
      if (differs) {
        expect(formatted, `${name} should change the output`).not.toBe(
          name === 'currency' ? formatUnit(28.5, { isCurrency: true }) : base
        );
      } else {
        expect(formatted, `${name} should not change a unit's output`).toBe(base);
      }
    }
  });
});

describe('formatUnit', () => {
  it('formats a unit with Intl’s own short display', () => {
    const expected = new Intl.NumberFormat('en-US', {
      style: 'unit',
      unit: 'kilogram',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(2.5);
    expect(formatUnit(2.5, { locale: 'en-US', unit: 'kilogram', maxFraction: 2 })).toBe(expected);
  });

  it('leaves a unit’s display alone when narrow is set — the private helper’s own behaviour', () => {
    // The one place this module's two vocabularies differ: `NumberFormatOptions.narrow` narrows a
    // unit as well as a currency, and `UnitFormatOptions.narrow` deliberately does not, because
    // the helper being ported sets no `unitDisplay` at all.
    expect(formatUnit(2.5, { locale: 'en-US', unit: 'kilogram', narrow: true })).toBe(
      formatUnit(2.5, { locale: 'en-US', unit: 'kilogram', narrow: false })
    );
    expect(formatUnit(2.5, { locale: 'en-US', unit: 'kilogram', narrow: true })).not.toBe(
      formatNumber(2.5, { locale: 'en-US', style: 'unit', unit: 'kilogram', narrow: true })
    );
  });

  it('applies the private helper’s defaults for every option', () => {
    // `locale = 'en-US'`, `unit = 'meter'`, `maxFraction = 2`, `isCurrency = false`,
    // `currency = 'USD'`, `narrow = false`.
    const expected = new Intl.NumberFormat('en-US', {
      style: 'unit',
      unit: 'meter',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(12.5);
    expect(formatUnit(12.5, {})).toBe(expected);
    expect(formatUnit(12.5, { isCurrency: true })).toBe(
      privateRule(12.5, 'en-US', 'USD', false, 2)
    );
  });

  it('writes no minimum fraction digits, for a unit as for a currency', () => {
    expect(formatUnit(12, { locale: 'en-US', unit: 'meter' })).not.toContain('.00');
  });
});

describe('currencySymbol', () => {
  it('returns the narrow sign by default', () => {
    expect(currencySymbol('ISK', 'en-US')).toBe('kr');
    expect(currencySymbol('ISK', 'is-IS')).toBe('kr.');
    expect(currencySymbol('USD', 'en-US')).toBe('$');
  });

  it('returns the wide sign when narrow is false', () => {
    // Which for `ISK` under `en-US` is the code itself — the case a caller pairing code and
    // symbol has to compare for, rather than printing "ISK ISK".
    expect(currencySymbol('ISK', 'en-US', false)).toBe('ISK');
  });

  it('is the sign formatCurrency actually prints', () => {
    for (const [currency, locale] of [
      ['ISK', 'en-US'],
      ['ISK', 'is-IS'],
      ['USD', 'en-US'],
      ['USD', 'is-IS'],
      ['EUR', 'en-US'],
    ] as const) {
      expect(formatCurrency(2800, locale, currency)).toContain(currencySymbol(currency, locale));
    }
  });

  it('defaults the locale to en-US', () => {
    expect(currencySymbol('ISK')).toBe(currencySymbol('ISK', 'en-US'));
  });

  it('returns the code itself for a code Intl does not recognise, rather than throwing', () => {
    expect(currencySymbol('XYZ1', 'en-US')).toBe('XYZ1');
  });
});

/**
 * The private library's `defaultUnitFormat`, written out from its documented option set the same way
 * `privateRule` is written out above: `style` from `isCurrency`, `unit` only for a unit, `currency`
 * and `currencyDisplay` only for a currency, `minimumFractionDigits: 0`,
 * `maximumFractionDigits: maxFraction`, no `unitDisplay` at all, and `extraOptions` spread **last**
 * so it overrides any of them.
 *
 * It takes `UnitFormatOptions` for convenience but **ignores `minFraction`**, because the private
 * signature has no such option — which is why no parity case below sets one; `minFraction` is
 * covered on its own, further down.
 */
function privateDefaultUnitFormat(
  {
    locale = 'en-US',
    unit = 'meter',
    maxFraction = 2,
    isCurrency = false,
    currency = 'USD',
    narrow = false,
  }: UnitFormatOptions,
  extraOptions: Intl.NumberFormatOptions = {}
): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, {
    style: isCurrency ? 'currency' : 'unit',
    ...(!isCurrency ? { unit } : {}),
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFraction,
    ...(isCurrency ? { currency, currencyDisplay: narrow ? 'narrowSymbol' : 'symbol' } : {}),
    ...extraOptions,
  });
}

/**
 * The third ported function, and the one that actually holds the rule: `formatUnit` and
 * `formatCurrency` are wrappers over it, exactly as the private library's own two are. It is what
 * lets that library delete its `unit-utils.ts` rather than only its wrappers — so the parity that
 * matters here is `resolvedOptions()`, not just the formatted string.
 */
describe('defaultUnitFormat', () => {
  const CASES: UnitFormatOptions[] = [
    {},
    { locale: 'is-IS' },
    { unit: 'kilogram' },
    { unit: 'kilometer-per-hour', locale: 'de-DE' },
    { maxFraction: 0 },
    { maxFraction: 3, unit: 'liter' },
    { isCurrency: true },
    { isCurrency: true, currency: 'ISK', maxFraction: 0 },
    { isCurrency: true, currency: 'ISK', narrow: true },
    { isCurrency: true, currency: 'ISK', narrow: false },
    { isCurrency: true, currency: 'BHD', maxFraction: 3, locale: 'ar-EG' },
    { isCurrency: true, currency: 'USD', narrow: true, locale: 'is-IS' },
    // `narrow` on a unit, which the private helper ignores — it sets no `unitDisplay`.
    { unit: 'kilogram', narrow: true },
  ];

  it('returns a real Intl.NumberFormat', () => {
    expect(defaultUnitFormat()).toBeInstanceOf(Intl.NumberFormat);
  });

  it('compares only options the private helper has', () => {
    // `privateDefaultUnitFormat` ignores `minFraction`, so a case setting one would compare our
    // padded output against its unpadded one and pass for the wrong reason.
    expect(CASES.every((options) => options.minFraction === undefined)).toBe(true);
  });

  it('resolves the same options as the private helper, case for case', () => {
    for (const options of CASES) {
      expect(defaultUnitFormat(options).resolvedOptions()).toEqual(
        privateDefaultUnitFormat(options).resolvedOptions()
      );
    }
  });

  it('formats the same, case for case', () => {
    for (const options of CASES) {
      for (const value of [0, 2.5, 28, 1234.567, -12]) {
        expect(defaultUnitFormat(options).format(value)).toBe(
          privateDefaultUnitFormat(options).format(value)
        );
      }
    }
  });

  it('lets extraOptions override the rule, applied last', () => {
    // `{ minimumFractionDigits: 2 }` is exactly what the private `UnitInput` passes, for its
    // placeholder and for measuring the formatted parts. Outcomes are compared rather than values,
    // because one case below (`maxFraction: 0`) makes that bag ask for a minimum above the maximum
    // and both implementations must refuse it — the bag is not validated here, so `Intl`'s own
    // `RangeError` is the answer, exactly as it is there.
    const outcome = (format: () => Intl.NumberFormat): string => {
      try {
        return format().format(28);
      } catch (error) {
        return `threw ${(error as Error).name}`;
      }
    };
    for (const options of CASES) {
      const extra = { minimumFractionDigits: 2 };
      expect(outcome(() => defaultUnitFormat(options, extra))).toBe(
        outcome(() => privateDefaultUnitFormat(options, extra))
      );
    }
    expect(defaultUnitFormat({}, { minimumFractionDigits: 2 }).format(28)).toContain('28.00');
    expect(outcome(() => defaultUnitFormat({ maxFraction: 0 }, { minimumFractionDigits: 2 }))).toBe(
      'threw RangeError'
    );
    // Even `style` is overridable, because the bag is spread over everything.
    expect(defaultUnitFormat({ isCurrency: true }, { style: 'decimal' }).format(28)).toBe('28');
  });

  it('defaults every option the private helper defaults', () => {
    // `locale = 'en-US'`, `unit = 'meter'`, `maxFraction = 2`, `isCurrency = false`,
    // `currency = 'USD'`, `narrow = false` — and the options object itself is optional here, which
    // is the one widening (every call valid against the private signature stays valid).
    expect(defaultUnitFormat().resolvedOptions()).toEqual(
      privateDefaultUnitFormat({}).resolvedOptions()
    );
    const resolved = defaultUnitFormat().resolvedOptions();
    expect(resolved.locale).toBe('en-US');
    expect(resolved.style).toBe('unit');
    expect(resolved.unit).toBe('meter');
    expect(resolved.minimumFractionDigits).toBe(0);
    expect(resolved.maximumFractionDigits).toBe(2);
  });

  it('never sets unitDisplay, so a unit is always Intl’s own short form', () => {
    for (const narrow of [true, false]) {
      expect(defaultUnitFormat({ unit: 'kilogram', narrow }).resolvedOptions().unitDisplay).toBe(
        'short'
      );
    }
  });

  it('is what formatUnit and formatCurrency format through', () => {
    expect(
      formatUnit(28, { isCurrency: true, currency: 'ISK', narrow: true, maxFraction: 0 })
    ).toBe(
      defaultUnitFormat({ isCurrency: true, currency: 'ISK', narrow: true, maxFraction: 0 }).format(
        28
      )
    );
    expect(formatCurrency(28, 'en-US', 'USD')).toBe(
      defaultUnitFormat({ isCurrency: true, currency: 'USD', narrow: true }).format(28)
    );
  });

  it('throws for a code, unit or locale Intl does not recognise', () => {
    expect(() => defaultUnitFormat({ isCurrency: true, currency: 'XYZ1' })).toThrow(RangeError);
    expect(() => defaultUnitFormat({ unit: 'furlong' })).toThrow(RangeError);
    expect(() => defaultUnitFormat({ locale: 'not a locale' })).toThrow(RangeError);
  });
});

/**
 * `maxFraction` defaults to `2` whatever the currency, so asking for three *minimum* digits without
 * raising the maximum is a mistake a caller makes by passing one argument. `Intl` reports it as
 * `maximumFractionDigits value is out of range` — naming the parameter they did not set, against a
 * default they had no reason to suspect — so the pair is refused here instead, saying both numbers.
 */
describe('minFraction against maxFraction', () => {
  it('refuses a minimum above the maximum, naming both', () => {
    expect(() => defaultUnitFormat({ minFraction: 3 })).toThrow(RangeError);
    expect(() => defaultUnitFormat({ minFraction: 3 })).toThrow(/minFraction \(3\)/);
    expect(() => defaultUnitFormat({ minFraction: 3 })).toThrow(/maxFraction \(2\)/);
  });

  /**
   * The message exists to stop `Intl` blaming a `maximumFractionDigits` the caller never set. Turned
   * on whenever the *defaulted* `minFraction: 0` exceeded the maximum, it did the same thing in
   * reverse: a lone negative `maxFraction` was reported as a `minFraction` problem, naming a `0` the
   * caller had not passed either. So the guard asks whether `minFraction` was actually given, and a
   * bad `maxFraction` on its own is left to `Intl`, which names the argument that is wrong.
   */
  it('blames maxFraction, not a defaulted minFraction, for a lone bad maximum', () => {
    for (const bad of [{ maxFraction: -1 }, { maxFraction: 101 }]) {
      expect(() => defaultUnitFormat(bad)).toThrow(RangeError);
      expect(() => defaultUnitFormat(bad)).toThrow(/maximumFractionDigits/);
      expect(() => defaultUnitFormat(bad)).not.toThrow(/minFraction/);
      expect(() => formatUnit(28, bad)).toThrow(/maximumFractionDigits/);
      expect(() => formatCurrency(28, 'en-US', 'USD', true, -1)).toThrow(/maximumFractionDigits/);
    }
  });

  it('still refuses an explicit minFraction above a bad maximum, with its own message', () => {
    // Both are wrong, and the caller passed both, so the one naming both is the useful one.
    expect(() => defaultUnitFormat({ minFraction: 1, maxFraction: -1 })).toThrow(
      /minFraction \(1\)/
    );
  });

  it('treats an explicit undefined as absent, so a forwarded optional cannot trip it', () => {
    // `formatCurrency` forwards its optional sixth argument straight through.
    expect(() => defaultUnitFormat({ minFraction: undefined, maxFraction: 2 })).not.toThrow();
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, undefined)).toBe('$28');
  });

  it('refuses it through formatUnit and formatCurrency too', () => {
    expect(() => formatUnit(28, { minFraction: 3 })).toThrow(/minFraction/);
    expect(() => formatCurrency(28, 'en-US', 'BHD', true, 2, 3)).toThrow(/minFraction/);
  });

  it('keeps refusing it rather than caching the refusal', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(() => formatUnit(28, { minFraction: 3 })).toThrow(RangeError);
    }
  });

  it('accepts the pair a three-decimal currency actually needs', () => {
    expect(formatCurrency(1234.5, 'en-US', 'BHD', true, 3, 3)).toContain('.500');
    expect(formatUnit(28, { isCurrency: true, currency: 'BHD', maxFraction: 3, minFraction: 3 })) //
      .toContain('.000');
  });

  it('accepts equal values, and any minimum at or below the default', () => {
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, 2)).toBe('$28.00');
    expect(formatCurrency(28, 'en-US', 'USD', true, 0, 0)).toBe('$28');
    expect(formatCurrency(28, 'en-US', 'USD', true, 2, 1)).toBe('$28.0');
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

/**
 * What `LOCALE_FALLBACKS`'s own doc comment claims: `da-DK` is digit-for-digit identical to genuine
 * `is-IS` for a narrow currency sign and for a plain decimal's grouping/separators — every shape
 * this package's own components actually format a number in. Computed against *this* runtime's own
 * `is-IS` output (not a hand-typed string), so the comparison stays true on whatever ICU data the
 * machine running the suite has, the same reason `formatNumber`'s own `is-IS` tests above do it.
 */
describe('da-DK vs genuine is-IS — the fallback’s own claim of parity', () => {
  it('is identical for a narrow currency sign, every currency and value this package forms', () => {
    for (const currency of ['ISK', 'USD', 'EUR', 'GBP', 'BHD', 'JPY']) {
      for (const value of [0, 28, 28.5, 28.567, 2800, 1_234_567.89]) {
        const genuine = new Intl.NumberFormat('is-IS', {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
        }).format(value);
        const substitute = new Intl.NumberFormat('da-DK', {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
        }).format(value);
        expect(substitute, `${currency} ${value}`).toBe(genuine);
      }
    }
  });

  it('is identical for a plain decimal’s grouping and separators', () => {
    for (const value of [0, 28, 28.5, 1_234_567.89, -12.3]) {
      expect(new Intl.NumberFormat('da-DK').format(value)).toBe(
        new Intl.NumberFormat('is-IS').format(value)
      );
    }
    expect(localeSeparators('da-DK')).toEqual({ group: '.', decimal: ',' });
  });

  /**
   * The one divergence this package knows about and accepts, written out so it is a documented
   * boundary rather than a silent surprise: a currency's **wide** sign is not the same word in the
   * two locales (Danish spells it out, Icelandic falls back to the bare ISO code), and neither is a
   * non-currency unit's own abbreviation. Nothing in this package calls either shape under `is-IS`
   * (`CurrencyInput`/`formatCurrency` always ask for the narrow sign), so the fallback never reaches
   * this path today — this test exists so a future caller that does finds the boundary documented
   * rather than discovering it as a field in a wrong currency code.
   */
  it('is NOT claimed identical for a wide currency sign or a unit’s own abbreviation', () => {
    expect(
      new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'USD' }).format(28)
    ).not.toBe(new Intl.NumberFormat('is-IS', { style: 'currency', currency: 'USD' }).format(28));
    expect(
      new Intl.NumberFormat('da-DK', { style: 'unit', unit: 'kilometer-per-hour' }).format(3.33)
    ).not.toBe(
      new Intl.NumberFormat('is-IS', { style: 'unit', unit: 'kilometer-per-hour' }).format(3.33)
    );
  });
});

/**
 * The defect itself, reproduced and proven fixed without an actual browser:
 * `withoutIcuDataFor('is-IS')` makes this runtime's own `Intl.NumberFormat` negotiate exactly the
 * way Chromium's real one does for a tag it has no data for (see `src/test/intlStub.ts`), so these
 * assertions are the same ones that fail against the pre-fix code and against a real
 * `is-IS`-ICU-less Chromium.
 */
describe('number formatting on a runtime without is-IS ICU data', () => {
  it('still renders the narrow ISK sign as a suffix with "." grouping, not en-US’s prefix/comma', () => {
    const restore = withoutIcuDataFor('is-IS');
    try {
      expect(formatCurrency(5000, 'is-IS', 'ISK')).toBe('5.000 kr.');
      expect(formatCurrency(11_000, 'is-IS', 'ISK')).toBe('11.000 kr.');
      expect(
        formatNumber(12_345, {
          locale: 'is-IS',
          style: 'currency',
          currency: 'ISK',
          narrow: true,
        })
      ).toBe('12.345 kr.');
    } finally {
      restore();
    }
  });

  it('would otherwise regress to the original bug — proving the stub itself is faithful', () => {
    // A locale with no fallback chain at all (anything but `is-IS`) is untouched by the stub, so
    // `en-US` still works normally: the stub removes only the one tag it was asked to remove.
    const restore = withoutIcuDataFor('is-IS');
    try {
      expect(formatCurrency(40, 'en-US', 'USD')).toBe('$40');
      // And without `LOCALE_FALLBACKS` the fallback-less `new Intl.NumberFormat('is-IS', …)` this
      // runtime now simulates reproduces the exact pre-fix string, confirming the stub is standing
      // in for the real missing-ICU-data runtime and not merely for "a different locale".
      expect(
        new Intl.NumberFormat('is-IS', {
          style: 'currency',
          currency: 'ISK',
          currencyDisplay: 'narrowSymbol',
        }).format(5000)
      ).toBe('kr 5,000');
    } finally {
      restore();
    }
  });

  it('still derives the "." group / "," decimal pair parseLocaleNumber relies on', () => {
    const restore = withoutIcuDataFor('is-IS');
    try {
      expect(localeSeparators('is-IS')).toEqual({ group: '.', decimal: ',' });
      expect(parseLocaleNumber('1.234,56', 'is-IS')).toBe(1234.56);
    } finally {
      restore();
    }
  });

  it('still resolves ISK to 0 fraction digits, which is a currency fact, not a locale one', () => {
    const restore = withoutIcuDataFor('is-IS');
    try {
      expect(currencyFractionDigits('ISK', 'is-IS')).toBe(0);
    } finally {
      restore();
    }
  });
});
