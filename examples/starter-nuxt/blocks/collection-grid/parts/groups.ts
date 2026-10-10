/**
 * The `CatalogFacets → FilterFacet[]` adapter: turns the storefront's own description of a scope
 * into the shape `@eldrajs/ui`'s `FilterPanel` draws (`Block.vue`'s own `facets` computed calls
 * `buildFilterFacets`). The package never sees a catalogue shape or a router — this file, and
 * `Block.vue`'s own state around it, are the only place that translation happens.
 *
 * `filters[].source` is the *field's* vocabulary (`options`, `option:size`) while the storefront's
 * `CatalogFacets` is the *store's* (`options[].key` = `size`, `colour`) — `facetValuesFor` is the
 * one place those two are reconciled, together with the rule that decides which values a facet
 * offers at all. Everything here is pure, so the price arithmetic a slider and a URL share
 * (`parsePriceRange`/`rangeFromSlider`) and the panel-selection bridge (`applyPanelSelection`) are
 * provable without mounting anything.
 */
import { IN_STOCK, OUT_OF_STOCK } from '../../../app/storefront/facets';
import type { CatalogFacetTerm, CatalogFacets } from '../../../app/storefront/types';
import type {
  FilterFacet,
  FilterFacetLayout,
  FilterFacetType,
  FilterFacetValue,
  FilterSelection as UiFilterSelection,
} from '@eldrajs/ui';

/**
 * One variant option, by the key the store names it with: `option:size`, `option:colour`,
 * `option:fabric` — **any** key, not a list this theme maintains. The keys belong to the merchant's
 * own product options, so a store that spells its colour option `color` or sells by `fabric` is a
 * store this block filters for without a code change.
 */
export type OptionFilterSource = `option:${string}`;

/**
 * One yes/no facet beyond availability (`facets.toggles[]`), by the platform's own key. Folded as
 * more switch rows into the same combined `availability` facet — see `availabilityFacetValues`.
 */
export type ToggleFilterSource = `toggle:${string}`;

/**
 * **What a rendered facet filters on.** `options` is deliberately not here: it is a *field* value
 * that stands for "one facet per option key the store has" (`FilterFieldSource`), and the block
 * expands it into the `option:<key>` sources below before a facet exists.
 */
export type FilterSource =
  | 'category'
  | 'collection'
  | 'price'
  | 'availability'
  | OptionFilterSource
  | ToggleFilterSource;

/**
 * What an author may put in `filters[].source` — every rendered source, plus `options`.
 *
 * **`options` is a meta source**: one facet per option key the storefront's facets answer, labelled
 * by the facet's own `name`, in the facets' order. It exists because a merchant's option keys are
 * theirs, not the theme's — an author cannot list `option:size` and `option:colour` by hand without
 * knowing what the store sells by, and a store that adds `fabric` next season would need the page
 * edited to offer it. An explicit `option:<key>` row still works and **wins** for that key: that is
 * how an author pins one option's position in the panel or renames its facet.
 */
export type FilterFieldSource = FilterSource | 'options';

/** The `filters[].source` prefix one variant option is named with. */
export const OPTION_SOURCE = 'option:';
/** The internal source prefix a `facets.toggles[]` entry is named with — never an author-facing
 *  vocabulary; these rows are always folded into the `availability` facet (see below). */
export const TOGGLE_SOURCE = 'toggle:';

/** The option key a source names, or `null` for a source that is not an option. */
export function optionKeyOf(source: string): string | null {
  if (!source.startsWith(OPTION_SOURCE)) return null;
  const key = source.slice(OPTION_SOURCE.length);
  return key === '' ? null : key;
}

/** The toggle key a source names, or `null` for a source that is not one. */
export function toggleKeyOf(source: string): string | null {
  if (!source.startsWith(TOGGLE_SOURCE)) return null;
  const key = source.slice(TOGGLE_SOURCE.length);
  return key === '' ? null : key;
}

