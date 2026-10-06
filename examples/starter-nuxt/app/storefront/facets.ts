/**
 * The shopper's facets, applied over a list of products — the one implementation both storefront
 * sources run — and the facets a source derives from the products it fetched.
 *
 * `collection-grid` sends `filters` keyed by its own `filters[].source` ids (see that block's
 * `requestFiltersFor`): `category`, `collection`, `option:size`, `option:colour`, `availability`,
 * and `price` as a single `"<min>-<max>"` string in whole major units with either end allowed to be
 * empty. `createDemoStorefront` used to answer that request with a private copy of this pass while
 * `createGatewayStorefront` dropped every facet before its list read — so the demo filtered and
 * the real site did not: `?price=50-150` still showed the $48 bowl, with the chips, the URL and
 * the active-filter row all insisting it had been filtered.
 *
 * The gateway's list endpoints filter on `id`/`slug`/`status`/`createdAt` only and answer no
 * `facets` object (a facet token is a 400, not an empty list — see `gateway.ts`), so until they
 * grow the filter parameters and the aggregation the honest answer is to apply the same pass, and
 * count the same facets, client-side over what was fetched. `deriveFacets` is therefore **the
 * fallback the server replaces**: its result is the `CatalogFacets` shape the platform publishes,
 * so the day the gateway answers one, the derivation goes and nothing above it changes.
 *
 * Everything here is pure: no Vue, no client, no module state — which is what lets
 * `test/storefront/facets.spec.ts` pin every bound on its own.
 */
import type {
  CatalogFacetOption,
  CatalogFacetOptionValue,
  CatalogFacetTerm,
  CatalogFacets,
  StorefrontProductListItem,
} from './types';

/** The `filters` key a variant option is named with: `option:colour`, `option:size`. */
export const OPTION_SOURCE_PREFIX = 'option:';
/** The one option key whose values a product *card* already carries (`item.colours`). */
export const COLOUR_OPTION_KEY = 'colour';

/** The two `availability` values the platform's facets count, and the filter vocabulary with
 *  them. `in-stock` is read as well, so a link shared before the rename still filters. */
export const IN_STOCK = 'in_stock';
export const OUT_OF_STOCK = 'out_of_stock';
const IN_STOCK_VALUES = new Set([IN_STOCK, 'in-stock']);

/** A category or collection a product belongs to: the `slug` is the filter value, the `title` is
 *  what the shopper reads, and `id` is the catalog id when the source knows one. */
export interface ProductFacetTerm {
  slug: string;
  title?: string;
  id?: string;
}

/** One value of one variant option, as the source knows it. */
export interface ProductFacetOptionValue {
  value: string;
  label?: string;
  swatch?: string;
}

/**
 * What a source knows about one product beyond what a product *card* shows. A property left
 * `undefined` means "this backend cannot tell", and a filter on it is then **ignored** rather than
 * treated as unmatched: a backend that does not know which sizes a product is made in has no
 * business emptying the grid because the shopper ticked "M". An empty array is the opposite — a
 * known "none", which matches nothing (an `options` bag with no entry for a key is unknown, not
 * empty — see `optionValuesOf`).
 */
export interface ProductFacetAttributes {
  /** The category this product sits under. */
  category?: ProductFacetTerm;
  /** Every collection this product belongs to. */
  collections?: readonly ProductFacetTerm[];
  /** The option values this product is made in, keyed by option key (`size`, `colour`). */
  options?: Readonly<Record<string, readonly ProductFacetOptionValue[]>>;
}

const NOTHING_KNOWN: ProductFacetAttributes = {};

/** How a caller supplies the per-product attributes neither a card nor a list row carries. */
export type ProductFacetAttributesFor = (
  item: StorefrontProductListItem
) => ProductFacetAttributes | undefined;

/**
 * `"<min>-<max>"` in whole major units, either end empty for "no bound". **Both bounds are
 * inclusive** — a shopper asking for 50–150 means 50 and 150 are in.
 */
