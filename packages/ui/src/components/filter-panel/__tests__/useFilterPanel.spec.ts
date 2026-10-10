import { describe, expect, it } from 'vitest';
import type { FilterFacet, FilterFacetValue, FilterSelection } from '../types';
import {
  FILTER_SEARCH_FROM,
  FILTER_VALUES_SHOWN,
  appliedFilters,
  clearedSelection,
  dropOmittedFacets,
  facetCanShowAll,
  facetHasHiddenValues,
  facetIsRenderable,
  facetIsSearchable,
  facetRows,
  facetSelectedCount,
  facetStartsOpen,
  facetSummaryLabels,
  facetValues,
  foldForSearch,
  hasSelection,
  histogramBarInRange,
  isRangeAtLimits,
  isRangeSelection,
  isValueDisabled,
  isValueSelected,
  matchesSearch,
  rangeLimits,
  rangeOf,
  removeValue,
  renderableFacets,
  selectedValues,
  setRange,
  sizeSystemGroups,
  toggleValue,
  visibleFacetValues,
} from '../useFilterPanel';

/** A value with a count, which is what every facet value really is. */
function value(
  id: string,
  label = id.toUpperCase(),
  count = 5,
  extra: Partial<FilterFacetValue> = {}
): FilterFacetValue {
  return { value: id, label, count, ...extra };
}

/** `n` values named `v1…vn`, for the threshold suites. */
function values(n: number): FilterFacetValue[] {
  return Array.from({ length: n }, (_, index) => value(`v${index + 1}`, `Value ${index + 1}`));
}

const CATEGORY: FilterFacet = {
  id: 'category',
  label: 'Category',
  type: 'list',
  values: [
    value('sweaters', 'Sweaters', 18),
    value('cardigans', 'Cardigans', 9),
    value('blankets', 'Blankets', 4),
  ],
};

const COLOUR: FilterFacet = {
  id: 'colour',
  label: 'Colour',
  type: 'colour',
  values: [
    value('black', 'Black', 14, { swatch: '#1f1d1b' }),
    value('brown', 'Brown', 9, { swatch: '#7a5236' }),
    value('natural', 'Natural', 6, { swatch: '#dccfb8' }),
    value('navy', 'Navy', 0, { swatch: '#27324a' }),
  ],
};

const PRICE: FilterFacet = {
  id: 'price',
  label: 'Price',
  type: 'range',
  min: 40,
  max: 240,
  step: 1,
};

const AVAILABILITY: FilterFacet = {
  id: 'availability',
  label: 'Availability',
  type: 'toggle',
  values: [value('in_stock', 'In stock only', 41)],
};

describe('the selection model', () => {
  it('reads a facet’s chosen values, and nothing for a facet with none', () => {
    const selection: FilterSelection = { colour: ['brown', 'natural'] };
    expect(selectedValues(selection, 'colour')).toEqual(['brown', 'natural']);
    expect(selectedValues(selection, 'category')).toEqual([]);
    expect(isValueSelected(selection, 'colour', 'brown')).toBe(true);
    expect(isValueSelected(selection, 'colour', 'black')).toBe(false);
  });

  /** A span is not a set of values, and a caller asking for the set must not be handed numbers. */
  it('reads a range’s key as no chosen values', () => {
    expect(selectedValues({ price: [40, 160] }, 'price')).toEqual([]);
    expect(isRangeSelection([40, 160])).toBe(true);
    expect(isRangeSelection(['40', '160'])).toBe(false);
    expect(isRangeSelection(undefined)).toBe(false);
  });

  it('appends a checked value and keeps the rest', () => {
    const next = toggleValue({ colour: ['brown'] }, 'colour', 'natural', true);
    expect(next).toEqual({ colour: ['brown', 'natural'] });
  });

  it('writes a new object rather than mutating the one it was given', () => {
    const selection: FilterSelection = { colour: ['brown'] };
    const next = toggleValue(selection, 'colour', 'natural', true);
    expect(selection).toEqual({ colour: ['brown'] });
    expect(next).not.toBe(selection);
  });

  /**
   * The key is removed, not left as `[]`. One representation of "nothing selected here" is what
   * lets `hasSelection` and the URL grammar agree; proven by `toEqual` on the whole object, which
   * fails for a leftover empty array.
   */
  it('removes the facet’s key when the last value goes', () => {
    expect(toggleValue({ colour: ['brown'], size: ['m'] }, 'colour', 'brown', false)).toEqual({
      size: ['m'],
    });
  });

  it('is a no-op when the value is already in the state asked for', () => {
    const selection: FilterSelection = { colour: ['brown'] };
    expect(toggleValue(selection, 'colour', 'brown', true)).toBe(selection);
    expect(toggleValue(selection, 'colour', 'natural', false)).toBe(selection);
  });

  it('removes a value whether it was there or not', () => {
    expect(removeValue({ colour: ['brown', 'natural'] }, 'colour', 'brown')).toEqual({
      colour: ['natural'],
    });
    expect(removeValue({ colour: ['natural'] }, 'colour', 'brown')).toEqual({
      colour: ['natural'],
    });
  });

  it('clears everything, every range included', () => {
    expect(clearedSelection()).toEqual({});
  });
});

