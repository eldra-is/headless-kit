import { dateTimeFormat } from './date';
import { numberFormat } from './number';
import { isUtcZone } from './zones';

/**
 * `installIcelandicIntl()` — Icelandic for code you do not control.
 *
 * `@eldrajs/sdk/format`'s functions are the way to format text you write. A date picker, vue-i18n's
 * `n()`/`d()` or a chart library calls `Intl` itself, and where the runtime has no Icelandic data
 * (Chrome, Edge, Cloudflare Workers) it prints English. This patches `Intl.NumberFormat`,
 * `Intl.DateTimeFormat`, `Number.prototype.toLocaleString` and the three `Date.prototype.toLocale*`
 * methods so that a request for Icelandic is formatted from this package's own data, and every other
 * locale is left to the runtime exactly as before. Unlike a polyfill that replaces `Intl`, nothing
 * changes for a browser on `en-GB` or `de-DE`, and there is no default locale to get wrong.
 */

const INSTALLED = Symbol.for('@eldrajs/sdk/format/intl');

type Formatter = {
  supportedLocalesOf(
    locales: string | string[],
    options?: { localeMatcher?: 'lookup' | 'best fit' }
  ): string[];
};
type Restore = () => void;

export interface InstallIcelandicIntlOptions {
  /**
   * Patch even where the runtime has Icelandic data (Node, Safari, Firefox), so every runtime prints
   * the same Icelandic. Off by default: there the runtime's own Icelandic is left alone.
   */
  force?: boolean;
}

/** Whether the runtime would format `locales` as Icelandic if it could: an Icelandic tag before any tag it supports. */
function wantsIcelandic(Runtime: Formatter, locales: unknown): boolean {
  if (locales === undefined) return false;
  for (const tag of Intl.getCanonicalLocales(locales as string | string[])) {
    if (/^is(-|$)/i.test(tag)) return true;
    if (Runtime.supportedLocalesOf([tag]).length > 0) return false;
  }
  return false;
}

function supportedLocalesOf(Runtime: Formatter) {
  return (locales: string | string[], options?: { localeMatcher?: 'lookup' | 'best fit' }) => {
    const supported = new Set(Runtime.supportedLocalesOf(locales, options));
    return Intl.getCanonicalLocales(locales).filter(
      (tag) => supported.has(tag) || /^is(-|$)/i.test(tag)
    );
  };
}

const DATE_FIELDS = ['weekday', 'year', 'month', 'day'] as const;
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'] as const;

