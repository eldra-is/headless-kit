import { describe, expect, it } from 'vitest';
import {
  defaultPriceStep,
  fitPriceStep,
  formatPriceRange,
  groupValuesFor,
  hasPriceRange,
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
    expect(values.at(-1)).toEqual({ value: 'moss', label: 'moss', count: 0 });
  });

  it('offers nothing at all without facets, and nothing for price either way', () => {
    expect(groupValuesFor('category', undefined, [], AVAILABILITY)).toEqual([]);
    expect(groupValuesFor('price', FACETS, [], AVAILABILITY)).toEqual([]);
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
