import { describe, expect, it } from 'vitest';
import {
  deriveFacets,
  filterItems,
  matchesFilters,
  matchesFiltersExcept,
  matchesPrice,
} from '../../app/storefront/facets';
import type { ProductFacetAttributes } from '../../app/storefront/facets';
import type { StorefrontProductListItem } from '../../app/storefront/types';

/**
 * `facets.ts` is the one facet pass both storefront sources run — the demo over its fixture and
 * the gateway over the page it just fetched — plus the client-side derivation of the platform's own
 * `facets` object, so it is tested here on its own, with no source and no Vue around it. Every
 * bound below is a *mutation proof*: flip the comparison, drop the `continue`, treat an unknown
 * attribute as "matches nothing", count a family over its own filter, and one of these fails.
 */
function item(
  overrides: Partial<StorefrontProductListItem> & { handle: string }
): StorefrontProductListItem {
  return {
    title: overrides.handle,
    url: `/products/${overrides.handle}`,
    price: { amount: 100, compareAt: null },
    stock: 'in',
    available: true,
    productId: `${overrides.handle}`,
    ...overrides,
  };
}

describe('matchesPrice', () => {
  const priced = (amount: number) => item({ handle: 'p', price: { amount, compareAt: null } });

  it('includes both bounds — the shopper asking for 50–150 means 50 and 150 are in', () => {
    expect(matchesPrice(priced(50), '50-150')).toBe(true);
    expect(matchesPrice(priced(150), '50-150')).toBe(true);
  });

  it('excludes anything outside them — the $48 bowl the live site kept showing', () => {
    expect(matchesPrice(priced(48), '50-150')).toBe(false);
    expect(matchesPrice(priced(151), '50-150')).toBe(false);
  });

  it('treats an empty end as no bound, and a missing range as no filter at all', () => {
    expect(matchesPrice(priced(10), '-150')).toBe(true);
    expect(matchesPrice(priced(10), '50-')).toBe(false);
    expect(matchesPrice(priced(9000), '50-')).toBe(true);
    expect(matchesPrice(priced(9000), '-150')).toBe(false);
    expect(matchesPrice(priced(9000), undefined)).toBe(true);
    expect(matchesPrice(priced(9000), '-')).toBe(true);
  });
});

