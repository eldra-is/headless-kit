import { computed, inject, toValue, type ComputedRef } from 'vue';
import { CURRENCY_KEY, currencyFractionDigits, useEldraUiLocale } from '@eldrajs/ui';

/**
 * The theme's money helpers. Storefront amounts are **major units** the whole way through
 * (`types.ts`) — 28 is twenty-eight dollars, not twenty-eight cents — because that is what the
 * gateway sends, and converting on the way in only moves the rounding somewhere less visible.
 *
 * Two shapes are needed because `@eldrajs/ui` takes the other convention: `Price`/`ProductCard`
 * read **minor** units (their own `amount` docs say so), so anything handed to one of those
 * components goes through `toMinorUnits` first, while money that has to appear inside a sentence
 * ("Add to cart · 2.800 kr.") is formatted here with `formatMoney`. A third shape names the
 * currency itself rather than an amount in it ("ISK kr."): `currencyLabel`.
 *
 * **The currency is the store's, and it is never guessed.** It comes from the platform — the
 * organisation's own commerce settings, read once at build and put on
 * `runtimeConfig.public.eldra.commerce` by `@eldrajs/theme-nuxt`, provided to the whole app under
 * `@eldrajs/ui`'s `CURRENCY_KEY` by `app/plugins/eldra-ui-messages.ts`. So both helpers take it
 * **explicitly, with no default**: a currency guessed from the content locale renders real amounts
 * under the wrong sign, which is worse than rendering them with no sign at all. A store that
 * publishes none formats its prices as a plain number (see `formatMoney`).
 */

/** The one locale the theme formats money in until the storefront can say otherwise. */
export const DEFAULT_LOCALE = 'en-US';

/**
 * ISO 4217's own default minor-unit count, for the one case where there is no currency to ask:
 * it is also what `@eldrajs/ui`'s `currencyFractionDigits` falls back to, so `toMinorUnits` and
 * the `<Price>` the value is handed to agree about the scale either way.
 */
const DEFAULT_FRACTION_DIGITS = 2;

/** How one currency-and-locale pair formats: everything both helpers below need, resolved once. */
interface MoneyFormat {
  format: (amount: number) => string;
  /** Appended after the number, with a space, when there is one — see `resolveFormat`. */
  code: string;
  /** Minor units per major unit, as a power of ten. */
  digits: number;
}

/**
 * One cache for every `Intl.NumberFormat` this module builds, keyed by locale and currency.
 *
 * Constructing a `NumberFormat` is the expensive part — far more than `format()` — and this is the
 * theme's hot path: `useMoney().format` is a fresh call on every render of every price, and a
 * collection grid renders one or two per card. A store has one currency and a handful of locales,
 * so the cache is a few entries that never need evicting.
 */
const formats = new Map<string, MoneyFormat>();

function resolveFormat(currency: string | undefined, locale: string): MoneyFormat {
  const code = currency ?? '';
  const key = `${locale}\u0000${code}`;
  const cached = formats.get(key);
  if (cached !== undefined) return cached;

  const decimal = (): MoneyFormat => {
    const formatter = new Intl.NumberFormat(locale, { style: 'decimal' });
    // The code is appended only when there is one to show: a store that published no currency has
    // nothing to print after the number, and a dangling separator would reach the DOM and the
    // accessible text of every price on the page.
    return {
      format: (amount) => formatter.format(amount),
      code,
      digits: DEFAULT_FRACTION_DIGITS,
    };
  };

  let resolved: MoneyFormat;
  if (code === '') {
    resolved = decimal();
  } else {
    try {
      const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
      resolved = {
        format: (amount) => formatter.format(amount),
        // Nothing to append: the formatter has already written the symbol or the code itself.
        code: '',
        // The same rule `<Price>` applies to the value `toMinorUnits` hands it, so the two can only
        // ever divide and multiply by the same power of ten.
        digits: currencyFractionDigits(code, locale),
      };
    } catch {
      // `Intl.NumberFormat` throws `RangeError` on a currency code it does not recognise, and this
      // runs inside `computed`s where a throw takes the whole block down. Fall back to a plain
      // decimal and say which code it was.
      resolved = decimal();
    }
  }

  formats.set(key, resolved);
  return resolved;
}

