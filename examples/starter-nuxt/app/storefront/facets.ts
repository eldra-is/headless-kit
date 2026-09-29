/**
 * The shopper's facets, applied over a list of products — the one implementation both storefront
 * sources run.
 *
 * `collection-grid` sends `filters` keyed by its own `filters[].source` ids (see that block's
 * `requestFiltersFor`): `category`, `option:size`, `option:colour`, `availability`, and `price` as
 * a single `"<min>-<max>"` string in whole major units with either end allowed to be empty.
 * `createDemoStorefront` used to answer that request with a private copy of this pass while
 * `createGatewayStorefront` dropped every facet before its list read — so the demo filtered and
 * the real site did not: `?minPrice=50&maxPrice=150` still showed the $48 bowl, with the chips,
 * the URL and the active-filter row all insisting it had been filtered.
 *
 * The gateway's list endpoints filter on `id`/`slug`/`status`/`createdAt` only (a facet token is a
 * 400, not an empty list — see `gateway.ts`), so until the gateway grows a facet parameter the
 * honest answer is to apply the same pass client-side over what it fetched. Everything here is
 * pure: no Vue, no client, no module state — which is what lets `test/storefront/facets.spec.ts`
 * pin every bound on its own.
 */
import type { StorefrontFacet, StorefrontProductListItem } from './types';

/**
 * What a source knows about one product beyond what a product *card* shows. A property left
 * `undefined` means "this backend cannot tell", and a filter on it is then **ignored** rather than
 * treated as unmatched: a backend that does not know which sizes a product is made in has no
 * business emptying the grid because the shopper ticked "M". An empty array is the opposite — a
 * known "none", which matches nothing.
 */
export interface ProductFacetAttributes {
  /** The `category` facet value this product sits under. */
  category?: string;
  /** The `size` facet values. */
  sizes?: readonly string[];
  /** The `colour` facet values (lower-cased colour names). */
  colours?: readonly string[];
}

const NOTHING_KNOWN: ProductFacetAttributes = {};

/**
 * `"<min>-<max>"` in whole major units, either end empty for "no bound" (`grid.pricePrefix` is
 * `$`). **Both bounds are inclusive** — a shopper asking for 50–150 means 50 and 150 are in.
 */
export function matchesPrice(item: StorefrontProductListItem, range: string | undefined): boolean {
  if (range === undefined) return true;
  const [rawMin = '', rawMax = ''] = range.split('-');
  const amount = item.price.amount;
  if (rawMin !== '' && amount < Number(rawMin)) return false;
  if (rawMax !== '' && amount > Number(rawMax)) return false;
  return true;
}

/**
 * Every clause is AND-ed across sources and OR-ed within one source, the ordinary faceted-search
 * semantics the block's own UI implies (ticking two colours widens, ticking a colour and a size
 * narrows).
 *
 * `availability` and `price` read the item itself, so they work for any source. `category`,
 * `option:size` and `option:colour` need `attributes`; see `ProductFacetAttributes` for what an
 * absent one means.
 */
export function matchesFilters(
  item: StorefrontProductListItem,
  filters: Record<string, string[]> | undefined,
  attributes: ProductFacetAttributes = NOTHING_KNOWN
): boolean {
  if (filters === undefined) return true;

  for (const [source, selected] of Object.entries(filters)) {
    if (selected.length === 0) continue;
    if (source === 'category') {
      if (attributes.category === undefined) continue;
      if (!selected.includes(attributes.category)) return false;
    } else if (source === 'option:size') {
      const sizes = attributes.sizes;
      if (sizes === undefined) continue;
      if (!selected.some((value) => sizes.includes(value))) return false;
    } else if (source === 'option:colour') {
      const colours = attributes.colours;
      if (colours === undefined) continue;
      if (!selected.some((value) => colours.includes(value))) return false;
    } else if (source === 'availability') {
      // "In stock" means orderable now; "Include back-order" additionally admits pre-orders. A
      // sold-out product matches neither, which is why ticking either one drops it.
      const admits = selected.some((value) =>
        value === 'backorder' ? item.stock === 'preorder' : item.available && item.stock !== 'out'
      );
      if (!admits) return false;
    } else if (source === 'price') {
      if (!matchesPrice(item, selected[0])) return false;
    }
    // An unknown source is ignored rather than treated as "matches nothing": a backend that does
    // not know a filter has no business emptying the grid because of it.
  }
  return true;
}

/** `matchesFilters` over a list, keeping the list's own order (so a server-side sort survives). */
export function filterItems(
  items: readonly StorefrontProductListItem[],
  filters: Record<string, string[]> | undefined,
  attributesFor?: (item: StorefrontProductListItem) => ProductFacetAttributes | undefined
): StorefrontProductListItem[] {
  if (!hasActiveFilters(filters)) return [...items];
  return items.filter((item) => matchesFilters(item, filters, attributesFor?.(item)));
}

/** Whether a request carries anything to filter on at all — `{}` and `{colour: []}` do not. */
export function hasActiveFilters(filters: Record<string, string[]> | undefined): boolean {
  if (filters === undefined) return false;
  return Object.values(filters).some((selected) => selected.length > 0);
}

/**
 * The facets a source can honestly derive from the products it just fetched, counted over those
 * products — the same thing `createDemoStorefront`'s `countedFacets` does, minus a vocabulary to
 * count against.
 *
 * Only the attributes a `StorefrontProductListItem` actually carries can be derived this way, and
 * today that is `colours` (name and swatch are the store's own content, so the values need no
 * translation here). `category`, `size` and `availability` are store vocabularies — which values
 * exist, in which order, under which labels — that a product list response does not carry; a
 * source that has them supplies its own `facets` instead of calling this, the way the demo does.
 * A group whose facet is missing renders no values, never invented ones.
 */
export function deriveFacets(items: readonly StorefrontProductListItem[]): StorefrontFacet[] {
  const colours = new Map<
    string,
    { value: string; label: string; count: number; swatch?: string }
  >();
  for (const item of items) {
    for (const colour of item.colours ?? []) {
      const value = colour.name.toLowerCase();
      const existing = colours.get(value);
      if (existing) existing.count += 1;
      else colours.set(value, { value, label: colour.name, count: 1, swatch: colour.swatch });
    }
  }
  if (colours.size === 0) return [];
  return [{ source: 'colour', label: 'Colour', values: [...colours.values()] }];
}