export function matchesPrice(item: StorefrontProductListItem, range: string | undefined): boolean {
  if (range === undefined) return true;
  const [rawMin = '', rawMax = ''] = range.split('-');
  const amount = item.price.amount;
  if (rawMin !== '' && amount < Number(rawMin)) return false;
  if (rawMax !== '' && amount > Number(rawMax)) return false;
  return true;
}

/** Orderable now: the one meaning "In stock" can have on a list row (see `item.stock`). */
function inStock(item: StorefrontProductListItem): boolean {
  return item.available && item.stock !== 'out';
}

/**
 * The values of one option for one product, or `undefined` when the source cannot tell.
 *
 * The one place the two sources of option values are reconciled, and it is shared by the filter
 * and by the derivation on purpose: a value the panel offers has to be a value the pass can match,
 * or ticking it changes the chips and the URL and nothing else. `attributes.options` is what a
 * source declares; a product card's own `colours` is the fallback, because that is the one option
 * a `StorefrontProductListItem` already carries.
 *
 * The unknown/empty distinction is per **option key**, not per bag: a key the source does not name
 * is unknown and a filter on it is ignored (an option this store does not have — `option:fabric` —
 * must not empty the grid), while a key named with an empty list is a known "none" and a filter on
 * it excludes the product. So a source that can answer for an option answers for it explicitly,
 * including with `[]`, which is what `createDemoStorefront` does for a product with no sizes.
 */
export function optionValuesOf(
  item: StorefrontProductListItem,
  attributes: ProductFacetAttributes,
  key: string
): readonly ProductFacetOptionValue[] | undefined {
  const declared = attributes.options?.[key];
  if (declared !== undefined) return declared;
  if (key === COLOUR_OPTION_KEY && item.colours !== undefined) {
    return item.colours.map((colour) => ({
      value: colour.name.toLowerCase(),
      label: colour.name,
      swatch: colour.swatch,
    }));
  }
  return undefined;
}

/** One `filters` clause against one product. `true` for a clause this pass cannot judge. */
function matchesClause(
  item: StorefrontProductListItem,
  source: string,
  selected: readonly string[],
  attributes: ProductFacetAttributes
): boolean {
  if (source === 'price') return matchesPrice(item, selected[0]);
  if (source === 'availability') {
    return selected.some((value) => (IN_STOCK_VALUES.has(value) ? inStock(item) : !inStock(item)));
  }
  if (source === 'category') {
    const slug = attributes.category?.slug;
    if (slug === undefined) return true;
    return selected.includes(slug);
  }
  if (source === 'collection') {
    const terms = attributes.collections;
    if (terms === undefined) return true;
    return selected.some((value) => terms.some((term) => term.slug === value));
  }
  if (source.startsWith(OPTION_SOURCE_PREFIX)) {
    const values = optionValuesOf(item, attributes, source.slice(OPTION_SOURCE_PREFIX.length));
    if (values === undefined) return true;
    return selected.some((value) => values.some((candidate) => candidate.value === value));
  }
  // An unknown source is ignored rather than treated as "matches nothing": a backend that does
  // not know a filter has no business emptying the grid because of it.
  return true;
}

/**
 * Every clause is AND-ed across sources and OR-ed within one source, the ordinary faceted-search
 * semantics the block's own UI implies (ticking two colours widens, ticking a colour and a size
 * narrows).
 *
 * `availability` and `price` read the item itself, so they work for any source. `category`,
 * `collection` and `option:*` need `attributes`; see `ProductFacetAttributes` for what an absent
 * one means.
 */
export function matchesFilters(
  item: StorefrontProductListItem,
  filters: Record<string, string[]> | undefined,
  attributes: ProductFacetAttributes = NOTHING_KNOWN
): boolean {
  return matchesFiltersExcept(item, filters, null, attributes);
}

