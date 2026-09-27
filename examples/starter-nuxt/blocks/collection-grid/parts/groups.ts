/**
 * The filter groups' own vocabulary, shared by `Block.vue` (which builds the groups out of the
 * `filters[]` field and the storefront's facets) and `parts/FilterGroups.vue` (which renders them
 * in both the sidebar and the drawer).
 *
 * `filters[].source` is the *field's* vocabulary (`option:size`, `option:colour`) while
 * `StorefrontFacet.source` is the *store's* (`size`, `colour`) — `FACET_SOURCE` is the one place
 * those two are reconciled, and `price` is deliberately absent from it: a price range has no facet
 * to read values from, it is two number inputs.
 */
import type { StorefrontFacet } from '../../../app/storefront/types';

/** The five `filters[].source` options `block.json` declares. */
export type FilterSource = 'category' | 'option:size' | 'option:colour' | 'price' | 'availability';

/** How a group draws its values (spec `02-blocks.md` "Collection grid" → Layout, Filter groups). */
export type FilterGroupKind = 'checkbox' | 'size' | 'colour' | 'price';

export interface FilterGroupValue {
  value: string;
  label: string;
  count: number;
  /** A CSS colour from the store, for a `colour` group's dot. Content, never a design token. */
  swatch?: string;
}

export interface FilterGroup {
  source: FilterSource;
  /** The group title: the editor's own `filters[].label`, else the store's facet label. */
  label: string;
  kind: FilterGroupKind;
  collapsed: boolean;
  /** The hidden `<legend>` — longer than the title for `price` ("Price range in US dollars"). */
  legend: string;
  values: FilterGroupValue[];
}

/** Selected values per `filters[].source`. The price range lives in its own two strings. */
export type FilterSelection = Partial<Record<FilterSource, string[]>>;

export const FILTER_SOURCES: readonly FilterSource[] = [
  'category',
  'option:size',
  'option:colour',
  'price',
  'availability',
];

/** `filters[].source` → `StorefrontFacet.source`. `price` has no facet (see the module comment). */
export const FACET_SOURCE: Partial<Record<FilterSource, string>> = {
  category: 'category',
  'option:size': 'size',
  'option:colour': 'colour',
  availability: 'availability',
};

export const GROUP_KIND: Record<FilterSource, FilterGroupKind> = {
  category: 'checkbox',
  'option:size': 'size',
  'option:colour': 'colour',
  price: 'price',
  availability: 'checkbox',
};

/**
 * Spec States → "Many items": "a group with 12 or more values shows the first 8, then a 'Show all
 * 14' link button."
 */
export const COLLAPSE_FROM = 12;
export const COLLAPSED_COUNT = 8;

export function isFilterSource(value: unknown): value is FilterSource {
  return typeof value === 'string' && (FILTER_SOURCES as readonly string[]).includes(value);
}

/**
 * The values a group offers: the facet's own, minus anything the store counts zero of — "Do show
 * real counts next to filter values and hide values with 0 results, **unless they are selected**"
 * (spec Do/Don't), so a selected value stays removable even once nothing matches it.
 *
 * A selected value the facet no longer *lists at all* is appended rather than dropped. Most
 * backends compute facets over the current result set, so a narrowing filter can remove a value the
 * shopper has already ticked; dropping it would leave the filter applied to every request with no
 * control left to untick it. Labelled by its raw value, since the facet no longer describes it.
 */
export function visibleFacetValues(
  facet: StorefrontFacet | undefined,
  selected: readonly string[]
): FilterGroupValue[] {
  const out: FilterGroupValue[] = (facet?.values ?? [])
    .filter((value) => value.count > 0 || selected.includes(value.value))
    .map((value) => ({
      value: value.value,
      label: value.label,
      count: value.count,
      swatch: value.swatch,
    }));
  const listed = new Set(out.map((value) => value.value));
  for (const value of selected) {
    if (!listed.has(value)) out.push({ value, label: value, count: 0 });
  }
  return out;
}

/**
 * A price input's value, reduced to what a price can be: digits only, leading zeroes dropped, and
 * at most nine of them (a shopper pasting a phone number into "Max" must not turn into a request
 * for a 10-digit ceiling). Empty means "no bound", which is why `''` is a valid result rather than
 * a `0` the request would then have to special-case.
 */
export function sanitizeAmount(raw: string): string {
  const digits = raw
    .replace(/\D+/g, '')
    .slice(0, 9)
    .replace(/^0+(?=\d)/, '');
  return digits;
}
