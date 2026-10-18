import { watch, type Ref } from 'vue';
import type {
  StorefrontCartLine,
  StorefrontProduct,
  StorefrontResult,
  StorefrontSearchResponse,
  StorefrontSource,
} from './types';

/**
 * Commerce analytics for the storefront, as a wrapper around a `StorefrontSource` — the same
 * layer `app/storefront/feedback.ts` reports failures from, and for the same reason: blocks call
 * `useStorefront()` and know nothing about tracking, so a block can neither forget an event nor
 * send one twice. `app/plugins/eldra-storefront.ts` wraps the source it provides with the
 * `useEldraAnalytics().track` of `@eldrajs/theme-nuxt`; this file touches no Nuxt global.
 *
 * Events (the contract the platform's analytics ingest stores; props are strings):
 *
 * | name               | props                                                              |
 * | ------------------ | ------------------------------------------------------------------ |
 * | `product_view`     | `product_id`, `handle`, `variant_id`, `value`, `currency`          |
 * | `add_to_cart`      | `product_id`, `variant_id`, `quantity`, `value`, `currency`        |
 * | `remove_from_cart` | the same                                                           |
 * | `begin_checkout`   | `cart_id`, `item_count`, `value`, `currency`                       |
 * | `search`           | `query` (trimmed, 100 characters), `result_count`                  |
 *
 * `value` is major units with `.` as the decimal separator and `currency` is ISO 4217. `purchase`
 * is never sent from the browser: it belongs to the order module.
 *
 * Nothing here identifies a shopper or stores anything in the browser.
 */

export type Track = (name: string, props?: Record<string, string | number | undefined>) => void;

/** How long a search query must stay put before it counts, so partial typing is never sent. */
export const SEARCH_DEBOUNCE_MS = 800;
/** A search query is cut to this many characters. */
export const SEARCH_QUERY_MAX = 100;

/** Major units as a decimal string (`28`, `28.5`, `28.05`), never exponent notation. */
export function formatValue(amount: number): string {
  return String(Math.round(amount * 10000) / 10000);
}

/** The cart id a checkout URL ends with (`{checkoutUrl}/checkout/{orgId}/{cartId}`), if it does. */
export function cartIdFromCheckoutUrl(url: string | null): string | undefined {
  if (url === null) return undefined;
  const segments = url.split(/[?#]/)[0]!.split('/').filter(Boolean);
  return segments.length >= 3 && segments[segments.length - 3] === 'checkout'
    ? segments[segments.length - 1]
    : undefined;
}

export function withAnalytics(source: StorefrontSource, track: Track): StorefrontSource {
  const currency = (): string | undefined => source.commerce?.currency;

  function lineProps(
    line: Pick<StorefrontCartLine, 'productId' | 'variantId' | 'unitPrice'>,
    quantity: number
  ): Record<string, string | number | undefined> {
    return {
      product_id: line.productId,
      variant_id: line.variantId,
      quantity,
      value: formatValue(line.unitPrice * quantity),
      currency: currency(),
    };
  }

  // `product_view` once per product per visit: several blocks may read the same product, and a
  // volatile refresh re-resolves it, so the dedupe lives here, on the route — it resets when the
  // route's product changes (including to none), so A -> cart -> A is two visits.
  let viewed: string | null = null;
  watch(
    () => source.route.productHandle,
    () => {
      viewed = null;
    }
  );

  const catalog: StorefrontSource['catalog'] = {
    ...source.catalog,
    product(handle) {
      const result = source.catalog.product(handle);
      watch(
        () => result.data.value,
        (product: StorefrontProduct | null) => {
          if (product === null || product === undefined || viewed === product.handle) return;
          // Only the page's own product: a "related" read is not a view.
          if (source.route.productHandle !== product.handle) return;
          viewed = product.handle;
          track('product_view', {
            product_id: product.productId,
            handle: product.handle,
            variant_id: product.variantId,
            value: formatValue(product.price.amount),
            currency: currency(),
          });
        },
        { immediate: true }
      );
      return result;
    },
  };

  const cart: StorefrontSource['cart'] = {
    ...source.cart,
    async add(input) {
      const failure = await source.cart.add(input);
      if (failure === null) {
        // The price comes from the line the cart now holds for the variant, which is what the
        // shopper was charged for; a variant the cart cannot show yet is sent without a value.
        const line = source.cart.lines.value.find((l) => l.variantId === input.variantId);
        track('add_to_cart', {
          ...(line ? lineProps(line, input.quantity) : { quantity: input.quantity }),
          product_id: input.productId,
          variant_id: input.variantId,
          currency: currency(),
        });
      }
      return failure;
    },
    async remove(lineId) {
      const line = source.cart.lines.value.find((l) => l.id === lineId);
      const failure = await source.cart.remove(lineId);
      if (failure === null && line !== undefined) {
        track('remove_from_cart', lineProps(line, line.quantity));
      }
      return failure;
    },
    beginCheckout() {
      source.cart.beginCheckout();
      const totals = source.cart.totals.value;
      track('begin_checkout', {
        cart_id: cartIdFromCheckoutUrl(source.cart.checkoutUrl.value),
        item_count: source.cart.count.value,
        value: totals ? formatValue(totals.total) : undefined,
        currency: currency(),
      });
    },
  };

  const search: StorefrontSource['search'] = {
    ...source.search,
    run(query: Ref<string>): StorefrontResult<StorefrontSearchResponse> {
      const result = source.search.run(query);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastSent: string | null = null;
      watch(
        [query, result.data],
        ([text, response]) => {
          clearTimeout(timer);
          const trimmed = (text ?? '').trim();
          // Only a result that answers *this* query counts, and only once typing has stopped.
          if (trimmed === '' || response === null || response === undefined) return;
          if (response.query.trim() !== trimmed || trimmed === lastSent) return;
          timer = setTimeout(() => {
            lastSent = trimmed;
            track('search', {
              query: trimmed.slice(0, SEARCH_QUERY_MAX),
              result_count: response.total,
            });
          }, SEARCH_DEBOUNCE_MS);
        },
        { immediate: true }
      );
      return result;
    },
  };

  return { ...source, catalog, cart, search };
}
