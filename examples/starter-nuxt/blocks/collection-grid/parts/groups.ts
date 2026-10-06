/**
 * The filter groups' own vocabulary, shared by `Block.vue` (which builds the groups out of the
 * `filters[]` field and the storefront's facets) and `parts/FilterGroups.vue` (which renders them
 * in both the sidebar and the drawer).
 *
 * `filters[].source` is the *field's* vocabulary (`options`, `option:size`) while the storefront's
 * `CatalogFacets` is the *store's* (`options[].key` = `size`, `colour`) — `groupValuesFor` is the one
 * place those two are reconciled, together with the rule that decides which values a group offers at
 * all.
 *
 * Everything here is pure, so the price arithmetic a slider and a URL share
 * (`parsePriceRange`/`rangeFromSlider`) is provable without mounting anything.
 */
import { IN_STOCK, OUT_OF_STOCK } from '../../../app/storefront/facets';
import type { CatalogFacetTerm, CatalogFacets } from '../../../app/storefront/types';

/**
 * One variant option, by the key the store names it with: `option:size`, `option:colour`,
 * `option:fabric` — **any** key, not a list this theme maintains. The keys belong to the merchant's
 * own product options, so a store that spells its colour option `color` or sells by `fabric` is a
 * store this block filters for without a code change.
 */
export type OptionFilterSource = `option:${string}`;

/**
 * **What a rendered group filters on.** `options` is deliberately not here: it is a *field* value
 * that stands for "one group per option key the store has" (`FilterFieldSource`), and the block
 * expands it into the `option:<key>` sources below before a group exists.
 */
export type FilterSource =
  | 'category'
  | 'collection'
  | 'price'
  | 'availability'
  | OptionFilterSource;

/**
 * What an author may put in `filters[].source` — every rendered source, plus `options`.
 *
 * **`options` is a meta source**: one group per option key the storefront's facets answer, labelled by
 * the facet's own `name`, in the facets' order. It exists because a merchant's option keys are theirs,
 * not the theme's — an author cannot list `option:size` and `option:colour` by hand without knowing
 * what the store sells by, and a store that adds `fabric` next season would need the page edited to
 * offer it. An explicit `option:<key>` row still works and **wins** for that key: that is how an
 * author pins one option's position in the panel or renames its group.
 */
export type FilterFieldSource = FilterSource | 'options';

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
  /**
   * **The value of the row this one sits under**, for a `category` group the store answers as a tree
   * (`CatalogFacetTerm.parentId`). Absent on every other family and on every top row, which is what
   * a flat group is: nothing carries a parent, so nothing indents.
   *
   * One level, ever. A category three deep is rendered under its top-most listed ancestor rather
   * than at its own depth — a filter panel is not a tree view, and a 15rem sidebar has no third
   * indent to give (see `nestCategoryTerms`).
   */
  parent?: string;
  /**
   * This row is covered by its ticked parent rather than by a filter of its own: the parent's id is
   * what the request carries, and the platform expands it to the descendants. Drawn ticked and
   * inoperable, with a hidden note naming the parent, because the shopper's way back out is the
   * parent they ticked — the one control that can still change.
   */
  implied?: boolean;
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

/** The `filters[].source` prefix one variant option is named with. */
export const OPTION_SOURCE = 'option:';

/**
 * The four sources that are **one group each, always** — everything a URL and a request can carry
 * besides the open-ended option keys. The block enumerates these when it reads the query string and
 * when it clears it; the option keys it enumerates from the facets and from its own selection, since
 * there is no closed list of them.
 */
export const FIXED_FILTER_SOURCES = [
  'category',
  'collection',
  'price',
  'availability',
] as const satisfies readonly FilterSource[];

/** The option key a source names, or `null` for a source that is not an option. */
export function optionKeyOf(source: string): string | null {
  if (!source.startsWith(OPTION_SOURCE)) return null;
  const key = source.slice(OPTION_SOURCE.length);
  return key === '' ? null : key;
}

/** `option:<key>` for one of the store's own option keys. */
export function optionSourceFor(key: string): OptionFilterSource {
  return `${OPTION_SOURCE}${key}`;
}

/**
 * **The query key a source is spelled with**, in both directions: what the block writes and what it
 * reads back. An option is its bare key (`?colour=oat`) — the `option:` prefix is the *field's*
 * vocabulary, never a shopper's URL.
 */
export function queryKeyFor(source: FilterSource): string {
  return optionKeyOf(source) ?? source;
}

/**
 * How a group draws its values — **decided by the values, for an option.**
 *
 * A swatch is a colour the store sent as data, and the only control that can show one is the dot
 * (`FilterGroups.vue` draws it itself for exactly that reason), so an option whose values carry one is
 * a colour group whatever it is keyed; every other option is pills. That is what lets an arbitrary
 * option key render correctly without this file knowing the key at all — the two hard-coded `size`/
 * `colour` keys it used to carry meant a store spelling its option `color` got a group with no values
 * and no group.
 */