describe('a range facet’s span', () => {
  it('falls back to the facet’s own limits with nothing held', () => {
    expect(rangeLimits(PRICE)).toEqual([40, 240]);
    expect(rangeOf({}, PRICE)).toEqual([40, 240]);
    expect(isRangeAtLimits({}, PRICE)).toBe(true);
  });

  it('falls back to the spec’s 0–100 for a facet that gives no bounds', () => {
    expect(rangeLimits({ id: 'x', label: 'X', type: 'range' })).toEqual([0, 100]);
  });

  it('floors max at min, so inverted bounds collapse rather than invert', () => {
    expect(rangeLimits({ id: 'x', label: 'X', type: 'range', min: 90, max: 10 })).toEqual([90, 90]);
  });

  it('clamps a held span into the bounds and puts it the right way round', () => {
    expect(rangeOf({ price: [10, 500] }, PRICE)).toEqual([40, 240]);
    expect(rangeOf({ price: [160, 80] }, PRICE)).toEqual([80, 160]);
  });

  /**
   * A range at its limits excludes nothing, so it is stored as **nothing**: otherwise "no price
   * filter" and "the whole price range" would be two selections meaning the same thing, the head's
   * **Clear all** would stay on screen with nothing to clear, and the URL would carry a
   * `?price=40-240` that says nothing.
   */
  it('drops the key when a span is written at the limits', () => {
    expect(setRange({ price: [80, 160], size: ['m'] }, PRICE, [40, 240])).toEqual({ size: ['m'] });
    expect(setRange({}, PRICE, [40, 240])).toEqual({});
  });

  it('drops the key for a span wider than the limits too', () => {
    expect(setRange({ price: [80, 160] }, PRICE, [0, 1000])).toEqual({});
  });

  it('writes a narrowed span', () => {
    expect(setRange({}, PRICE, [80, 160])).toEqual({ price: [80, 160] });
    expect(isRangeAtLimits({ price: [80, 160] }, PRICE)).toBe(false);
  });

  it('writes a span that moves one end only', () => {
    expect(setRange({}, PRICE, [40, 160])).toEqual({ price: [40, 160] });
    expect(setRange({}, PRICE, [80, 240])).toEqual({ price: [80, 240] });
  });
});

describe('the selected-count badge', () => {
  it('counts the checked values of a facet', () => {
    expect(facetSelectedCount(COLOUR, { colour: ['brown', 'natural'] })).toBe(2);
    expect(facetSelectedCount(COLOUR, {})).toBe(0);
  });

  it('counts a switched-on switch', () => {
    expect(facetSelectedCount(AVAILABILITY, { availability: ['in_stock'] })).toBe(1);
  });

  /** Spec → Behaviour: "a moved range does not count". A badge saying "1" counts nothing. */
  it('never counts a moved range', () => {
    expect(facetSelectedCount(PRICE, { price: [80, 160] })).toBe(0);
  });
});