/** `option:<key>` for one of the store's own option keys. */
export function optionSourceFor(key: string): OptionFilterSource {
  return `${OPTION_SOURCE}${key}`;
}

/** `toggle:<key>` for one of the store's own toggle keys. */
export function toggleSourceFor(key: string): ToggleFilterSource {
  return `${TOGGLE_SOURCE}${key}`;
}

/**
 * A toggle's own `on_sale`-style key, camelCased for the one query key it reads and writes
 * (`onSale`) — the URL's own convention for everything else in this file is the bare option/source
 * key, but a toggle is a single yes/no flag rather than a value list, so it reads best as the
 * camelCase query parameters the rest of the app already uses for boolean state.
 */
export function toggleQueryKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase());
}

/**
 * The four sources that are **one facet each, always** — everything a URL and a request can carry
 * besides the open-ended option/toggle keys. The block enumerates these when it reads the query
 * string and when it clears it; the option and toggle keys it enumerates from the facets and from
 * its own selection, since there is no closed list of them.
 */
export const FIXED_FILTER_SOURCES = [
  'category',
  'collection',
  'price',
  'availability',
] as const satisfies readonly FilterSource[];

/**
 * **The query keys an option or toggle key may not take**, because something else already owns them
 * in the one namespace they share — the URL.
 *
 * Four are the fixed filter sources' own (`?category=`, `?collection=`, `?price=`, `?availability=`);
 * five more are the keys the storefront route reads into typed fields of its own before a block ever
 * sees them (`q`, `page`, `token`, `sort`, `columns` — `app/plugins/eldra-storefront.ts`'s
 * `RESERVED_QUERY_KEYS`, which is where `route.filters` gets everything *else*).
 *
 * An option key is a merchant's own word, and `options` exists so any of them works — so a store
 * whose variant option happens to be keyed `category` or `sort` is a real possibility, and both
 * collisions are silent and ugly. A key colliding with a filter source reads the *same* query key as
 * that source, so one `?category=ceramics` goes out as both a `categoryId` and an `option=…`, AND-ed,
 * emptying the grid; ticking it then writes the key twice in one patch and the filter un-applies on
 * the next read. A key colliding with a route field (`sort` above all) is never readable from the URL
 * at all — it lands in `route.sort`, not in `route.filters` — while every state write would clear the
 * shopper's sort out of the URL.
 *
 * So such a key is **dropped**, with a dev warning naming it (`usableOptionKey`). Namespacing it
 * instead was the alternative and was not taken: the query key is a shopper-visible, shareable part
 * of the URL, and inventing `?opt_category=` for one store means a link that no other spelling of
 * this theme reads. Dropping offers one facet fewer and keeps every other filter exactly right.
 */
const RESERVED_QUERY_KEYS: ReadonlySet<string> = new Set<string>([
  ...FIXED_FILTER_SOURCES,
  'q',
  'page',
  'token',
  'sort',
  'columns',
]);

const warnedKeys = new Set<string>();

/**
 * One option (or toggle) key, or `null` when the URL already belongs to something else
 * (`RESERVED_QUERY_KEYS`).
 *
 * The warning is once per key per session and dev-only, read through the same cast
 * `app/storefront/commerce.ts` uses — the starter does not depend on `vite` itself, and an
 * environment defining neither `DEV` flag simply never warns, which is the safe direction.
 */
export function usableOptionKey(key: string | null): string | null {
  if (key === null) return null;
  if (!RESERVED_QUERY_KEYS.has(key)) return key;
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  if (meta.env?.DEV === true && !warnedKeys.has(key)) {
    warnedKeys.add(key);
    console.warn(
      `[eldra] collection-grid: the variant option "${key}" cannot be filtered on, because ` +
        `?${key}= already belongs to another filter or to the page's own route state. ` +
        'Its facet is not shown. Rename the option key in the store to offer it.'
    );
  }
  return null;
}

