import { describe, expect, it } from 'vitest';
import {
  applyVolatileSnapshots,
  chunkIds,
  collectVolatileTargets,
  VOLATILE_CHUNK_SIZE,
} from '../../app/storefront/volatile';
import type {
  StorefrontProduct,
  StorefrontProductListItem,
  StorefrontSearchResponse,
  VolatileSnapshot,
} from '../../app/storefront/types';

/**
 * The pure half of the prerender/refresh contract: which product ids a page's storefront data is
 * about, and how a batch of live volatile values is folded back into it without disturbing
 * anything else. Nothing here touches Vue, the network or a component — the refresh *behaviour*
 * (when it runs, what `revalidating` is set to) belongs to the plugin and the blocks.
 */

function listItem(overrides: Partial<StorefrontProductListItem> = {}): StorefrontProductListItem {
  return {
    handle: 'merino-crew-sweater',
    title: 'Merino crew sweater',
    url: '/products/merino-crew-sweater',
    featuredImage: { src: '/demo/product-1.svg', alt: 'Merino crew sweater' },
    price: { amount: 96, compareAt: null },
    rating: { value: 4.5, count: 12 },
    colours: [{ name: 'Oat', swatch: '#d8cbb0' }],
    stock: 'in',
    available: true,
    productId: 'p-1',
    ...overrides,
  };
}

function fullProduct(overrides: Partial<StorefrontProduct> = {}): StorefrontProduct {
  return {
    ...listItem(),
    images: [{ src: '/demo/product-1.svg', alt: 'Merino crew sweater' }],
    options: [],
    categoryTrail: [{ label: 'Shop', href: '/collections/all' }],
    description: 'A relaxed crew knitted from extra-fine Merino.',
    inventory: 42,
    shipsBy: 'Tue 29 Sep – Thu 1 Oct',
    ...overrides,
  };
}

function snapshot(overrides: Partial<VolatileSnapshot> = {}): VolatileSnapshot {
  return {
    id: 'p-1',
    price: { amount: 79, compareAt: 96 },
    available: true,
    stock: 'low',
    ...overrides,
  };
}

