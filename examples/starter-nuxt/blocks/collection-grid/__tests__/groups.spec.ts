import { describe, expect, it } from 'vitest';
import {
  applyPanelSelection,
  availabilityFacetValues,
  buildFilterFacets,
  defaultPriceStep,
  facetSourceMap,
  facetTypeFor,
  facetValuesFor,
  fitPriceStep,
  formatPriceRange,
  hasPriceRange,
  nestCategoryTerms,
  optionKeyOf,
  optionSourceFor,
  panelSelectionFor,
  parsePriceRange,
  priceSpanOf,
  queryKeyFor,
  rangeFromSlider,
  sliderValueFor,
  spanWithRange,
  toggleKeyOf,
  toggleQueryKey,
  toggleSourceFor,
  usableOptionKey,
  widenPriceSpan,
  type FilterSelection,
  type FilterSource,
} from '../parts/groups';
import type { CatalogFacets } from '../../../app/storefront/types';

/**
 * The adapter's pure rules: the `CatalogFacets → FilterFacet[]` mapping, the price grammar the
 * URL, the request and the slider all share, and the bridge between the panel's own selection shape
 * and the block's internal one. Tested without Vue — `Block.spec.ts` proves the round trip through
 * the route and the mounted `FilterPanel`.
 */

const AVAILABILITY = { inStock: 'In stock only', outOfStock: 'Out of stock' };

