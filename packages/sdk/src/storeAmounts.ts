import type { StoreAmounts } from './tokens';

/**
 * Major to minor units with the runtime's own `Intl`, not the bundled formatter `./tokens` uses:
 * this runs inside the client, and a currency's decimal count is the same in every locale, so the
 * client need not carry the formatter for it.
 */
function toMinorUnits(amount: number, currency: string): number {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // An unknown code keeps two decimals, the common case.
  }
  return Math.round(amount * 10 ** digits);
}

/**
 * The store's amounts for `⟦store …⟧` tokens (WS-1473), from the public delivery read
 * (`GET /delivery/v1/provider-account`): `{ freeShippingThreshold: { ISK: 1500000, EUR: 10000 } }`,
 * in minor units.
 *
 * `freeShippingThreshold` in a currency is the **lowest** threshold among the active delivery
 * methods that sell in it: "free shipping over" the least a shopper can spend to get it. A method
 * publishes its threshold per currency in `currencyPrices` (Core, WS-1473), and before that only in
 * its own `currency`; both are read, so this works against either gateway. A threshold of `0` is
 * kept (that method always ships free). A currency no method has a threshold in is absent, and a
 * token naming it hides its sentence rather than guessing.
 */
export function storeAmountsFromDelivery(accounts: unknown): StoreAmounts {
  const lowest: Record<string, number> = {};
  const offer = (currency: unknown, threshold: unknown): void => {
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) return;
    const minor = toMinorUnits(threshold, currency);
    if (lowest[currency] === undefined || minor < lowest[currency]) lowest[currency] = minor;
  };
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (account === null || typeof account !== 'object') continue;
    const { currency, freeShippingThreshold, currencyPrices, status } = account as Record<
      string,
      unknown
    >;
    if (typeof status === 'string' && status.toUpperCase() !== 'ACTIVE') continue;
    offer(currency, freeShippingThreshold);
    for (const price of Array.isArray(currencyPrices) ? currencyPrices : []) {
      if (price === null || typeof price !== 'object') continue;
      const entry = price as Record<string, unknown>;
      offer(entry.currency, entry.freeShippingThreshold);
    }
  }
  return Object.keys(lowest).length === 0 ? {} : { freeShippingThreshold: lowest };
}