/**
 * `matchesFilters` with one source left out — the whole of the "counts ignore the facet's own
 * filter" rule, and the reason it is written once here rather than in each source.
 *
 * `ignore` is a `filters` key (`category`, `option:colour`, `price`), or `null` to judge every
 * clause.
 */
export function matchesFiltersExcept(
  item: StorefrontProductListItem,
  filters: Record<string, string[]> | undefined,
  ignore: string | null,
  attributes: ProductFacetAttributes = NOTHING_KNOWN
): boolean {
  if (filters === undefined) return true;
  for (const [source, selected] of Object.entries(filters)) {
    if (selected.length === 0 || source === ignore) continue;
    if (!matchesClause(item, source, selected, attributes)) return false;
  }
  return true;
}

/** `matchesFilters` over a list, keeping the list's own order (so a server-side sort survives). */
export function filterItems(
  items: readonly StorefrontProductListItem[],
  filters: Record<string, string[]> | undefined,
  attributesFor?: ProductFacetAttributesFor
): StorefrontProductListItem[] {
  if (!hasActiveFilters(filters)) return [...items];
  return items.filter((item) => matchesFilters(item, filters, attributesFor?.(item)));
}

/** Whether a request carries anything to filter on at all — `{}` and `{colour: []}` do not. */
export function hasActiveFilters(filters: Record<string, string[]> | undefined): boolean {
  if (filters === undefined) return false;
  return Object.values(filters).some((selected) => selected.length > 0);
}

export interface DeriveFacetsOptions {
  /** The filters the scope was read under, so each family's counts can ignore its own. */
  filters?: Record<string, string[]>;
  /** The per-product attributes a card does not carry (`category`, `collections`, `options`). */
  attributesFor?: ProductFacetAttributesFor;
}

/**
 * **The client-side fallback for the platform's `facets` object**, counted over the products a
 * source actually fetched.
 *
 * It answers the same `CatalogFacets` shape the gateway will, under the same two rules
 * (`types.ts`): a family's counts are computed with that family's own filter left out, and the
 * price bounds with every filter except price applied. So ticking one colour leaves the other
 * colours countable, and dragging a price thumb never moves the track.
 *
 * What it can see is bounded by what it was given. The vocabulary — which values exist, in which
 * order, under which labels — comes from the items themselves and from `attributesFor`, so a
 * backend that tells a source nothing about categories produces no category values rather than
 * invented ones, and a value that only exists beyond the fetched window is simply not there. That
 * is the limit the server-side facets remove.
 */
export function deriveFacets(
  items: readonly StorefrontProductListItem[],
  options: DeriveFacetsOptions = {}
): CatalogFacets {
  const { filters, attributesFor } = options;
  const attributesOf = (item: StorefrontProductListItem): ProductFacetAttributes =>
    attributesFor?.(item) ?? NOTHING_KNOWN;
  /** The scope one family counts against: every filter but its own. */
  const scopeWithout = (ignore: string): StorefrontProductListItem[] =>
    items.filter((item) => matchesFiltersExcept(item, filters, ignore, attributesOf(item)));

  return {
    price: priceBounds(scopeWithout('price')),
    categories: termFacet(items, scopeWithout('category'), (item) => {
      const term = attributesOf(item).category;
      return term === undefined ? [] : [term];
    }),
    collections: termFacet(
      items,
      scopeWithout('collection'),
      (item) => attributesOf(item).collections ?? []
    ),
    availability: availabilityCounts(scopeWithout('availability')),
    options: optionFacets(items, scopeWithout, attributesOf),
  };
}

