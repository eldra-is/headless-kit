/**
 * Locale-aware number formatting and parsing, ported from the private library's own `unit-utils.ts`.
 * Deliberately tiny and no DOM: just `Intl.NumberFormat` wrapped for the three shapes this package
 * needs (a plain decimal, a currency amount, a unit) and the inverse — turning what a person typed
 * in their own locale back into a `number`.
 *
 * **Stateless but for one memo.** `formatUnit` keeps the formatters it builds in a module-level
 * `Map`, because it takes a value and returns a string — a caller formatting a grid of prices has no
 * formatter of its own to hold, and construction costs some 40× a `format()` call. The memo is keyed
 * on every input that reaches `Intl` and holds nothing but `Intl.NumberFormat` instances, so the
 * function stays pure and there is no cross-request state on a server; see `unitFormatters`' own
 * note. Nothing else here caches: `createNumberFormat` and `defaultUnitFormat` hand the formatter
 * back, so their caller already owns its lifetime.
 */

/**
 * A BCP 47 tag widened to a fallback chain for the one locale this package ships messages for whose
 * number-formatting CLDR data a real, current Chrome does not bundle: `is-IS`.
 * `Intl.NumberFormat.supportedLocalesOf(['is-IS'])` returns `[]` under Playwright's own bundled
 * Chromium (checked directly, not inferred: `pnpm --filter @eldrajs/ui exec playwright …`, see the
 * check recorded beside `LOCALE_FALLBACKS`' own test) because Chromium's bundled ICU data excludes
 * CLDR locales below "modern" coverage, and Icelandic is one; the constructor does not throw for
 * an unsupported tag, it silently negotiates down to its own default locale (`en-US`), which is
 * what turned an `is-IS`/`ISK` field into `"kr 5,000"` (comma grouping, prefix sign) instead of the
 * spec's `"5.000 kr."`. Node's `Intl` has full ICU and formats `is-IS` correctly on its own, which
 * is what made this invisible to a plain `node -e` check — only a real browser shows it.
 *
 * `da-DK` is next in the chain: fully supported everywhere, and — proven in
 * `__tests__/number-format.spec.ts` by comparing every formatted string against genuine `is-IS`
 * output rather than asserting a hand-picked few — digit-for-digit identical to it for a **narrow**
 * currency sign (`currencyDisplay: 'narrowSymbol'`, this package's own default everywhere it calls
 * `Intl`) and for a plain decimal's grouping and separators, which is every shape this package's own
 * components format a number in. It is **not** identical for a currency's **wide** sign
 * (`currencyDisplay: 'symbol'`, `narrow: false` on `formatUnit`/`formatCurrency`/`currencySymbol`) —
 * Danish spells it out (`"US$"`, `"€"`) where Icelandic falls back to the bare code (`"USD"`,
 * `"EUR"`) — nor for a non-currency unit's own abbreviation (`"km/klst."` vs `"km/t."`), so a future
 * caller reaching either of those two shapes under `is-IS` on a runtime without Icelandic data gets
 * Danish-flavoured text rather than Icelandic- or English-flavoured text: closer to the spec than
 * the pre-fix bug in every case measured, but still not genuine `is-IS`. `Intl.NumberFormat`'s own
 * locale negotiation only reaches `da-DK` when `is-IS` truly is not available, so a runtime that
 * does carry Icelandic data (Node; a future Chrome release) keeps using it and never touches the
 * fallback — `src/test/intlStub.ts`'s `withoutIcuDataFor` is what lets a test simulate the runtime
 * that does, without an actual browser.
 */
const LOCALE_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  'is-IS': ['is-IS', 'da-DK'],
};

/** The locale argument to hand an `Intl` constructor: the fallback chain above for a locale that
 * needs one, the bare tag for every other locale. */