describe('the collapsed summary', () => {
  it('lists the selected labels', () => {
    expect(facetSummaryLabels(COLOUR, { colour: ['brown', 'natural'] })).toEqual([
      'Brown',
      'Natural',
    ]);
  });

  /**
   * In the **facet's** value order, not the order they were checked in: a summary that reordered
   * itself as the shopper ticked would read as a different group each time.
   */
  it('keeps the facet’s own value order whatever order they were checked in', () => {
    expect(facetSummaryLabels(COLOUR, { colour: ['natural', 'black'] })).toEqual([
      'Black',
      'Natural',
    ]);
  });

  it('is empty with nothing selected, and empty for a range', () => {
    expect(facetSummaryLabels(COLOUR, {})).toEqual([]);
    expect(facetSummaryLabels(PRICE, { price: [80, 160] })).toEqual([]);
  });

  it('ignores a selected value the facet no longer offers', () => {
    expect(facetSummaryLabels(COLOUR, { colour: ['brown', 'ochre'] })).toEqual(['Brown']);
  });
});

describe('which facets start open', () => {
  it('opens a facet that is not marked collapsed', () => {
    expect(facetStartsOpen(COLOUR, {})).toBe(true);
  });

  it('closes a collapsed facet with nothing selected', () => {
    expect(facetStartsOpen({ ...COLOUR, collapsed: true }, {})).toBe(false);
  });

  /** Spec → Facet shape: "A group with a selected value always starts open." */
  it('opens a collapsed facet that carries a selection', () => {
    expect(facetStartsOpen({ ...COLOUR, collapsed: true }, { colour: ['brown'] })).toBe(true);
  });

  /**
   * A range counts as selected here even though its badge does not: a facet whose track has been
   * moved is one the shopper is using, and opening it is the only way they can see what it says.
   */
  it('opens a collapsed range whose span has moved, and leaves one at its limits closed', () => {
    const collapsed = { ...PRICE, collapsed: true };
    expect(facetStartsOpen(collapsed, { price: [80, 160] })).toBe(true);
    expect(facetStartsOpen(collapsed, {})).toBe(false);
    expect(facetStartsOpen(collapsed, { price: [40, 240] })).toBe(false);
  });
});

describe('whether Clear all is on screen', () => {
  const facets = [CATEGORY, COLOUR, PRICE, AVAILABILITY];

  it('is hidden with nothing selected and every range at its limits', () => {
    expect(hasSelection(facets, {})).toBe(false);
    expect(hasSelection(facets, { price: [40, 240] })).toBe(false);
  });

  it('is shown for a checked value, a switched switch or a moved range', () => {
    expect(hasSelection(facets, { colour: ['brown'] })).toBe(true);
    expect(hasSelection(facets, { availability: ['in_stock'] })).toBe(true);
    expect(hasSelection(facets, { price: [80, 160] })).toBe(true);
  });

  /** A stale key from a restored URL cannot keep the button on screen with nothing to clear. */
  it('ignores a key for a facet that is not being shown', () => {
    expect(hasSelection(facets, { material: ['linen'] })).toBe(false);
  });

  it('is false for no facets at all', () => {
    expect(hasSelection([], { colour: ['brown'] })).toBe(false);
  });
});

describe('the applied chips', () => {
  const facets = [CATEGORY, COLOUR, PRICE];

  it('draws one per selected value, facet by facet in each facet’s own order', () => {
    expect(
      appliedFilters(facets, { colour: ['natural', 'black'], category: ['sweaters'] })
    ).toEqual([
      { facetId: 'category', facetLabel: 'Category', value: 'sweaters', label: 'Sweaters' },
      { facetId: 'colour', facetLabel: 'Colour', value: 'black', label: 'Black' },
      { facetId: 'colour', facetLabel: 'Colour', value: 'natural', label: 'Natural' },
    ]);
  });

  /** A span has no one value a chip could take off; removing "the price" is Clear all's job. */
  it('draws none for a range', () => {
    expect(appliedFilters(facets, { price: [80, 160] })).toEqual([]);
  });

  /** A chip the panel cannot name is a chip nobody can act on. */
  it('skips a selected value the facet no longer offers', () => {
    expect(appliedFilters(facets, { colour: ['ochre'] })).toEqual([]);
  });

  it('draws none with nothing selected', () => {
    expect(appliedFilters(facets, {})).toEqual([]);
  });
});

