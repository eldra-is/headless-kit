import { currencyFractionDigits, useEldraUiCurrency, useEldraUiLocale } from '@eldrajs/ui';

/**
 * The theme's money helpers. Storefront amounts are **major units** the whole way through
 * (`types.ts`) — 28 is twenty-eight dollars, not twenty-eight cents — because that is what the
 * gateway sends, and converting on the way in only moves the rounding somewhere less visible.
 *
 * Two shapes are needed because `@eldrajs/ui` takes the other convention: `Price`/`ProductCard`
 * read **minor** units (their own `amount` docs say so), so anything handed to one of those
 * components goes through `toMinorUnits` first, while money that has to appear inside a sentence
 * ("Add to cart · $96.00") is formatted here with `formatMoney`.
 */

/** Until the store's own settings are readable from `useStorefront()`, every price is USD. */
export const DEFAULT_CURRENCY = 'USD';
/** Same: the one locale the theme formats money in until the storefront can say otherwise. */
export const DEFAULT_LOCALE = 'en-US';

/**
 * A major-unit amount as text, in the currency's own shape: `$28.00` for `USD`, `28 kr.` for
 * `ISK` — `style: 'currency'` takes the fraction-digit count from the currency itself, so a
 * zero-decimal currency never renders phantom decimals.
 *
 * `Intl.NumberFormat` throws `RangeError` on a currency code it does not recognise, and this is
 * called from `computed`s where a throw takes the whole block down, so an unusable code falls back
 * to a plain decimal plus the raw code — the same rule `@eldrajs/ui`'s `Price` follows.
 */
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE
): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale, { style: 'decimal' }).format(amount)} ${currency}`;
  }
}

/**
 * Major units → the minor units `@eldrajs/ui`'s `Price`/`ProductCard` expect, using the currency's
 * own minor-unit count rather than a hard-coded ×100 (`ISK` has none: 28 krónur stays 28).
 */
export function toMinorUnits(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  locale: string = DEFAULT_LOCALE
): number {
  return Math.round(amount * 10 ** currencyFractionDigits(currency, locale));
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
 * The same two helpers bound to the currency and locale the surrounding `@eldrajs/ui` components
 * already resolve, so a block's formatted money and its `<Price>` elements can never disagree.
 * Call it in `setup()` like any composable.
 */
export function useMoney(): {
  format: (amount: number) => string;
  minor: (amount: number) => number;
} {
  const currency = useEldraUiCurrency();
  const locale = useEldraUiLocale();
  return {
    format: (amount) => formatMoney(amount, currency.value, locale.value),
    minor: (amount) => toMinorUnits(amount, currency.value, locale.value),
  };
}