export function groupKindFor(
  source: FilterSource,
  values: readonly FilterGroupValue[]
): FilterGroupKind {
  if (source === 'price') return 'price';
  if (optionKeyOf(source) === null) return 'checkbox';
  return values.some((value) => value.swatch !== undefined) ? 'colour' : 'size';
}

/**
 * Spec States → "Many items": "a group with 12 or more values shows the first 8, then a 'Show all
 * 14' link button."
 */
export const COLLAPSE_FROM = 12;
export const COLLAPSED_COUNT = 8;

export function isFilterSource(value: unknown): value is FilterSource {
  if (typeof value !== 'string') return false;
  if ((FIXED_FILTER_SOURCES as readonly string[]).includes(value)) return true;
  return optionKeyOf(value) !== null;
}

/** Whether a `filters[].source` is one this block understands — `isFilterSource`, plus `options`. */
export function isFilterFieldSource(value: unknown): value is FilterFieldSource {
  return value === 'options' || isFilterSource(value);
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
  const out: FilterGroupValue[] = rawValuesFor(source, facets, availability).map((value) => {
    // A row its ticked parent already covers is neither operable nor countable on its own: the
    // request carries the parent's id and the platform expands it, so this row's own count describes
    // a filter nobody sent. It is drawn ticked and inoperable instead (`FilterGroupValue.implied`),
    // which is also why the `disabled` rule below does not get a say — an implied row is disabled
    // whatever it counts.
    if (value.parent !== undefined && selected.includes(value.parent)) {
      return { ...value, implied: true, disabled: true };
    }
    return {
      ...value,
      ...(value.count === 0 && !selected.includes(value.value) ? { disabled: true } : {}),
    };
  });
  const listed = new Set(out.map((value) => value.value));
  for (const value of selected) {
    if (!listed.has(value)) {
      out.push({ value, label: unlistedLabel(source, value, availability), count: 0 });
    }
  }
  return out;
}

/**
 * What a kept-but-unlisted value is called. The store's own words are gone with the value, so a
 * category or an option value can only be labelled by its raw slug — but **`availability` is the
 * one family the theme names itself**, so it is never shown the platform's spelling.
 *
 * That case is reachable: a store whose stock cannot be read answers no `availability` facet at all,
 * and a shopper arriving on a shared `?availability=in_stock` link still has the value selected. The
 * generic fallback drew them a checkbox and a chip reading literally `in_stock`, in both locales.
 */
function unlistedLabel(
  source: FilterSource,
  value: string,
  availability: AvailabilityLabels
): string {
  if (source !== 'availability') return value;
  if (value === IN_STOCK) return availability.inStock;
  if (value === OUT_OF_STOCK) return availability.outOfStock;
  return value;
}

function rawValuesFor(
  source: FilterSource,
  facets: CatalogFacets | undefined,
  availability: AvailabilityLabels
): FilterGroupValue[] {
  if (facets === undefined || source === 'price') return [];
  if (source === 'category') {
    return nestCategoryTerms(facets.categories, facets.categoryCounts === 'rolled-up');
  }
  if (source === 'collection') {
    // Flat, and not by omission: a collection is a curated list, not a level of anything.
    return facets.collections.map(flatTermValue);
  }
  if (source === 'availability') {
    // No `availability` facet at all means the store could not read stock, not that nothing is in
    // stock (`CatalogFacets.availability`). With no values the group is dropped altogether by the
    // block, which is the only honest answer: two zeroes would offer a shopper a filter whose
    // counts are unknown, and a request carrying it is an error rather than an empty page.
    const counts = facets.availability;
    if (counts === undefined) return [];
    return [
      { value: IN_STOCK, label: availability.inStock, count: counts.in_stock },
      { value: OUT_OF_STOCK, label: availability.outOfStock, count: counts.out_of_stock },
    ];
  }
  const option = facets.options.find((candidate) => candidate.key === optionKeyOf(source));
  return (option?.values ?? []).map((value) => ({
    value: value.value,
    label: value.label,
    count: value.count,
    ...(value.swatch === undefined ? {} : { swatch: value.swatch }),
  }));
}

function flatTermValue(term: CatalogFacetTerm): FilterGroupValue {
  return { value: term.slug, label: term.title, count: term.count };
}

/**
 * How deep the walk up a term's ancestors may go before it stops. A guard against a `parentId` cycle
 * in the data, not a product decision — this runs inside a `computed`, where a hang is the block.
 */
const MAX_CATEGORY_DEPTH = 6;