export function isFilterSource(value: unknown): value is FilterSource {
  if (typeof value !== 'string') return false;
  if ((FIXED_FILTER_SOURCES as readonly string[]).includes(value)) return true;
  return optionKeyOf(value) !== null || toggleKeyOf(value) !== null;
}

/** Whether a `filters[].source` is one this block understands — `isFilterSource`, plus `options`. */
export function isFilterFieldSource(value: unknown): value is FilterFieldSource {
  return value === 'options' || isFilterSource(value);
}

/**
 * **The query key a source is spelled with**, in both directions: what the block writes and what it
 * reads back. An option is its bare key (`?colour=oat`) — the `option:` prefix is the *field's*
 * vocabulary, never a shopper's URL. A toggle is its own camelCase key (`?onSale=1`).
 */
export function queryKeyFor(source: FilterSource): string {
  const toggleKey = toggleKeyOf(source);
  if (toggleKey !== null) return toggleQueryKey(toggleKey);
  return optionKeyOf(source) ?? source;
}

/** The two `availability` values, as this theme's own strings name them. */
export interface AvailabilityLabels {
  inStock: string;
  outOfStock: string;
}

/** Selected values per `filters[].source`, the block's own internal state — the price range lives
 *  in its own two strings (`priceMin`/`priceMax`), and a toggle's is `[]` or `['1']`. */
export type FilterSelection = Partial<Record<FilterSource, string[]>>;

/** One `filters[]` row, expanded (`options` already resolved to real sources) and ready to build. */
export interface FacetBuildRow {
  source: FilterSource;
  label?: string;
  collapsed?: boolean;
}

/** What a request to build a facet's values needs to know, besides the source itself. */
interface ValueBuildContext {
  facets: CatalogFacets | undefined;
  availability: AvailabilityLabels;
  categoryScopeSlug: string | null;
}

/**
 * The values a facet offers: the store's own, each with the count the facets report.
 *
 * **A value the store counts zero of is offered disabled, not dropped** (spec → Do / Don't): facet
 * counts leave their own family's filter out, so a zero means "another filter rules this out", and a
 * control that disappears the moment a neighbour is ticked moves every control after it. The one
 * exception is a value the shopper has already selected — never disabled, so the filter stays
 * removable — and a selected value the facets no longer *list at all* is appended rather than lost,
 * labelled by its raw value since nothing describes it any more.
 */
export function facetValuesFor(
  source: FilterSource,
  context: ValueBuildContext,
  selected: readonly string[]
): FilterFacetValue[] {
  const out: FilterFacetValue[] = rawFacetValuesFor(source, context).map((value) => {
    // A row its ticked parent already covers is neither operable nor countable on its own: the
    // request carries the parent's id and the platform expands it, so this row's own count
    // describes a filter nobody sent. It is drawn ticked and inoperable instead
    // (`FilterFacetValue.implied`), which is also why the `disabled` rule below does not get a say
    // — an implied row is disabled whatever it counts.
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
      out.push({ value, label: unlistedLabel(source, value, context.availability), count: 0 });
    }
  }
  return out;
}