describe('matchesFilters', () => {
  const sweater = item({ handle: 'sweater' });
  const knitwear: ProductFacetAttributes = {
    category: { slug: 'knitwear', title: 'Knitwear' },
    collections: [{ slug: 'the-winter-edit', title: 'The winter edit' }],
    options: {
      size: [{ value: 's' }, { value: 'm' }],
      colour: [{ value: 'oat' }, { value: 'moss' }],
    },
  };

  it('answers true for no filters and for an empty value list', () => {
    expect(matchesFilters(sweater, undefined, knitwear)).toBe(true);
    expect(matchesFilters(sweater, { category: [] }, knitwear)).toBe(true);
  });

  it('ORs within one source and ANDs across sources', () => {
    expect(matchesFilters(sweater, { 'option:size': ['l', 'm'] }, knitwear)).toBe(true);
    expect(matchesFilters(sweater, { 'option:size': ['l', 'xl'] }, knitwear)).toBe(false);
    expect(
      matchesFilters(sweater, { 'option:size': ['m'], 'option:colour': ['oat'] }, knitwear)
    ).toBe(true);
    expect(
      matchesFilters(sweater, { 'option:size': ['m'], 'option:colour': ['clay'] }, knitwear)
    ).toBe(false);
    expect(matchesFilters(sweater, { category: ['ceramics', 'knitwear'] }, knitwear)).toBe(true);
    expect(matchesFilters(sweater, { category: ['ceramics'] }, knitwear)).toBe(false);
  });

  it('filters on collection membership, which a product may have several of', () => {
    const both: ProductFacetAttributes = {
      collections: [{ slug: 'the-winter-edit' }, { slug: 'best-sellers' }],
    };
    expect(matchesFilters(sweater, { collection: ['best-sellers'] }, both)).toBe(true);
    expect(matchesFilters(sweater, { collection: ['the-winter-edit'] }, knitwear)).toBe(true);
    expect(matchesFilters(sweater, { collection: ['best-sellers'] }, knitwear)).toBe(false);
    // Known-but-empty: a product in no collection matches no collection filter.
    expect(matchesFilters(sweater, { collection: ['best-sellers'] }, { collections: [] })).toBe(
      false
    );
  });

  it('reads availability off the item, so a source needs no attributes at all', () => {
    const inStock = item({ handle: 'a' });
    const soldOut = item({ handle: 'b', stock: 'out', available: false });
    const preorder = item({ handle: 'c', stock: 'preorder', available: false });
    // Orderable in principle, out of stock in fact: "In stock" must still drop it, which is why
    // `available` alone is not the test.
    const listedButOut = item({ handle: 'd', stock: 'out', available: true });

    expect(matchesFilters(inStock, { availability: ['in_stock'] })).toBe(true);
    expect(matchesFilters(soldOut, { availability: ['in_stock'] })).toBe(false);
    expect(matchesFilters(preorder, { availability: ['in_stock'] })).toBe(false);
    expect(matchesFilters(listedButOut, { availability: ['in_stock'] })).toBe(false);

    expect(matchesFilters(soldOut, { availability: ['out_of_stock'] })).toBe(true);
    expect(matchesFilters(preorder, { availability: ['out_of_stock'] })).toBe(true);
    expect(matchesFilters(inStock, { availability: ['out_of_stock'] })).toBe(false);

    expect(matchesFilters(inStock, { availability: ['in_stock', 'out_of_stock'] })).toBe(true);
    expect(matchesFilters(soldOut, { availability: ['in_stock', 'out_of_stock'] })).toBe(true);

    // The spelling shared links were written with before the platform's own vocabulary landed.
    expect(matchesFilters(inStock, { availability: ['in-stock'] })).toBe(true);
    expect(matchesFilters(soldOut, { availability: ['in-stock'] })).toBe(false);
  });

  it('filters on price with no attributes, which is the whole gateway path', () => {
    expect(
      matchesFilters(item({ handle: 'p', price: { amount: 48 } }), { price: ['50-150'] })
    ).toBe(false);
    expect(
      matchesFilters(item({ handle: 'p', price: { amount: 50 } }), { price: ['50-150'] })
    ).toBe(true);
  });

  /**
   * The rule that keeps a client-side pass honest: a source the caller has no data for is
   * *unknown*, not *unmatched*. A backend that cannot tell which sizes a product is made in has no
   * business emptying the grid because the shopper ticked "M" — the same doctrine the demo already
   * applied to an unrecognised source name.
   */
  it('ignores a source it has no attribute for, and an unknown source name', () => {
    expect(matchesFilters(sweater, { 'option:size': ['xl'] })).toBe(true);
    expect(matchesFilters(sweater, { category: ['ceramics'] })).toBe(true);
    expect(matchesFilters(sweater, { collection: ['best-sellers'] })).toBe(true);
    expect(matchesFilters(sweater, { 'option:colour': ['clay'] })).toBe(true);
    expect(matchesFilters(sweater, { 'made-in': ['iceland'] }, knitwear)).toBe(true);
  });

  /** A *known* empty list is not unknown: a product recorded as made in no sizes matches none. A
   *  key the source does not name at all stays unknown, so an option the store does not have
   *  (`option:fabric`) cannot empty the grid. */
  it('excludes on a known-but-empty attribute, and still ignores an unnamed option key', () => {
    expect(matchesFilters(sweater, { 'option:size': ['m'] }, { options: { size: [] } })).toBe(
      false
    );
    expect(matchesFilters(sweater, { 'option:fabric': ['linen'] }, { options: { size: [] } })).toBe(
      true
    );
  });

  /** A card's own swatch summary is the colour vocabulary a product list row already carries, so
   *  a source that declares no option bag still filters by colour. */
  it('falls back to the card’s own colours for the colour option', () => {
    const coloured = item({ handle: 'c', colours: [{ name: 'Oat', swatch: '#d8cbb0' }] });
    expect(matchesFilters(coloured, { 'option:colour': ['oat'] })).toBe(true);
    expect(matchesFilters(coloured, { 'option:colour': ['moss'] })).toBe(false);
  });
});

