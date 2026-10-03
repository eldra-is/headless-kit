import { describe, expect, it } from 'vitest';
import { toSearchBarResults } from '../results';
import { formatMoney } from '../../../app/storefront/money';
import type {
  StorefrontProductListItem,
  StorefrontSearchResponse,
} from '../../../app/storefront/types';

function product(overrides: Partial<StorefrontProductListItem> = {}): StorefrontProductListItem {
  return {
    handle: 'linen-napkins',
    title: 'Linen napkins, set of 4',
    url: '/products/linen-napkins',
    featuredImage: { src: '/demo/product-1.svg', alt: 'Linen napkins' },
    price: { amount: 40, compareAt: null },
    stock: 'in',
    available: true,
    productId: 'linen-napkins',
    ...overrides,
  };
}

function response(overrides: Partial<StorefrontSearchResponse> = {}): StorefrontSearchResponse {
  return {
    query: 'linen',
    total: 17,
    products: [],
    articles: [],
    pages: [],
    suggestion: null,
    ...overrides,
  };
}

/**
 * What `useMoney().format` hands the mapper on a real page: the store's own currency, resolved in
 * the block's `setup()`. The mapper is pure and takes the formatter, so this spec says which
 * currency it is formatting in rather than inheriting one from a module-level default.
 */
const formatPrice = (amount: number): string => formatMoney(amount, 'USD');

describe('toSearchBarResults', () => {
  /**
   * `undefined`, not an empty shape. `SearchBar` reads an absent `results` as "nothing yet" (no
   * panel, and its loading view past 300ms) and a `{ total: 0 }` shape as "nothing found" — so
   * answering the no-response case with the latter is what made the panel say "No results" for the
   * whole time the request for the query was in flight.
   */
  it('answers undefined — not an empty, zero-total shape — for a null response', () => {
    expect(toSearchBarResults(null, 3, formatPrice)).toBeUndefined();
  });

  it('maps products, articles and pages into the SearchBar contract, carrying the backend total', () => {
    const result = toSearchBarResults(
      response({
        total: 3,
        products: [product()],
        articles: [
          {
            title: 'How to wash and store linen',
            href: '/journal/how-to-wash-and-store-linen',
            category: 'Care guide',
            readingTime: '4 min read',
            image: { src: '/demo/product-1.svg', alt: 'Linen' },
          },
        ],
        pages: [
          {
            title: 'Materials',
            href: '/pages/materials',
            path: 'northwindgoods.com/pages/materials',
            snippet: 'Where our linen, wool and stoneware come from.',
          },
        ],
      }),
      3,
      formatPrice
    );

    expect(result.total).toBe(3);
    expect(result.collections).toEqual([]);
    expect(result.products).toEqual([
      {
        id: 'linen-napkins',
        title: 'Linen napkins, set of 4',
        href: '/products/linen-napkins',
        price: '$40',
        image: '/demo/product-1.svg',
        imageAlt: 'Linen napkins',
      },
    ]);
    expect(result.articles).toEqual([
      {
        id: 'article-0',
        title: 'How to wash and store linen',
        href: '/journal/how-to-wash-and-store-linen',
        image: '/demo/product-1.svg',
        imageAlt: 'Linen',
      },
    ]);
    expect(result.pages).toEqual([{ id: 'page-0', title: 'Materials', href: '/pages/materials' }]);
  });

  it('caps each group at suggestionsPerGroup', () => {
    const products = Array.from({ length: 6 }, (_, i) =>
      product({ handle: `product-${i}`, productId: `product-${i}` })
    );
    const articles = Array.from({ length: 6 }, (_, i) => ({
      title: `Story ${i}`,
      href: `/journal/story-${i}`,
      category: 'Journal',
      readingTime: '4 min read',
    }));
    const pages = Array.from({ length: 6 }, (_, i) => ({
      title: `Page ${i}`,
      href: `/pages/page-${i}`,
      path: `northwindgoods.com/pages/page-${i}`,
      snippet: 'A page.',
    }));

    const result = toSearchBarResults(response({ products, articles, pages }), 2, formatPrice);
    expect(result.products).toHaveLength(2);
    expect(result.articles).toHaveLength(2);
    expect(result.pages).toHaveLength(2);
  });

  it('ranks sold-out products last, before the suggestionsPerGroup cap is applied', () => {
    const soldOut = product({
      handle: 'sold-out',
      productId: 'sold-out',
      stock: 'out',
      available: false,
    });
    const inStockA = product({ handle: 'in-stock-a', productId: 'in-stock-a' });
    const inStockB = product({ handle: 'in-stock-b', productId: 'in-stock-b' });

    const result = toSearchBarResults(
      response({ products: [soldOut, inStockA, inStockB] }),
      3,
      formatPrice
    );
    expect(result.products.map((item) => item.id)).toEqual([
      'in-stock-a',
      'in-stock-b',
      'sold-out',
    ]);
  });

  it('drops a sold-out product from the cap entirely when enough in-stock ones fill it', () => {
    const soldOut = product({
      handle: 'sold-out',
      productId: 'sold-out',
      stock: 'out',
      available: false,
    });
    const inStockA = product({ handle: 'in-stock-a', productId: 'in-stock-a' });
    const inStockB = product({ handle: 'in-stock-b', productId: 'in-stock-b' });

    const result = toSearchBarResults(
      response({ products: [soldOut, inStockA, inStockB] }),
      2,
      formatPrice
    );
    expect(result.products.map((item) => item.id)).toEqual(['in-stock-a', 'in-stock-b']);
  });
});