/** ECMA-402's ToDateTimeOptions: the fields `toLocale{Date,Time,}String` add when none are asked for. */
function withDefaults(
  options: Intl.DateTimeFormatOptions | undefined,
  required: 'date' | 'time' | 'any',
  defaults: 'date' | 'time' | 'all'
): Intl.DateTimeFormatOptions {
  const resolved = { ...options };
  const has = (fields: readonly string[]) =>
    fields.some((field) => (resolved as Record<string, unknown>)[field] !== undefined);
  let needDefaults = true;
  if ((required === 'date' || required === 'any') && has(DATE_FIELDS)) needDefaults = false;
  if ((required === 'time' || required === 'any') && has(TIME_FIELDS)) needDefaults = false;
  if (resolved.dateStyle !== undefined || resolved.timeStyle !== undefined) needDefaults = false;
  if (!needDefaults) return resolved;
  if (defaults === 'date' || defaults === 'all') {
    Object.assign(resolved, { year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  if (defaults === 'time' || defaults === 'all') {
    Object.assign(resolved, { hour: 'numeric', minute: 'numeric', second: 'numeric' });
  }
  return resolved;
}

/**
 * Formats Icelandic from this package's data wherever the runtime has none, and leaves every other
 * locale to the runtime. Call it once, before anything formats (a Nuxt client plugin, the top of
 * `main.ts`). Returns a function that puts the runtime's own `Intl` back.
 *
 * Covers numbers and dates. Dates in a zone other than UTC (Iceland's) stay with the runtime, since
 * the bundled data carries no time zones. Lists, relative times, names and sorting are not patched:
 * use `listFormat`, `relativeTimeFormat`, `displayNames` and `comparator` for those.
 */
export function installIcelandicIntl(options: InstallIcelandicIntlOptions = {}): Restore {
  const intl = Intl as unknown as Record<string, unknown>;
  const RuntimeNumberFormat = Intl.NumberFormat;
  const RuntimeDateTimeFormat = Intl.DateTimeFormat;
  if ((RuntimeNumberFormat as unknown as Record<symbol, unknown>)[INSTALLED]) return () => {};
  const runtimeHasIcelandic =
    RuntimeNumberFormat.supportedLocalesOf(['is']).length > 0 &&
    RuntimeDateTimeFormat.supportedLocalesOf(['is']).length > 0;
  if (runtimeHasIcelandic && !options.force) return () => {};

  let runtimeZone: string | undefined;
  /** The zone a date formatter would use: the one asked for, else the runtime's own. */
  const zoneOf = (dateOptions?: Intl.DateTimeFormatOptions) =>
    dateOptions?.timeZone ??
    (runtimeZone ??= new RuntimeDateTimeFormat().resolvedOptions().timeZone);
  const icelandicNumbers = (locales: unknown) => wantsIcelandic(RuntimeNumberFormat, locales);
  const icelandicDates = (locales: unknown, dateOptions?: Intl.DateTimeFormatOptions) =>
    wantsIcelandic(RuntimeDateTimeFormat, locales) && isUtcZone(zoneOf(dateOptions));
  const icelandicDateFormat = (dateOptions?: Intl.DateTimeFormatOptions) =>
    dateTimeFormat('is', { ...dateOptions, timeZone: zoneOf(dateOptions) });

  const NumberFormat = function NumberFormat(
    locales?: string | string[],
    numberOptions?: Intl.NumberFormatOptions
  ) {
    return icelandicNumbers(locales)
      ? numberFormat('is', numberOptions)
      : new RuntimeNumberFormat(locales, numberOptions);
  } as unknown as typeof Intl.NumberFormat;
  // Native instances stay `instanceof Intl.NumberFormat`.
  Object.assign(NumberFormat, {
    prototype: RuntimeNumberFormat.prototype,
    supportedLocalesOf: supportedLocalesOf(RuntimeNumberFormat),
  });

  const DateTimeFormat = function DateTimeFormat(
    locales?: string | string[],
    dateOptions?: Intl.DateTimeFormatOptions
  ) {
    return icelandicDates(locales, dateOptions)
      ? icelandicDateFormat(dateOptions)
      : new RuntimeDateTimeFormat(locales, dateOptions);
  } as unknown as typeof Intl.DateTimeFormat;
  Object.assign(DateTimeFormat, {
    prototype: RuntimeDateTimeFormat.prototype,
    supportedLocalesOf: supportedLocalesOf(RuntimeDateTimeFormat),
  });
  (NumberFormat as unknown as Record<symbol, unknown>)[INSTALLED] = true;

  const numberToLocaleString = Number.prototype.toLocaleString;
  const dateToLocaleString = Date.prototype.toLocaleString;
  const dateToLocaleDateString = Date.prototype.toLocaleDateString;
  const dateToLocaleTimeString = Date.prototype.toLocaleTimeString;

  Number.prototype.toLocaleString = function toLocaleString(
    this: number,
    locales?: string | string[],
    numberOptions?: Intl.NumberFormatOptions
  ) {
    return icelandicNumbers(locales)
      ? numberFormat('is', numberOptions).format(Number(this))
      : numberToLocaleString.call(this, locales, numberOptions);
  };
  const patchDate = (
    original: (
      this: Date,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ) => string,
    required: 'date' | 'time' | 'any',
    defaults: 'date' | 'time' | 'all'
  ) =>
    function (this: Date, locales?: string | string[], dateOptions?: Intl.DateTimeFormatOptions) {
      // An invalid date prints "Invalid Date" in every locale; the runtime says it.
      if (Number.isNaN(this.getTime()) || !icelandicDates(locales, dateOptions)) {
        return original.call(this, locales, dateOptions);
      }
      return icelandicDateFormat(withDefaults(dateOptions, required, defaults)).format(this);
    };
  Date.prototype.toLocaleString = patchDate(dateToLocaleString, 'any', 'all');
  Date.prototype.toLocaleDateString = patchDate(dateToLocaleDateString, 'date', 'date');
  Date.prototype.toLocaleTimeString = patchDate(dateToLocaleTimeString, 'time', 'time');
  intl.NumberFormat = NumberFormat;
  intl.DateTimeFormat = DateTimeFormat;

  return () => {
    intl.NumberFormat = RuntimeNumberFormat;
    intl.DateTimeFormat = RuntimeDateTimeFormat;
    Number.prototype.toLocaleString = numberToLocaleString;
    Date.prototype.toLocaleString = dateToLocaleString;
    Date.prototype.toLocaleDateString = dateToLocaleDateString;
    Date.prototype.toLocaleTimeString = dateToLocaleTimeString;
  };
}
