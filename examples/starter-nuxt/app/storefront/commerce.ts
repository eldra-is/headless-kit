import type { StorefrontCommerce } from './types';

/**
 * Reads the `commerce` slice `@eldrajs/theme-nuxt` puts on `runtimeConfig.public.eldra` — the
 * store's own settings, read once from the platform during the build (that module's
 * `src/runtime/commerce.ts`). `null` when the store publishes none, when the build had no gateway
 * credentials, or when the read failed; the module warns about all three at build time.
 *
 * Both plugins that need it go through here (`eldra-ui-messages` wants only the currency,
 * `eldra-storefront` puts the whole thing on `useStorefront()`), so the shape is validated once
 * rather than cast twice. It is validated at all because a runtime config is an *object a
 * customer's own `nuxt.config.ts` can set*: a half-filled `commerce` would otherwise reach a block
 * reading `taxInclusivePricing` as `undefined`, which tests as "prices exclude tax" at every call
 * site. A partial answer is no answer.
 */
export function toStorefrontCommerce(value: unknown): StorefrontCommerce | null {
  if (value === null || typeof value !== 'object') return null;
  const { currency, taxInclusivePricing, defaultTaxRate } = value as Record<string, unknown>;
  if (typeof currency !== 'string' || currency === '') return null;
  if (typeof taxInclusivePricing !== 'boolean' || typeof defaultTaxRate !== 'number') return null;
  return { currency, taxInclusivePricing, defaultTaxRate };
}

/**
 * The value to hand `@eldrajs/ui`'s `CURRENCY_KEY` for a store whose currency is `currency` —
 * `undefined` when the platform published none.
 *
 * "No currency" has to be provided as the **empty string**, not as `undefined`.
 * `useEldraUiCurrency()` reads an absent provide as "use my ambient default", which is `USD`: the
 * right call for a component library a shop of any kind installs, and the wrong one here, because
 * it would put a dollar sign in front of krónur — a wrong price, where a bare number is only an
 * incomplete one. `''` is a code `Intl.NumberFormat` must reject, and `Price`'s own documented
 * fallback for a code it cannot use is a plain decimal followed by that code — which for the empty
 * string is the plain number alone. So a store with no published currency shows numbers in its
 * `<Price>` elements, with no symbol invented for it.
 *
 * `useStoreCurrency()` (`./money.ts`) reads the same provide and maps `''` back to "no currency",
 * so money inside a sentence and money in a `<Price>` are formatted the same way on the same page.
 * This is the single place that conversion is written down: the real page's plugin, Storybook's
 * decorator and the block test harness all call it.
 */
export function uiCurrencyFor(currency: string | undefined): string {
  return currency ?? '';
}