/**
 * A major-unit amount as text, in the currency's own shape: `$28.00` for `USD`, `28 kr.` for
 * `ISK` — `style: 'currency'` takes the fraction-digit count from the currency itself, so a
 * zero-decimal currency never renders phantom decimals.
 *
 * Three outcomes, and the last two are the honest ones:
 *
 * - a currency the platform published and `Intl` knows — the formatted amount;
 * - **no currency at all** (`undefined`: the store has not configured commerce) — a plain
 *   decimal, no symbol and no code, because there is no code to print;
 * - a code `Intl` rejects — a plain decimal plus the raw code (`28 XYZ1`), the same rule
 *   `@eldrajs/ui`'s `Price` follows.
 */
export function formatMoney(
  amount: number,
  currency: string | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  const { format, code } = resolveFormat(currency, locale);
  const formatted = format(amount);
  return code === '' ? formatted : `${formatted} ${code}`;
}

/**
 * A currency *code* as text naming itself, not an amount: `"ISK kr."`, `"USD $"` — the code plus
 * whatever symbol `Intl` renders for it in `locale`, for a place that names the store's currency
 * rather than formatting a price in it (the footer's currency selector, with one option now that
 * the platform publishes one currency).
 *
 * Built from the same `Intl.NumberFormat(locale, { style: 'currency', currency: code })`
 * `resolveFormat` constructs for `formatMoney`, read through `formatToParts` instead of formatted,
 * so the symbol is whatever that constructor decides is a currency's separate sign in `locale` —
 * never a hand-maintained code → symbol table. Two fallbacks to the code alone, both honest: the
 * code appended to itself is noise, so a locale with no symbol distinct from the code (`ISK` in
 * `en-US`, whose "symbol" part *is* the code) prints just the code; and a code `Intl` rejects
 * throws at construction, the same failure `formatMoney` catches, with the same fallback.
 */
export function currencyLabel(code: string, locale: string = DEFAULT_LOCALE): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
    }).formatToParts(0);
    const symbol = parts.find((part) => part.type === 'currency')?.value;
    return symbol !== undefined && symbol !== code ? `${code} ${symbol}` : code;
  } catch {
    return code;
  }
}

/**
 * Major units → the minor units `@eldrajs/ui`'s `Price`/`ProductCard` expect, using the currency's
 * own minor-unit count rather than a hard-coded ×100 (`ISK` has none: 28 krónur stays 28). With no
 * currency it uses `DEFAULT_FRACTION_DIGITS`, which is what the `<Price>` reading the result falls
 * back to as well.
 */
export function toMinorUnits(
  amount: number,
  currency: string | undefined,
  locale: string = DEFAULT_LOCALE
): number {
  return Math.round(amount * 10 ** resolveFormat(currency, locale).digits);
}

/**
 * Rounds a sum back to two decimals. Major-unit arithmetic is floating point (`28.99 * 3` is
 * `86.96999999999998`), so every total the theme computes itself — a line total, a cart subtotal,
 * a percentage discount — is rounded before it is shown or added to another amount.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * The store currency, or `undefined` when the platform published none.
 *
 * Reads the very provide `@eldrajs/ui`'s own components read (`CURRENCY_KEY`), so a `<Price>` and
 * a formatted sentence beside it can never disagree — but **without the package's fallback**.
 * `useEldraUiCurrency()` answers `USD` for an absent currency, which is the right ambient default
 * for a component library and the wrong answer for this theme: a store whose currency the platform
 * does not know must show its prices as numbers, not as dollars. (The same reasoning does not
 * apply to the number locale: grouping and decimal separators have a sane default, and
 * `useEldraUiLocale()`'s is the theme's own.)
 */
export function useStoreCurrency(): ComputedRef<string | undefined> {
  const provided = inject(CURRENCY_KEY, undefined);
  return computed(() => {
    const currency = toValue(provided);
    return currency === undefined || currency === '' ? undefined : currency;
  });
}

/**
 * The money helpers bound to the store's currency and the locale the surrounding `@eldrajs/ui`
 * components already resolve — the one place a block resolves either. Call it in `setup()` like
 * any composable.
 *
 * `currency` is exposed for the few callers that format outside a component (`blocks/search`'s
 * pure result mapper takes a formatter built from it).
 */
export function useMoney(): {
  format: (amount: number) => string;
  minor: (amount: number) => number;
  currency: ComputedRef<string | undefined>;
} {
  const currency = useStoreCurrency();
  const locale = useEldraUiLocale();
  return {
    format: (amount) => formatMoney(amount, currency.value, locale.value),
    minor: (amount) => toMinorUnits(amount, currency.value, locale.value),
    currency,
  };
}
