import type { ComputedRef } from 'vue';
import {
  currencyFractionDigits,
  currencySymbol,
  formatCurrency,
  useEldraUiCurrency,
  useEldraUiLocale,
} from '@eldrajs/ui';

/**
 * The theme's money helpers. Storefront amounts are **major units** the whole way through
 * (`types.ts`) — 28 is twenty-eight dollars, not twenty-eight cents — because that is what the
 * gateway sends, and converting on the way in only moves the rounding somewhere less visible.
 *
 * Two shapes are needed because `@eldrajs/ui` takes the other convention: `Price`/`ProductCard`
 * read **minor** units (their own `amount` docs say so), so anything handed to one of those
 * components goes through `toMinorUnits` first, while money that has to appear inside a sentence
 * ("Add to cart · 2.800 kr.") is formatted here with `formatMoney`. A third shape names the
 * currency itself rather than an amount in it ("ISK kr"): `currencyLabel`.
 *
 * **Nothing here builds an `Intl.NumberFormat` of its own.** Both money shapes go through
 * `@eldrajs/ui`'s `formatCurrency`/`currencySymbol`, which is the same formatter — and therefore
 * the same **narrow** currency sign — that every `<Price>`, `<ProductCard>` and `<CurrencyInput>`
 * on the page renders with. A hand-built `{ style: 'currency' }` formatter writes the *wide* sign
 * instead, and that is exactly how this theme came to read "ISK 2,800" in a button label beside a
 * `<Price>` reading "kr 2,800" for the same money.
 *
 * **The currency is the store's, and it is never guessed.** It comes from the platform — the
 * organisation's own commerce settings, read once at build and put on
 * `runtimeConfig.public.eldra.commerce` by `@eldrajs/theme-nuxt`, provided to the whole app under
 * `@eldrajs/ui`'s `CURRENCY_KEY` by `app/plugins/eldra-ui-messages.ts`. So both helpers take it
 * **explicitly, with no default**: a currency guessed from the content locale renders real amounts
 * under the wrong sign, which is worse than rendering them with no sign at all. A store that
 * publishes none formats its prices as a plain number (see `formatMoney`), exactly as the
 * package's own `<Price>` does for the same answer.
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
  /** Minor units per major unit, as a power of ten. */
  digits: number;
}

/**
 * One cache per currency-and-locale pair, keyed by both.
 *
 * `useMoney().format` is a fresh call on every render of every price and a collection grid renders
 * one or two per card, so what this saves is worth saving: the `currencyFractionDigits` lookup, the
 * one probe that decides whether `Intl` will accept the store's code at all, and — for a store with
 * no currency — the one `Intl.NumberFormat` this module still constructs itself. A store has one
 * currency and a handful of locales, so the cache is a few entries that never need evicting.
 *
 * What it deliberately does **not** cache is a currency formatter. `formatCurrency` is
 * `@eldrajs/ui`'s own, stateless by design, and the single place the narrow sign and the
 * fraction-digit rule are decided; a formatter cached here would be a second definition of both,
 * which is precisely the bug this module had. Its per-amount construction is a few microseconds
 * against a render that costs far more.
 */
const formats = new Map<string, MoneyFormat>();

