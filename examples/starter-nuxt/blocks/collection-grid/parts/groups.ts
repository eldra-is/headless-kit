/**
 * The filter groups' own vocabulary, shared by `Block.vue` (which builds the groups out of the
 * `filters[]` field and the storefront's facets) and `parts/FilterGroups.vue` (which renders them
 * in both the sidebar and the drawer).
 *
 * `filters[].source` is the *field's* vocabulary (`option:size`, `option:colour`) while the
 * storefront's `CatalogFacets` is the *store's* (`options[].key` = `size`, `colour`) —
 * `groupValuesFor` is the one place those two are reconciled, together with the rule that decides
 * which values a group offers at all.
 *
 * Everything here is pure, so the price arithmetic a slider and a URL share
 * (`parsePriceRange`/`rangeFromSlider`) is provable without mounting anything.
 */
import type { CatalogFacets } from '../../../app/storefront/types';

/** The six `filters[].source` options `block.json` declares. */
export type FilterSource =
  | 'category'
  | 'collection'
  | 'option:size'
  | 'option:colour'
  | 'price'
  | 'availability';

/** How a group draws its values (spec `02-blocks.md` "Collection grid" → Layout, Filter groups). */
export type FilterGroupKind = 'checkbox' | 'size' | 'colour' | 'price';

export interface FilterGroupValue {
  value: string;
  label: string;
  count: number;
  /** A CSS colour from the store, for a `colour` group's dot. Content, never a design token. */
  swatch?: string;
  /**
   * Nothing the current filters leave for this value (`count === 0`). The control stays in place
   * and stops being operable rather than disappearing: a value that vanishes as the shopper ticks
   * its neighbour moves every control under their pointer. A value they have *already* ticked is
   * never disabled, whatever it counts, or the filter could not be removed again.
   */
  disabled?: boolean;
}

export interface FilterGroup {
  source: FilterSource;
  /** The group title: the editor's own `filters[].label`, else the source's own name. */
  label: string;
  kind: FilterGroupKind;
  collapsed: boolean;
  /** The hidden `<legend>` — longer than the title for `price` ("Price range in USD"). */
  legend: string;
  values: FilterGroupValue[];
  /**
   * `price` only (the block's `priceSlider` field, default on): the range slider, or the two typed
   * fields alone for a store whose prices sit in a few tight clusters a track cannot separate.
   */
  slider?: boolean;
}

/** Selected values per `filters[].source`. The price range lives in its own two strings. */
export type FilterSelection = Partial<Record<FilterSource, string[]>>;

export const FILTER_SOURCES: readonly FilterSource[] = [
  'category',
  'collection',
  'option:size',
  'option:colour',
  'price',
  'availability',
];

export const GROUP_KIND: Record<FilterSource, FilterGroupKind> = {
  category: 'checkbox',
  collection: 'checkbox',
  'option:size': 'size',
  'option:colour': 'colour',
  price: 'price',
  availability: 'checkbox',
};