/**
 * What a kept-but-unlisted value is called. The store's own words are gone with the value, so a
 * category or an option value can only be labelled by its raw slug — but **`availability` is the
 * one family the theme names itself**, so it is never shown the platform's spelling.
 *
 * That case is reachable: a store whose stock cannot be read answers no `availability` facet at
 * all, and a shopper arriving on a shared `?availability=in_stock` link still has the value
 * selected. The generic fallback drew them a checkbox and a chip reading literally `in_stock`, in
 * both locales.
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

function rawFacetValuesFor(
  source: FilterSource,
  { facets, categoryScopeSlug }: ValueBuildContext
): FilterFacetValue[] {
  if (facets === undefined) return [];
  if (source === 'category') {
    // On a category page the facet is that category's children and nothing else — flat, because
    // one level down is all there is to offer (see `childCategoryTerms`).
    if (categoryScopeSlug !== null) {
      return childCategoryTerms(facets.categories, categoryScopeSlug);
    }
    // **A parent row is only offered by a source that can honour one.** `categoryCounts:
    // 'rolled-up'` is the platform saying it counted the ancestors itself — and the contract that
    // added those counts (3.8.0) added the `parentId` that places them *and* the `categoryId` that
    // matches a whole subtree, together. A gateway answering anything else counts assignments and
    // matches direct membership only, so a `Tableware` row there is a filter it cannot honour: the
    // shopper would tick it and get an empty grid under a URL saying otherwise, which is the one
    // thing this whole server-side filter path exists to remove. So that family stays exactly as
    // flat as it always was.
    if (facets.categoryCounts !== 'rolled-up') return facets.categories.map(flatTermValue);
    return nestCategoryTerms(facets.categories);
  }
  if (source === 'collection') {
    // Flat, and not by omission: a collection is a curated list, not a level of anything.
    return facets.collections.map(flatTermValue);
  }
  const optionKey = optionKeyOf(source);
  if (optionKey === null) return [];
  const option = facets.options.find((candidate) => candidate.key === optionKey);
  return (option?.values ?? []).map((value) => ({
    value: value.value,
    label: value.label,
    count: value.count,
    ...(value.swatch === undefined ? {} : { swatch: value.swatch }),
    ...(value.group === undefined ? {} : { group: value.group }),
  }));
}

/**
 * **The children of one category, as rows the panel can draw** — the `category` facet on a
 * category page.
 *
 * The scope already *is* that category, so the whole tree is the wrong vocabulary: a row for the
 * category itself would narrow nothing, and a row for a sibling or a cousin would narrow to nothing
 * at all. Its children are the only values that divide the page, and each of them filters within
 * the subtree the page is scoped to, which is what the platform's `categoryId` already matches.
 *
 * The current category is found by **slug**, because that is what the route carries and what the
 * facets spell their terms with; its children are the terms whose `parentId` is its id. Flat, and
 * with the counts exactly as the source gave them — one level needs no indent, and no number here
 * is derived.
 *
 * `[]` whenever the family cannot be read that way: a source that places no term (`parentId`
 * absent, so no row can be known to be a child), or a scope whose own category the facets do not
 * name — an empty category, say. The block drops a facet with no values, which is the honest
 * answer: there is nothing here to divide.
 */
export function childCategoryTerms(
  terms: readonly CatalogFacetTerm[],
  categoryScopeSlug: string
): FilterFacetValue[] {
  const current = terms.find((term) => term.slug === categoryScopeSlug);
  if (current === undefined || current.id === '') return [];
  return terms.filter((term) => term.parentId === current.id).map(flatTermValue);
}

function flatTermValue(term: CatalogFacetTerm): FilterFacetValue {
  return { value: term.slug, label: term.title, count: term.count };
}

/** How deep the walk up a term's ancestors may go before it stops. A guard against a `parentId`
 *  cycle in the data, not a product decision — this runs inside a `computed`, where a hang is the
 *  block. */
const MAX_CATEGORY_DEPTH = 6;

/**
 * **The category family as rows the panel can draw: each parent followed by its children, indented
 * one level.**
 *
 * Only ever called for a family the platform has **placed and counted up itself** (public contract
 * 3.8.0 — see `rawFacetValuesFor`), so the terms arrive as a tree with every reported ancestor in
 * the same list and every count already the subtree's. A term that still carries no `parentId` at
 * all comes out flat: the whole of this is skipped, not approximated.
 *
 * **One level of indent, ever.** A category three deep is rendered under its top-most listed
 * ancestor, not at its own depth: a filter panel is not a tree view, every indent costs a 15rem
 * sidebar a column of label width, and a shopper ticking a grandchild gets the same filter either
 * way. Nothing is dropped — only flattened.
 *
 * **Order is the source's.** 3.8.0 answers depth-first by title, and this preserves whatever order
 * it was handed: the top rows keep their input order and each parent's children keep theirs, which
 * on an already depth-first list is no change at all. Nothing here sorts by count.
 *
 * **No count is derived.** A parent's number is the platform's own, deduplicated over its subtree,
 * and a sum over the children on screen is not — a product in Cups and in Bowls is one product and
 * two counts. So the numbers are used exactly as they came.
 */