function resolveFormat(currency: string | undefined, locale: string): MoneyFormat {
  const code = currency ?? '';
  const key = `${locale}\u0000${code}`;
  const cached = formats.get(key);
  if (cached !== undefined) return cached;

  // The same rule `<Price>` applies to the value `toMinorUnits` hands it, so the two can only ever
  // divide and multiply by the same power of ten — and the same cap `<Price>` formats with, so a
  // zero-decimal currency stays integral in a sentence as well.
  const digits = code === '' ? DEFAULT_FRACTION_DIGITS : currencyFractionDigits(code, locale);

  /**
   * A plain decimal, for the two cases with no usable currency sign. The code is appended only when
   * there is one to show: a store that published none has nothing to print after the number, and a
   * dangling separator would reach the DOM and the accessible text of every price on the page.
   */
  const decimal = (): MoneyFormat => {
    const formatter = new Intl.NumberFormat(locale, { style: 'decimal' });
    return {
      format: (amount) =>
        code === '' ? formatter.format(amount) : `${formatter.format(amount)} ${code}`,
      digits,
    };
  };

  let resolved: MoneyFormat;
  if (code === '') {
    resolved = decimal();
  } else {
    // `formatCurrency` throws `RangeError` for a code `Intl` does not know, exactly as the private
    // helper it ports does, and this runs inside `computed`s where a throw takes the whole block
    // down. So the code is probed once per pair here rather than guarded once per amount.
    try {
      formatCurrency(0, locale, code, true, digits, digits);
      resolved = {
        // The narrow sign is the util's own default and the whole reason to go through it. The
        // currency's own count goes in twice: as the cap, because the util's default of 2 would
        // print a fractional króna and round a three-decimal currency to two; and as the
        // **minimum**, which is the util's display rule — without it `$96` and `$96.50` sit in the
        // same column. Both are exactly what `<Price>` passes, so a formatted sentence and the
        // `<Price>` beside it cannot disagree about either.
        format: (amount) => formatCurrency(amount, locale, code, true, digits, digits),
        digits,
      };
    } catch {
      resolved = decimal();
    }
  }

  formats.set(key, resolved);
  return resolved;
}

/**
 * A major-unit amount as text, in the currency's own shape and its **narrow** sign: `$28.00` for
 * `USD`, `2.800 kr.` for `ISK` on an Icelandic page, `kr 2,800` for the same money on an English
 * one. The fraction count is the currency's own, as both the maximum and the minimum, so a
 * zero-decimal currency never renders phantom decimals and a two-decimal one never renders a
 * ragged column.
 *
 * Three outcomes, and the last two are the honest ones:
 *
 * - a currency the platform published and `Intl` knows — the formatted amount;
 * - **no currency at all** (`undefined` or `''`: the store has not configured commerce) — a plain
 *   decimal, no symbol and no code, because there is no code to print;
 * - a code `Intl` rejects — a plain decimal plus the raw code (`28 XYZ1`), the same shape
 *   `@eldrajs/ui`'s `Price` falls back to for the identical failure.
 */
export function formatMoney(
  amount: number,
  currency: string | undefined,
  locale: string = DEFAULT_LOCALE
): string {
  return resolveFormat(currency, locale).format(amount);
}

/**
 * A currency *code* as text naming itself, not an amount: `"ISK kr."` on an Icelandic page,
 * `"ISK kr"` on an English one, `"USD $"` — the code plus the sign `formatMoney` prints in front
 * of the amounts on the same page, for a place that names the store's currency rather than
 * formatting a price in it (the footer's currency selector, with one option now that the platform
 * publishes one currency).
 *
 * `@eldrajs/ui`'s `currencySymbol` is where the sign comes from — the **narrow** one, read out of
 * `formatToParts`, never a hand-maintained code → symbol table — so this label and every price on
 * the page are written with the same character. One fallback, and it is the honest one: the code
 * appended to itself is noise, so a currency with no sign distinct from its code in this locale
 * (which is also what `currencySymbol` answers for a code `Intl` rejects) prints just the code.
 */
export function currencyLabel(code: string, locale: string = DEFAULT_LOCALE): string {
  const symbol = currencySymbol(code, locale);
  return symbol === code ? code : `${code} ${symbol}`;
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
 * `@eldrajs/ui`'s own composable, under the theme's name for it: it reads the very provide the
 * package's components read (`CURRENCY_KEY`), so a `<Price>` and a formatted sentence beside it
 * can never disagree, and it guesses no code — a store whose currency the platform does not know
 * shows its prices as numbers, not as dollars. (The same reasoning does not apply to the number
 * locale: grouping and decimal separators have a sane default, and `useEldraUiLocale()`'s is the
 * theme's own.)
 *
 * Kept as a named wrapper rather than inlined at the two call sites because "the store's currency"
 * is the theme's own vocabulary, and because this is where a theme that resolved it differently —
 * per market, say — would say so once.
 */
export function useStoreCurrency(): ComputedRef<string | undefined> {
  return useEldraUiCurrency();
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