/** `filters[].source` → the `CatalogFacets.options` key it reads, for the option sources only. */
const OPTION_KEY: Partial<Record<FilterSource, string>> = {
  'option:size': 'size',
  'option:colour': 'colour',
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

/** The two `availability` values, as this theme's own strings name them. */
export interface AvailabilityLabels {
  inStock: string;
  outOfStock: string;
}

/**
 * The values a group offers: the store's own, each with the count the facets report.
 *
 * **A value the store counts zero of is offered disabled, not dropped** (contract §4): facet counts
 * leave their own family's filter out, so a zero means "another filter rules this out", and a
 * control that disappears the moment a neighbour is ticked moves every control after it. The one
 * exception is a value the shopper has already selected — never disabled, so the filter stays
 * removable — and a selected value the facets no longer *list at all* is appended rather than lost,
 * labelled by its raw value since nothing describes it any more.
 */
export function groupValuesFor(
  source: FilterSource,
  facets: CatalogFacets | undefined,
  selected: readonly string[],
  availability: AvailabilityLabels
): FilterGroupValue[] {
  const out: FilterGroupValue[] = rawValuesFor(source, facets, availability).map((value) => ({
    ...value,
    ...(value.count === 0 && !selected.includes(value.value) ? { disabled: true } : {}),
  }));
  const listed = new Set(out.map((value) => value.value));
  for (const value of selected) {
    if (!listed.has(value)) out.push({ value, label: value, count: 0 });
  }
  return out;
}

function rawValuesFor(
  source: FilterSource,
  facets: CatalogFacets | undefined,
  availability: AvailabilityLabels
): FilterGroupValue[] {
  if (facets === undefined || source === 'price') return [];
  if (source === 'category' || source === 'collection') {
    const terms = source === 'category' ? facets.categories : facets.collections;
    return terms.map((term) => ({ value: term.slug, label: term.title, count: term.count }));
  }
  if (source === 'availability') {
    return [
      { value: 'in_stock', label: availability.inStock, count: facets.availability.in_stock },
      {
        value: 'out_of_stock',
        label: availability.outOfStock,
        count: facets.availability.out_of_stock,
      },
    ];
  }
  const option = facets.options.find((candidate) => candidate.key === OPTION_KEY[source]);
  return (option?.values ?? []).map((value) => ({
    value: value.value,
    label: value.label,
    count: value.count,
    ...(value.swatch === undefined ? {} : { swatch: value.swatch }),
  }));
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

/**
 * The shopper's own price bounds, as the URL and the storefront request both spell them:
 * `"<min>-<max>"` in whole major units, either end empty for "no bound".
 */
export interface PriceRange {
  min: string;
  max: string;
}

export const NO_PRICE_RANGE: PriceRange = { min: '', max: '' };

/** Whether either end is set — `''`/`''` is no filter at all. */
export function hasPriceRange(range: PriceRange): boolean {
  return range.min !== '' || range.max !== '';
}

/** `"1200-4800"` → `{min: '1200', max: '4800'}`; either end may be empty, and so may the whole. */
export function parsePriceRange(raw: string | undefined): PriceRange {
  if (raw === undefined) return NO_PRICE_RANGE;
  const [min = '', max = ''] = raw.split('-');
  return { min: sanitizeAmount(min), max: sanitizeAmount(max) };
}

/** The query/request value, or `null` when there is no bound to send. */
export function formatPriceRange(range: PriceRange): string | null {
  return hasPriceRange(range) ? `${range.min}-${range.max}` : null;
}

/** The span a price control works across: the catalogue's own lowest and highest price. */
export interface PriceSpan {
  min: number;
  max: number;
}

/** The span of a set of products, or `null` when there are none to span. */
export function priceSpanOf(items: ReadonlyArray<{ price: { amount: number } }>): PriceSpan | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const amount = item.price.amount;
    if (!Number.isFinite(amount)) continue;
    if (amount < min) min = amount;
    if (amount > max) max = amount;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/**
 * The wider of two spans.
 *
 * Only the facets' own `price` is filter-independent (it is counted with every filter *except*
 * price applied). A span read off the loaded items instead — the fallback for a storefront that
 * answers no facets — shrinks as the shopper narrows the range, and a slider whose track shrinks
 * under the thumb can only ever be narrowed: each drag inward moves the bound inward too. So the
 * fallback keeps the widest span it has seen for this collection.
 */
export function widenPriceSpan(
  current: PriceSpan | null,
  next: PriceSpan | null
): PriceSpan | null {
  if (current === null) return next;
  if (next === null) return current;
  return { min: Math.min(current.min, next.min), max: Math.max(current.max, next.max) };
}

/**
 * The span widened to hold the shopper's own bounds.
 *
 * The facets' price span is counted with every filter *except* price applied, so it narrows as the
 * other filters narrow — tick a colour and the span becomes that colour's own prices. A slider
 * cannot show a value outside its bounds, so without this a range of 50–150 read back as 96–96 the
 * moment another group was touched, and dragging either thumb would then write that back as the
 * shopper's range. Including their own bounds keeps the thumbs where they put them and keeps the
 * filter removable by dragging back out.
 */
export function spanWithRange(span: PriceSpan, range: PriceRange): PriceSpan {
  const bounds: number[] = [];
  if (range.min !== '') bounds.push(Number(range.min));
  if (range.max !== '') bounds.push(Number(range.max));
  if (bounds.length === 0) return span;
  return widenPriceSpan(span, { min: Math.min(...bounds), max: Math.max(...bounds) }) ?? span;
}

/**
 * The pair the slider shows: the shopper's own bound where they set one, the span's where they did
 * not — so an untouched control spans the whole catalogue (spec Default content: "both thumbs at
 * an end"), which is also what makes "no filter" visible as a state.
 */
export function sliderValueFor(range: PriceRange, span: PriceSpan): [number, number] {
  const min = range.min === '' ? span.min : Number(range.min);
  const max = range.max === '' ? span.max : Number(range.max);
  return [min, max];
}

/**
 * The pair written back out of the slider. **A thumb parked on the span's own end is "no bound"**,
 * not a bound that happens to equal it: that is what lets a shopper drag a filter back off, keeps
 * the URL free of a range nobody asked for, and keeps the request identical to one made before any
 * filter existed.
 */
export function rangeFromSlider(value: readonly [number, number], span: PriceSpan): PriceRange {
  return {
    min: value[0] <= span.min ? '' : String(Math.round(value[0])),
    max: value[1] >= span.max ? '' : String(Math.round(value[1])),
  };
}

/**
 * The price slider's step when the author set no `priceStep`: one unit of the store currency, with
 * the one documented exception (spec Fields, `priceStep`: "one unit of the store currency, ISK
 * 100, USD 1"). ISK has no minor unit and its amounts run two orders of magnitude larger, so a
 * step of one króna gives a 20 000-step track nobody can drag accurately.
 *
 * A store whose currency wants its own step says so in the field; this is only the default.
 */
const CURRENCY_PRICE_STEP: Readonly<Record<string, number>> = { ISK: 100 };

export function defaultPriceStep(currency: string | undefined): number {
  return CURRENCY_PRICE_STEP[currency ?? ''] ?? 1;
}

/**
 * How many stops a track needs to be worth dragging. Below this the step is the control's whole
 * range, so the thumbs can only sit at either end.
 */
const MIN_PRICE_STOPS = 10;

/**
 * The currency's own step, narrowed to one the catalogue can hold.
 *
 * A step is a granularity, not a unit of faith: a store selling in krónur whose whole collection
 * spans 50 of them gets a two-stop track from ISK's 100, and every value between the ends — a
 * typed figure, a bound out of a shared URL — then snaps to one end or the other. So a default
 * step the span cannot hold ten of falls back to one unit, which every span can.
 *
 * Only the default is fitted. An author who sets `priceStep` themselves gets exactly that.
 */
export function fitPriceStep(step: number, span: PriceSpan): number {
  const width = span.max - span.min;
  if (!(width > 0)) return step;
  return Math.floor(width / MIN_PRICE_STOPS) >= step ? step : 1;
}