export function nestCategoryTerms(terms: readonly CatalogFacetTerm[]): FilterFacetValue[] {
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
  // depth-first list (contract 3.8.0's own order) comes out exactly as it went in.
  const topIdOf = new Map(terms.map((term) => [term.id, topOf(term).id] as const));
  // Which terms are top rows: the ones that are their own top. A `parentId` cycle has none — every
  // term in it stops one short of itself — and a term whose top row does not exist is promoted to
  // one rather than nested under nothing, which is what keeps every row on screen and tickable.
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

  const out: FilterFacetValue[] = [];
  for (const top of tops) {
    out.push(flatTermValue(top));
    for (const child of childrenOf.get(top.id) ?? []) {
      out.push({ ...flatTermValue(child), parent: top.slug });
    }
  }
  return out;
}

/**
 * The combined `availability` facet's own values: "In stock only" (when the store can read stock)
 * followed by one switch row per `facets.toggles[]` entry (`on_sale`, …) — see `queryKeyFor` for
 * the one query key each toggle reads and writes. A selected value nothing lists any more (a stale
 * `?availability=out_of_stock` link, a toggle the store has stopped sending) is kept, unlabelled
 * where this theme has no name for it, the same rule every other family follows.
 */
export function availabilityFacetValues(
  facets: CatalogFacets | undefined,
  selection: FilterSelection,
  availability: AvailabilityLabels
): FilterFacetValue[] {
  if (facets === undefined) return [];
  const out: FilterFacetValue[] = [];
  if (facets.availability !== undefined) {
    const selected = (selection.availability ?? []).includes(IN_STOCK);
    out.push({
      value: IN_STOCK,
      label: availability.inStock,
      count: facets.availability.in_stock,
      ...(facets.availability.in_stock === 0 && !selected ? { disabled: true } : {}),
    });
  }
  for (const toggle of facets.toggles ?? []) {
    const selected = (selection[toggleSourceFor(toggle.key)] ?? []).length > 0;
    out.push({
      value: toggle.key,
      label: toggle.label,
      count: toggle.count,
      ...(toggle.count === 0 && !selected ? { disabled: true } : {}),
    });
  }
  const listed = new Set(out.map((value) => value.value));
  for (const value of selection.availability ?? []) {
    if (!listed.has(value)) {
      out.push({ value, label: unlistedLabel('availability', value, availability), count: 0 });
      listed.add(value);
    }
  }
  for (const source of Object.keys(selection)) {
    const key = toggleKeyOf(source);
    if (key === null || listed.has(key) || (selection[source as FilterSource]?.length ?? 0) === 0) {
      continue;
    }
    out.push({ value: key, label: key, count: 0 });
    listed.add(key);
  }
  return out;
}

/**
 * How a facet draws its values — **decided by the values, for an option.**
 *
 * A swatch is a colour the store sent as data, and the only control that can show one is
 * `ColourFacet`'s own dot, so an option whose values carry one is a colour facet whatever it is
 * keyed; a `group` (a size system — "Knitwear", "Socks (EU)") makes it a `size` facet; every other
 * option is a plain `list`. That is what lets an arbitrary option key render correctly without this
 * file knowing the key at all — the two hard-coded `size`/`colour` keys it used to carry meant a
 * store spelling its option `color` got a facet with no values and no group.
 *
 * `category` and `collection` are always `list` — neither is ever a colour or a size.
 */
export function facetTypeFor(
  source: FilterSource,
  values: readonly FilterFacetValue[]
): FilterFacetType {
  if (optionKeyOf(source) === null) return 'list';
  if (values.some((value) => value.swatch !== undefined)) return 'colour';
  if (values.some((value) => value.group !== undefined)) return 'size';
  return 'list';
}

