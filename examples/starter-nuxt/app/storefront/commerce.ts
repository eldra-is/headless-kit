import type { StorefrontCommerce } from './types';

/**
 * Reads the `commerce` slice `@eldrajs/theme-nuxt` puts on `runtimeConfig.public.eldra` — the
 * store's own settings, read once from the platform during the build (that module's
 * `src/runtime/commerce.ts`). `null` when the store publishes none, when the build had no gateway
 * credentials, or when the read failed; the module warns about all three at build time.
 *
 * Both plugins that need it go through here (`eldra-ui-messages` wants only the currency,
 * `eldra-storefront` puts the whole thing on `useStorefront()`), so the shape is read once rather
 * than cast twice.
 *
 * It is checked because this is an `unknown` boundary, not because a customer is expected to write
 * the key: the module rebuilds `runtimeConfig.public.eldra` itself and then overwrites `commerce`
 * with what it read, so `nuxt.config.ts` cannot set it. What arrives here is still whatever a
 * runtime config happens to hold — a Nuxt `NUXT_PUBLIC_…` override on a server-rendered deploy,
 * hand-edited `.nuxt` state, some future writer — and the rule is all-or-nothing on purpose: a
 * half-set record would reach a block reading `taxInclusivePricing` as `undefined`, which tests as
 * "prices exclude tax" at every call site that asks. A partial answer is no answer — but it is a
 * loud one, because throwing away a currency somebody did publish is not something to do quietly.
 */
export function toStorefrontCommerce(value: unknown): StorefrontCommerce | null {
  // `null` and `undefined` — and `''`, which is what reaches the page when the module wrote `null`:
  // Nuxt serialises a null public-runtime-config value as an empty string (the same thing happens
  // to `locale`) — all mean one thing, that the store published nothing. Not a mistake, nothing to
  // report.
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'object') return discard(value, 'commerce is not an object');
  const { currency, taxInclusivePricing, defaultTaxRate } = value as Record<string, unknown>;
  if (typeof currency !== 'string' || currency === '') return discard(value, 'currency');
  if (typeof taxInclusivePricing !== 'boolean') return discard(value, 'taxInclusivePricing');
  if (typeof defaultTaxRate !== 'number') return discard(value, 'defaultTaxRate');
  return { currency, taxInclusivePricing, defaultTaxRate };
}

/**
 * Says which field was missing or wrong, in dev only. A store whose whole page silently drops to
 * bare numbers because two tax fields were absent is a bug nobody can see; the dev guard keeps the
 * line out of a production bundle, where there is nobody to read it and the page has already made
 * the safe choice.
 *
 * Vite's `import.meta.env.DEV`, not Nuxt's `import.meta.dev`: this module is also compiled by
 * Storybook and by the test run, neither of which is a Nuxt build — the same guard, and for the
 * same reason, that `@eldrajs/ui`'s own `Price` uses for its invalid-currency warning. It is read
 * through a cast because the starter does not depend on `vite` itself, so `vite/client`'s
 * declaration of `ImportMeta.env` is not available to every tsconfig that compiles this file; an
 * environment that defines neither simply never warns, which is the safe direction.
 */
function discard(value: unknown, field: string): null {
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  if (meta.env?.DEV === true) {
    console.warn(
      `[eldra] ignoring the store's commerce settings: ${field} is missing or not the right type`,
      value
    );
  }
  return null;
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
