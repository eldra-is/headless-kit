import { resolveBlockTokens } from '../../app/composables/usePriceTokens';
import { DEMO_STORE_AMOUNTS } from '../../app/storefront/demo';
import { formatMoney } from '../../app/storefront/money';

/** How `mountOptions` resolves price tokens: the demo store's dollars and thresholds. */
export const DEMO_PRICE_OPTIONS = {
  currency: 'USD',
  locale: 'en-US',
  storeAmounts: DEMO_STORE_AMOUNTS,
  format: formatMoney,
};

/**
 * A seed value as a block mounted by `mountOptions` shows it: every price token written out in the
 * demo store's currency (`useBlockData`). A spec comparing page text with `mock.json` compares with
 * this, since a seed's `⟦store freeShippingThreshold⟧` reads "$80.00" on the page.
 */
export function shown<T>(value: T): T {
  return resolveBlockTokens(value, DEMO_PRICE_OPTIONS);
}
