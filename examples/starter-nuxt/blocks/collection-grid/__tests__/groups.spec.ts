import { describe, expect, it } from 'vitest';
import {
  defaultPriceStep,
  fitPriceStep,
  formatPriceRange,
  groupValuesFor,
  hasPriceRange,
  nestCategoryTerms,
  parsePriceRange,
  priceSpanOf,
  rangeFromSlider,
  sliderValueFor,
  spanWithRange,
  widenPriceSpan,
} from '../parts/groups';
import type { CatalogFacets } from '../../../app/storefront/types';

/**
 * The filter groups' pure rules: the price grammar the URL, the request and the slider all share,
 * and the one function that turns a storefront's facets into the values a group offers. Tested
 * without Vue, so each rule can be pinned on its own — `FilterGroups.spec.ts` proves the controls
 * drawn from them and `Block.spec.ts` the round trip through the route.
 */

const AVAILABILITY = { inStock: 'In stock', outOfStock: 'Out of stock' };

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
      values: [
        { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
        { value: 'clay', label: 'Clay', count: 0 },
      ],
    },
  ],
};

describe('groupValuesFor', () => {
  it('reads category and collection terms by their slug, labelled by their title', () => {
    expect(groupValuesFor('category', FACETS, [], AVAILABILITY)).toEqual([
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'discontinued', label: 'Discontinued', count: 0, disabled: true },
    ]);
    expect(groupValuesFor('collection', FACETS, [], AVAILABILITY)).toEqual([
      { value: 'the-winter-edit', label: 'The winter edit', count: 48 },
    ]);
  });

  it('names the two availability counts from the theme’s own strings', () => {
    expect(groupValuesFor('availability', FACETS, [], AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock', count: 41 },
      { value: 'out_of_stock', label: 'Out of stock', count: 7 },
    ]);
  });

  it('maps an option source to the store’s own option key, swatches and all', () => {
    expect(groupValuesFor('option:colour', FACETS, [], AVAILABILITY)).toEqual([
      { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
      { value: 'clay', label: 'Clay', count: 0, disabled: true },
    ]);
    // No `size` option in these facets: no values, never invented ones.
    expect(groupValuesFor('option:size', FACETS, [], AVAILABILITY)).toEqual([]);
  });

  it('never disables a value the shopper has selected, whatever it counts', () => {
    expect(groupValuesFor('category', FACETS, ['discontinued'], AVAILABILITY)).toEqual([
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'discontinued', label: 'Discontinued', count: 0 },
    ]);
  });

  it('keeps a selected value the facets no longer list at all', () => {
    const values = groupValuesFor('option:colour', FACETS, ['moss'], AVAILABILITY);
    // The store's own word for it is gone with the value, so the raw one is all there is to show —
    // which is true of every family but `availability`, whose two words are the theme's own.
    expect(values.at(-1)).toEqual({ value: 'moss', label: 'moss', count: 0 });
    const categories = groupValuesFor('category', FACETS, ['linens'], AVAILABILITY);
    expect(categories.at(-1)).toEqual({ value: 'linens', label: 'linens', count: 0 });
  });

  /**
   * A store whose stock cannot be read answers **no** `availability` facet rather than two zeroes
   * (`CatalogFacets.availability`), and a group with no values is one the block does not render —
   * so the shopper is never offered a filter whose counts are unknown and whose request is an
   * error. A value they have already ticked is still kept, or the filter could not be removed.
   */
  it('offers nothing for availability when the facets omit it, bar a value already ticked', () => {
    const { availability: _omitted, ...noStock } = FACETS;
    expect(groupValuesFor('availability', noStock, [], AVAILABILITY)).toEqual([]);
    // A kept value is named by the **theme's** own strings, not the platform's spelling: this is
    // what a shopper arriving on a shared `?availability=in_stock` link sees while stock cannot be
    // read, and `in_stock` on a checkbox and a chip is untranslated in every locale.
    expect(groupValuesFor('availability', noStock, ['in_stock'], AVAILABILITY)).toEqual([
      { value: 'in_stock', label: 'In stock', count: 0 },
    ]);
    expect(groupValuesFor('availability', noStock, ['out_of_stock'], AVAILABILITY)).toEqual([
      { value: 'out_of_stock', label: 'Out of stock', count: 0 },
    ]);
    // Every other group still draws: only the one family the store cannot count goes.
    expect(groupValuesFor('category', noStock, [], AVAILABILITY)).toHaveLength(2);
  });

  it('offers nothing at all without facets, and nothing for price either way', () => {
    expect(groupValuesFor('category', undefined, [], AVAILABILITY)).toEqual([]);
    expect(groupValuesFor('price', FACETS, [], AVAILABILITY)).toEqual([]);
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
describe('the category group', () => {
  /** Contract 3.8.0's own shape: depth-first by title, each count already the subtree's, `parentId`
   *  normalised to `null` on a root by the gateway. */
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

  /**
   * **The whole point of the discriminator.** A gateway that counts assignments matches a
   * `categoryId` by direct membership only, so a `Tableware` row there is a filter it cannot honour:
   * the shopper ticks it and gets an empty grid under a chip saying otherwise. Flat is not a
   * degradation, it is the honest answer — no parent row, no indent, no implication.
   */
  it('stays flat for a source that did not roll its counts up', () => {
    const terms: CatalogFacets['categories'] = [
      { id: 'cat-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'cat-tableware' },
      { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', count: 0, parentId: null },
    ];
    for (const facets of [
      { ...FACETS, categories: terms },
      { ...FACETS, categories: terms, categoryCounts: 'direct' as const },
    ]) {
      expect(groupValuesFor('category', facets, [], AVAILABILITY)).toEqual([
        { value: 'cup', label: 'Cup', count: 6 },
        // Offered disabled rather than dropped, by the ordinary zero-count rule — and with no
        // `parent`, so nothing indents and nothing is implied.
        { value: 'tableware', label: 'Tableware', count: 0, disabled: true },
      ]);
    }
  });

  /** Parent first, then its children; a root with no children is simply a row. */
  it('puts a parent above its children and marks them as children', () => {
    expect(groupValuesFor('category', rolledUp(TREE_TERMS), [], AVAILABILITY)).toEqual([
      { value: 'blankets', label: 'Blankets', count: 3 },
      { value: 'tableware', label: 'Tableware', count: 9 },
      { value: 'bowl', label: 'Bowl', count: 4, parent: 'tableware' },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
    ]);
  });

  /**
   * **No count is derived.** 3.8.0's parent count is the subtree's, deduplicated, and explicitly not
   * the sum of its children — a product in Cups and in Bowls is one product and two counts — so
   * `Tableware` reads 9 and not 4 + 6.
   */
  it('never derives a count the platform already rolled up', () => {
    expect(nestCategoryTerms(TREE_TERMS)[1]).toEqual({
      value: 'tableware',
      label: 'Tableware',
      count: 9,
    });
  });

  /**
   * **Order is the source's.** 3.8.0 answers depth-first by title, so a list that arrives clustered
   * comes out untouched — no re-sorting by count, by title or by anything else.
   */
  it('preserves a depth-first list exactly as it arrived', () => {
    expect(nestCategoryTerms(TREE_TERMS).map((value) => value.value)).toEqual([
      'blankets',
      'tableware',
      'bowl',
      'cup',
    ]);
  });

  /**
   * A source that places nothing — no `parentId` on any term — comes out flat even when it says its
   * counts are rolled up. The pass is skipped, not approximated: nothing is invented from slugs.
   */
  it('leaves an unplaced family flat', () => {
    expect(
      nestCategoryTerms([
        { id: 'c1', slug: 'knitwear', title: 'Knitwear', count: 18 },
        { id: 'c2', slug: 'ceramics', title: 'Ceramics', count: 14 },
      ])
    ).toEqual([
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'ceramics', label: 'Ceramics', count: 14 },
    ]);
  });

  /**
   * One indent, ever. A category three deep is drawn under its top-most listed ancestor rather than at
   * its own depth — a filter panel is not a tree view and a 15rem sidebar has no third indent — and
   * every count is still the platform's own.
   */
  it('flattens a third level under its top ancestor', () => {
    expect(
      nestCategoryTerms([
        { id: 'c-tableware', slug: 'tableware', title: 'Tableware', count: 9, parentId: null },
        { id: 'c-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'c-tableware' },
        { id: 'c-espresso', slug: 'espresso', title: 'Espresso', count: 2, parentId: 'c-cup' },
      ])
    ).toEqual([
      { value: 'tableware', label: 'Tableware', count: 9 },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
      { value: 'espresso', label: 'Espresso', count: 2, parent: 'tableware' },
    ]);
  });

  /** A child whose parent the facets never listed is a top row, not a lost one. */
  it('keeps a child whose parent is not listed as a row of its own', () => {
    expect(
      nestCategoryTerms([{ id: 'c-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'c-gone' }])
    ).toEqual([{ value: 'cup', label: 'Cup', count: 6 }]);
  });

  /** This runs inside a `computed`, where a hang is the whole block. */
  it('does not hang on a parentId cycle', () => {
    expect(
      nestCategoryTerms([
        { id: 'a', slug: 'a', title: 'A', count: 1, parentId: 'b' },
        { id: 'b', slug: 'b', title: 'B', count: 1, parentId: 'a' },
      ])
    ).toHaveLength(2);
  });
});

/**
 * A ticked parent carries the whole branch: the request sends the parent's category id and the
 * platform expands it over the descendants, so a child's own checkbox is not a filter the shopper can
 * set or unset from there. Only ever reachable on a rolled-up family — the flat one has no parent row.
 */
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
    expect(groupValuesFor('category', TREE_FACETS, ['tableware'], AVAILABILITY)).toEqual([
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

  /** Untouched, the children are ordinary values again — and a zero-count one is disabled by the
   *  ordinary rule, not by implication. */
  it('leaves the children operable when the parent is not ticked', () => {
    expect(groupValuesFor('category', TREE_FACETS, [], AVAILABILITY)).toEqual([
      { value: 'tableware', label: 'Tableware', count: 6 },
      { value: 'bowl', label: 'Bowl', count: 0, parent: 'tableware', disabled: true },
      { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
    ]);
  });

  /** A child ticked on its own stays ticked on its own: nothing implies it, so it stays removable. */
  it('does not imply a sibling of a ticked child', () => {
    const values = groupValuesFor('category', TREE_FACETS, ['cup'], AVAILABILITY);
    expect(values.find((value) => value.value === 'cup')).toEqual({
      value: 'cup',
      label: 'Cup',
      count: 6,
      parent: 'tableware',
    });
    expect(values.find((value) => value.value === 'bowl')?.implied).toBeUndefined();
  });
});

/**
 * `?price=1200-4800`: one query key, one request value, both ends optional. The round trip has to
 * be exact — the block seeds its state from this string and writes the same string back — or a
 * shared URL and the grid disagree, which is the defect the whole filter state lives to avoid.
 */
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

  /** A thumb the shopper moved to the span's own end is "no bound", which is what lets a filter be
   *  dragged off again — and what keeps an untouched control out of the URL entirely. */
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
    // Outside the span (a stale pair, a span that moved) is still no bound, never a bound beyond it.
    expect(rangeFromSlider([10, 400], span)).toEqual({ min: '', max: '' });
  });

  /**
   * **The end that did not move keeps the bound the shopper applied**, whatever the track's extent
   * says about it.
   *
   * The track is widened to hold their own bounds (`spanWithRange`), because the facets' price span
   * is counted with every filter *but* price and can narrow inside their range. So on
   * `?price=50-150&colour=oat` both thumbs sit on "an end", and deriving both ends from the pair
   * read the untouched one as "no bound": one ArrowRight on the minimum wrote `51-` and the $150
   * ceiling was gone — from the URL, the chip and the request — with the track still ending at 150.
   */
  it('never rewrites the end a gesture did not touch', () => {
    const narrowed = { min: 50, max: 150 };
    const applied = { min: '50', max: '150' };
    expect(rangeFromSlider([51, 150], narrowed, applied)).toEqual({ min: '51', max: '150' });
    expect(rangeFromSlider([50, 149], narrowed, applied)).toEqual({ min: '50', max: '149' });
    // Half a range is the same story: the open end stays open.
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

  /** The fallback span (no facets) shrinks as the shopper narrows the range, and a track that
   *  shrinks under the thumb can only ever be narrowed — so the widest seen is kept. */
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

/**
 * The facets' price span is counted with every filter *but* price, so it narrows as the other
 * groups narrow. A slider cannot show a value outside its bounds, so the shopper's own bounds are
 * folded in — otherwise a 50–150 range read back as 96–96 as soon as a colour was ticked, and the
 * next drag would write that back as their range.
 */
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
    // A store that publishes no currency still gets a usable grid.
    expect(defaultPriceStep(undefined)).toBe(1);
  });
});

describe('fitPriceStep', () => {
  /** A step the span cannot hold ten of leaves a two-stop track, where every value between the
   *  ends — a typed figure, a bound out of a shared URL — snaps to one end or the other. */
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