/**
 * **The category family as rows the panel can draw: each parent followed by its children, indented
 * one level.**
 *
 * The terms arrive as a tree (`CatalogFacetTerm.parentId`) with every ancestor present — the
 * storefront completes them, since a facet counted over the categories products are *assigned* to
 * names only the leaves (`app/storefront/categories.ts`'s `completeCategoryTerms`). A source that
 * places nothing answers no `parentId` at all, and the family then comes out exactly as flat as it
 * always was: the whole of this is skipped, not approximated.
 *
 * **One level of indent, ever.** A category three deep is rendered under its top-most listed
 * ancestor, not at its own depth: a filter panel is not a tree view, every indent costs a 15rem
 * sidebar a column of label width, and a shopper ticking a grandchild gets the same filter either
 * way. Nothing is dropped — only flattened.
 *
 * **Order is the source's.** Public contract 3.8.0 answers depth-first by title, and this preserves
 * whatever order it was handed: the top rows keep their input order and each parent's children keep
 * theirs, which on an already depth-first list is no change at all. Nothing here sorts by count.
 *
 * **A parent's count is rolled up only when nobody else has done it.** Against a gateway that counts
 * assignments, the sum over the descendants on screen is the only honest number: a synthesised
 * `Tableware` row counts 0 of its own, and `Cups (6) · Bowls (4)` under a row reading `Tableware (0)`
 * is a row the shopper reads as empty and the panel disables. `rolledUp` — contract 3.8.0's own
 * ancestor counts — turns the sum off, because **a parent's count there is not the sum of its
 * children**: it is deduplicated, and a product in Cups and in Bowls is one product and two counts
 * (`CatalogFacets.categoryCounts`).
 */
export function nestCategoryTerms(
  terms: readonly CatalogFacetTerm[],
  rolledUp: boolean
): FilterGroupValue[] {
  if (!terms.some((term) => term.parentId !== undefined)) return terms.map(flatTermValue);
  const byId = new Map(terms.map((term) => [term.id, term] as const));

  /** The top-most ancestor of a term that is **listed here** — the term itself for a top row. */
  const topOf = (term: CatalogFacetTerm): CatalogFacetTerm => {
    let top = term;
    const seen = new Set<string>([term.id]);
    for (let depth = 0; depth < MAX_CATEGORY_DEPTH; depth += 1) {
      const parentId = top.parentId;
      if (parentId === null || parentId === undefined || seen.has(parentId)) break;
      const parent = byId.get(parentId);
      if (parent === undefined) break;
      seen.add(parentId);
      top = parent;
    }
    return top;
  };

  // Input order decides the order of the top rows, and a child follows the row it sits under — so a
  // depth-first list (contract 3.8.0's own order) comes out exactly as it went in. On the fallback
  // path the storefront appends the ancestors it synthesised after the counted terms, so a parent the
  // facets never named lands after the roots they did, which is the order a shopper reads as "the
  // families the catalogue counted, then the one above them".
  const topIdOf = new Map(terms.map((term) => [term.id, topOf(term).id] as const));
  // Which terms are top rows: the ones that are their own top. A `parentId` cycle has none — every
  // term in it stops one short of itself — and a term whose top row does not exist is promoted to one
  // rather than nested under nothing, which is what keeps every row on screen and tickable.
  const topIds = new Set(terms.filter((term) => topIdOf.get(term.id) === term.id).map((t) => t.id));
  const tops: CatalogFacetTerm[] = [];
  const childrenOf = new Map<string, CatalogFacetTerm[]>();
  for (const term of terms) {
    const top = topIdOf.get(term.id);
    if (top === undefined || top === term.id || !topIds.has(top)) {
      tops.push(term);
      continue;
    }
    const siblings = childrenOf.get(top);
    if (siblings === undefined) childrenOf.set(top, [term]);
    else siblings.push(term);
  }

  const out: FilterGroupValue[] = [];
  for (const top of tops) {
    const children = childrenOf.get(top.id) ?? [];
    const rolled = children.reduce((sum, child) => sum + child.count, top.count);
    out.push({ value: top.slug, label: top.title, count: rolledUp ? top.count : rolled });
    for (const child of children) out.push({ ...flatTermValue(child), parent: top.slug });
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
 * The range written back out of the slider, once a move is over.
 *
 * **The applied range is the source of truth, and only the end that moved is rewritten.** One
 * gesture moves one thumb — a drag, an arrow-key run, a typed field — so the other end keeps the
 * string the shopper already applied, character for character. Deriving *both* ends from the pair
 * is what made a nudge of one thumb erase the other bound: the span the thumbs are drawn across is
 * widened to hold the shopper's own bounds (`spanWithRange`, because the facets' span is counted
 * with every filter but price and can narrow inside their range), so on `?price=50-150&colour=oat`
 * both thumbs sit on "an end" and reading either as "no bound" threw away a filter the shopper had
 * set, on screen, in the URL and in the request.
 *
 * For the end that *did* move, **a thumb parked on the span's own end is "no bound"** — not a bound
 * that happens to equal it. That is what lets a shopper drag a filter back off, keeps the URL free
 * of a range nobody asked for, and keeps the request identical to one made before any filter
 * existed.
 */
export function rangeFromSlider(
  value: readonly [number, number],
  span: PriceSpan,
  applied: PriceRange = NO_PRICE_RANGE
): PriceRange {
  // Where the thumbs stood before this move: anything still there is an end nobody touched.
  const [wasMin, wasMax] = sliderValueFor(applied, span);
  return {
    min:
      value[0] === wasMin ? applied.min : value[0] <= span.min ? '' : String(Math.round(value[0])),
    max:
      value[1] === wasMax ? applied.max : value[1] >= span.max ? '' : String(Math.round(value[1])),
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