/** The span of the loaded items, or a zero span when there is nothing to span. */
function priceBounds(items: readonly StorefrontProductListItem[]): { min: number; max: number } {
  if (items.length === 0) return { min: 0, max: 0 };
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const amount = item.price.amount;
    if (!Number.isFinite(amount)) continue;
    if (amount < min) min = amount;
    if (amount > max) max = amount;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

/**
 * One term family (categories, collections): the vocabulary in the order the items first name it,
 * counted over `scope` — the set every filter *but this family's own* was applied to. A term the
 * other filters exclude is therefore listed with a count of 0 rather than dropped, which is what
 * lets the panel disable it instead of making it disappear under the shopper's pointer.
 */
function termFacet(
  all: readonly StorefrontProductListItem[],
  scope: readonly StorefrontProductListItem[],
  termsOf: (item: StorefrontProductListItem) => readonly ProductFacetTerm[]
): CatalogFacetTerm[] {
  const vocabulary = new Map<string, ProductFacetTerm>();
  for (const item of all) {
    for (const term of termsOf(item)) {
      if (!vocabulary.has(term.slug)) vocabulary.set(term.slug, term);
    }
  }
  const counts = new Map<string, number>();
  for (const item of scope) {
    for (const term of termsOf(item)) {
      counts.set(term.slug, (counts.get(term.slug) ?? 0) + 1);
    }
  }
  return [...vocabulary.values()].map((term) => ({
    id: term.id ?? term.slug,
    slug: term.slug,
    title: term.title ?? term.slug,
    count: counts.get(term.slug) ?? 0,
  }));
}

function availabilityCounts(items: readonly StorefrontProductListItem[]): {
  in_stock: number;
  out_of_stock: number;
} {
  const available = items.filter(inStock).length;
  return { in_stock: available, out_of_stock: items.length - available };
}

/**
 * Every variant option the items name, each counted over the scope its *own* filter was left out
 * of — so the colour counts narrow when a size is ticked and stay put when another colour is.
 *
 * `name` is the option's key: a product list row carries no display name for an option, and a
 * group title the shopper reads belongs to the theme's own strings (`collection-grid` labels its
 * groups from `filters[].label` or its i18n set), never to a raw store key.
 */
function optionFacets(
  all: readonly StorefrontProductListItem[],
  scopeWithout: (ignore: string) => StorefrontProductListItem[],
  attributesOf: (item: StorefrontProductListItem) => ProductFacetAttributes
): CatalogFacetOption[] {
  const vocabulary = new Map<string, Map<string, ProductFacetOptionValue>>();
  for (const item of all) {
    const attributes = attributesOf(item);
    for (const key of optionKeysOf(item, attributes)) {
      const values = optionValuesOf(item, attributes, key) ?? [];
      const known = vocabulary.get(key) ?? new Map<string, ProductFacetOptionValue>();
      vocabulary.set(key, known);
      for (const value of values) {
        if (!known.has(value.value)) known.set(value.value, value);
      }
    }
  }

  const out: CatalogFacetOption[] = [];
  for (const [key, known] of vocabulary) {
    const scope = scopeWithout(`${OPTION_SOURCE_PREFIX}${key}`);
    const counts = new Map<string, number>();
    for (const item of scope) {
      for (const value of optionValuesOf(item, attributesOf(item), key) ?? []) {
        counts.set(value.value, (counts.get(value.value) ?? 0) + 1);
      }
    }
    const values: CatalogFacetOptionValue[] = [...known.values()].map((value) => ({
      value: value.value,
      label: value.label ?? value.value,
      ...(value.swatch === undefined ? {} : { swatch: value.swatch }),
      count: counts.get(value.value) ?? 0,
    }));
    if (values.length > 0) out.push({ key, name: key, values });
  }
  return out;
}

/** Which options one product has values for: what it declares, plus the card's own colours. */
function optionKeysOf(
  item: StorefrontProductListItem,
  attributes: ProductFacetAttributes
): string[] {
  const keys = Object.keys(attributes.options ?? {});
  if (attributes.options?.[COLOUR_OPTION_KEY] === undefined && item.colours !== undefined) {
    keys.push(COLOUR_OPTION_KEY);
  }
  return keys;
}