/** Everything `buildFilterFacets` needs besides the rows themselves. */
export interface FacetBuildOptions {
  facets: CatalogFacets | undefined;
  /** The block's own internal selection (per `FilterSource`, price excluded). */
  selection: FilterSelection;
  availability: AvailabilityLabels;
  categoryScopeSlug: string | null;
  /** Sources this scope cannot narrow by (`StorefrontCollectionProducts.unfilterable`). */
  unfilterable: ReadonlySet<string>;
  /** A facet's title when the author set none. */
  labelFor: (source: FilterSource) => string;
  /** The block's `colourLayout` field: swatch rows (`list`, the default) or swatch tiles (`grid`). */
  colourLayout: FilterFacetLayout;
  /** The block's `sizeGuideHref` field, already resolved to a plain URL. */
  sizeGuideHref?: string;
  price: {
    min: number;
    max: number;
    step: number;
    /** The block's `priceSlider` field. */
    slider: boolean;
    /** Whether this range is money the store can actually name (`money.currency` is known). */
    currency: boolean;
    histogram?: number[];
  };
}

/**
 * **The adapter's one entry point.** Builds the ordered `FilterFacet[]` `FilterPanel` draws, from
 * the author's own `filters[]` rows (already expanded — `options` resolved to real sources) and the
 * storefront's facets. A renderable-but-empty range is still included: `FilterPanel`'s own
 * `renderableFacets` drops a range with fewer than two distinct values, so this file does not
 * duplicate that rule. Every other facet with no values to offer (no store data, an empty
 * `availability`) is dropped here, same as it always was.
 */
export function buildFilterFacets(
  rows: readonly FacetBuildRow[],
  options: FacetBuildOptions
): FilterFacet[] {
  const out: FilterFacet[] = [];
  const seen = new Set<FilterSource>();
  for (const row of rows) {
    const { source } = row;
    if (options.unfilterable.has(source) || seen.has(source)) continue;
    seen.add(source);
    const label = (row.label ?? '').trim() || options.labelFor(source);
    const collapsed = row.collapsed === true;

    if (source === 'price') {
      // Omit a range where min === max: nothing for the panel to filter.
      if (options.price.min === options.price.max) continue;
      out.push({
        id: 'price',
        label,
        type: 'range',
        collapsed,
        min: options.price.min,
        max: options.price.max,
        step: options.price.step,
        currency: options.price.currency,
        slider: options.price.slider,
        ...(options.price.histogram ? { histogram: options.price.histogram } : {}),
      });
      continue;
    }

    if (source === 'availability') {
      const values = availabilityFacetValues(
        options.facets,
        options.selection,
        options.availability
      );
      if (values.length === 0) continue;
      out.push({ id: 'availability', label, type: 'toggle', collapsed, values });
      continue;
    }

    const values = facetValuesFor(source, options, options.selection[source] ?? []);
    if (values.length === 0) continue;
    const type = facetTypeFor(source, values);
    out.push({
      id: queryKeyFor(source),
      label,
      type,
      collapsed,
      values,
      ...(type === 'colour' ? { layout: options.colourLayout } : {}),
      ...(type === 'size' && options.sizeGuideHref ? { sizeGuideHref: options.sizeGuideHref } : {}),
    });
  }
  return out;
}

/**
 * Every rendered source's own `FilterSource`, keyed by the `FilterFacet.id` (the query key) the
 * panel uses — the reverse of `queryKeyFor`, for translating the panel's own selection back into
 * the block's internal one (`applyPanelSelection`). `availability` and `price` are deliberately not
 * here: both are translated by hand, the first because one ui facet id can span several internal
 * sources (availability plus every toggle), the second because it is never a value list.
 */