const FACETS: CatalogFacets = {
  price: { min: 24, max: 180 },
  categories: [
    { id: 'c1', slug: 'knitwear', title: 'Knitwear', count: 18 },
    { id: 'c2', slug: 'discontinued', title: 'Discontinued', count: 0 },
  ],
  collections: [{ id: 'k1', slug: 'the-winter-edit', title: 'The winter edit', count: 48 }],
  availability: { in_stock: 41, out_of_stock: 7 },
  options: [
    {
      key: 'colour',
      name: 'colour',
      kind: 'color',
      values: [
        { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
        { value: 'clay', label: 'Clay', count: 0 },
      ],
    },
  ],
};

function values(
  source: FilterSource,
  facets: CatalogFacets | undefined,
  selected: readonly string[] = [],
  categoryScopeSlug: string | null = null
) {
  return facetValuesFor(
    source,
    { facets, availability: AVAILABILITY, categoryScopeSlug },
    selected
  );
}

describe('facetValuesFor', () => {
  it('reads category and collection terms by their slug, labelled by their title', () => {
    expect(values('category', FACETS)).toEqual([
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'discontinued', label: 'Discontinued', count: 0, disabled: true },
    ]);
    expect(values('collection', FACETS)).toEqual([
      { value: 'the-winter-edit', label: 'The winter edit', count: 48 },
    ]);
  });

  it('maps an option source to the store’s own option key, swatches and all', () => {
    expect(values('option:colour', FACETS)).toEqual([
      { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
      { value: 'clay', label: 'Clay', count: 0, disabled: true },
    ]);
    // No `size` option in these facets: no values, never invented ones.
    expect(values('option:size', FACETS)).toEqual([]);
  });

  it('carries a value’s size-system group through untouched', () => {
    const sized: CatalogFacets = {
      ...FACETS,
      options: [
        {
          key: 'size',
          name: 'size',
          kind: 'none',
          values: [{ value: 'm', label: 'M', count: 14, group: 'Knitwear' }],
        },
      ],
    };
    expect(values('option:size', sized)).toEqual([
      { value: 'm', label: 'M', count: 14, group: 'Knitwear' },
    ]);
  });

  it('never disables a value the shopper has selected, whatever it counts', () => {
    expect(values('category', FACETS, ['discontinued'])).toEqual([
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'discontinued', label: 'Discontinued', count: 0 },
    ]);
  });

  it('keeps a selected value the facets no longer list at all', () => {
    const colour = values('option:colour', FACETS, ['moss']);
    expect(colour.at(-1)).toEqual({ value: 'moss', label: 'moss', count: 0 });
    const categories = values('category', FACETS, ['linens']);
    expect(categories.at(-1)).toEqual({ value: 'linens', label: 'linens', count: 0 });
  });

  it('offers nothing at all without facets', () => {
    expect(values('category', undefined)).toEqual([]);
  });

  it('scopes category values to one category’s children on a category page', () => {
    const scoped: CatalogFacets = {
      ...FACETS,
      categoryCounts: 'rolled-up',
      categories: [
        { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', count: 9, parentId: null },
        { id: 'cat-bowl', slug: 'bowl', title: 'Bowl', count: 4, parentId: 'cat-tableware' },
        { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
      ],
    };
    expect(values('category', scoped, [], 'tableware')).toEqual([
      { value: 'bowl', label: 'Bowl', count: 4 },
      { value: 'cup', label: 'Cup', count: 6 },
    ]);
  });
});

describe('facetTypeFor', () => {
  /**
   * **A colour facet is one whose values carry colours, and the option's `kind` is not a second
   * vote.** The platform sends a `swatch` per value only under a `color`-kind option, so the two
   * normally agree — but a merchant who switched the option to Color and has not picked the
   * colours yet leaves this facet with nothing to put in a dot, and a row of empty circles is worse
   * than the plain list it replaced. The decision stays on the values.
   */
  it('draws a colour facet from the values’ own swatches, not from the option’s kind', () => {
    expect(facetTypeFor('option:colour', values('option:colour', FACETS))).toBe('colour');

    const unpainted: CatalogFacets = {
      ...FACETS,
      options: [
        {
          key: 'colour',
          name: 'colour',
          kind: 'color',
          values: [{ value: 'oat', label: 'Oat', count: 9 }],
        },
      ],
    };
    expect(facetTypeFor('option:colour', values('option:colour', unpainted))).toBe('list');
  });

  it('draws a size facet once a value arrives with a size-system group', () => {
    const grouped = [{ value: 'm', label: 'M', count: 14, group: 'Knitwear' }];
    expect(facetTypeFor('option:size', grouped)).toBe('size');
    const ungrouped = [{ value: 'm', label: 'M', count: 14 }];
    expect(facetTypeFor('option:size', ungrouped)).toBe('list');
  });

  it('is always list for category and collection', () => {
    const swatched = [{ value: 'a', label: 'A', count: 1, swatch: '#fff' }];
    expect(facetTypeFor('category', swatched)).toBe('list');
    expect(facetTypeFor('collection', swatched)).toBe('list');
  });
});

/**
 * **The category family, flat or nested, and what decides which.**
 *
 * `categoryCounts: 'rolled-up'` is the platform saying it counted the ancestors itself — and public
 * contract 3.8.0 added those counts, the `parentId` that places them and the `categoryId` that
 * matches a whole subtree together. So it is also the signal that a parent row is a filter the
 * gateway can honour, which is the only condition under which the panel offers one.
 */
describe('the category facet', () => {
  const TREE_TERMS: CatalogFacets['categories'] = [
    { id: 'cat-blankets', slug: 'blankets', title: 'Blankets', count: 3, parentId: null },
    { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', count: 9, parentId: null },
    { id: 'cat-bowl', slug: 'bowl', title: 'Bowl', count: 4, parentId: 'cat-tableware' },
    { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
  ];

  const rolledUp = (terms: CatalogFacets['categories']): CatalogFacets => ({
    ...FACETS,
    categories: terms,
    categoryCounts: 'rolled-up',
  });

  it('stays flat for a source that did not roll its counts up', () => {
    const terms: CatalogFacets['categories'] = [
      { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
      { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', count: 0, parentId: null },
    ];
    for (const facets of [
      { ...FACETS, categories: terms },
      { ...FACETS, categories: terms, categoryCounts: 'direct' as const },
    ]) {
      expect(values('category', facets)).toEqual([
        { value: 'cup', label: 'Cup', count: 6 },
        { value: 'tableware', label: 'Tableware', count: 0, disabled: true },
      ]);
    }
  });

  it('puts a parent above its children and marks them as children', () => {
    expect(values('category', rolledUp(TREE_TERMS))).toEqual([
      { value: 'blankets', label: 'Blankets', count: 3 },
      { value: 'tableware', label: 'Tableware', count: 9 },
      { value: 'bowl', label: 'Bowl', count: 4, parent: 'tableware' },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
    ]);
  });

  it('never derives a count the platform already rolled up', () => {
    expect(nestCategoryTerms(TREE_TERMS)[1]).toEqual({
      value: 'tableware',
      label: 'Tableware',
      count: 9,
    });
  });

  it('does not hang on a parentId cycle', () => {
    expect(
      nestCategoryTerms([
        { id: 'a', slug: 'a', title: 'A', count: 1, parentId: 'b' },
        { id: 'b', slug: 'b', title: 'B', count: 1, parentId: 'a' },
      ])
    ).toHaveLength(2);
  });
});

describe('a ticked parent category', () => {
  const TREE_FACETS: CatalogFacets = {
    ...FACETS,
    categoryCounts: 'rolled-up',
    categories: [
      { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', count: 6, parentId: null },
      { id: 'cat-bowl', slug: 'bowl', title: 'Bowl', count: 0, parentId: 'cat-tableware' },
      { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
    ],
  };

  it('implies every child, whatever that child counts', () => {
    expect(values('category', TREE_FACETS, ['tableware'])).toEqual([
      { value: 'tableware', label: 'Tableware', count: 6 },
      {
        value: 'bowl',
        label: 'Bowl',
        count: 0,
        parent: 'tableware',
        implied: true,
        disabled: true,
      },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware', implied: true, disabled: true },
    ]);
  });

  it('leaves the children operable when the parent is not ticked', () => {
    expect(values('category', TREE_FACETS, [])).toEqual([
      { value: 'tableware', label: 'Tableware', count: 6 },
      { value: 'bowl', label: 'Bowl', count: 0, parent: 'tableware', disabled: true },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
    ]);
  });
});

describe('availabilityFacetValues', () => {
  it('offers "In stock only" when the store can read stock', () => {
    expect(availabilityFacetValues(FACETS, {}, AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
    ]);
  });

  it('offers nothing when the facets omit availability, bar a value already ticked', () => {
    const { availability: _omitted, ...noStock } = FACETS;
    expect(availabilityFacetValues(noStock, {}, AVAILABILITY)).toEqual([]);
    expect(availabilityFacetValues(noStock, { availability: ['in_stock'] }, AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 0 },
    ]);
    expect(
      availabilityFacetValues(noStock, { availability: ['out_of_stock'] }, AVAILABILITY)
    ).toEqual([{ value: 'out_of_stock', label: 'Out of stock', count: 0 }]);
  });

  /** `facets.toggles[]` folds in as more switch rows beside "In stock only", each under its own
   *  `toggle:<key>` selection rather than `availability`'s. */
  it('folds facets.toggles[] in as more switch rows', () => {
    const withToggles: CatalogFacets = {
      ...FACETS,
      toggles: [{ key: 'on_sale', label: 'On sale', count: 12 }],
    };
    expect(availabilityFacetValues(withToggles, {}, AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
      { value: 'on_sale', label: 'On sale', count: 12 },
    ]);
    expect(
      availabilityFacetValues(withToggles, { [toggleSourceFor('on_sale')]: ['1'] }, AVAILABILITY)
    ).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
      { value: 'on_sale', label: 'On sale', count: 12 },
    ]);
  });

  it('disables a toggle nothing is left for, unless it is already on', () => {
    const withToggles: CatalogFacets = {
      ...FACETS,
      toggles: [{ key: 'on_sale', label: 'On sale', count: 0 }],
    };
    expect(availabilityFacetValues(withToggles, {}, AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
      { value: 'on_sale', label: 'On sale', count: 0, disabled: true },
    ]);
    expect(
      availabilityFacetValues(withToggles, { [toggleSourceFor('on_sale')]: ['1'] }, AVAILABILITY)
    ).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
      { value: 'on_sale', label: 'On sale', count: 0 },
    ]);
  });

  it('keeps a selected toggle the store has stopped sending, unlabelled', () => {
    expect(
      availabilityFacetValues(FACETS, { [toggleSourceFor('on_sale')]: ['1'] }, AVAILABILITY)
    ).toEqual([
      { value: 'in_stock', label: 'In stock only', count: 41 },
      { value: 'on_sale', label: 'on_sale', count: 0 },
    ]);
  });
});

describe('queryKeyFor and the toggle vocabulary', () => {
  it('camelCases a toggle source’s own key for the one query parameter it reads and writes', () => {
    expect(toggleQueryKey('on_sale')).toBe('onSale');
    expect(toggleQueryKey('pre_order')).toBe('preOrder');
    expect(toggleQueryKey('onsale')).toBe('onsale');
    expect(queryKeyFor(toggleSourceFor('on_sale'))).toBe('onSale');
  });

  it('round-trips toggleSourceFor/toggleKeyOf', () => {
    expect(toggleKeyOf(toggleSourceFor('on_sale'))).toBe('on_sale');
    expect(toggleKeyOf('option:colour')).toBeNull();
    expect(toggleKeyOf('toggle:')).toBeNull();
  });

  it('leaves an option source’s own bare key as its query key', () => {
    expect(queryKeyFor(optionSourceFor('colour'))).toBe('colour');
    expect(queryKeyFor('category')).toBe('category');
  });
});

describe('usableOptionKey', () => {
  it('refuses a key that collides with a fixed source or a route field', () => {
    for (const key of [
      'category',
      'collection',
      'price',
      'availability',
      'sort',
      'page',
      'columns',
    ]) {
      expect(usableOptionKey(key)).toBeNull();
    }
    expect(usableOptionKey('fabric')).toBe('fabric');
    expect(usableOptionKey(null)).toBeNull();
  });
});

describe('buildFilterFacets', () => {
  const baseOptions = {
    facets: FACETS,
    selection: {} as FilterSelection,
    availability: AVAILABILITY,
    categoryScopeSlug: null,
    unfilterable: new Set<string>(),
    labelFor: (source: FilterSource) => `Label:${source}`,
    colourLayout: 'list' as const,
    price: { min: 24, max: 180, step: 1, slider: true, currency: true },
  };

  it('builds one facet per row, in order, dropping a source with nothing to offer', () => {
    const out = buildFilterFacets(
      [{ source: 'category' }, { source: 'option:size' }, { source: 'price' }],
      baseOptions
    );
    // `option:size` has no store data in `FACETS`, so it is dropped — price always stays.
    expect(out.map((facet) => facet.id)).toEqual(['category', 'price']);
    expect(out[0]).toMatchObject({ id: 'category', type: 'list', label: 'Label:category' });
    expect(out[1]).toMatchObject({ id: 'price', type: 'range', min: 24, max: 180 });
  });

  it('drops a source this scope cannot narrow by, and a repeated row', () => {
    const out = buildFilterFacets(
      [{ source: 'category' }, { source: 'category' }, { source: 'collection' }],
      { ...baseOptions, unfilterable: new Set(['collection']) }
    );
    expect(out.map((facet) => facet.id)).toEqual(['category']);
  });

  it('carries the price step, currency and slider flags through', () => {
    const out = buildFilterFacets([{ source: 'price' }], {
      ...baseOptions,
      price: { min: 24, max: 180, step: 10, slider: false, currency: false },
    });
    expect(out[0]).toMatchObject({ step: 10, slider: false, currency: false });
    expect(out[0]).not.toHaveProperty('histogram');
  });

  it('carries a histogram through only when the facets supplied one', () => {
    const withHistogram = buildFilterFacets([{ source: 'price' }], {
      ...baseOptions,
      price: { ...baseOptions.price, histogram: [1, 2, 3] },
    });
    expect(withHistogram[0]?.histogram).toEqual([1, 2, 3]);

    const without = buildFilterFacets([{ source: 'price' }], baseOptions);
    expect(without[0]).not.toHaveProperty('histogram');
  });

  it('gives a colour facet its layout, and a size facet its Size guide link', () => {
    const coloured = buildFilterFacets([{ source: 'option:colour' }], {
      ...baseOptions,
      colourLayout: 'grid',
    });
    expect(coloured[0]).toMatchObject({ type: 'colour', layout: 'grid' });

    const sizedFacets: CatalogFacets = {
      ...FACETS,
      options: [
        {
          key: 'size',
          name: 'size',
          kind: 'none',
          values: [{ value: 'm', label: 'M', count: 14, group: 'Knitwear' }],
        },
      ],
    };
    const sized = buildFilterFacets([{ source: 'option:size' }], {
      ...baseOptions,
      facets: sizedFacets,
      sizeGuideHref: '/pages/size-guide',
    });
    expect(sized[0]).toMatchObject({ type: 'size', sizeGuideHref: '/pages/size-guide' });
    // Never on a facet that is not a size facet.
    expect(coloured[0]).not.toHaveProperty('sizeGuideHref');
  });

  it('folds availability and facets.toggles[] into one toggle facet', () => {
    const withToggles: CatalogFacets = {
      ...FACETS,
      toggles: [{ key: 'on_sale', label: 'On sale', count: 12 }],
    };
    const out = buildFilterFacets([{ source: 'availability' }], {
      ...baseOptions,
      facets: withToggles,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'availability', type: 'toggle' });
    expect(out[0]?.values?.map((value) => value.value)).toEqual(['in_stock', 'on_sale']);
  });

  it('passes a row’s own label and collapsed flag through, else the default label', () => {
    const out = buildFilterFacets([{ source: 'category', label: 'Shop by', collapsed: true }], {
      ...baseOptions,
      labelFor: () => 'Category',
    });
    expect(out[0]).toMatchObject({ label: 'Shop by', collapsed: true });
  });
});

describe('facetSourceMap', () => {
  it('maps every rendered source’s own query key back to itself, price and availability excluded', () => {
    const map = facetSourceMap([
      { source: 'category' },
      { source: 'option:colour' },
      { source: 'price' },
      { source: 'availability' },
    ]);
    expect(map.get('category')).toBe('category');
    expect(map.get('colour')).toBe('option:colour');
    expect(map.has('price')).toBe(false);
    expect(map.has('availability')).toBe(false);
  });
});

describe('panelSelectionFor and applyPanelSelection', () => {
  const span = { min: 24, max: 180 };
  const sources = facetSourceMap([{ source: 'category' }, { source: 'option:colour' }]);

  it('carries every non-empty source through under its own query key, and folds toggles into availability', () => {
    const selection: FilterSelection = {
      category: ['knitwear'],
      'option:colour': ['oat'],
      availability: ['in_stock'],
      [toggleSourceFor('on_sale')]: ['1'],
    };
    expect(panelSelectionFor(selection, { min: '', max: '' }, span)).toEqual({
      category: ['knitwear'],
      colour: ['oat'],
      availability: ['in_stock', 'on_sale'],
    });
  });

  it('adds the price pair only when a bound is set, else leaves the key out', () => {
    expect(panelSelectionFor({}, { min: '', max: '' }, span)).toEqual({});
    expect(panelSelectionFor({}, { min: '50', max: '' }, span)).toEqual({ price: [50, 180] });
  });

  it('is the exact reverse of applyPanelSelection for a selection round trip', () => {
    const selection: FilterSelection = { category: ['knitwear'], availability: ['in_stock'] };
    const panel = panelSelectionFor(selection, { min: '50', max: '150' }, span);
    const back = applyPanelSelection(panel, {
      sources,
      toggleKeys: new Set(),
      priceSpan: span,
      appliedPrice: { min: '50', max: '150' },
    });
    expect(back.selection).toEqual(selection);
    expect(back.price).toEqual({ min: '50', max: '150' });
  });

  it('splits availability’s array back into canonical tokens and known toggle keys, dropping the rest', () => {
    const back = applyPanelSelection(
      { availability: ['in_stock', 'on_sale', 'unknown_toggle'] },
      {
        sources,
        toggleKeys: new Set(['on_sale']),
        priceSpan: span,
        appliedPrice: { min: '', max: '' },
      }
    );
    expect(back.selection).toEqual({
      availability: ['in_stock'],
      [toggleSourceFor('on_sale')]: ['1'],
    });
  });

  it('drops a facet id nothing maps to — a stale key from a facet since removed', () => {
    const back = applyPanelSelection(
      { category: ['knitwear'], gone: ['x'] },
      { sources, toggleKeys: new Set(), priceSpan: span, appliedPrice: { min: '', max: '' } }
    );
    expect(back.selection).toEqual({ category: ['knitwear'] });
  });

  /** `rangeFromSlider` is idempotent when nothing moved — safe to call on every `change`, not only
   *  a price one. */
  it('leaves the price range untouched when the reported pair has not moved', () => {
    const back = applyPanelSelection(
      { category: ['knitwear'], price: [50, 150] },
      { sources, toggleKeys: new Set(), priceSpan: span, appliedPrice: { min: '50', max: '150' } }
    );
    expect(back.price).toEqual({ min: '50', max: '150' });
  });

  it('reads no price key as the span’s own ends — no bound', () => {
    const back = applyPanelSelection(
      {},
      { sources, toggleKeys: new Set(), priceSpan: span, appliedPrice: { min: '50', max: '150' } }
    );
    expect(back.price).toEqual({ min: '', max: '' });
  });
});

describe('the price range’s query grammar', () => {
  it('round-trips a range, either end open', () => {
    for (const raw of ['1200-4800', '1200-', '-4800']) {
      expect(formatPriceRange(parsePriceRange(raw))).toBe(raw);
    }
  });

  it('reads no range at all as no filter', () => {
    expect(parsePriceRange(undefined)).toEqual({ min: '', max: '' });
    expect(parsePriceRange('-')).toEqual({ min: '', max: '' });
    expect(hasPriceRange({ min: '', max: '' })).toBe(false);
    expect(formatPriceRange({ min: '', max: '' })).toBeNull();
  });

  it('sanitises what a URL can carry — digits only, no leading zeroes, bounded length', () => {
    expect(parsePriceRange('0050-00')).toEqual({ min: '50', max: '0' });
    expect(parsePriceRange('abc-1e9')).toEqual({ min: '', max: '19' });
    expect(parsePriceRange('1234567890123-')).toEqual({ min: '123456789', max: '' });
  });
});

describe('the slider’s own pair', () => {
  const span = { min: 24, max: 180 };

  it('spans the catalogue when nothing is filtered, and the shopper’s bounds when something is', () => {
    expect(sliderValueFor({ min: '', max: '' }, span)).toEqual([24, 180]);
    expect(sliderValueFor({ min: '50', max: '' }, span)).toEqual([50, 180]);
    expect(sliderValueFor({ min: '', max: '150' }, span)).toEqual([24, 150]);
  });

  it('reads a thumb moved to either end back as no bound', () => {
    expect(rangeFromSlider([24, 180], span, { min: '50', max: '150' })).toEqual({
      min: '',
      max: '',
    });
    expect(rangeFromSlider([50, 180], span, { min: '50', max: '150' })).toEqual({
      min: '50',
      max: '',
    });
    expect(rangeFromSlider([24, 150], span, { min: '50', max: '150' })).toEqual({
      min: '',
      max: '150',
    });
    expect(rangeFromSlider([50, 150], span)).toEqual({ min: '50', max: '150' });
    expect(rangeFromSlider([10, 400], span)).toEqual({ min: '', max: '' });
  });

  it('never rewrites the end a gesture did not touch', () => {
    const narrowed = { min: 50, max: 150 };
    const applied = { min: '50', max: '150' };
    expect(rangeFromSlider([51, 150], narrowed, applied)).toEqual({ min: '51', max: '150' });
    expect(rangeFromSlider([50, 149], narrowed, applied)).toEqual({ min: '50', max: '149' });
    expect(rangeFromSlider([60, 180], span, { min: '50', max: '' })).toEqual({
      min: '60',
      max: '',
    });
    expect(rangeFromSlider([24, 140], span, { min: '', max: '150' })).toEqual({
      min: '',
      max: '140',
    });
  });
});

describe('the price span', () => {
  it('is the lowest and highest price of the products it is given', () => {
    expect(priceSpanOf([{ price: { amount: 96 } }, { price: { amount: 24 } }])).toEqual({
      min: 24,
      max: 96,
    });
    expect(priceSpanOf([])).toBeNull();
  });

  it('only ever widens', () => {
    expect(widenPriceSpan({ min: 50, max: 150 }, { min: 24, max: 96 })).toEqual({
      min: 24,
      max: 150,
    });
    expect(widenPriceSpan(null, { min: 24, max: 96 })).toEqual({ min: 24, max: 96 });
    expect(widenPriceSpan({ min: 24, max: 96 }, null)).toEqual({ min: 24, max: 96 });
    expect(widenPriceSpan(null, null)).toBeNull();
  });
});

describe('spanWithRange', () => {
  it('widens the span to hold the shopper’s own bounds', () => {
    expect(spanWithRange({ min: 96, max: 96 }, { min: '50', max: '150' })).toEqual({
      min: 50,
      max: 150,
    });
    expect(spanWithRange({ min: 96, max: 96 }, { min: '50', max: '' })).toEqual({
      min: 50,
      max: 96,
    });
  });

  it('leaves a span alone when nothing is filtered', () => {
    expect(spanWithRange({ min: 24, max: 180 }, { min: '', max: '' })).toEqual({
      min: 24,
      max: 180,
    });
    expect(spanWithRange({ min: 24, max: 180 }, { min: '50', max: '150' })).toEqual({
      min: 24,
      max: 180,
    });
  });
});

describe('defaultPriceStep', () => {
  it('is one unit of the store currency, and 100 for ISK', () => {
    expect(defaultPriceStep('USD')).toBe(1);
    expect(defaultPriceStep('EUR')).toBe(1);
    expect(defaultPriceStep('ISK')).toBe(100);
    expect(defaultPriceStep(undefined)).toBe(1);
  });
});

describe('fitPriceStep', () => {
  it('falls back to one unit when the catalogue’s span is smaller than ten steps', () => {
    expect(fitPriceStep(100, { min: 18, max: 68 })).toBe(1);
    expect(fitPriceStep(100, { min: 1200, max: 48000 })).toBe(100);
    expect(fitPriceStep(100, { min: 0, max: 1000 })).toBe(100);
    expect(fitPriceStep(100, { min: 0, max: 999 })).toBe(1);
  });

  it('leaves a one-unit step and a collapsed span alone', () => {
    expect(fitPriceStep(1, { min: 24, max: 180 })).toBe(1);
    expect(fitPriceStep(1, { min: 5, max: 5 })).toBe(1);
    expect(fitPriceStep(100, { min: 5, max: 5 })).toBe(100);
  });
});

describe('optionKeyOf', () => {
  it('reads the key off an option source, and nothing off any other', () => {
    expect(optionKeyOf('option:colour')).toBe('colour');
    expect(optionKeyOf('option:')).toBeNull();
    expect(optionKeyOf('category')).toBeNull();
    expect(optionKeyOf(toggleSourceFor('on_sale'))).toBeNull();
  });
});
