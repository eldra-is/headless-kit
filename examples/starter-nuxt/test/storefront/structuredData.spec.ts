import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../app/storefront/money';
import { pageStructuredData, type PageLdParts } from '../../app/storefront/structuredData';
import type { StorefrontProduct } from '../../app/storefront/types';

const ORIGIN = 'https://shop.test';

const product = (over: Partial<StorefrontProduct> = {}): StorefrontProduct => ({
  handle: 'mug',
  title: 'Mug',
  url: '/products/mug',
  featuredImage: null,
  images: [{ src: 'https://cdn.test/mug.jpg', alt: 'Mug' }],
  price: { amount: 2800, compareAt: null },
  stock: 'in',
  available: true,
  productId: 'p1',
  variantId: 'v1',
  options: [],
  categoryTrail: [],
  description: 'A <b>hand-thrown</b> mug.',
  inventory: null,
  ...over,
});

const parts = (over: Partial<PageLdParts> = {}): PageLdParts => ({
  kind: 'page',
  title: 'About',
  currentUrl: `${ORIGIN}/about`,
  url: (path) => `${ORIGIN}${path}`,
  absolute: true,
  homeLabel: 'Home',
  trail: [],
  product: null,
  currency: 'ISK',
  items: [],
  profile: {
    name: 'Shop',
    logoUrl: 'https://media.test/icon-512',
    sameAs: [],
    contact: { email: null, telephone: null },
  },
  searchPath: '/search',
  ...over,
});

const types = (entries: ReturnType<typeof pageStructuredData>) =>
  entries.map((entry) => entry.type);

describe('pageStructuredData', () => {
  it('writes Organization and WebSite on home, and only with an absolute origin', () => {
    expect(types(pageStructuredData(parts({ kind: 'home' })))).toEqual(['organization', 'website']);
    expect(types(pageStructuredData(parts({ kind: 'home', absolute: false })))).toEqual([]);
  });

  it('writes only a BreadcrumbList on an ordinary page, Home first', () => {
    const [entry, ...rest] = pageStructuredData(parts());
    expect(rest).toEqual([]);
    expect(entry!.type).toBe('breadcrumb');
    expect(entry!.node.itemListElement).toMatchObject([
      { name: 'Home', item: `${ORIGIN}/` },
      { name: 'About', item: `${ORIGIN}/about` },
    ]);
  });

  it('writes nothing for the not-found shell', () => {
    expect(pageStructuredData(parts({ kind: 'notFound' }))).toEqual([]);
  });

  it('builds a product from the same price, currency and stock the page renders', () => {
    const entries = pageStructuredData(
      parts({
        kind: 'product',
        title: 'Mug',
        currentUrl: `${ORIGIN}/products/mug`,
        trail: [{ label: 'Cups', path: '/categories/cups' }],
        product: product({ brand: 'Acme' }),
      })
    );
    expect(types(entries)).toEqual(['breadcrumb', 'product']);
    expect(
      (entries[0]!.node.itemListElement as Array<{ name: string }>).map((item) => item.name)
    ).toEqual(['Home', 'Cups', 'Mug']);
    const node = entries[1]!.node as Record<string, any>;
    expect(node).toMatchObject({
      name: 'Mug',
      description: 'A hand-thrown mug.',
      image: ['https://cdn.test/mug.jpg'],
      brand: { name: 'Acme' },
      offers: { price: 2800, priceCurrency: 'ISK', availability: 'https://schema.org/InStock' },
    });
    // The number the markup states is the number the visible price is formatted from.
    expect(formatMoney(node.offers.price, 'ISK', 'en-US')).toContain('2,800');
  });

  it('maps stock states to availability and falls back to the shop name as brand', () => {
    const availability = (stock: StorefrontProduct['stock']) =>
      (
        pageStructuredData(parts({ kind: 'product', product: product({ stock }) }))[1]!.node
          .offers as Record<string, unknown>
      ).availability;
    expect(availability('out')).toBe('https://schema.org/OutOfStock');
    expect(availability('preorder')).toBe('https://schema.org/PreOrder');
    expect(availability('low')).toBe('https://schema.org/LimitedAvailability');
    expect(
      pageStructuredData(parts({ kind: 'product', product: product() }))[1]!.node.brand
    ).toEqual({ '@type': 'Brand', name: 'Shop' });
  });

  it('writes one offer per variant, AggregateOffer when prices differ, and drops a bad barcode', () => {
    const entries = pageStructuredData(
      parts({
        kind: 'product',
        product: product({
          variants: [
            { sku: 'S', barcode: '4006381333931', price: 2000, compareAt: null, stock: 'in' },
            { sku: 'L', barcode: 'internal', price: 3000, compareAt: 3500, stock: 'out' },
          ],
        }),
      })
    );
    const offers = entries[1]!.node.offers as Record<string, any>;
    expect(offers).toMatchObject({ '@type': 'AggregateOffer', lowPrice: 2000, highPrice: 3000 });
    expect(offers.offers[0].gtin).toBe('4006381333931');
    expect(offers.offers[1].gtin).toBeUndefined();
    expect(offers.offers[1].availability).toBe('https://schema.org/OutOfStock');
  });

  it('writes an ItemList on a listing page only when it shows products', () => {
    const listing = (items: PageLdParts['items']) =>
      types(pageStructuredData(parts({ kind: 'collection', items })));
    expect(listing([])).toEqual(['breadcrumb']);
    expect(listing([{ title: 'Mug', url: `${ORIGIN}/products/mug` }])).toEqual([
      'breadcrumb',
      'itemList',
    ]);
  });
});
