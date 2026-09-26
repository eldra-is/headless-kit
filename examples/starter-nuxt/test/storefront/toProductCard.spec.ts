import { describe, expect, it } from 'vitest';
import { toProductCard } from '../../app/storefront/toProductCard';
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

describe('toProductCard', () => {
  it('maps title, url, featuredImage, rating, colours, stock and available straight through', () => {
    const card = toProductCard(baseItem());
    expect(card.title).toBe('Merino crew sweater');
    expect(card.url).toBe('/products/merino-crew-sweater');
    expect(card.featuredImage).toEqual({ src: '/demo/product-1.svg', alt: 'Merino crew sweater' });
    expect(card.rating).toEqual({ value: 4.5, count: 126 });
    expect(card.colours).toEqual([{ name: 'Oat', swatch: '#d8cbb0' }]);
    expect(card.stock).toBe('in');
    expect(card.available).toBe(true);
  });

  it('maps price.amount, compareAt and from', () => {
    const card = toProductCard(baseItem({ price: { amount: 9600, compareAt: 12800, from: true } }));
    expect(card.price).toEqual({ amount: 9600, compareAt: 12800, from: true });
  });

  it('renders no featuredImage as null, not undefined', () => {
    const card = toProductCard(baseItem({ featuredImage: undefined }));
    expect(card.featuredImage).toBeNull();
  });

  it('derives badge: { variant: "sale" } when compareAt is greater than amount', () => {
    const card = toProductCard(baseItem({ price: { amount: 9600, compareAt: 12800 } }));
    expect(card.badge).toEqual({ variant: 'sale' });
  });

  it('derives no badge when compareAt equals amount', () => {
    const card = toProductCard(baseItem({ price: { amount: 9600, compareAt: 9600 } }));
    expect(card.badge).toBeNull();
  });

  it('derives no badge when compareAt is less than amount', () => {
    const card = toProductCard(baseItem({ price: { amount: 9600, compareAt: 4800 } }));
    expect(card.badge).toBeNull();
  });

  it('derives no badge when there is no compareAt at all', () => {
    const card = toProductCard(baseItem({ price: { amount: 9600, compareAt: null } }));
    expect(card.badge).toBeNull();
  });
});