describe('the facet search', () => {
  it('folds case and accents away', () => {
    expect(foldForSearch('Créme Brûlée')).toBe('creme brulee');
    expect(foldForSearch('ÓSK')).toBe('osk');
    expect(foldForSearch('Ægir')).toBe('ægir');
  });

  it('matches a query against a label, ignoring case and accents either way round', () => {
    const creme = value('creme', 'Crème');
    expect(matchesSearch(creme, 'creme')).toBe(true);
    expect(matchesSearch(creme, 'CRÈME')).toBe(true);
    expect(matchesSearch(value('osk', 'Osk'), 'ósk')).toBe(true);
    expect(matchesSearch(creme, 'linen')).toBe(false);
  });

  it('matches a run anywhere in the label, not only its start', () => {
    expect(matchesSearch(value('x', 'Merino wool'), 'wool')).toBe(true);
  });

  it('matches everything for an empty or whitespace query', () => {
    expect(matchesSearch(value('x', 'Linen'), '')).toBe(true);
    expect(matchesSearch(value('x', 'Linen'), '   ')).toBe(true);
  });

  /** The value, not its id: an id is a URL token the shopper never sees or types. */
  it('matches the label rather than the value', () => {
    expect(matchesSearch(value('mer-wool', 'Lambswool'), 'lambswool')).toBe(true);
    expect(matchesSearch(value('mer-wool', 'Lambswool'), 'mer-wool')).toBe(false);
  });
});