function intlLocales(locale: string): string | readonly string[] {
  return LOCALE_FALLBACKS[locale] ?? locale;
}

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
  /**
   * `Intl.NumberFormat`'s own `currencyDisplay`, for the two values `narrow` cannot express
   * (`"code"` → "USD 12.00", `"name"` → "12.00 US dollars"). Set, it wins over `narrow`.
   */
  currencyDisplay?: Intl.NumberFormatOptions['currencyDisplay'];
  /** `Intl.NumberFormat`'s own `unitDisplay` (`"short"`, `"narrow"`, `"long"`). Wins over `narrow`. */
  unitDisplay?: Intl.NumberFormatOptions['unitDisplay'];
}

/**
 * Builds the `Intl.NumberFormat` a `NumberFormatOptions` describes, so a caller that needs to
 * format many values (a list of prices) builds it once rather than paying `formatNumber`'s own
 * construction cost per value.
 */
export function createNumberFormat(options: NumberFormatOptions): Intl.NumberFormat {
  const {
    locale,
    style = 'decimal',
    currency,
    unit,
    maxFraction,
    minFraction,
    narrow,
    currencyDisplay,
    unitDisplay,
  } = options;

  const intlOptions: Intl.NumberFormatOptions = { style };

  if (style === 'currency') {
    intlOptions.currency = currency ?? 'USD';
    if (narrow) intlOptions.currencyDisplay = 'narrowSymbol';
    if (currencyDisplay !== undefined) intlOptions.currencyDisplay = currencyDisplay;
  }
  if (style === 'unit') {
    intlOptions.unit = unit ?? 'kilogram';
    if (narrow) intlOptions.unitDisplay = 'narrow';
    if (unitDisplay !== undefined) intlOptions.unitDisplay = unitDisplay;
  }
  if (maxFraction !== undefined) intlOptions.maximumFractionDigits = maxFraction;
  if (minFraction !== undefined) intlOptions.minimumFractionDigits = minFraction;

  return new Intl.NumberFormat(intlLocales(locale), intlOptions);
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
 *
 * Exported because a control that lets a person *type* a number needs exactly the two characters
 * the formatter would print: `QuantityStepper` strips the group separator out of its editing text
 * and accepts both through the `beforeinput` filter in `src/utils/numeric-input.ts`. A locale that does
 * not group at all returns `""` for `group`, which a caller must read as "there is no group
 * separator" rather than as a separator that happens to be empty.
 */
export function localeSeparators(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(intlLocales(locale)).formatToParts(12345.6);
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
 * text, a bare `-` or `.`, stray letters — so a caller never has to check for `NaN` itself. A
 * **trailing** separator is not one of those: `"12."` is `12`, and so is `"12,"` under `is-IS`,
 * because a fraction that has not been typed yet is not a reason to throw the number away.
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

  // A **trailing** decimal separator is a number whose fraction is simply not there yet: "12." is
  // 12, and "12," is 12 under `is-IS`. Refusing it made a field commit `null` the moment someone
  // deleted the fraction digits they had typed and left — the value vanished because the caret had
  // stopped one character short. A separator with nothing before it is still not a number, so a
  // lone "-", "." or "," falls through to the test below and returns `null`.
  if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);

  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isNaN(value) ? null : value;
}

/**
 * How many fraction digits a currency actually has — 2 for `USD` and `EUR`, **0** for `ISK` and
 * `JPY`, 3 for `KWD` — read from the runtime's own ICU data rather than a hand-maintained table,
 * the same way `localeSeparators` reads the separators.
 *
 * A public helper, also used by `Price` (`toMajor`, converting a minor-unit integer to the major
 * unit `Intl.NumberFormat` expects). `UnitInput` and `CurrencyInput` keep the private library's own
 * rule instead — `maxFraction` is `2` whatever the currency, so a field shows what was typed rather
 * than what the currency's minor unit allows. It is exported for a consumer who wants the other
 * rule too: rounding an Icelandic price to two decimals and then displaying it with none silently
 * drops what the customer typed, and hard-coding 2 is exactly the assumption that breaks in
 * `is-IS`.
 *
 * The locale only picks which ICU data is consulted; the digit count is the currency's, so
 * `ISK` is 0 under `en-US` too.
 */
