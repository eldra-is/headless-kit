import { describe, expect, it } from 'vitest';
import {
  deriveFacets,
  filterItems,
  matchesFilters,
  matchesPrice,
} from '../../app/storefront/facets';
import type { ProductFacetAttributes } from '../../app/storefront/facets';
import type { StorefrontProductListItem } from '../../app/storefront/types';

/**
 * `facets.ts` is the one facet pass both storefront sources run — the demo over its fixture and
 * the gateway over the page it just fetched — so it is tested here on its own, with no source and
 * no Vue around it. Every bound below is a *mutation proof*: flip the comparison, drop the
 * `continue`, treat an unknown attribute as "matches nothing", and one of these fails.
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
    category: 'knitwear',
    sizes: ['s', 'm'],
    colours: ['oat', 'moss'],
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

  it('reads availability off the item, so a source needs no attributes at all', () => {
    const inStock = item({ handle: 'a' });
    const soldOut = item({ handle: 'b', stock: 'out', available: false });
    const preorder = item({ handle: 'c', stock: 'preorder', available: false });
    // Orderable in principle, out of stock in fact: "In stock" must still drop it, which is why
    // `available` alone is not the test.
    const listedButOut = item({ handle: 'd', stock: 'out', available: true });

    expect(matchesFilters(inStock, { availability: ['in-stock'] })).toBe(true);
    expect(matchesFilters(soldOut, { availability: ['in-stock'] })).toBe(false);
    expect(matchesFilters(preorder, { availability: ['in-stock'] })).toBe(false);
    expect(matchesFilters(preorder, { availability: ['backorder'] })).toBe(true);
    expect(matchesFilters(soldOut, { availability: ['backorder'] })).toBe(false);
    expect(matchesFilters(preorder, { availability: ['in-stock', 'backorder'] })).toBe(true);
    expect(matchesFilters(listedButOut, { availability: ['in-stock'] })).toBe(false);
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
    expect(matchesFilters(sweater, { 'option:colour': ['clay'] })).toBe(true);
    expect(matchesFilters(sweater, { 'made-in': ['iceland'] }, knitwear)).toBe(true);
  });

  /** A *known* empty list is not unknown: a product recorded as made in no sizes matches none. */
  it('excludes on a known-but-empty attribute', () => {
    expect(matchesFilters(sweater, { 'option:size': ['m'] }, { sizes: [] })).toBe(false);
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

describe('deriveFacets', () => {
  const items = [
    item({ handle: 'a', colours: [{ name: 'Oat', swatch: '#d8cbb0' }] }),
    item({
      handle: 'b',
      colours: [
        { name: 'Oat', swatch: '#d8cbb0' },
        { name: 'Moss', swatch: '#6b7a4f' },
      ],
    }),
  ];

  it('counts each colour over the items it was given, keeping the store’s own labels', () => {
    expect(deriveFacets(items)).toEqual([
      {
        source: 'colour',
        label: 'Colour',
        values: [
          { value: 'oat', label: 'Oat', count: 2, swatch: '#d8cbb0' },
          { value: 'moss', label: 'Moss', count: 1, swatch: '#6b7a4f' },
        ],
      },
    ]);
  });

  it('derives nothing from items that carry no facetable attribute', () => {
    expect(deriveFacets([item({ handle: 'a' })])).toEqual([]);
    expect(deriveFacets([])).toEqual([]);
  });
});
