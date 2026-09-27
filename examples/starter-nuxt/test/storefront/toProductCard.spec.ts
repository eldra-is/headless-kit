import { describe, expect, it } from 'vitest';
import { toProductCard, toProductCardEntries } from '../../app/storefront/toProductCard';
import type { StorefrontProductListItem } from '../../app/storefront/types';

function baseItem(overrides: Partial<StorefrontProductListItem> = {}): StorefrontProductListItem {
  return {
    handle: 'merino-crew-sweater',
    title: 'Merino crew sweater',
    url: '/products/merino-crew-sweater',
    featuredImage: { src: '/demo/product-1.svg', alt: 'Merino crew sweater' },
    price: { amount: 9600, compareAt: null },
    rating: { value: 4.5, count: 126 },
    colours: [{ name: 'Oat', swatch: '#d8cbb0' }],
    stock: 'in',
    available: true,
    variantId: 'merino-crew-sweater::oat::m',
    ...overrides,
  };
}

/** `toProductCard` returns `null` for an item whose `url` is not a safe href — see the
 *  "rejects" cases below. Every other case in this file expects a card, so this narrows once. */
function expectCard(...args: Parameters<typeof toProductCard>) {
  const card = toProductCard(...args);
  expect(card).not.toBeNull();
  return card!;
}

describe('toProductCard', () => {
  it('maps title, url, featuredImage, rating, colours, stock and available straight through', () => {
    const card = expectCard(baseItem());
    expect(card.title).toBe('Merino crew sweater');
    expect(card.url).toBe('/products/merino-crew-sweater');
    expect(card.featuredImage).toEqual({ src: '/demo/product-1.svg', alt: 'Merino crew sweater' });
    expect(card.rating).toEqual({ value: 4.5, count: 126 });
    expect(card.colours).toEqual([{ name: 'Oat', swatch: '#d8cbb0' }]);
    expect(card.stock).toBe('in');
    expect(card.available).toBe(true);
  });

  it('maps price.amount, compareAt and from', () => {
    const card = expectCard(baseItem({ price: { amount: 9600, compareAt: 12800, from: true } }));
    expect(card.price).toEqual({ amount: 9600, compareAt: 12800, from: true });
  });

  it('renders no featuredImage as null, not undefined', () => {
    const card = expectCard(baseItem({ featuredImage: undefined }));
    expect(card.featuredImage).toBeNull();
  });

  it('derives badge: { variant: "sale" } when compareAt is greater than amount', () => {
    const card = expectCard(baseItem({ price: { amount: 9600, compareAt: 12800 } }));
    expect(card.badge).toEqual({ variant: 'sale' });
  });

  it('derives no badge when compareAt equals amount', () => {
    const card = expectCard(baseItem({ price: { amount: 9600, compareAt: 9600 } }));
    expect(card.badge).toBeNull();
  });

  it('derives no badge when compareAt is less than amount', () => {
    const card = expectCard(baseItem({ price: { amount: 9600, compareAt: 4800 } }));
    expect(card.badge).toBeNull();
  });

  it('derives no badge when there is no compareAt at all', () => {
    const card = expectCard(baseItem({ price: { amount: 9600, compareAt: null } }));
    expect(card.badge).toBeNull();
  });

  // `item.url` is storefront-derived (a gateway response or the demo fixture), and
  // `ProductCardProduct.url` is required — the card always renders a link, so there is no
  // "card without a link" state. So an unusable URL means no card, which is what these lock in.
  describe('the url trust boundary', () => {
    it.each([
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
      ['a protocol-relative URL', '//evil.example/p/x'],
      ['a backslash path', '/products\\..\\admin'],
      ['an empty string', ''],
      ['whitespace only', '   '],
    ])('returns null for %s', (_label, url) => {
      expect(toProductCard(baseItem({ url }))).toBeNull();
    });

    it('keeps an ordinary path and an absolute http(s) URL', () => {
      expect(expectCard(baseItem({ url: '/products/x' })).url).toBe('/products/x');
      expect(expectCard(baseItem({ url: 'https://shop.example/p/x' })).url).toBe(
        'https://shop.example/p/x'
      );
    });
  });
});

describe('toProductCardEntries', () => {
  it('drops the unusable items, keeps order, and reports whether each link routes', () => {
    const entries = toProductCardEntries([
      baseItem({ handle: 'a', url: '/products/a' }),
      baseItem({ handle: 'bad', url: 'javascript:alert(1)' }),
      baseItem({ handle: 'b', url: 'https://elsewhere.example/p/b' }),
    ]);

    expect(entries.map((entry) => entry.item.handle)).toEqual(['a', 'b']);
    expect(entries.map((entry) => entry.internal)).toEqual([true, false]);
    expect(entries.map((entry) => entry.product.url)).toEqual([
      '/products/a',
      'https://elsewhere.example/p/b',
    ]);
  });

  it('carries the sanitised href on the item too, so a caller never re-reads the raw one', () => {
    const [entry] = toProductCardEntries([baseItem({ url: '  /products/a  ' })]);
    expect(entry!.item.url).toBe('/products/a');
    expect(entry!.product.url).toBe('/products/a');
  });

  it('accepts null/undefined and returns no entries', () => {
    expect(toProductCardEntries(null)).toEqual([]);
    expect(toProductCardEntries(undefined)).toEqual([]);
  });
});
