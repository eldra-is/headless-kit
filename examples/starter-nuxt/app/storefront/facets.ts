/**
 * The shopper's facets, applied over a list of products, and the facets counted over that same list
 * — **the demo storefront's half of the filter contract**, and the vocabulary both halves share.
 *
 * `collection-grid` sends `filters` keyed by its own `filters[].source` ids (see that block's
 * `requestFiltersFor`): `category`, `collection`, `option:size`, `option:colour`, `availability`,
 * and `price` as a single `"<min>-<max>"` string in whole major units with either end allowed to be
 * empty. `createDemoStorefront` answers the whole of that request from its own fixture through
 * `filterItems` and `deriveFacets`, which is what lets a Storybook story, a sample page and a spec
 * filter for real with no gateway behind them — and what keeps a shopper from being shown a filter
 * that moves the chips, the URL and the active-filter row while the grid stays as it was.
 *
 * `createGatewayStorefront` does neither: the catalog list filters and counts server-side
 * (`gateway.ts`, public contract 3.7.0), over the whole collection rather than the rows one read
 * could reach. What it still shares is `canonicalAvailability*` — which spellings the `availability`
 * family has, including the retired hyphenated one a shared link may carry — because that is the
 * theme's own vocabulary rather than any one backend's, and `collection-grid` reads a URL through it
 * too.
 *
 * Everything here is pure: no Vue, no client, no module state — which is what lets
 * `test/storefront/facets.spec.ts` pin every bound on its own.
 */
import { ancestorsOf, EMPTY_CATEGORY_INDEX, type CategoryIndex } from './categories';
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

/**
 * The two `availability` values the platform's facets count, and the whole filter vocabulary: the
 * hyphenated spellings are read as well, so a link shared before the rename still filters.
 *
 * Anything else — `backorder` from a theme that offered it, a value some other storefront invented
 * — is **unknown**, and an unknown clause is ignored rather than treated as unmatched, exactly as
 * every other source in this file is. Reading it as "not in stock" showed a shopper following an
 * old link nothing but the sold-out products, under a chip quoting the word they clicked.
 */
export const IN_STOCK = 'in_stock';
export const OUT_OF_STOCK = 'out_of_stock';
const IN_STOCK_VALUES = new Set([IN_STOCK, 'in-stock']);
const OUT_OF_STOCK_VALUES = new Set([OUT_OF_STOCK, 'out-of-stock']);

/**
 * The current spelling of one `availability` value, or `null` for a value this pass does not know.
 *
 * The block normalises its own state through this, so a legacy spelling out of a URL ticks the box
 * it means instead of appearing beside it as an untranslated third row.
 */
export function canonicalAvailability(value: string): string | null {
  if (IN_STOCK_VALUES.has(value)) return IN_STOCK;
  if (OUT_OF_STOCK_VALUES.has(value)) return OUT_OF_STOCK;
  return null;
}

/** Every value of an `availability` clause in its current spelling, de-duplicated, unknowns
 *  dropped. `[]` when nothing in it is a value this vocabulary has. */
export function canonicalAvailabilityValues(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const canonical = canonicalAvailability(value);
    if (canonical !== null && !out.includes(canonical)) out.push(canonical);
  }
  return out;
}

/** A category or collection a product belongs to: the `slug` is the filter value, the `title` is
 *  what the shopper reads, and `id` is the catalog id when the source knows one — which is also what
 *  a `category` clause resolves a parent through (see `matchesClause`). */