describe('matchesFiltersExcept', () => {
  const attributes: ProductFacetAttributes = {
    category: { slug: 'ceramics' },
    options: { colour: [{ value: 'clay' }] },
  };

  it('judges every clause but the one named', () => {
    const filters = { category: ['knitwear'], 'option:colour': ['clay'] };
    const bowl = item({ handle: 'bowl' });
    expect(matchesFilters(bowl, filters, attributes)).toBe(false);
    expect(matchesFiltersExcept(bowl, filters, 'category', attributes)).toBe(true);
    expect(matchesFiltersExcept(bowl, filters, 'option:colour', attributes)).toBe(false);
    expect(matchesFiltersExcept(bowl, filters, null, attributes)).toBe(false);
  });
});

describe('filterItems', () => {
  const items = [
    item({ handle: 'bowl', price: { amount: 48 } }),
    item({ handle: 'plate', price: { amount: 50 } }),
    item({ handle: 'vase', price: { amount: 150 } }),
    item({ handle: 'lamp', price: { amount: 151 } }),
  ];

  it('keeps order and drops only what the filters exclude', () => {
    expect(filterItems(items, { price: ['50-150'] }).map((i) => i.handle)).toEqual([
      'plate',
      'vase',
    ]);
  });

  it('returns every item when there is nothing to filter on', () => {
    expect(filterItems(items, undefined)).toHaveLength(4);
    expect(filterItems(items, {})).toHaveLength(4);
  });
});

/**
 * `deriveFacets` is the **fallback for the platform's own `facets` object** (`CatalogFacets` in
 * `app/storefront/types.ts`), so what is pinned here is the contract both halves owe the filter
 * panel: the shape, the vocabulary, and the two counting rules — a family's counts leave that
 * family's own filter out, and the price bounds leave only price out.
 */