export function currencyFractionDigits(currency: string, locale = 'en-US'): number {
  try {
    return (
      new Intl.NumberFormat(intlLocales(locale), { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    // An unknown or malformed code throws `RangeError`; 2 is the ISO 4217 default.
    return 2;
  }
}

/**
 * The options the private library's `formatUnit` takes, mirrored name for name (its own
 * `UnitFormatProps`) so that library can alias this module's function in place of its copy.
 * `locale` and `maxFraction` are the two it declares as required; every value is defaulted here
 * exactly as it defaults them, so an omitted one behaves identically either way.
 */
export interface UnitFormatOptions {
  /** A BCP 47 locale tag. Defaults to `"en-US"`. */
  locale?: string;
  /** An `Intl` unit identifier, read only when `isCurrency` is false. Defaults to `"meter"`. */
  unit?: string;
  /** `maximumFractionDigits`. Defaults to `2`. */
  maxFraction?: number;
  /** Format as a currency rather than a unit. Defaults to `false`. */
  isCurrency?: boolean;
  /** ISO 4217, read only when `isCurrency`. Defaults to `"USD"`. */
  currency?: string;
  /**
   * The **narrow** currency sign (`currencyDisplay: "narrowSymbol"`) rather than the wide one.
   * Defaults to `false`. Deliberately has no effect on a unit — the private helper sets no
   * `unitDisplay` at all, so a unit is always `Intl`'s own `"short"`. (`NumberFormatOptions.narrow`,
   * this module's own option, *does* narrow a unit; that is the one place the two vocabularies
   * differ, and the reason this function does not simply forward `narrow`.)
   */
  narrow?: boolean;
  /**
   * `minimumFractionDigits`. **Display-only; omit it to match input formatting.**
   *
   * The one option here the private library's own `UnitFormatProps` does not have, and the reason
   * it is optional with no default: omitted, this is the private helper's unconditional
   * `minimumFractionDigits: 0` — the rule a *field* wants, where `28` must read `"$28"` because
   * that is what the person typed. A **displayed** amount wants the opposite: a price list in which
   * one row reads `$96` and the next `$96.50` is ragged, so `Price` (and a theme formatting money
   * into a sentence) passes `currencyFractionDigits(currency, locale)` here and gets `"$96.00"`.
   * A zero-decimal currency is unaffected either way: its own count is `0`.
   *
   * So the private library can alias these functions unchanged — it never passes this — while the
   * kit's own display path gets padded amounts out of the same formatter.
   *
   * **It must not exceed `maxFraction`, which defaults to `2` whatever the currency.** So a
   * three-decimal currency needs both passed, and passing only `minFraction: 3` is refused with a
   * `RangeError` naming both — `Intl`'s own message for that pair blames
   * `maximumFractionDigits`, a value the caller never set.
   */
  minFraction?: number;
}

/**
 * Every default the private library's `defaultUnitFormat` destructures, in one place — because two
 * functions here need them: the formatter, and `formatUnit`'s memo key, which has to name the
 * *resolved* value of each or two calls that format alike would land on different entries (and, worse,
 * two that format differently on the same one). `satisfies Required<UnitFormatOptions>` is what keeps
 * the set complete: add an option to that interface without a default here and this stops compiling.
 */
const UNIT_FORMAT_DEFAULTS = {
  locale: 'en-US',
  unit: 'meter',
  maxFraction: 2,
  isCurrency: false,
  currency: 'USD',
  narrow: false,
  minFraction: 0,
} as const satisfies Required<UnitFormatOptions>;

/**
 * `options` with every absent value filled in from `UNIT_FORMAT_DEFAULTS`. `??` rather than a spread,
 * so an explicitly passed `undefined` means "default" exactly as the private helper's destructuring
 * does — which matters, because `formatCurrency` forwards its optional sixth argument straight
 * through.
 */
function resolveUnitFormat(options: UnitFormatOptions): Required<UnitFormatOptions> {
  return {
    locale: options.locale ?? UNIT_FORMAT_DEFAULTS.locale,
    unit: options.unit ?? UNIT_FORMAT_DEFAULTS.unit,
    maxFraction: options.maxFraction ?? UNIT_FORMAT_DEFAULTS.maxFraction,
    isCurrency: options.isCurrency ?? UNIT_FORMAT_DEFAULTS.isCurrency,
    currency: options.currency ?? UNIT_FORMAT_DEFAULTS.currency,
    narrow: options.narrow ?? UNIT_FORMAT_DEFAULTS.narrow,
    minFraction: options.minFraction ?? UNIT_FORMAT_DEFAULTS.minFraction,
  };
}

/**
 * Memoised formatters for `formatUnit`, keyed by every input that can change the output.
 *
 * Constructing an `Intl.NumberFormat` costs some 40× what `format()` costs on it, and `formatUnit`
 * takes a value and returns a string — a caller formatting a grid of prices has no formatter of its
 * own to hold, the way `defaultUnitFormat` and `createNumberFormat` let it. This is how it gets
 * both: the function stays pure (same arguments, same answer, no observable state), and the
 * construction happens once per distinct shape. A construction that **throws** caches nothing, so an
 * unrecognised currency code throws on every call, as it must.
 *
 * Unbounded, deliberately: the key space is a store's locales × its currencies × a handful of digit
 * counts — a few entries that are all still wanted at the end of the page's life.
 */
const unitFormatters = new Map<string, Intl.NumberFormat>();

/**
 * The `Intl.NumberFormat` a `UnitFormatOptions` describes: the port of the private library's own
 * `defaultUnitFormat`, argument for argument — the options object, the optional second
 * `Intl.NumberFormatOptions` bag, and the fact that the bag is applied **last** so it can override
 * anything the rule above it decided.
 *
 * **The third canonical copy, and the one that actually holds the rule.** `formatUnit` and
 * `formatCurrency` are wrappers over this, exactly as the private library's own two are, which is
 * what lets that library import all three from `@eldrajs/ui` and delete its `unit-utils.ts`
 * outright — deleting only the wrappers would leave the sign and digit rule still defined privately,
 * which is the duplication this port exists to end. The rule, in full: `style` is `"currency"` or
 * `"unit"`; a unit carries `unit` and no `unitDisplay`, so `Intl`'s own `"short"` applies; a currency
 * carries `currency` and `currencyDisplay: narrow ? "narrowSymbol" : "symbol"`;
 * `minimumFractionDigits` is `minFraction` (`0` when omitted, as there) and `maximumFractionDigits`
 * is `maxFraction`. Change none of it here without changing it there; the defaults live in
 * `UNIT_FORMAT_DEFAULTS`.
 *
 * `extraOptions` is what the private library's `UnitInput` passes `{ minimumFractionDigits: 2 }`
 * through for its placeholder and its part measurement, and it keeps that meaning: a plain
 * `Intl.NumberFormatOptions` spread over the resolved options, so a caller can override even
 * `style`. Nothing in this package calls it — `formatUnit` does not forward one, because the
 * formatter it memoises must be a function of its key alone — but the signature is the private
 * one's, so an aliasing consumer needs no change.
 *
 * Returns the formatter rather than a string, so a caller that formats many values builds it once;
 * that is also why nothing memoises it. Throws `RangeError` for a currency code, unit identifier or
 * locale `Intl` does not recognise, and for an explicit `minFraction` above `maxFraction`.
 */
export function defaultUnitFormat(
  options: UnitFormatOptions = {},
  extraOptions: Intl.NumberFormatOptions = {}
): Intl.NumberFormat {
  const { locale, unit, maxFraction, isCurrency, currency, narrow, minFraction } =
    resolveUnitFormat(options);

  // Only when the caller actually passed a `minFraction`. `Intl` reports the pair as
  // `maximumFractionDigits value is out of range`, which names an argument a caller passing only
  // `minFraction` never set, against a default of 2 it has no reason to suspect — so that case is
  // answered here. A lone out-of-range `maxFraction` is left to `Intl`, whose message then names the
  // argument that *is* wrong; blaming the defaulted `minFraction: 0` for it would be the same
  // misdirection in reverse.
  if (options.minFraction !== undefined && minFraction > maxFraction) {
    throw new RangeError(
      `[@eldrajs/ui] minFraction (${minFraction}) cannot exceed maxFraction (${maxFraction}); ` +
        'maxFraction defaults to 2 whatever the currency, so pass both for a currency with more ' +
        'minor-unit digits than that.'
    );
  }

  return new Intl.NumberFormat(intlLocales(locale), {
    style: isCurrency ? 'currency' : 'unit',
    ...(isCurrency ? {} : { unit }),
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
    // The private helper's own ternary. `unitDisplay` is deliberately never set: `Intl` then uses
    // `"short"`, and `UnitFormatOptions.narrow` is a currency decision only.
    ...(isCurrency ? { currency, currencyDisplay: narrow ? 'narrowSymbol' : 'symbol' } : {}),
    // Last, so it wins — the private helper's own ordering.
    ...extraOptions,
  });
}

/**
 * A number with a unit or a currency attached, in a locale: the port of the private library's own
 * `formatUnit`, option names and all — `defaultUnitFormat(options).format(value)`, exactly as the
 * private one is, with the formatter memoised (see `unitFormatters`).
 *
 * **Canonical, with `defaultUnitFormat` and `formatCurrency`.** The private library is expected to
 * import all three from `@eldrajs/ui` and delete its own, so with the arguments that library passes
 * the output must agree character for character; the rule itself is written out on
 * `defaultUnitFormat`. `minFraction` is the one option beyond that library's own, additive and
 * optional: omitted — which is how it calls — the behaviour is exactly the private one's. See
 * `UnitFormatOptions.minFraction`.
 *
 * Throws what `Intl.NumberFormat` throws — a `RangeError` for a currency code, unit identifier or
 * locale it does not recognise — because the private helper does, and a public copy that swallowed
 * an error its original raises is not the same function; plus the one `defaultUnitFormat` adds for
 * an explicit `minFraction` above `maxFraction`. A caller inside a `computed` must guard it (`Price`
 * does, falling back to a plain decimal plus the raw code).
 */
export function formatUnit(value: number, options: UnitFormatOptions): string {
  const { locale, unit, maxFraction, isCurrency, currency, narrow, minFraction } =
    resolveUnitFormat(options);

  // Every resolved option that reaches `Intl` for this style, so one entry can never answer for a
  // shape that formats differently. `narrow` is absent from the unit key because a unit's display is
  // pinned to `"short"`, and `currency`/`unit` each appear only in the branch that reads them.
  // `|` cannot occur in any part: a BCP 47 tag, an ISO 4217 code and an `Intl` unit identifier are
  // letters, digits and hyphens only, so no two distinct shapes can spell the same string. (A
  // control character would do as well and reads worse in source.)
  const key = isCurrency
    ? `c|${locale}|${currency}|${narrow ? 1 : 0}|${minFraction}|${maxFraction}`
    : `u|${locale}|${unit}|${minFraction}|${maxFraction}`;

  let formatter = unitFormatters.get(key);
  if (formatter === undefined) {
    // `options`, not the resolved copy: the guard above has to see whether `minFraction` was passed.
    formatter = defaultUnitFormat(options);
    // Only after construction has succeeded: a code `Intl` rejects must keep throwing.
    unitFormatters.set(key, formatter);
  }

  return formatter.format(value);
}

/**
 * One currency amount as text, in the narrow sign by default: `"kr 2,800"` (`en-US`/`ISK`),
 * `"2.800 kr."` (`is-IS`/`ISK`), `"$28"` (`en-US`/`USD`).
 *
 * The port of the private library's own `formatCurrency` — **positional arguments and the same
 * defaults on purpose**, where the rest of this package would take an options object, so that this
 * can be the canonical copy that library imports in place of its own. In its first five parameters
 * it is `formatUnit(value, { locale, isCurrency: true, currency, maxFraction, narrow: narrowSymbol })`
 * and nothing else, exactly as the private one is.
 *
 * This is the one public entry point for formatting money, and the reason it exists: a hand-built
 * `Intl.NumberFormat({ style: 'currency' })` renders the **wide** sign (`"ISK 2,800"`), which is
 * not the shape this kit's prices and currency fields are in — a storefront formatting its own
 * amounts that way showed `"ISK 2,800"` in a button label beside a `<Price>` reading `"kr 2,800"`
 * for the same money.
 *
 * Three things to know before calling it:
 *
 * - **`minimumFractionDigits` is `0` unless `minFraction` says otherwise.** Called the private
 *   library's way — five arguments or fewer — `28` is `"$28"` and `28.5` is `"$28.5"`: the rule a
 *   currency *field* wants, where the field shows what a person typed rather than what the minor
 *   unit allows.
 * - **`minFraction` is the display rule**, the sixth parameter and the one addition to the ported
 *   signature. A price list in which one row reads `$96` and the next `$96.50` is ragged, so a
 *   *displayed* amount passes `currencyFractionDigits(currency, locale)` and gets `"$96.00"`. That
 *   is what `Price` and the starter's own money helpers do; a zero-decimal currency is unaffected
 *   (`"kr 2,800"` either way, its own count being `0`). **It must not exceed `maxFraction`**, which
 *   is the next bullet's trap: `formatCurrency(v, 'en-US', 'BHD', true, 2, 3)` is refused with a
 *   `RangeError` naming both, rather than `Intl`'s own message blaming a `maximumFractionDigits`
 *   the caller never set.
 * - **`maxFraction` defaults to `2` whatever the currency.** A zero-decimal currency is unaffected
 *   (`ISK` has no fraction to print), but a three-decimal one is rounded to two unless the caller
 *   says otherwise. Pass `currencyFractionDigits(currency, locale)` for the currency's own count,
 *   which — being the same answer as for `minFraction` — is what a displayed amount passes for
 *   both; passing only the sixth argument for such a currency is the refusal above.
 *
 * Throws for an unrecognised currency code or locale, the same as `formatUnit` and the same as the
 * private helper; see that function's note.
 */
export function formatCurrency(
  value: number,
  locale = 'en-US',
  currency = 'USD',
  narrowSymbol = true,
  maxFraction = 2,
  minFraction?: number
): string {
  return formatUnit(value, {
    locale,
    isCurrency: true,
    currency,
    maxFraction,
    narrow: narrowSymbol,
    minFraction,
  });
}

/**
 * The sign a currency is written with in a locale, on its own: `"kr"` (`ISK` under `en-US`,
 * narrow), `"kr."` (`ISK` under `is-IS`), `"$"` (`USD` under `en-US`). For a place that names a
 * currency rather than formatting an amount in it — a currency selector, a label beside a store's
 * code.
 *
 * This package's own addition rather than a port: the private library has no equivalent. Read out
 * of `formatToParts` rather than a hand-maintained code → symbol table, so it is whatever the
 * runtime's own ICU data says, and `narrow` (the default) picks the same sign `formatCurrency`
 * prints. Some locales have no sign for a currency distinct from its code — `ISK` under `en-US` is
 * `"ISK"` with `narrow: false`, `CHF` is `"CHF"` either way — in which case that is what comes
 * back; a caller pairing the code with the symbol should compare the two and print the code alone
 * when they match, rather than `"ISK ISK"`.
 *
 * Unlike `formatCurrency` this one never throws: it has no original to be faithful to, and an
 * unrecognised code returns the code itself, which is also what `Intl` answers for a code it knows
 * but has no sign for.
 */
export function currencySymbol(currency: string, locale = 'en-US', narrow = true): string {
  try {
    const parts = createNumberFormat({
      locale,
      style: 'currency',
      currency,
      narrow,
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}
