/**
 * Locale-aware number formatting and parsing, ported from the private `unit-utils.ts` per the task
 * brief's own contract. Deliberately tiny and stateless, the same shape as `mask.ts`: no caching,
 * no DOM, just `Intl.NumberFormat` wrapped for the three shapes this package needs (a plain
 * decimal, a currency amount, a unit) and the inverse — turning what a person typed in their own
 * locale back into a `number`.
 */

/** What a formatted number needs: the locale plus the handful of `Intl.NumberFormat` options this
 * package's components actually use. */
export interface NumberFormatOptions {
  /** A BCP 47 locale tag, e.g. `"en-US"` or `"is-IS"`. */
  locale: string;
  /** `"decimal"` (the default), `"currency"` or `"unit"`. */
  style?: 'decimal' | 'currency' | 'unit';
  /** Required with `style: "currency"`, e.g. `"ISK"`, `"USD"`. */
  currency?: string;
  /** Required with `style: "unit"`, e.g. `"kilogram"`. */
  unit?: string;
  /** `Intl.NumberFormat`'s `maximumFractionDigits`. */
  maxFraction?: number;
  /** `Intl.NumberFormat`'s `minimumFractionDigits`. */
  minFraction?: number;
  /**
   * The narrow display: `currencyDisplay: "narrowSymbol"` for a currency ("$" rather than "US$"
   * where the two differ), `unitDisplay: "narrow"` for a unit. No effect on a plain decimal.
   */
  narrow?: boolean;
}

/**
 * Builds the `Intl.NumberFormat` a `NumberFormatOptions` describes, so a caller that needs to
 * format many values (a list of prices) builds it once rather than paying `formatNumber`'s own
 * construction cost per value.
 */
export function createNumberFormat(options: NumberFormatOptions): Intl.NumberFormat {
  const { locale, style = 'decimal', currency, unit, maxFraction, minFraction, narrow } = options;

  const intlOptions: Intl.NumberFormatOptions = { style };

  if (style === 'currency') {
    intlOptions.currency = currency ?? 'USD';
    if (narrow) intlOptions.currencyDisplay = 'narrowSymbol';
  }
  if (style === 'unit') {
    intlOptions.unit = unit ?? 'kilogram';
    if (narrow) intlOptions.unitDisplay = 'narrow';
  }
  if (maxFraction !== undefined) intlOptions.maximumFractionDigits = maxFraction;
  if (minFraction !== undefined) intlOptions.minimumFractionDigits = minFraction;

  return new Intl.NumberFormat(locale, intlOptions);
}

/** Formats one value. For formatting many values under the same options, use `createNumberFormat`
 * once and call `.format()` on the result instead — this constructs a fresh formatter every call. */
export function formatNumber(value: number, options: NumberFormatOptions): string {
  return createNumberFormat(options).format(value);
}

/**
 * The group and decimal separators a locale's `Intl.NumberFormat` actually uses, read from the
 * runtime's own ICU data rather than a hand-maintained table — `is-IS` groups with `.` and takes
 * `,` as the decimal point, `en-US` the reverse, and other locales use other characters entirely
 * (a non-breaking space, an apostrophe, …). `12345.6` is large enough to force a `group` part in
 * every locale that groups at all, and has a fractional part so `decimal` always appears too.
 */
function localeSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  return { group, decimal };
}

/** Escapes a string for use inside a `RegExp`, so a locale's own separator character (which can be
 * a `.`, itself a regex metacharacter) is matched literally. */
function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses text a person typed in their own locale back into a plain `number` — the inverse of
 * `formatNumber` with `style: "decimal"`. Handles `is-IS`'s `"1.234,56"` (`.` groups, `,` is the
 * decimal point) and `en-US`'s `"1,234.56"` (the reverse) by deriving both separators from the
 * locale itself (`localeSeparators`, above) rather than assuming either arrangement.
 *
 * Returns `null` for anything that is not a valid number once separators are stripped — empty
 * text, a bare `-` or `.`, stray letters — so a caller never has to check for `NaN` itself.
 */
export function parseLocaleNumber(text: string, locale: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const { group, decimal } = localeSeparators(locale);

  let normalized = trimmed;
  if (group !== '') {
    normalized = normalized.replace(new RegExp(escapeForRegExp(group), 'g'), '');
  }
  if (decimal !== '.') {
    normalized = normalized.replace(new RegExp(escapeForRegExp(decimal), 'g'), '.');
  }
  // Some locales group with a non-breaking or narrow no-break space that can slip in around the
  // text as well as between digits (pasted text, a trailing space); strip whatever is left.
  normalized = normalized.replace(/\s/g, '');

  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isNaN(value) ? null : value;
}