describe('deriveFacets', () => {
  const CATALOGUE: Array<{
    handle: string;
    amount: number;
    category: string;
    categoryTitle: string;
    colours: string[];
    sizes: string[];
    collections: string[];
    stock?: StorefrontProductListItem['stock'];
  }> = [
    {
      handle: 'sweater',
      amount: 96,
      category: 'knitwear',
      categoryTitle: 'Knitwear',
      colours: ['oat'],
      sizes: ['s', 'm'],
      collections: ['the-winter-edit'],
    },
    {
      handle: 'cardigan',
      amount: 164,
      category: 'knitwear',
      categoryTitle: 'Knitwear',
      colours: ['moss'],
      sizes: ['m'],
      collections: ['the-winter-edit', 'best-sellers'],
    },
    {
      handle: 'bowl',
      amount: 48,
      category: 'ceramics',
      categoryTitle: 'Ceramics',
      colours: ['clay'],
      sizes: [],
      collections: ['the-winter-edit'],
      stock: 'out',
    },
  ];

  const items = CATALOGUE.map((row) =>
    item({
      handle: row.handle,
      price: { amount: row.amount, compareAt: null },
      ...(row.stock === 'out' ? { stock: 'out' as const, available: false } : {}),
    })
  );

  const attributesFor = (candidate: StorefrontProductListItem): ProductFacetAttributes => {
    const row = CATALOGUE.find((entry) => entry.handle === candidate.handle)!;
    return {
      category: { slug: row.category, title: row.categoryTitle, id: `cat-${row.category}` },
      collections: row.collections.map((slug) => ({ slug, title: slug, id: `col-${slug}` })),
      options: {
        size: row.sizes.map((size) => ({ value: size, label: size.toUpperCase() })),
        colour: row.colours.map((colour) => ({ value: colour, label: colour, swatch: '#000' })),
      },
    };
  };

  it('answers the platform’s own shape: price bounds, terms with ids and titles, counts', () => {
    expect(deriveFacets(items, { attributesFor })).toEqual({
      price: { min: 48, max: 164 },
      categories: [
        { id: 'cat-knitwear', slug: 'knitwear', title: 'Knitwear', count: 2 },
        { id: 'cat-ceramics', slug: 'ceramics', title: 'Ceramics', count: 1 },
      ],
      collections: [
        { id: 'col-the-winter-edit', slug: 'the-winter-edit', title: 'the-winter-edit', count: 3 },
        { id: 'col-best-sellers', slug: 'best-sellers', title: 'best-sellers', count: 1 },
      ],
      availability: { in_stock: 2, out_of_stock: 1 },
      options: [
        {
          key: 'size',
          name: 'size',
          values: [
            { value: 's', label: 'S', count: 1 },
            { value: 'm', label: 'M', count: 2 },
          ],
        },
        {
          key: 'colour',
          name: 'colour',
          values: [
            { value: 'oat', label: 'oat', swatch: '#000', count: 1 },
            { value: 'moss', label: 'moss', swatch: '#000', count: 1 },
            { value: 'clay', label: 'clay', swatch: '#000', count: 1 },
          ],
        },
      ],
    });
  });

  /**
   * The rule the whole multi-select interaction rests on (contract §1, "counts ignore own
   * filter"): selecting "Oat" must leave the other colours countable, or the shopper can only ever
   * narrow to one value and then has to clear it to see anything else.
   */
  it('counts a family over the scope its own filter was left out of', () => {
    const facets = deriveFacets(items, { filters: { 'option:colour': ['oat'] }, attributesFor });
    const colours = facets.options.find((option) => option.key === 'colour')!;
    expect(colours.values.map((value) => [value.value, value.count])).toEqual([
      ['oat', 1],
      ['moss', 1],
      ['clay', 1],
    ]);
    // Every *other* family is counted with the colour filter applied: only the sweater is Oat.
    expect(facets.categories).toEqual([
      { id: 'cat-knitwear', slug: 'knitwear', title: 'Knitwear', count: 1 },
      { id: 'cat-ceramics', slug: 'ceramics', title: 'Ceramics', count: 0 },
    ]);
    expect(facets.availability).toEqual({ in_stock: 1, out_of_stock: 0 });
    expect(facets.price).toEqual({ min: 96, max: 96 });
  });

  /** A value another filter excludes keeps its place in the vocabulary with a count of 0 — the
   *  panel disables it rather than letting it vanish under the shopper's pointer. */
  it('keeps a zero-count value listed rather than dropping it', () => {
    const facets = deriveFacets(items, { filters: { category: ['ceramics'] }, attributesFor });
    const sizes = facets.options.find((option) => option.key === 'size')!;
    expect(sizes.values.map((value) => [value.value, value.count])).toEqual([
      ['s', 0],
      ['m', 0],
    ]);
  });

  /** Price bounds leave only the price filter out, so dragging a thumb never moves the track. */
  it('spans the scope with every filter but price applied', () => {
    expect(deriveFacets(items, { filters: { price: ['100-'] }, attributesFor }).price).toEqual({
      min: 48,
      max: 164,
    });
    expect(
      deriveFacets(items, { filters: { category: ['knitwear'] }, attributesFor }).price
    ).toEqual({ min: 96, max: 164 });
  });

  it('derives what the items alone can answer when no attributes are supplied', () => {
    const cards = [
      item({ handle: 'a', colours: [{ name: 'Oat', swatch: '#d8cbb0' }] }),
      item({
        handle: 'b',
        price: { amount: 40 },
        colours: [
          { name: 'Oat', swatch: '#d8cbb0' },
          { name: 'Moss', swatch: '#6b7a4f' },
        ],
      }),
    ];
    expect(deriveFacets(cards)).toEqual({
      price: { min: 40, max: 100 },
      categories: [],
      collections: [],
      availability: { in_stock: 2, out_of_stock: 0 },
      options: [
        {
          key: 'colour',
          name: 'colour',
          values: [
            { value: 'oat', label: 'Oat', swatch: '#d8cbb0', count: 2 },
            { value: 'moss', label: 'Moss', swatch: '#6b7a4f', count: 1 },
          ],
        },
      ],
    });
  });

  it('answers a zero span and empty families for nothing at all', () => {
    expect(deriveFacets([])).toEqual({
      price: { min: 0, max: 0 },
      categories: [],
      collections: [],
      availability: { in_stock: 0, out_of_stock: 0 },
      options: [],
    });
    expect(deriveFacets([item({ handle: 'a' })]).options).toEqual([]);
  });
});