export interface ProductFacetTerm {
  slug: string;
  title?: string;
  id?: string;
  /** Where the term sits in the category tree — carried through to `CatalogFacetTerm.parentId`, which
   *  is what lets the filter panel nest it. Absent on a flat family, and on every collection. */
  parentId?: string | null;
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
  attributes: ProductFacetAttributes,
  categories: CategoryIndex
): boolean {
  if (source === 'price') return matchesPrice(item, selected[0]);
  if (source === 'availability') {
    const known = canonicalAvailabilityValues(selected);
    if (known.length === 0) return true;
    return known.some((value) => (value === IN_STOCK ? inStock(item) : !inStock(item)));
  }
  if (source === 'category') {
    const term = attributes.category;
    if (term?.slug === undefined) return true;
    if (selected.includes(term.slug)) return true;
    // **A ticked parent carries its whole branch.** The filter panel offers parent rows, and the
    // platform's own `categoryId` filter expands a category to its descendants — so a product in
    // `Cups` matches a shopper's `tableware`. Without the tree there is nothing to expand through
    // and this is the direct match it always was.
    if (term.id === undefined) return false;
    return ancestorsOf(categories, term.id).some((ancestor) => selected.includes(ancestor.slug));
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
  attributes: ProductFacetAttributes = NOTHING_KNOWN,
  /** The store's category tree, so a ticked **parent** category matches a product in a child of it.
   *  Omitted — a source with no tree — and a `category` clause is the direct match it always was. */
  categories: CategoryIndex = EMPTY_CATEGORY_INDEX
): boolean {
  return matchesFiltersExcept(item, filters, null, attributes, categories);
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
  attributes: ProductFacetAttributes = NOTHING_KNOWN,
  categories: CategoryIndex = EMPTY_CATEGORY_INDEX
): boolean {
  if (filters === undefined) return true;
  for (const [source, selected] of Object.entries(filters)) {
    if (selected.length === 0 || source === ignore) continue;
    if (!matchesClause(item, source, selected, attributes, categories)) return false;
  }
  return true;
}

/** `matchesFilters` over a list, keeping the list's own order (so a server-side sort survives). */
export function filterItems(
  items: readonly StorefrontProductListItem[],
  filters: Record<string, string[]> | undefined,
  attributesFor?: ProductFacetAttributesFor,
  categories: CategoryIndex = EMPTY_CATEGORY_INDEX
): StorefrontProductListItem[] {
  if (!hasActiveFilters(filters)) return [...items];
  return items.filter((item) => matchesFilters(item, filters, attributesFor?.(item), categories));
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
  /**
   * The store's category tree, so the `categories` family comes out **placed and counted up**: every
   * term carries its `parentId`, every ancestor is a term of its own, and a product counts towards its
   * own category and each ancestor above it (`categoryTermsOf`). That is what lets the filter panel
   * draw parent rows — and it is only honest here because `matchesClause` expands a ticked parent to
   * its descendants too, the way the platform's own `categoryId` does.
   *
   * Omitted — a source with no tree to declare — and the family is flat, its counts direct, exactly as
   * it was: the panel then offers no parent row at all (`CatalogFacets.categoryCounts`).
   */
  categories?: CategoryIndex;
}

/**
 * **The `facets` object counted in the client**, over the products a source holds — the demo
 * storefront's answer, where the fixture *is* the whole catalogue.
 *
 * It answers the same `CatalogFacets` shape the platform does, under the same two rules
 * (`types.ts`): a family's counts are computed with that family's own filter left out, and the
 * price bounds with every filter except price applied. So ticking one colour leaves the other
 * colours countable, and dragging a price thumb never moves the track.
 *
 * What it can see is bounded by what it was given. The vocabulary — which values exist, in which
 * order, under which labels — comes from the items themselves and from `attributesFor`, so a
 * backend that tells a source nothing about categories produces no category values rather than
 * invented ones, and a value that only exists beyond the list is simply not there. That is the one
 * limit a count made where the whole catalogue lives does not have.
 */
export function deriveFacets(
  items: readonly StorefrontProductListItem[],
  options: DeriveFacetsOptions = {}
): CatalogFacets {
  const { filters, attributesFor, categories = EMPTY_CATEGORY_INDEX } = options;
  const attributesOf = (item: StorefrontProductListItem): ProductFacetAttributes =>
    attributesFor?.(item) ?? NOTHING_KNOWN;
  /** The scope one family counts against: every filter but its own. */
  const scopeWithout = (ignore: string): StorefrontProductListItem[] =>
    items.filter((item) =>
      matchesFiltersExcept(item, filters, ignore, attributesOf(item), categories)
    );

  return {
    price: priceBounds(scopeWithout('price')),
    categories: termFacet(items, scopeWithout('category'), (item) =>
      categoryTermsOf(attributesOf(item).category, categories)
    ),
    // The ancestor counts above are this derivation's own and are **deduplicated**, because a product
    // is counted once per term however many of its categories lead there. So the panel must not sum
    // them again (`CatalogFacets.categoryCounts`) — unlike the platform's counts today, which are per
    // assigned category and which the panel does roll up. A source with no tree declares nothing,
    // which reads as `'direct'`, which is what a flat family is.
    ...(categories.byId.size > 0 ? { categoryCounts: 'rolled-up' as const } : {}),
    collections: termFacet(
      items,
      scopeWithout('collection'),
      (item) => attributesOf(item).collections ?? []
    ),
    availability: availabilityCounts(scopeWithout('availability')),
    options: optionFacets(items, scopeWithout, attributesOf),
  };
}

/**
 * **The category terms one product counts towards: its own, and every ancestor above it.**
 *
 * Both halves of why. A product assigned to `Cups` is a product in `Tableware`, and a filter on
 * `tableware` returns it (`matchesClause` expands a ticked parent the same way the platform's own
 * `categoryId` does) — so a facet that counted only the leaf would offer a parent row claiming 0 and
 * then return 28, which is the one thing a count may never do. And the ancestors have to be in the
 * *vocabulary* at all, or the parent row the shopper wants to tick is not there to tick: a catalogue
 * of cups and bowls names those two and never names what they are.
 *
 * Counted **once per term**, because the vocabulary is a set: a product in two sibling categories is
 * one product under their parent, not two.
 *
 * Without a tree there is nothing above anything, and this is the single direct term it always was.
 */
function categoryTermsOf(
  term: ProductFacetTerm | undefined,
  categories: CategoryIndex
): readonly ProductFacetTerm[] {
  if (term === undefined) return [];
  if (term.id === undefined || categories.byId.size === 0) return [term];
  const placed = { ...term, parentId: categories.byId.get(term.id)?.parentId ?? null };
  return [...ancestorsOf(categories, term.id), placed];
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
    ...(term.parentId === undefined ? {} : { parentId: term.parentId }),
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
    // **The kind comes from the values, because this source has no merchant to ask.** A real store's
    // facets carry the option's own `kind` (`gateway.ts`'s `mapFacets`); a derivation over product
    // *cards* has only what those cards carry, and a swatch is the one thing only a `color` option
    // ever has (`StorefrontProductListItem.colours`, `ProductFacetOptionValue.swatch`). Nothing is
    // read off the key: an option named `colour` whose values carry no swatch is `none` here, the
    // same answer the live site would give for an option a merchant left on None.
    const kind = values.some((value) => value.swatch !== undefined) ? 'color' : 'none';
    if (values.length > 0) out.push({ key, name: key, kind, values });
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