describe('the 6 and 12 thresholds', () => {
  const facetOf = (n: number): FilterFacet => ({
    id: 'material',
    label: 'Material',
    type: 'list',
    values: values(n),
  });

  it('is 6 shown and a search field above more than 12', () => {
    expect(FILTER_VALUES_SHOWN).toBe(6);
    expect(FILTER_SEARCH_FROM).toBe(12);
  });

  /** The boundary on both sides: exactly 6 shows all six and offers no button. */
  it.each([
    [1, false],
    [5, false],
    [6, false],
    [7, true],
    [12, true],
    [40, true],
  ])('a facet of %i values offers Show all N: %s', (count, offered) => {
    expect(facetCanShowAll(facetOf(count))).toBe(offered);
    expect(facetHasHiddenValues(facetOf(count))).toBe(offered);
  });

  /** And on both sides of 12: exactly 12 gets no search field. */
  it.each([
    [6, false],
    [11, false],
    [12, false],
    [13, true],
    [40, true],
  ])('a facet of %i values gets a search field: %s', (count, searchable) => {
    expect(facetIsSearchable(facetOf(count))).toBe(searchable);
  });

  it('shows exactly the first six while collapsed', () => {
    const visible = visibleFacetValues(facetOf(20));
    expect(visible).toHaveLength(6);
    expect(visible.map((item) => item.value)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  });

  it('shows every value once Show all N has been pressed', () => {
    expect(visibleFacetValues(facetOf(20), { expanded: true })).toHaveLength(20);
    expect(facetHasHiddenValues(facetOf(20), { expanded: true })).toBe(false);
  });

  /**
   * Spec → States, "Searching a long list": "the list shows all its values (not just 6) while a
   * query is active". A truncated search result is a search that lies.
   */
  it('searches the whole list, not only the first six', () => {
    const found = visibleFacetValues(facetOf(20), { query: 'Value 1' });
    // "Value 1", "Value 1x" — 1, 10 through 19: eleven matches, eight of them past the sixth row.
    expect(found).toHaveLength(11);
    expect(found.map((item) => item.value)).toContain('v19');
  });

  it('offers no Show all N while a query is filtering', () => {
    expect(facetHasHiddenValues(facetOf(20), { query: 'Value 1' })).toBe(false);
  });

  it('answers nothing for a query that matches nothing', () => {
    expect(visibleFacetValues(facetOf(20), { query: 'linen' })).toEqual([]);
  });

  /**
   * The thresholds belong to `list` alone (spec → Variants: the search field and **Show all N**
   * are that row's). A colour facet's swatches and a size facet's tiles are read at a glance.
   */
  it.each(['colour', 'size', 'toggle', 'range'] as const)(
    'never truncates or searches a %s facet',
    (type) => {
      const facet: FilterFacet = { id: 'f', label: 'F', type, values: values(20) };
      expect(facetCanShowAll(facet)).toBe(false);
      expect(facetIsSearchable(facet)).toBe(false);
      expect(visibleFacetValues(facet)).toHaveLength(20);
    }
  );

  it('answers no values for a facet that has none', () => {
    expect(facetValues(PRICE)).toEqual([]);
    expect(visibleFacetValues(PRICE)).toEqual([]);
  });
});

describe('nested rows', () => {
  const tree = [
    value('tableware', 'Tableware', 16),
    value('cup', 'Cup', 6, { parent: 'tableware' }),
    value('bowl', 'Bowl', 4, { parent: 'tableware' }),
    value('knitwear', 'Knitwear', 18),
  ];

  it('nests a child under its parent and leaves no extra top row', () => {
    const rows = facetRows(tree);
    expect(rows.map((row) => row.value.value)).toEqual(['tableware', 'knitwear']);
    expect(rows[0]!.children.map((child) => child.value)).toEqual(['cup', 'bowl']);
    expect(rows[1]!.children).toEqual([]);
  });

  /** A row the shopper can see has to be a row they can tick. */
  it('promotes a child whose parent is not among the visible values', () => {
    const rows = facetRows([value('cup', 'Cup', 6, { parent: 'tableware' })]);
    expect(rows.map((row) => row.value.value)).toEqual(['cup']);
  });

  it('keeps a flat list flat', () => {
    expect(facetRows(facetValues(CATEGORY)).every((row) => row.children.length === 0)).toBe(true);
  });
});

describe('size systems', () => {
  const sizes = [
    value('xs', 'XS', 8, { group: 'Knitwear' }),
    value('m', 'M', 14, { group: 'Knitwear' }),
    value('42-44', '42–44', 0, { group: 'Socks (EU)' }),
    value('l', 'L', 12, { group: 'Knitwear' }),
  ];

  /**
   * First appearance, not alphabetical: the order is the store's, and sorting the headings would
   * reorder the grid under the merchant without being asked. "Socks (EU)" sorts before "Knitwear".
   */
  it('groups by system in first-appearance order, gathering a system’s values together', () => {
    expect(sizeSystemGroups(sizes)).toEqual([
      { key: 'Knitwear', values: [sizes[0], sizes[1], sizes[3]] },
      { key: 'Socks (EU)', values: [sizes[2]] },
    ]);
  });

  /** A store that has not told us its size systems gets one grid and no sub-headings. */
  it('collapses values with no group into one unlabelled group', () => {
    const plain = [value('s', 'S'), value('m', 'M')];
    expect(sizeSystemGroups(plain)).toEqual([{ key: undefined, values: plain }]);
  });

  it('keeps an unlabelled group beside the named ones rather than merging them', () => {
    const mixed = [value('s', 'S'), value('m', 'M', 5, { group: 'Knitwear' })];
    expect(sizeSystemGroups(mixed).map((group) => group.key)).toEqual([undefined, 'Knitwear']);
  });

  it('answers nothing for no values', () => {
    expect(sizeSystemGroups([])).toEqual([]);
  });
});

describe('which histogram bars are inside the span', () => {
  /** Spec → Behaviour: "a bar is 'in' when its bucket **centre** lies between the thumbs." */
  it('judges a bar by its bucket centre, not by either edge', () => {
    // Four bars over 0–100: centres at 12.5, 37.5, 62.5, 87.5.
    const inside = [0, 1, 2, 3].map((index) => histogramBarInRange(index, 4, [25, 75], [0, 100]));
    expect(inside).toEqual([false, true, true, false]);
  });

  it('lights every bar for a span at the limits', () => {
    expect([0, 1, 2, 3].map((index) => histogramBarInRange(index, 4, [0, 100], [0, 100]))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('works over bounds that do not start at zero', () => {
    // Four bars over 40–240: centres at 65, 115, 165, 215.
    expect(
      [0, 1, 2, 3].map((index) => histogramBarInRange(index, 4, [100, 200], [40, 240]))
    ).toEqual([false, true, true, false]);
  });

  it('lights the spec’s own 24 bars against a span, and no more', () => {
    const lit = Array.from({ length: 24 }, (_, index) =>
      histogramBarInRange(index, 24, [40, 140], [40, 240])
    ).filter(Boolean).length;
    // Centres every 8.33 from 44.17: twelve of them at or below 140.
    expect(lit).toBe(12);
  });

  it('lights nothing for a collapsed range or no bars at all', () => {
    expect(histogramBarInRange(0, 4, [40, 40], [40, 40])).toBe(false);
    expect(histogramBarInRange(0, 0, [0, 100], [0, 100])).toBe(false);
  });
});

describe('which values are disabled', () => {
  it('disables a value with nothing left', () => {
    expect(isValueDisabled(value('navy', 'Navy', 0), {}, 'colour')).toBe(true);
    expect(isValueDisabled(value('navy', 'Navy', 3), {}, 'colour')).toBe(false);
  });

  it('honours an explicitly disabled value even with a count', () => {
    expect(isValueDisabled(value('navy', 'Navy', 3, { disabled: true }), {}, 'colour')).toBe(true);
  });

  /**
   * Spec → States: "A selected value is never disabled." Not cosmetic — a selected value with a
   * count of 0 is the one the shopper has to un-tick to get their results back, and disabling it
   * would trap them.
   */
  it('never disables a value the shopper has selected, whatever its count says', () => {
    const selection: FilterSelection = { colour: ['navy'] };
    expect(isValueDisabled(value('navy', 'Navy', 0), selection, 'colour')).toBe(false);
    expect(isValueDisabled(value('navy', 'Navy', 0, { disabled: true }), selection, 'colour')).toBe(
      false
    );
  });
});

describe('a range with nothing to narrow is not drawn at all', () => {
  /**
   * A catalogue whose cheapest and dearest product cost the same has no span. Drawing one anyway
   * gives a single thumb that cannot move and two fields reading "3,500" to "3,500" — a control
   * that looks operable, answers every gesture with nothing, and excludes nothing however it is
   * set. The honest rendering of "there is nothing to filter here" is no group.
   */
  it.each([
    ['a collapsed span', { min: 3500, max: 3500 }],
    ['an inverted span, which collapses to one value', { min: 240, max: 40 }],
    ['no bounds at all beyond a single value', { min: 0, max: 0 }],
  ])('%s is not renderable', (_name, bounds) => {
    expect(facetIsRenderable({ id: 'price', label: 'Price', type: 'range', ...bounds })).toBe(
      false
    );
  });

  it('a real span is renderable, and so is a range that gives no bounds', () => {
    expect(facetIsRenderable(PRICE)).toBe(true);
    expect(facetIsRenderable({ id: 'price', label: 'Price', type: 'range' })).toBe(true);
    // One step of span is still a span: two distinct values is the bar, not "enough" of them.
    expect(
      facetIsRenderable({ id: 'price', label: 'Price', type: 'range', min: 40, max: 41 })
    ).toBe(true);
  });

  /** Every other facet type is drawn whatever it holds — an empty list is information too. */
  it.each(['list', 'colour', 'size', 'toggle'] as const)(
    'an empty %s facet is still drawn',
    (type) => {
      expect(facetIsRenderable({ id: 'f', label: 'F', type, values: [] })).toBe(true);
    }
  );

  it('drops only the facets that cannot be drawn', () => {
    const collapsed: FilterFacet = { id: 'price', label: 'Price', type: 'range', min: 40, max: 40 };
    expect(renderableFacets([CATEGORY, collapsed, COLOUR]).map((facet) => facet.id)).toEqual([
      'category',
      'colour',
    ]);
    expect(renderableFacets([CATEGORY, PRICE]).map((facet) => facet.id)).toEqual([
      'category',
      'price',
    ]);
  });

  describe('and its selection goes with it', () => {
    const collapsed: FilterFacet = { id: 'price', label: 'Price', type: 'range', min: 40, max: 40 };

    it('takes the omitted facet’s key out of a selection', () => {
      expect(dropOmittedFacets({ price: [40, 40], size: ['m'] }, [collapsed, CATEGORY])).toEqual({
        size: ['m'],
      });
    });

    /**
     * Narrow on purpose: a key for a facet the panel was never given is left alone, because a page
     * may keep a filter of its own in the same object that this panel has no business clearing.
     */
    it('leaves a key for a facet it was never given alone', () => {
      const selection: FilterSelection = { material: ['linen'] };
      expect(dropOmittedFacets(selection, [collapsed, CATEGORY])).toBe(selection);
    });

    it('is a no-op when every facet is drawn, or when the omitted one holds nothing', () => {
      const selection: FilterSelection = { category: ['sweaters'] };
      expect(dropOmittedFacets(selection, [CATEGORY, PRICE])).toBe(selection);
      expect(dropOmittedFacets(selection, [CATEGORY, collapsed])).toBe(selection);
    });
  });
});