describe('collectVolatileTargets', () => {
  it('reads the id off a single product — a detail page', () => {
    expect(collectVolatileTargets(fullProduct())).toEqual(['p-1']);
    expect(collectVolatileTargets(listItem())).toEqual(['p-1']);
  });

  it('reads a card list in order, and never repeats an id', () => {
    const items = [
      listItem({ productId: 'p-1' }),
      listItem({ productId: 'p-2' }),
      listItem({ productId: 'p-1' }),
      listItem({ productId: 'p-3' }),
    ];
    expect(collectVolatileTargets(items)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('reads the collection grid’s `{ items, total, facets }` result', () => {
    const data = {
      items: [listItem({ productId: 'p-9' }), listItem({ productId: 'p-8' })],
      total: 2,
      facets: [],
    };
    expect(collectVolatileTargets(data)).toEqual(['p-9', 'p-8']);
  });

  it('reads a search response’s products and leaves its articles and pages alone', () => {
    const response: StorefrontSearchResponse = {
      query: 'sweater',
      total: 3,
      products: [listItem({ productId: 'p-4' }), listItem({ productId: 'p-5' })],
      articles: [{ title: 'Knitwear care', href: '/journal/care', category: '', readingTime: '' }],
      pages: [{ title: 'Shipping', href: '/shipping', path: '/shipping', snippet: '' }],
      suggestion: null,
    };
    expect(collectVolatileTargets(response)).toEqual(['p-4', 'p-5']);
  });

  it('answers `[]` for anything it does not recognise, rather than guessing', () => {
    expect(collectVolatileTargets(null)).toEqual([]);
    expect(collectVolatileTargets(undefined)).toEqual([]);
    expect(collectVolatileTargets(42)).toEqual([]);
    expect(collectVolatileTargets('merino-crew-sweater')).toEqual([]);
    expect(collectVolatileTargets({})).toEqual([]);
    expect(collectVolatileTargets([])).toEqual([]);
    // A cart line carries `productId` and `title` but is not a product card.
    expect(
      collectVolatileTargets([
        {
          id: 'line-1',
          productId: 'p-1',
          variantId: 'p-1::oat',
          title: 'Merino crew sweater',
          url: '/products/merino-crew-sweater',
          variantLabel: 'Oat / M',
          quantity: 1,
          unitPrice: 96,
          lineTotal: 96,
          max: null,
        },
      ])
    ).toEqual([]);
  });

  it('skips an item with no usable id', () => {
    expect(
      collectVolatileTargets([listItem({ productId: '' }), listItem({ productId: 'p-2' })])
    ).toEqual(['p-2']);
  });
});

describe('applyVolatileSnapshots', () => {
  it('replaces the volatile fields and nothing else', () => {
    const item = listItem();
    const [next] = applyVolatileSnapshots([item], [snapshot()]);

    expect(next).not.toBe(item);
    expect(next?.price).toEqual({ amount: 79, compareAt: 96 });
    expect(next?.stock).toBe('low');
    expect(next?.available).toBe(true);
    // Everything else is byte-for-byte the prerendered value.
    expect(next?.title).toBe(item.title);
    expect(next?.handle).toBe(item.handle);
    expect(next?.url).toBe(item.url);
    expect(next?.featuredImage).toBe(item.featuredImage);
    expect(next?.rating).toBe(item.rating);
    expect(next?.colours).toBe(item.colours);
    expect(next?.productId).toBe(item.productId);
  });

  /**
   * The mutation proof for the rule above: a `applyVolatileSnapshots` that copied any other field
   * off the snapshot — the title, say — has to fail here. Proven by mutation 2026-09-28: adding
   * `title: 'Live title'` to the replaced set fails this assertion.
   */
  it('never takes a non-volatile field from the snapshot', () => {
    const item = listItem();
    const live = { ...snapshot(), title: 'Live title', url: '/products/live', handle: 'live' };
    const [next] = applyVolatileSnapshots([item], [live as VolatileSnapshot]);

    expect(next?.title).toBe('Merino crew sweater');
    expect(next?.url).toBe('/products/merino-crew-sweater');
    expect(next?.handle).toBe('merino-crew-sweater');
  });

  it('keeps `from` — the price *spread* is not one of the refreshed values', () => {
    const item = listItem({ price: { amount: 96, compareAt: null, from: true } });
    const [next] = applyVolatileSnapshots([item], [snapshot()]);
    expect(next?.price).toEqual({ amount: 79, compareAt: 96, from: true });
  });

  it('returns the very same object when nothing changed, so Vue re-renders nothing', () => {
    const unchanged = snapshot({ price: { amount: 96, compareAt: null }, stock: 'in' });
    const item = listItem();
    const list = [item];
    expect(applyVolatileSnapshots(list, [unchanged])).toBe(list);

    const grid = { items: [item], total: 1, facets: [] };
    expect(applyVolatileSnapshots(grid, [unchanged])).toBe(grid);

    const product = fullProduct();
    expect(applyVolatileSnapshots(product, [unchanged])).toBe(product);

    // `compareAt: undefined` and `compareAt: null` mean the same thing; neither is a change.
    const noCompareAt = listItem({ price: { amount: 96 } });
    const same = [noCompareAt];
    expect(applyVolatileSnapshots(same, [unchanged])).toBe(same);
  });

  it('keeps the untouched items in a list at their own identity', () => {
    const changed = listItem({ productId: 'p-1' });
    const untouched = listItem({ productId: 'p-2' });
    const list = [changed, untouched];
    const next = applyVolatileSnapshots(list, [snapshot()]);

    expect(next).not.toBe(list);
    expect(next[0]).not.toBe(changed);
    expect(next[1]).toBe(untouched);
  });

  it('ignores an id nothing on the page carries, and an empty batch', () => {
    const list = [listItem()];
    expect(applyVolatileSnapshots(list, [snapshot({ id: 'someone-else' })])).toBe(list);
    expect(applyVolatileSnapshots(list, [])).toBe(list);
  });

  it('replaces `inventory` only when the snapshot carries it, and only on a product that has one', () => {
    const product = fullProduct();
    const withInventory = applyVolatileSnapshots(product, [snapshot({ inventory: 3 })]);
    expect(withInventory.inventory).toBe(3);
    expect(withInventory.description).toBe(product.description);
    expect(withInventory.images).toBe(product.images);

    // No `inventory` key on the snapshot: the prerendered count stays.
    const withoutInventory = applyVolatileSnapshots(product, [snapshot()]);
    expect(withoutInventory.inventory).toBe(42);

    // A card has no `inventory` field and must not grow one.
    const [card] = applyVolatileSnapshots([listItem()], [snapshot({ inventory: 3 })]);
    expect(card && 'inventory' in card).toBe(false);
  });

  it('works through the grid and search containers, leaving their siblings alone', () => {
    const grid = {
      items: [listItem()],
      total: 1,
      facets: [{ source: 'size', label: 'Size', values: [] }],
    };
    const nextGrid = applyVolatileSnapshots(grid, [snapshot()]);
    expect(nextGrid).not.toBe(grid);
    expect(nextGrid.items[0]?.price.amount).toBe(79);
    expect(nextGrid.total).toBe(1);
    expect(nextGrid.facets).toBe(grid.facets);

    const response: StorefrontSearchResponse = {
      query: 'sweater',
      total: 1,
      products: [listItem()],
      articles: [],
      pages: [],
      suggestion: null,
    };
    const nextResponse = applyVolatileSnapshots(response, [snapshot()]);
    expect(nextResponse.products[0]?.stock).toBe('low');
    expect(nextResponse.query).toBe('sweater');
  });

  it('leaves data it does not recognise exactly as it was', () => {
    const cart = { lines: [], totals: { subtotal: 0, shipping: null, total: 0 } };
    expect(applyVolatileSnapshots(cart, [snapshot()])).toBe(cart);
    expect(applyVolatileSnapshots(null, [snapshot()])).toBe(null);
  });
});

describe('chunkIds', () => {
  const ids = (count: number): string[] =>
    Array.from({ length: count }, (_unused, index) => `id-${index + 1}`);

  it('asks for nothing when there is nothing to ask about', () => {
    expect(chunkIds([])).toEqual([]);
  });

  it('keeps a full batch in one chunk', () => {
    const chunks = chunkIds(ids(50));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(50);
  });

  it('splits one past the limit into two', () => {
    const chunks = chunkIds(ids(51));
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 1]);
    expect(chunks[1]).toEqual(['id-51']);
  });

  it('splits a long page into as many chunks as it takes, in order', () => {
    const chunks = chunkIds(ids(120));
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual(ids(120));
  });

  it('takes a size of its own', () => {
    expect(chunkIds(ids(5), 2).map((chunk) => chunk.length)).toEqual([2, 2, 1]);
    expect(VOLATILE_CHUNK_SIZE).toBe(50);
  });
});
