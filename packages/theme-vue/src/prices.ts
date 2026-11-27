import { inject, provide, type InjectionKey } from 'vue';

/**
 * Writes a rich-text `price` node (a price token, WS-1474) in the shopper's currency, or answers
 * `null` when it cannot be written. A theme binds `@eldrajs/sdk/tokens`' `resolvePriceNode` to its
 * currency, regional locale and money formatter and provides it once; `EldraRichText` reads it.
 *
 * Read during render, so a resolver that reads reactive state (the shopper's currency) re-renders
 * every rich-text field when that state changes.
 */
export type EldraPriceResolver = (attrs: unknown) => string | null;

export const ELDRA_PRICE_KEY: InjectionKey<EldraPriceResolver> = Symbol.for(
  'eldra.price-resolver'
) as InjectionKey<EldraPriceResolver>;

/** Provide the theme's price resolver to every `EldraRichText` below. */
export function provideEldraPrices(resolve: EldraPriceResolver): void {
  provide(ELDRA_PRICE_KEY, resolve);
}

/** The price resolver an ancestor provided, or `null`: then no price resolves. */
export function useEldraPrices(): EldraPriceResolver | null {
  return inject(ELDRA_PRICE_KEY, null);
}
