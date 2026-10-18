import { nextTick, reactive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cartIdFromCheckoutUrl,
  formatValue,
  SEARCH_DEBOUNCE_MS,
  withAnalytics,
} from '../../app/storefront/analytics';
import { createCartStore, type CartOps } from '../../app/storefront/cart';
import type {
  StorefrontCartLine,
  StorefrontProduct,
  StorefrontResult,
  StorefrontSearchResponse,
  StorefrontSource,
} from '../../app/storefront/types';

const line: StorefrontCartLine = {
  id: 'line-1',
  productId: 'p1',
  variantId: 'v1',
  title: 'Mug',
  url: '/products/mug',
  variantLabel: '',
  quantity: 2,
  unitPrice: 12.5,
  lineTotal: 25,
  image: null,
  max: null,
};

function result<T>(initial: T | null): StorefrontResult<T> {
  return {
    data: ref(initial) as StorefrontResult<T>['data'],
    pending: ref(false),
    error: ref(null),
    loading: ref(false),
    revalidating: ref(new Set()),
    refresh: () => Promise.resolve(),
  };
}

function makeSource(overrides: { product?: StorefrontResult<StorefrontProduct> } = {}) {
  const lines = [line];
  const ops: CartOps = {
    init: () => Promise.resolve({ lines: [], totals: { subtotal: 0, shipping: null, total: 0 } }),
    add: () => Promise.resolve({ lines, totals: { subtotal: 25, shipping: null, total: 25 } }),
    setQuantity: () => Promise.reject(new Error('unused')),
    remove: () => Promise.resolve({ lines: [], totals: { subtotal: 0, shipping: null, total: 0 } }),
    applyDiscount: () => Promise.reject(new Error('unused')),
    removeDiscount: () => Promise.reject(new Error('unused')),
    checkoutUrl: ref('https://pay.example/checkout/org-1/cart-9'),
  };
  const cart = createCartStore(ops);
  const route = reactive({ productHandle: 'mug' as string | null });
  const searchResult = result<StorefrontSearchResponse>(null);
  const product = overrides.product ?? result<StorefrontProduct>(null);
  const source = {
    commerce: { currency: 'USD', taxInclusivePricing: false, defaultTaxRate: 0 },
    route,
    cart,
    catalog: { product: () => product },
    search: { run: () => searchResult },
  } as unknown as StorefrontSource;
  return { source, cart, route, searchResult, product };
}

describe('formatValue / cartIdFromCheckoutUrl', () => {
  it('writes major units with a dot', () => {
    expect(formatValue(28)).toBe('28');
    expect(formatValue(28.5)).toBe('28.5');
    expect(formatValue(0.1 + 0.2)).toBe('0.3');
  });

  it('reads the cart id off the platform checkout URL', () => {
    expect(cartIdFromCheckoutUrl('https://pay.example/checkout/org-1/cart-9')).toBe('cart-9');
    expect(cartIdFromCheckoutUrl('https://pay.example/elsewhere')).toBeUndefined();
    expect(cartIdFromCheckoutUrl(null)).toBeUndefined();
  });
});

describe('withAnalytics', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('tracks add_to_cart only when the add succeeded', async () => {
    const { source } = makeSource();
    const track = vi.fn();
    const wrapped = withAnalytics(source, track);
    await wrapped.cart.add({ productId: 'p1', variantId: 'v1', quantity: 2 });
    expect(track).toHaveBeenCalledWith('add_to_cart', {
      product_id: 'p1',
      variant_id: 'v1',
      quantity: 2,
      value: '25',
      currency: 'USD',
    });
  });

  it('does not track a refused add', async () => {
    const { source } = makeSource();
    const track = vi.fn();
    const failing = {
      ...source,
      cart: { ...source.cart, add: () => Promise.resolve({ message: 'no' }) },
    } as unknown as StorefrontSource;
    await withAnalytics(failing, track).cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(track).not.toHaveBeenCalled();
  });

  it('tracks remove_from_cart with the removed line', async () => {
    const { source, cart } = makeSource();
    const track = vi.fn();
    const wrapped = withAnalytics(source, track);
    await cart.add({ productId: 'p1', variantId: 'v1', quantity: 2 });
    await wrapped.cart.remove('line-1');
    expect(track).toHaveBeenCalledWith('remove_from_cart', {
      product_id: 'p1',
      variant_id: 'v1',
      quantity: 2,
      value: '25',
      currency: 'USD',
    });
  });

  it('tracks begin_checkout from the cart state when the shopper follows the link', async () => {
    const { source, cart } = makeSource();
    const track = vi.fn();
    await cart.add({ productId: 'p1', variantId: 'v1', quantity: 2 });
    withAnalytics(source, track).cart.beginCheckout();
    expect(track).toHaveBeenCalledWith('begin_checkout', {
      cart_id: 'cart-9',
      item_count: 2,
      value: '25',
      currency: 'USD',
    });
  });

  it('tracks product_view once per visit, and again after leaving the product', async () => {
    const product = result<StorefrontProduct>({
      handle: 'mug',
      productId: 'p1',
      variantId: 'v1',
      price: { amount: 12.5 },
    } as StorefrontProduct);
    const { source, route } = makeSource({ product });
    const track = vi.fn();
    const wrapped = withAnalytics(source, track);
    wrapped.catalog.product(ref('mug'));
    wrapped.catalog.product(ref('mug'));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('product_view', {
      product_id: 'p1',
      handle: 'mug',
      variant_id: 'v1',
      value: '12.5',
      currency: 'USD',
    });
    // A refresh re-resolves the same product: no second view.
    product.data.value = { ...product.data.value! };
    await nextTick();
    expect(track).toHaveBeenCalledTimes(1);
    // Leaving and coming back is a new visit.
    route.productHandle = null;
    await nextTick();
    route.productHandle = 'mug';
    await nextTick();
    product.data.value = { ...product.data.value! };
    await nextTick();
    expect(track).toHaveBeenCalledTimes(2);
  });

  it('does not count a related product as a view', () => {
    const product = result<StorefrontProduct>({
      handle: 'other',
      productId: 'p2',
      variantId: 'v2',
      price: { amount: 1 },
    } as StorefrontProduct);
    const { source } = makeSource({ product });
    const track = vi.fn();
    withAnalytics(source, track).catalog.product(ref('other'));
    expect(track).not.toHaveBeenCalled();
  });

  it('debounces search and sends the settled query once', async () => {
    const { source, searchResult } = makeSource();
    const track = vi.fn();
    const query = ref('');
    withAnalytics(source, track).search.run(query);
    for (const text of ['m', 'mu', ' mug ']) {
      query.value = text;
      searchResult.data.value = { query: text, total: 3 } as StorefrontSearchResponse;
      await nextTick();
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 4);
    }
    expect(track).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('search', { query: 'mug', result_count: 3 });
    // The same settled query is not sent again.
    searchResult.data.value = { query: 'mug', total: 3 } as StorefrontSearchResponse;
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('ignores an empty query and a result for a different query', async () => {
    const { source, searchResult } = makeSource();
    const track = vi.fn();
    const query = ref('mug');
    withAnalytics(source, track).search.run(query);
    searchResult.data.value = { query: 'cup', total: 1 } as StorefrontSearchResponse;
    await nextTick();
    query.value = '';
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2);
    expect(track).not.toHaveBeenCalled();
  });
});