export function facetSourceMap(rows: readonly FacetBuildRow[]): ReadonlyMap<string, FilterSource> {
  const out = new Map<string, FilterSource>();
  for (const row of rows) {
    if (row.source === 'price' || row.source === 'availability') continue;
    out.set(queryKeyFor(row.source), row.source);
  }
  return out;
}

/**
 * The panel's own view of the selection (`FilterSelection` keyed by facet id), derived from the
 * block's internal one. One-way: the panel is controlled from this, and every change it reports
 * comes back through `applyPanelSelection`.
 */
export function panelSelectionFor(
  selection: FilterSelection,
  priceRange: { min: string; max: string },
  priceSpan: { min: number; max: number }
): UiFilterSelection {
  const out: UiFilterSelection = {};
  for (const [source, values] of Object.entries(selection)) {
    if (!values || values.length === 0) continue;
    if (toggleKeyOf(source) !== null) continue; // folded into `availability` below
    out[queryKeyFor(source as FilterSource)] = values;
  }
  const toggleKeys = Object.keys(selection)
    .filter((source) => (selection[source as FilterSource]?.length ?? 0) > 0)
    .map((source) => toggleKeyOf(source))
    .filter((key): key is string => key !== null);
  if (toggleKeys.length > 0) {
    out.availability = [...(out.availability ?? []), ...toggleKeys];
  }
  if (priceRange.min !== '' || priceRange.max !== '') {
    out.price = sliderValueFor(priceRange, priceSpan);
  }
  return out;
}

/**
 * The reverse of `panelSelectionFor`: what the panel's own `change` event reports, translated back
 * into the block's internal selection plus the price range it writes to the URL.
 *
 * Every non-price, non-`availability` key is resolved through `sources` (an unknown key — a stale
 * one from a facet the author has since removed — is simply dropped, the honest answer for a
 * selection nothing can act on). `availability`'s own array is split back into the canonical
 * `in_stock`/`out_of_stock` tokens and whichever toggle keys ride along with it, by key:
 * `toggleKeys` is this scope's current `facets.toggles[]` keys, so a value that is neither a known
 * availability token nor a current toggle key is dropped the same way an unknown source is.
 *
 * The price pair is run through `rangeFromSlider`, which is idempotent when nothing moved — safe to
 * call on every change, not only a price one.
 */
export function applyPanelSelection(
  next: UiFilterSelection,
  context: {
    sources: ReadonlyMap<string, FilterSource>;
    toggleKeys: ReadonlySet<string>;
    priceSpan: PriceSpan;
    appliedPrice: PriceRange;
  }
): { selection: FilterSelection; price: PriceRange } {
  const selection: FilterSelection = {};
  for (const [facetId, raw] of Object.entries(next)) {
    if (facetId === 'price') continue;
    const values = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    if (facetId === 'availability') {
      const avail = values.filter((value) => value === IN_STOCK || value === OUT_OF_STOCK);
      if (avail.length > 0) selection.availability = avail;
      for (const value of values) {
        if (avail.includes(value)) continue;
        if (context.toggleKeys.has(value)) selection[toggleSourceFor(value)] = ['1'];
      }
      continue;
    }
    const source = context.sources.get(facetId);
    if (source !== undefined && values.length > 0) selection[source] = values;
  }
  const priceVal = next.price;
  const pair: [number, number] =
    Array.isArray(priceVal) && typeof priceVal[0] === 'number' && typeof priceVal[1] === 'number'
      ? (priceVal as [number, number])
      : [context.priceSpan.min, context.priceSpan.max];
  const price = rangeFromSlider(pair, context.priceSpan, context.appliedPrice);
  return { selection, price };
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
 * moment another facet was touched, and dragging either thumb would then write that back as the
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
 * gesture moves one thumb — a drag, an arrow-key run, a typed value — so the other end keeps the
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
 *
 * Idempotent when the pair did not move at all (the panel reports the whole selection on every
 * change, price included): both ends still equal `wasMin`/`wasMax`, so the same `applied` comes
 * back out.
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
