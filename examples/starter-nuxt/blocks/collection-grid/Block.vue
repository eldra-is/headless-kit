<script setup lang="ts">
/**
 * Collection grid: a collection's products as a filterable, sortable card grid — a sticky filter
 * sidebar from 64rem of the block's own width, a filter drawer below that (and at every width in
 * `drawer-only`) (spec `02-blocks.md` "Collection grid", 3047–3170, over the shared "Product grid"
 * and "Progress bar" parts at 3036–3045).
 *
 * **Where the data comes from.** Everything a shopper sees — cards, prices, filter values, counts,
 * the total — is `useStorefront().catalog.collectionProducts()`; the CMS fields only configure the
 * block and carry the empty-state copy. The collection is the `collection` reference field when an
 * author picked one, else `route.collectionHandle` (the field's own help text: "Leave empty on a
 * collection page to use that collection"). Cards are always built by `toProductCard()`, the
 * one mapping every commerce block shares.
 *
 * **Where the state goes.** Selected filters, sort, columns and page belong in the URL so results
 * can be shared and the back button works (spec Do/Don't), but `blocks/**` may not touch a router:
 * the block writes its state out through `route.setQuery()` — the one writer `StorefrontRoute`
 * exposes — and the page turns that into a URL. It reads back only what that interface can give
 * back: `route.page`, which is what makes the `pages` style's numbered links real navigation rather
 * than component state. Filters, the price range, the sort and the column count are read back the
 * same way — `route.filters` is the generic bag every query key but the five typed ones lands in
 * (`QUERY_KEY` below is this block's own spelling of them) — so a shared URL restores the whole
 * grid state and the prerendered page stays the unfiltered one.
 *
 * **Two requests, not one.** The grid's request is driven by the *applied* selection. The drawer's
 * "Show N products" button needs the count for the *pending* one before it is applied — the spec is
 * explicit both that the number is live and that nothing else on the page may change until the
 * button is pressed (3.2.2) — so a second, `pageSize: 1` request answers only that. Its handle
 * stays `null` until the drawer is first opened, so a page nobody filters on never makes it.
 *
 * **Paging.** `load-more` grows one request's window (`pageSize × pagesLoaded`) so the grid keeps
 * every card already on screen, and hands the count, the decorative progress bar and the button to
 * the package's `LoadMore`. `pages` renders `Pagination` over real `hrefForPage` links routed by
 * `EldraRouterLink`, with `route.page` as the current page; its own `@container` already shows the
 * compact form below 48rem, which is why `compact` is left at its default.
 *
 * The filter groups themselves — and why they are not `Accordion`/`AccordionItem` — are documented
 * in `parts/FilterGroups.vue`.
 */
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type Component,
  type ComputedRef,
} from 'vue';
import {
  Badge,
  Button,
  Container,
  Drawer,
  EditorPlaceholder,
  EmptyState,
  FieldWrapper,
  FilterPanel,
  LoadMore,
  Pagination,
  ProductCard,
  Section,
  Select,
  Skeleton,
  VisuallyHidden,
  appliedFilters,
  useMessages,
  type FilterFacet,
  type FilterFacetLayout,
  type FilterSelection as UiFilterSelection,
  type SelectOption,
} from '@eldrajs/ui';
import { useEldraLink } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { iconComponent } from '../../app/composables/iconComponent';
import { useRevalidating } from '../../app/composables/useRevalidating';
import { useStorefront } from '../../app/composables/useStorefront';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import { useMoney } from '../../app/storefront/money';
import {
  collectionSelector,
  selectorNeedsPublish,
  selectorSlug,
} from '../../app/storefront/collectionSelector';
import type { StorefrontCollectionSelector } from '../../app/storefront/types';
import { canonicalAvailabilityValues } from '../../app/storefront/facets';
import { CATALOGUE_PATH } from '../../app/storefront/categories';
import { categoryHref, safeHref } from '../../app/utils/links';
import {
  applyPanelSelection,
  buildFilterFacets,
  defaultPriceStep,
  facetSourceMap,
  FIXED_FILTER_SOURCES,
  fitPriceStep,
  formatPriceRange,
  isFilterFieldSource,
  isFilterSource,
  optionKeyOf,
  optionSourceFor,
  panelSelectionFor,
  parsePriceRange,
  usableOptionKey,
  priceSpanOf,
  queryKeyFor,
  spanWithRange,
  toggleKeyOf,
  toggleSourceFor,
  widenPriceSpan,
  type FilterFieldSource,
  type FilterSelection,
  type FilterSource,
  type PriceRange,
  type PriceSpan,
} from './parts/groups';

/**
 * `Button.iconLeft`, `Select.leadingIcon` and `EmptyState.icon` each take an already-bound icon
 * component, while `EldraIcon` needs a `name` prop bound first. The theme's shared name→component
 * adapter (`app/composables/iconComponent.ts`) builds one and caches it per name at module scope,
 * so a re-render never remounts (and re-fetches) it.
 */
/** The filter icon (Filter button and the no-results empty state) and the mobile sort trigger's. */
const AdjustmentsIcon = iconComponent('adjustments');
const SortIcon = iconComponent('arrows-sort');
/**
 * `ProductCard` carries its own `min-w-56` so a card alone never collapses, but a grid track is
 * the width it is: two tracks of 14rem plus a gap do not fit a phone, and the card's minimum
 * would push the second column off the edge. The track decides the width here, as in the carousel.
 */
const CARD_CLASSES = { root: 'min-w-0' } as const;
/** The freshly-inserted editor hint's box icon (spec States, "Empty (freshly inserted)"). */
const BoxIcon = iconComponent('box');

interface SortOptionField {
  option?: string;
  label?: string;
}
interface FilterField {
  source?: string;
  label?: string;
  collapsed?: boolean;
}

const props = defineProps<{ entry: EldraBlockEntry<'collection-grid'> }>();
const { data } = useBlockData(props, 'collection-grid');
const editing = useEditing();
const { t } = useI18n();
const storefront = useStorefront();
const route = storefront.route;

const uid = useUiId();
const drawerId = `collection-grid-drawer-${uid}`;
/** The drawer foot's own two strings ("Clear all", "Show N products") — the panel's own copy of
 *  them is hidden now (see the drawer template below), so this block draws them itself, from the
 *  same `@eldrajs/ui` default messages `FilterPanel` would have read, rather than a second copy of
 *  the English text in this file's own locale. */
const filterPanelMessages = useMessages();
/** The grid's own visually hidden `h2` names the list of cards (spec Accessibility: "The grid has a
 *  visually hidden `h2` 'Products'"). */
const productsHeadingId = `collection-grid-products-${uid}`;

type Variant = 'sidebar' | 'drawer-only';
const variant = computed<Variant>(() =>
  data.value.variant === 'drawer-only' ? 'drawer-only' : 'sidebar'
);
const hasSidebar = computed(() => variant.value === 'sidebar');

/** The column counts the field, the Select and a shared URL all agree on. */
const COLUMN_CHOICES = ['2', '3', '4'];

const columnsField = computed(() => normaliseChoice(data.value.columns, COLUMN_CHOICES, '3'));
const pageSize = computed(() =>
  Number(normaliseChoice(data.value.pageSize, ['12', '24', '48'], '24'))
);
const isLoadMore = computed(
  () =>
    normaliseChoice(data.value.paginationStyle, ['load-more', 'pages'], 'load-more') === 'load-more'
);
const showColumnSelect = computed(() => data.value.showColumnSelect !== false);

function normaliseChoice(value: unknown, allowed: string[], fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(raw) ? raw : fallback;
}

// ---------------------------------------------------------------------------------------------
// The collection
// ---------------------------------------------------------------------------------------------

/**
 * **What the grid lists**: one collection (the default, and every grid this theme shipped before),
 * the whole catalogue — the `/products` page, where the scope is the store rather than a curated
 * list — or one **category** and everything under it, which is the `/categories/:path*` page.
 *
 * A block-level `select` rather than a meaning overloaded onto an empty `collection`, for the same
 * reason `priceSlider` is one: an empty reference already means "take it from the route", which is
 * exactly what a collection *template* relies on, so reading it as "all products" instead would turn
 * every seeded collection page into the catalogue the moment its route stopped resolving. Adding a
 * value to an existing `select` costs nothing either — the scanner compares type, localization and
 * cardinality, never an enum's members — so the block stays version 3 and no author's configured
 * filter list is retired.
 *
 * The two route-scoped values read the committed route and are **captured at setup**, never watched:
 * a result is keyed by its sources' values at creation, and this block sits on pages that are not
 * category pages, so a live source would re-key the grid onto whatever the shopper clicked towards
 * (`StorefrontResult`'s own "sources final at setup time" rule — `breadcrumbs` captures
 * `route.productHandle` for exactly the same reason).
 */
const catalogueScope = computed(() => data.value.scope === 'catalogue');
const categoryScope = computed(() => data.value.scope === 'category');
/** The category page's own category: the canonical path the read is scoped by, and the leaf slug
 *  the `category` filter group lists the children of. */
const routeCategoryPath = route.categoryPath;
const routeCategorySlug = route.categorySlug;
/** Which category the filter panel should offer the children of — `null` in every other scope, so
 *  `facetValuesFor` keeps the whole-tree family it always drew. */
const categoryScopeSlug = computed(() => (categoryScope.value ? routeCategorySlug : null));
/** Both scopes that come from the route rather than from a picked collection read the *catalogue*
 *  endpoint; only the category one narrows it. */
const storeWideScope = computed(() => catalogueScope.value || categoryScope.value);
/**
 * The one request option a category page adds, spread into both read option objects so neither can
 * drift: the scope's own canonical path, which narrows the catalogue read to that category's whole
 * subtree (`StorefrontCatalog.products`). Spread rather than written as `categoryPath: … ??
 * undefined`, so a grid in any other scope sends an options object byte-identical to the one it
 * always sent — and therefore keys the same result the build prerendered.
 */
const categoryScopeOption = computed<{ categoryPath?: string }>(() =>
  categoryScope.value && routeCategoryPath !== null ? { categoryPath: routeCategoryPath } : {}
);

/**
 * Which collection this grid shows. `collection` is the `reference` field an
 * author picks in Studio; it stores the collection's id, so a renamed collection
 * cannot silently empty the block. It replaced a `collectionHandle` string field
 * in version 3 — a handle a merchant retyped went stale the moment the
 * collection was renamed, and the field is not read here any more even when an
 * entry still carries the retired value (Core keeps it as `collectionHandle__v2`
 * and nothing in this theme looks at it). `route.collectionHandle` is the
 * collection template's own segment, the case the field is meant to be left
 * empty for.
 *
 * `collectionSelector` prefers the reference's resolved `slug`, falls back to its
 * bare id (a page builder draft overlay, or a depth-0 read — see
 * `app/storefront/collectionSelector.ts`) and only then to the route: a picked
 * collection overrides it, which is what its help text promises.
 */
const selected = computed<StorefrontCollectionSelector | null>(() =>
  collectionSelector(data.value.collection, route.collectionHandle)
);
/** The handle, when the collection is known by one. `collection()` below and the
 *  `/collections/<slug>` paging links have no other key to work from; the grid
 *  itself goes through `selected`, so an id-only collection still loads. */
const collectionHandle = computed<string | null>(() => selectorSlug(selected.value));
/**
 * **Whether this grid has a scope to read at all.** The catalogue always has one; a collection has
 * one once a reference is picked or the route resolved a collection; a **category** has one only on
 * a page whose route resolved a category — there is nothing to fall back to, and falling back to
 * the catalogue would answer a category page with the whole store.
 */
const hasCollection = computed(() => {
  if (categoryScope.value) return routeCategoryPath !== null;
  return catalogueScope.value || selected.value !== null;
});
/** The catalogue needs nothing bound, so there is nothing to hint about; the other two each have
 *  their own thing missing, and their own sentence for it. */
const showNoCollectionHint = computed(
  () => editing.value && !storeWideScope.value && !hasCollection.value
);
/** A `category` grid on a page that resolves no category: nothing to pick, so the hint says where
 *  the category comes from rather than asking for one. */
const showNoCategoryHint = computed(
  () => editing.value && categoryScope.value && !hasCollection.value
);

/**
 * The collection's own record, for the section label and the paging links. Never asked for in the
 * catalogue scope — an **empty source**, not a live one, because a result's sources are part of its
 * cache key and a key that resolves differently after hydration misses the payload the build left
 * (`StorefrontResult`'s own rule).
 */
const collectionInfoHandle = computed(() => (storeWideScope.value ? null : collectionHandle.value));
const collection = storefront.catalog.collection(collectionInfoHandle);
const collectionTitle = computed(
  () => collection.data.value?.title ?? collectionHandle.value ?? ''
);
/** Falls back to the plain noun when nothing names the collection yet — an
 *  id-only reference has no title and no handle to borrow one from, and an empty
 *  `{collection}` would leave the landmark named " products". */
const sectionLabel = computed(() =>
  storeWideScope.value || collectionTitle.value === ''
    ? t('grid.products')
    : t('grid.sectionLabel', { collection: collectionTitle.value })
);

// ---------------------------------------------------------------------------------------------
// Applied state (sidebar: live) and the drawer's pending copy
// ---------------------------------------------------------------------------------------------

/**
 * Seeded from `route.filters`/`route.sort`/`route.columns` — "a shared URL restores the whole grid
 * state" (spec Do/Don't). From here the block owns this state and writes every change back through
 * `publishState()`; `adoptRouteState()` below is the other direction, for the moves the block does
 * not make itself.
 */
/**
 * **The author's own `filters[]` rows**, as sources this block understands — `options` included, which
 * is the one that is not a group but a stand-in for every option key the store has. Read in several
 * places (the groups, the chips, the query keys), and the only place the field's raw shape is
 * validated.
 *
 * An explicit `option:<key>` row whose key would take a query key something else already owns is
 * dropped here, with the same dev warning a facet-sourced one gets (`usableOptionKey`), so the
 * collision is refused wherever it enters rather than in one of the two paths.
 */
const filterFields = computed(() =>
  ((data.value.filters ?? []) as FilterField[]).filter(
    (row): row is FilterField & { source: FilterFieldSource } => {
      if (!isFilterFieldSource(row.source)) return false;
      const key = optionKeyOf(row.source);
      return key === null || usableOptionKey(key) !== null;
    }
  )
);

/** Whether the author asked for every option key the store has (`options`). */
const wantsEveryOption = computed(() => filterFields.value.some((row) => row.source === 'options'));

/** The option keys the author named themselves — final at setup time, unlike everything else.
 *  `filterFields` has already dropped any that collide with a reserved query key. */
function explicitOptionKeys(): string[] {
  const keys: string[] = [];
  for (const row of filterFields.value) {
    const key = optionKeyOf(row.source);
    if (key !== null && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * **The option keys a URL may be read through**, which is the one thing an open-ended source
 * vocabulary costs: there is no closed list to enumerate when reading the query string.
 *
 * A key is readable only when the store is known to have an option for it — an explicit
 * `option:<key>` row, or, under `options`, a key the storefront's facets actually answer. **Not any
 * unknown query key**: `?ref=newsletter` would otherwise become `option:ref`, draw a chip and go out
 * in the request, a filter nobody set and promised to the shopper in their own URL. And never a key
 * another filter or the page's own route state already owns (`usableOptionKey`).
 *
 * The facets are only known after a read has answered, which is exactly when a query string is read
 * anyway: the prerendered page is always the unfiltered one and `adoptRouteState()` is what picks the
 * query up after mount (see its own comment). A key already in the selection stays readable whatever
 * the facets say now, so a later read that cannot describe the family does not silently drop a filter
 * the chips and the URL both show.
 */
function readableOptionKeys(selected: FilterSelection): string[] {
  const keys = explicitOptionKeys();
  const add = (key: string | null): void => {
    const usable = usableOptionKey(key);
    if (usable !== null && !keys.includes(usable)) keys.push(usable);
  };
  if (wantsEveryOption.value) {
    for (const option of facets.value?.options ?? []) add(option.key);
    for (const source of Object.keys(selected)) add(optionKeyOf(source));
  }
  return keys;
}

/** Every filter source a query key is read into, price excluded (it has its own two bounds). Every
 *  toggle key the store currently answers (`facets.toggles[]`) is managed the same way an option
 *  key is — there is no author-facing row for one, so there is no "explicit" half to this list. */
function managedSources(
  optionKeys: readonly string[],
  toggleKeys: readonly string[]
): FilterSource[] {
  const out: FilterSource[] = FIXED_FILTER_SOURCES.filter((source) => source !== 'price');
  for (const key of optionKeys) out.push(optionSourceFor(key));
  for (const key of toggleKeys) out.push(toggleSourceFor(key));
  return out;
}

function filterSelectionFromRoute(
  optionKeys: readonly string[],
  toggleKeys: readonly string[]
): FilterSelection {
  const out: FilterSelection = {};
  for (const source of managedSources(optionKeys, toggleKeys)) {
    const values = route.filters[queryKeyFor(source)];
    if (values === undefined || values.length === 0) continue;
    // `availability` is the one source with a vocabulary of its own rather than the store's, so a
    // spelling from a link shared before the platform's `in_stock`/`out_of_stock` landed is folded
    // into the current one here. The block's own state then only ever holds values the panel
    // offers: an unfolded `in-stock` ticked nothing and rendered an untranslated third checkbox
    // (and chip) beside the two real ones. A value from no vocabulary at all is dropped — the pass
    // ignores it too (`facets.ts`), so a chip for it would promise a filter nothing applies.
    // A toggle is a single yes/no flag rather than a value list: any non-empty query value means
    // on, normalised to the one marker the block's own selection holds for it (`['1']`).
    const next =
      source === 'availability'
        ? canonicalAvailabilityValues(values)
        : toggleKeyOf(source) !== null
          ? ['1']
          : [...values];
    if (next.length > 0) out[source] = next;
  }
  return out;
}

/**
 * The selection a page is **created** with: the author's own option rows and nothing else, because
 * no read has answered yet — a toggle key is never explicit, so there is none to read at creation
 * either. Everything else arrives through `adoptRouteState()` after mount — which is the same
 * reason the first paint is the unfiltered collection either way.
 */
function initialFilterSelection(): FilterSelection {
  return filterSelectionFromRoute(explicitOptionKeys(), []);
}

/** The price range the URL carries, sanitised the way a typed one is. */
function routePriceRange(): PriceRange {
  return parsePriceRange(route.filters.price?.[0]);
}

const selection = ref<FilterSelection>(initialFilterSelection());
const initialPrice = routePriceRange();
const priceMin = ref(initialPrice.min);
const priceMax = ref(initialPrice.max);

/**
 * The author's own sort rows this block's strings can name at all — `data.value.sortOptions` run
 * through `SORT_LABEL`, with no regard yet for what this scope's own read can or cannot honour.
 * `sort`'s own settling below needs exactly this, and nothing more: `data.value` is the block's own
 * field data, so this is the same on the server's render and on whatever reads it before any
 * network call has gone out, which is what lets `sort` reach its final value — stably, with
 * nothing left to correct — before `products` further down even exists. (`sort` feeds
 * `requestOptions`, one of `products`'s own reactive sources, so a `sort.value` write *after*
 * `products` exists is a second, real request under it — seen once, the hard way: a page that
 * should ask for its collection once asked twice, because a later correction changed the very
 * value the first request's key was built from.) The render-facing `sortOptions`, further down,
 * narrows this once the scope has actually answered.
 */
const configuredSortOptions = computed<SelectOption[]>(() => {
  const SORT_LABEL: Record<string, string> = {
    featured: t('grid.sortFeatured'),
    'best-selling': t('grid.sortBestSelling'),
    'price-asc': t('grid.sortPriceAsc'),
    'price-desc': t('grid.sortPriceDesc'),
    newest: t('grid.sortNewest'),
  };
  const rows = (data.value.sortOptions ?? []) as SortOptionField[];
  return rows
    .filter((row): row is SortOptionField & { option: string } => {
      return typeof row.option === 'string' && row.option in SORT_LABEL;
    })
    .map((row) => ({
      value: row.option,
      label: (row.label ?? '').trim() || SORT_LABEL[row.option]!,
    }));
});
const sort = ref(
  route.sort !== null && configuredSortOptions.value.some((option) => option.value === route.sort)
    ? route.sort
    : ''
);
watch(
  configuredSortOptions,
  (options) => {
    if (options.length === 0) {
      sort.value = '';
    } else if (!options.some((option) => option.value === sort.value)) {
      sort.value = options[0]!.value;
    }
  },
  { immediate: true }
);

/** The shopper's own column choice, seeded from `route.columns` (a shared URL) when it names a
 *  valid option, else the field's own default — and reset whenever the field's default changes. */
const columnsChoice = ref(
  route.columns !== null && COLUMN_CHOICES.includes(route.columns)
    ? route.columns
    : columnsField.value
);
watch(columnsField, (value) => {
  columnsChoice.value = value;
});
const columnOptions = computed<SelectOption[]>(() =>
  COLUMN_CHOICES.map((value) => ({ value, label: value }))
);

/** `load-more` grows the window rather than paging; any filter or sort change starts over. */
const pagesLoaded = ref(1);
const currentPage = computed(() => {
  const page = Math.trunc(route.page);
  return Number.isFinite(page) && page > 0 ? page : 1;
});

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

/**
 * `filters` as the storefront takes it: one entry per filter source with at least one value, plus
 * the price range as a single `"<min>-<max>"` value with either end allowed to be empty ("no
 * bound"). `undefined` rather than `{}` when nothing is selected, so an unfiltered request looks
 * exactly like one made before any filter existed.
 */
function requestFiltersFor(
  values: FilterSelection,
  min: string,
  max: string
): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const [source, selected] of Object.entries(values)) {
    if (selected && selected.length > 0) out[source] = [...selected];
  }
  const price = formatPriceRange({ min, max });
  if (price !== null) out.price = [price];
  return Object.keys(out).length > 0 ? out : undefined;
}

const requestFilters = computed(() =>
  requestFiltersFor(selection.value, priceMin.value, priceMax.value)
);

/**
 * How long a sidebar filter/price change waits for a sibling change before the read it drives goes
 * out, so three quick checkbox ticks reach the storefront as one request rather than three
 * superseded ones. One named constant rather than a literal, so the single number that answers
 * "how chainable does this feel" is greppable — and it is the window the drawer's own pending
 * count waits out too.
 */
const FILTER_DEBOUNCE_MS = 350;

/**
 * Everything the read takes, live — the page window, the sort and the filters, recomputed the
 * instant any of them moves. Nothing reads this directly: `requestOptions` below is the copy the
 * storefront actually sees, and the gap between the two is the debounce.
 */
const liveRequestOptions = computed(() => ({
  page: isLoadMore.value ? 1 : currentPage.value,
  pageSize: isLoadMore.value ? pageSize.value * pagesLoaded.value : pageSize.value,
  sort: sort.value === '' ? undefined : sort.value,
  filters: requestFilters.value,
  ...categoryScopeOption.value,
}));

/**
 * What the storefront read is actually given: `liveRequestOptions`, mirrored the moment it changes
 * — **unless** the sidebar has armed the window below, in which case the whole object is held back
 * until it expires. The visible state (`selection`, the chips, the price fields, the URL) still
 * writes at once, so nothing the shopper sees waits; only the request is held.
 *
 * **The whole object, not just `filters`.** A sidebar handler's own `publishState()` resets
 * `pagesLoaded` to 1 in the same turn it changes the selection, and that is one of this object's
 * inputs: holding `filters` alone meant a filter ticked after a Load more press fired an immediate
 * read for the reset page window carrying the *old* filters — 24 unfiltered cards replacing the 48
 * the shopper had loaded — and then the debounced one 350 ms later. Two requests, the first thrown
 * away. Mirroring the whole object closes that for every input at once, including the ones that
 * move with no handler of this block's at all (a `pages`-style page link, Back/Forward), which
 * keep reaching the read immediately because nothing is armed when they do.
 *
 * `liveRequestOptions` is a computed, so its value is reference-stable until an input really
 * changes: assigning it when nothing moved is a no-op and asks the storefront nothing.
 */
/** Whether a sidebar change is waiting out the window — the first half of `updating`. */
const debounceArmed = ref(false);
let filterDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const requestOptions = shallowRef(liveRequestOptions.value);
watch(liveRequestOptions, (value) => {
  if (!debounceArmed.value) requestOptions.value = value;
});

/**
 * Arms the wait. Called by the sidebar's own live path (`onPanelChange`)
 * **before** it changes anything, so the mirror above never sees a half-applied change: a trailing
 * debounce, where each further arm restarts the window rather than queuing a second timer.
 */
function armFilterDebounce(): void {
  debounceArmed.value = true;
  if (filterDebounceTimer !== null) clearTimeout(filterDebounceTimer);
  filterDebounceTimer = setTimeout(() => {
    filterDebounceTimer = null;
    debounceArmed.value = false;
    requestOptions.value = liveRequestOptions.value;
  }, FILTER_DEBOUNCE_MS);
}

/** Resolves an armed wait at once — what every immediate-apply change calls (sort, columns, Load
 *  more, the drawer's own apply, Clear all, a removed chip), so its own read carries a sidebar
 *  change that was still waiting rather than leaving it stranded for another `FILTER_DEBOUNCE_MS`.
 *  A no-op when nothing was armed and nothing has changed.
 *
 *  **Call it after the handler's own change to a request input, never before.** The assignment is
 *  synchronous, so it queues the result's watcher at that point; a request input moved afterwards
 *  queues the mirror's watcher behind it, and the read goes out twice in the same tick — once on
 *  the half-applied value and once on the final one. Every handler below mutates first for exactly
 *  this reason. */
function flushFilterDebounce(): void {
  if (filterDebounceTimer !== null) {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = null;
  }
  debounceArmed.value = false;
  requestOptions.value = liveRequestOptions.value;
}
/**
 * The grid's own read, from whichever scope the block is in. Both answer the same
 * `StorefrontCollectionProducts`, so everything below this line — the cards, the count, the facets, the
 * chips, the paging — is written once (`StorefrontCatalog.products`).
 *
 * Which one is **decided at setup and never changes**: `scope` is a field, so a result created under
 * one scope is never re-pointed at the other, and the unused scope's read is never created at all.
 */
const products = storeWideScope.value
  ? storefront.catalog.products(requestOptions)
  : storefront.catalog.collectionProducts(selected, requestOptions);

const items = computed(() => products.data.value?.items ?? []);
const money = useMoney();
const total = computed(() => products.data.value?.total ?? 0);
/** The storefront's own description of the scope it answered from — values, labels, swatches and
 *  counts for every group (`CatalogFacets`). `undefined` from a source that cannot describe it. */
const facets = computed(() => products.data.value?.facets);
/**
 * The filter sources **this scope** cannot narrow by, as the storefront declares them
 * (`StorefrontCollectionProducts.unfilterable`) — the platform can count the other collections a
 * collection's products are in without being able to ask for the intersection, so a group fed by
 * real counts can still be a filter that does nothing.
 *
 * Their groups and their chips are both dropped below. Nothing is removed from the request or from
 * the query string: the source may be perfectly filterable in another scope, so a shared link stays
 * meaningful, and the storefront that declared it unfilterable is already the one ignoring it.
 */
const unfilterableSources = computed(() => new Set(products.data.value?.unfilterable ?? []));
/**
 * `configuredSortOptions`, minus whichever of them this scope just declared it cannot honour
 * (`StorefrontCollectionProducts.unsortable`) — the platform gateway reads no sales data to order
 * by, on either of its two scopes, so a shopper picking `best-selling` there would see nothing move
 * and the control would look broken. A plain `computed` reading `products.data.value` straight
 * through, same as `unfilterableSources` above: both sides of a hydration read the *same*,
 * already-settled answer at render time (the "one synchronous turn" the server's render and the
 * client's hydration of it share), so this never disagrees with what either one painted. The demo
 * storefront declares nothing, so Storybook and the sample pages keep every option. This is what
 * the template's own `:options` binds to — `sort`'s own settling above never reads it.
 */
const sortOptions = computed<SelectOption[]>(() => {
  const unsortable = products.data.value?.unsortable;
  if (unsortable === undefined) return configuredSortOptions.value;
  return configuredSortOptions.value.filter((option) => !unsortable.includes(option.value));
});
/**
 * The one correction `configuredSortOptions`'s own settling above could not make, because it
 * cannot know the answer yet: a `sort` already pointed at an id this scope just declared
 * `unsortable` — a URL carrying `?sort=best-selling`, say — falls back here to the first option
 * still offered, the same way an id this grid never configured at all already does. `immediate`,
 * so this is this watch's *own* first, synchronous run (not a later re-trigger of some earlier
 * one), settled the moment `products.data.value` is — which keeps it a no-op, writing nothing and
 * asking nothing again, for every page whose `sort` was never pointed at the one id this matters
 * for in the first place.
 */
watch(
  sortOptions,
  (options) => {
    if (options.some((option) => option.value === sort.value)) return;
    // Nothing left to offer — an author who configured only ids this scope declares unsortable.
    // The control is already hidden (`hasSort`), so the only thing left to get right is the
    // request: clear it rather than keep sending an id the same answer just said cannot be
    // honoured. The configured-list watch above settles its own empty case exactly this way.
    sort.value = options.length > 0 ? options[0]!.value : '';
  },
  { immediate: true }
);
const pending = products.pending;

/** A collection the storefront could only have found by id, and did not — a
 *  picked collection whose draft overlay carries no `slug` yet (`null` data,
 *  rather than a real response with no matching products). In the editor say why
 *  rather than show an empty grid, since publishing is what fixes it; a live
 *  visitor gets the block's own empty state as always. */
const showUnresolvedCollectionHint = computed(
  () =>
    editing.value &&
    selectorNeedsPublish(selected.value) &&
    !pending.value &&
    products.data.value === null
);

/**
 * Loading a *further* page is not the same state as filtering, and neither of them is the same as
 * having nothing at all. **The prerender contract** (`app/storefront/types.ts`) splits the three:
 *
 * - `showSkeletons` — `pending && no data`: the first load of a grid with nothing on screen yet.
 *   Both halves are stated rather than trusting `pending` to imply the second, because a skeleton
 *   drawn over results the visitor can already see is precisely the flash this work removed.
 * - `updating` — a sidebar change waiting out its debounce, or the read it drives already in
 *   flight (`refreshing`) — over results that *are* on screen: a filter, a sort, a page. The old
 *   cards stay exactly where they are and the list pulses between 0.7 and 0.9 opacity, the grid is
 *   marked `aria-busy`, and the count reads "Updating…". This is what used to replace the whole
 *   grid with skeletons.
 * - `loadingMore` — Load more, where "focus stays on the button" (spec Accessibility): every card
 *   stays put, undimmed, the count stays real, and only the button is busy (`LoadMore`'s own
 *   `pending`). It latches on the press and clears when the read answers — off `loading`, not
 *   `pending`, which no longer rises for a read over data the grid already has and would leave the
 *   button spinning for the life of the page.
 */
const loading = products.loading;
const hasData = computed(() => products.data.value !== null);
const loadingMore = ref(false);
watch(loading, (value) => {
  if (!value) loadingMore.value = false;
});
const showSkeletons = computed(() => pending.value && !hasData.value);

/**
 * Both "a fresher value is on its way" states, gated identically: the volatile refresh (money and
 * the stock line, re-read a moment after mount) and a whole read in flight over cards already on
 * screen. `useRevalidating` holds both at `false` until after mount, so the browser's first render
 * is the server's — a hydrating page's result is already `loading` with its payload data in
 * place, and reading either flag straight through would paint `aria-busy`, "Updating…" and dimmed
 * cards the server never wrote.
 */
const { any: cardsRevalidating, refreshing } = useRevalidating({
  keys: () => products.revalidating.value,
  refreshing: () => loading.value && hasData.value && !loadingMore.value,
});
/**
 * The grid's own "this is about to change" flag: armed the moment a sidebar change is typed or
 * ticked, not only once the debounced read actually goes out — the shopper sees the list is about
 * to move as soon as they touch a control, which is the whole point of showing *something* before
 * the request exists at all. `debounceArmed` is written only by sidebar handlers and is therefore never true
 * during a server render or a hydrating client's first paint, the same way `refreshing` never is.
 *
 * What it draws, and the rules that follow from it:
 *
 * - The card list itself pulses (`UPDATING_PULSE` below) — nothing is drawn **over** it, nothing
 *   is added to the DOM, and nothing moves. The sidebar, the chips, the toolbar and the count are
 *   outside it and stay at full strength: chaining filter changes is the entire point of the
 *   debounce, so the panel has to stay operable and legible while the list is on its way.
 * - The list is marked busy and takes `inert`, so no card can be reached or clicked mid-update,
 *   and the count line — a `role="status"` — is what says "Updating…" in words. There is nothing
 *   to hide from assistive technology, because there is no extra element at all.
 */
const updating = computed(() => debounceArmed.value || refreshing.value);

/**
 * The grid's own "a fresher result is on its way" treatment: its opacity eases between 0.7 and
 * 0.9 and back, continuously, for as long as `updating` holds. Declared in
 * `app/assets/main.css` (`eldra-pulse-soft`) beside the theme's other custom utilities rather
 * than inline, so a customer restyles or removes it in one place.
 *
 * Under `prefers-reduced-motion: reduce` the animation is off and the list holds a steady 0.8
 * instead — still visibly waiting, with nothing moving. The pair is written as one constant
 * because Tailwind scans source text for class names: every class here has to appear literally
 * somewhere in this file for the build to emit it.
 */
const UPDATING_PULSE =
  'animate-eldra-pulse-soft motion-reduce:animate-none motion-reduce:opacity-80';

/**
 * **One visible "this is stale" treatment at a time, never two.** `cardsRevalidating` folds the
 * whole-read `refreshing` *into* its own per-card signal (see `useRevalidating`'s own doc), which
 * is exactly what used to put the dimmed-value-and-spinner treatment on every card during a
 * filter/sort/page read. The grid's own pulse (`updating`, `UPDATING_PULSE`) is the one indicator
 * for that now — dimming every card's two values underneath a pulsing list would double up the
 * same message, and the two dims would multiply — so this masks `cardsRevalidating` back down to
 * the volatile refresh alone (money and the stock line, re-read a moment after mount) whenever
 * `updating` is already showing something. The volatile refresh has nothing to do with `updating`
 * and keeps its own treatment either way.
 */
const showCardRefresh = computed(() => !updating.value && cardsRevalidating.value);
/**
 * The volatile refresh, said once for the whole grid. Each card dims its two values and draws a
 * spinner beside them but passes `announce: false` — a 24-card grid would otherwise hold 48 polite
 * live regions all speaking at once (`@eldrajs/ui`'s `announce` prop) — so this one region is what
 * speaks. The whole-read state has its own words in `countText`, which is why `showCardRefresh`
 * and not `updating` is the condition here.
 */
const announcement = computed(() => (showCardRefresh.value ? t('storefront.updatingValues') : ''));

/**
 * The cards actually rendered. `toProductCardEntries` (`app/storefront/toProductCard.ts`) is the
 * one place a storefront-derived URL is sanitised: it drops an item whose `url` is not a
 * `safeHref` — `ProductCard`'s link is required, so a linkless card does not exist — and reports
 * per card whether the destination routes (`entry.internal`). `items` stays the raw response for
 * the skeleton count and the "shown N of total" line, which are about the request, not the DOM.
 */
const cards = computed(() =>
  toProductCardEntries(items.value, {
    ratio: '4x5',
    minorUnits: money.minor,
    revalidating: showCardRefresh.value,
  })
);

/** The count of skeleton cards: "the grid shows the same number of Skeleton cards" (spec States →
 *  Loading), which on the very first load — nothing on screen yet — is the page size. */
const lastItemCount = ref(0);
watch(
  items,
  (value) => {
    if (value.length > 0) lastItemCount.value = value.length;
  },
  { immediate: true }
);
const skeletonCount = computed(() =>
  lastItemCount.value > 0 ? lastItemCount.value : pageSize.value
);

// ---------------------------------------------------------------------------------------------
// Filter groups
// ---------------------------------------------------------------------------------------------

/**
 * A facet's title and hidden `<legend>` — one string, now that `FilterFacet.label` is both (the
 * package draws no separate hidden legend any more).
 *
 * The four fixed sources are the theme's own words. An option's is **the store's**: the facet's own
 * `name` for that key, which is the only place a merchant's "Fabric" exists — with the two keys this
 * theme does have strings for (`size`, `colour`) still preferred, so a store using the ordinary keys
 * reads a translated facet title rather than a raw store string, and so the Icelandic site says
 * "Stærð". A key with no facet name and no string of this theme's falls back to the key itself, which
 * is at least the merchant's own word. A toggle source never reaches here — it is folded into the
 * `availability` facet, which keeps its own label.
 */
function defaultFacetLabel(source: FilterSource): string {
  if (source === 'price') return t('grid.price');
  if (source === 'category') return t('grid.legendCategory');
  if (source === 'collection') return t('grid.legendCollection');
  if (source === 'availability') return t('grid.legendAvailability');
  const key = optionKeyOf(source);
  if (key === 'size') return t('grid.legendSize');
  if (key === 'colour') return t('grid.legendColour');
  return optionNames.value.get(key ?? '') ?? key ?? source;
}

/** Each option key's own display name, as the storefront's facets report it. */
const optionNames = computed(
  () => new Map((facets.value?.options ?? []).map((option) => [option.key, option.name] as const))
);

/** The combined `availability` facet's own values' names: the facets carry counts, never labels —
 *  "In stock only" is the one switch row the theme names itself (spec → Variants, `toggle` facet). */
const availabilityLabels = computed(() => ({
  inStock: t('grid.availabilityInStock'),
  outOfStock: t('grid.availabilityOutOfStock'),
}));

/** The destination of the Size facet's "Size guide" link, resolved from the block's own `link`
 *  field through the theme's link resolver — a plain URL, or `undefined` with nothing to link to. */
const resolveLink = useEldraLink();
const sizeGuideLink = computed(() => resolveLink(data.value.sizeGuideHref));
const sizeGuideHref = computed(() => safeHref(sizeGuideLink.value?.href) ?? undefined);

/** The Colour facet's own layout: swatch rows (the default) or a swatch grid — the block's
 *  `colourLayout` field, top-level per the component's own storage rule (a child under an existing
 *  `filters[]` item would force a version bump that retires every author's configured list). */
const colourLayout = computed<FilterFacetLayout>(() =>
  data.value.colourLayout === 'grid' ? 'grid' : 'list'
);

/**
 * The span the price control works across: **the catalogue's own bounds**, from the facets (spec:
 * "not 0 and a round number"), which are counted with every filter *except* price applied and so
 * stay still while the shopper drags.
 *
 * The fallback, for a storefront that answers no facets, is the span of the loaded products — and
 * that one does move, because narrowing the price narrows the products. `widenPriceSpan` keeps the
 * widest span seen for this collection, so the track cannot ratchet shut around the thumbs; it is
 * dropped when the collection changes, since the next one's prices are its own.
 */
const facetPriceSpan = computed<PriceSpan | null>(() => facets.value?.price ?? null);
const loadedPriceSpan = ref<PriceSpan | null>(null);
// `immediate`, because the facets can arrive *with* the products and already have no span of their
// own: the platform omits `price` when the scope minus the price filter holds nothing, and a
// prerendered page hands this block its answer before the first render. Waiting for a change left
// the fallback unset and the control spanning 0 to 0.
watch(
  [facetPriceSpan, items],
  ([facet, loaded]) => {
    if (facet !== null) {
      loadedPriceSpan.value = null;
      return;
    }
    loadedPriceSpan.value = widenPriceSpan(loadedPriceSpan.value, priceSpanOf(loaded));
  },
  { immediate: true }
);
watch(selected, () => {
  loadedPriceSpan.value = null;
});
const EMPTY_SPAN: PriceSpan = { min: 0, max: 0 };
const priceSpan = computed<PriceSpan>(() =>
  spanWithRange(facetPriceSpan.value ?? loadedPriceSpan.value ?? EMPTY_SPAN, {
    min: priceMin.value,
    max: priceMax.value,
  })
);

/**
 * The price slider's step: the author's `priceStep`, else one unit of the store currency (ISK 100,
 * USD 1 — `defaultPriceStep`), narrowed to a step this catalogue's own span can actually hold
 * (`fitPriceStep`). A non-positive or non-integer field value is no step at all, so it falls back
 * rather than handing the slider a grid it cannot land on.
 */
/**
 * The price group's control: the range slider (the default), or its two typed fields alone — what
 * a store whose prices sit in a few tight clusters a track cannot separate sets.
 *
 * A block-level field rather than one on the `filters[]` row it describes, even though it is about
 * the price group: a new child under an existing list item is a storage-shape change to the
 * scanner (`storageCompatible` compares a list item's children by count and id, so it cannot tell
 * an addition from a replacement), and the version bump it demands makes Core retire every
 * author's configured `filters` list. A top-level addition costs nothing — and there is one price
 * group at most, so the two shapes say the same thing.
 */
const priceSlider = computed(() => data.value.priceSlider !== false);

const priceStep = computed(() => {
  const own = data.value.priceStep;
  if (typeof own === 'number' && Number.isFinite(own) && own > 0) return own;
  return fitPriceStep(defaultPriceStep(money.currency.value), priceSpan.value);
});

/**
 * **The author's rows expanded into rendered sources**, which is the whole of what `options` means: in
 * its place, one `option:<key>` row per option key the storefront's facets answer, in the facets'
 * order, carrying no label of its own (the group then takes the store's own name for that key).
 *
 * A key an explicit `option:<key>` row already names is **not** expanded again: that row wins, wherever
 * the author put it and whatever they called it. So "Size first, then whatever else this store sells
 * by" is two rows, and the common case — "every option, in the store's order" — is one.
 */
const expandedFilterRows = computed<Array<FilterField & { source: FilterSource }>>(() => {
  const explicitKeys = new Set(
    filterFields.value.map((row) => optionKeyOf(row.source)).filter((key) => key !== null)
  );
  const out: Array<FilterField & { source: FilterSource }> = [];
  for (const row of filterFields.value) {
    if (row.source !== 'options') {
      out.push({ ...row, source: row.source });
      continue;
    }
    // The facets' own keys, in the facets' order — plus any key the shopper already has a filter on
    // that the facets have stopped naming. That second half is the standing rule that a group
    // carrying a selection is never dropped out from under an applied filter: facets are computed
    // over the current result set on most backends, so a narrowing filter can remove the very family
    // it was set in, and a group that vanished would leave the shopper no control to undo it.
    for (const key of [
      ...(facets.value?.options ?? []).map((option) => option.key),
      ...Object.keys(selection.value).map(optionKeyOf),
    ]
      .map(usableOptionKey)
      .filter((key): key is string => key !== null)) {
      if (explicitKeys.has(key) || out.some((done) => done.source === optionSourceFor(key))) {
        continue;
      }
      out.push({ ...row, label: undefined, source: optionSourceFor(key) });
    }
  }
  return out;
});

/**
 * **The one call into the adapter.** `buildFilterFacets` (`parts/groups.ts`) turns the author's
 * expanded rows and the storefront's facets into the `FilterFacet[]` `FilterPanel` draws — a source
 * this scope cannot narrow by, or one with nothing to offer, is dropped there, same as it always
 * was. A range with fewer than two distinct values is still included: the package's own
 * `renderableFacets` (inside `FilterPanel`) drops it, so this file does not duplicate that rule.
 */
const filterFacets = computed<FilterFacet[]>(() =>
  buildFilterFacets(expandedFilterRows.value, {
    facets: facets.value,
    selection: selection.value,
    availability: availabilityLabels.value,
    categoryScopeSlug: categoryScopeSlug.value,
    unfilterable: unfilterableSources.value,
    labelFor: defaultFacetLabel,
    colourLayout: colourLayout.value,
    sizeGuideHref: sizeGuideHref.value,
    price: {
      min: priceSpan.value.min,
      max: priceSpan.value.max,
      step: priceStep.value,
      slider: priceSlider.value,
      currency: money.currency.value !== undefined,
      ...(facets.value?.price?.histogram ? { histogram: facets.value.price.histogram } : {}),
    },
  })
);

/** Every rendered source's own `FilterSource`, by the `FilterFacet.id` the panel uses — the reverse
 *  of `queryKeyFor`, for translating the panel's own selection back into the block's internal one
 *  (`applyPanelSelection`, called from `onPanelChange`/`onPendingPanelChange`). */
const sourceMap = computed(() => facetSourceMap(expandedFilterRows.value));

/** This scope's current toggle keys (`facets.toggles[]`), so `applyPanelSelection` can tell a known
 *  toggle apart from an unknown `availability` array member (a stale value nothing lists any more). */
const toggleKeySet = computed(
  () => new Set((facets.value?.toggles ?? []).map((toggle) => toggle.key))
);

/** The sidebar panel's own live (applied) selection, keyed by facet id. One-way: the panel is
 *  controlled from this, and every change it reports comes back through `onPanelChange`. */
const panelSelection = computed<UiFilterSelection>(() =>
  panelSelectionFor(selection.value, { min: priceMin.value, max: priceMax.value }, priceSpan.value)
);

/** The drawer panel's own pending copy of the same view. */
const pendingPanelSelection = computed<UiFilterSelection>(() =>
  panelSelectionFor(
    pendingSelection.value,
    { min: pendingMin.value, max: pendingMax.value },
    priceSpan.value
  )
);

/**
 * The Filter button's own badge count: every applied value (`@eldrajs/ui`'s own `appliedFilters`,
 * which already excludes a range — a span has no one value a chip could take off) plus one more if
 * the price range is set, which the button's own count has always included.
 */
const activeCount = computed(
  () =>
    appliedFilters(filterFacets.value, panelSelection.value).length +
    (priceMin.value !== '' || priceMax.value !== '' ? 1 : 0)
);

/**
 * The empty-results advice: the author's own `emptyText`, then a sentence naming what is actually
 * filtered ("Nothing in Oat, size M is in stock right now.", spec States → Empty results). The
 * value labels, not the chip labels — the sentence reads as prose, not as a list of facet titles.
 * `appliedFilters` already excludes the price range, same as this sentence always has.
 */
const emptyTitle = computed(() => (data.value.emptyTitle ?? '').trim() || t('grid.noResultsTitle'));
const emptyText = computed(() => {
  const own = (data.value.emptyText ?? '').trim();
  const labels = appliedFilters(filterFacets.value, panelSelection.value).map(
    (filter) => filter.label
  );
  const named = labels.length > 0 ? t('grid.nothingIn', { filters: labels.join(', ') }) : '';
  return [own, named].filter((part) => part !== '').join(' ');
});

// ---------------------------------------------------------------------------------------------
// Writing the state out, and the result count
// ---------------------------------------------------------------------------------------------

/**
 * The block's state as query keys, handed to the page through the one writer a block may call.
 * `null` clears a key; `page` is always cleared, because any filter, sort or column change starts
 * the results over (`load-more`'s own window is reset beside it).
 */
/**
 * The URL, read back into the block's own state — after mount, and on every later change.
 *
 * Three moves change the query without the block doing it: the browser's Back/Forward buttons, a
 * link to the same collection with a different filter, and — the one that made the deployed site's
 * filters inert — **arriving with a query on a prerendered page**. Nuxt hydrates a prerendered
 * route under the *payload's* path, query and all stripped, and only restores the real URL once
 * the app's `<Suspense>` has resolved (`hasDeferredRoute` in its router plugin). So
 * `?price=50-150` simply is not in the route while the block is being built: seeding
 * once left the inputs blank, the request unfiltered and the grid showing everything, under chips
 * and a URL that said otherwise.
 *
 * Adopting it after mount rather than during setup is also what keeps the first paint the server's:
 * the static HTML is the unfiltered collection, the client renders exactly that, and the filtered
 * read goes out afterwards — a transition, not a hydration mismatch.
 *
 * Every assignment is guarded by an equality check, so the block's own `publishState()` round-trip
 * (write the URL → the route changes → this reads it back) settles instead of re-requesting.
 */
function adoptRouteState(): void {
  // Tracked explicitly rather than inferred from `appliedFilters`' own reference stability: by the
  // time this watcher runs, `selection`/price may already carry a *sidebar* change this same tick
  // (`onPanelChange` writes them before `publishState()` echoes them into the route that wakes
  // this up) — and `flushFilterDebounce()` below must not fire for that round-trip, or it undoes
  // the arm that very same change just made for a reason this function had nothing to do with.
  let changed = false;
  const next = filterSelectionFromRoute(readableOptionKeys(selection.value), [
    ...toggleKeySet.value,
  ]);
  if (!sameSelection(next, selection.value)) {
    selection.value = next;
    changed = true;
  }
  const range = routePriceRange();
  if (range.min !== priceMin.value) {
    priceMin.value = range.min;
    changed = true;
  }
  if (range.max !== priceMax.value) {
    priceMax.value = range.max;
    changed = true;
  }
  if (
    route.sort !== null &&
    route.sort !== sort.value &&
    sortOptions.value.some((option) => option.value === route.sort)
  ) {
    sort.value = route.sort;
  }
  if (
    route.columns !== null &&
    route.columns !== columnsChoice.value &&
    COLUMN_CHOICES.includes(route.columns)
  ) {
    columnsChoice.value = route.columns;
  }
  // A query the block did not write (Back/Forward, a shared link, the first adopt on mount)
  // applies at once — it is not the sidebar's own live path, so it owes nothing to
  // `FILTER_DEBOUNCE_MS`. Only when *this* function actually changed the applied selection or
  // price: the block's own `publishState()` round-trip changes neither (the guards above already
  // settle it instead of re-requesting), so it never manufactures a request nothing asked for —
  // and, just as importantly, never flushes a debounce some other change armed a moment earlier.
  if (changed) flushFilterDebounce();
}

/** Two selections holding the same values for the same sources, order included. */
function sameSelection(a: FilterSelection, b: FilterSelection): boolean {
  const sources = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<FilterSource>;
  for (const source of sources) {
    const left = a[source] ?? [];
    const right = b[source] ?? [];
    if (left.length !== right.length) return false;
    if (left.some((value, index) => value !== right[index])) return false;
  }
  return true;
}

onMounted(() => {
  adoptRouteState();
  // The facets are in there because they are what makes an option key *readable* at all
  // (`readableOptionKeys`): a shared `?fabric=linen` can only be adopted once the store has said it
  // has a `fabric` option, which is the first read answering.
  watch(() => [route.filters, route.sort, route.columns, facets.value], adoptRouteState, {
    deep: true,
  });
});

function publishState(): void {
  pagesLoaded.value = 1;
  const patch: Record<string, string | string[] | null> = {
    page: null,
    sort: sort.value === '' ? null : sort.value,
    columns: columnsChoice.value,
    price: formatPriceRange({ min: priceMin.value, max: priceMax.value }),
  };
  // Every source, selected or not: a key the shopper has just emptied has to be cleared, which a
  // patch built only from what is selected would leave in the URL for ever. The option keys come
  // from everything the block knows of — the author's rows, the facets, and the selection itself, so
  // a key the store has since stopped offering can still be cleared rather than sticking for ever.
  //
  // **Every one of those three goes through `usableOptionKey` first**, and this is the place it
  // matters most: a source whose query key belongs to something else would be *written* here, after
  // the four keys above, so it lands last and wins. A store with an option keyed `sort` stripped the
  // shopper's sort out of the URL on every state write; one keyed `category` cleared the category
  // they had just ticked, which `adoptRouteState` then read back as absent, reverting the tick on
  // screen. Refusing the key in the three places it is *read* was not enough — the patch is where the
  // damage was.
  const sources = new Set<FilterSource>();
  const add = (source: FilterSource): void => {
    const key = optionKeyOf(source);
    if (key !== null && usableOptionKey(key) === null) return;
    sources.add(source);
  };
  for (const source of managedSources(readableOptionKeys(selection.value), [
    ...toggleKeySet.value,
  ])) {
    add(source);
  }
  for (const option of facets.value?.options ?? []) add(optionSourceFor(option.key));
  for (const toggle of facets.value?.toggles ?? []) add(toggleSourceFor(toggle.key));
  for (const source of Object.keys(selection.value)) {
    if (isFilterSource(source)) add(source);
  }
  for (const source of sources) {
    // By its **query key**, not by the source: the price range is already in the patch above as one
    // `<min>-<max>` string, and nothing may overwrite it with a selection list.
    if (queryKeyFor(source) === 'price') continue;
    patch[queryKeyFor(source)] = selection.value[source] ?? null;
  }
  route.setQuery(patch);
}

const countText = computed(() => {
  if (showSkeletons.value || updating.value) return t('grid.updating');
  if (total.value === 1) return t('grid.oneProduct');
  return t('grid.nProducts', { count: total.value });
});

const countEl = ref<HTMLElement | null>(null);
/** The sidebar and drawer `FilterPanel` instances, for `focusChip`/`focusTitle` after a chip is
 *  removed from inside either one (`onPanelRemove`/`onPendingPanelRemove`). */
const sidebarPanelEl = ref<InstanceType<typeof FilterPanel> | null>(null);
const drawerPanelEl = ref<InstanceType<typeof FilterPanel> | null>(null);
function focusCount(): void {
  countEl.value?.focus();
}

/**
 * The applied filters just before the panel's own `change` handler ran — read at the top of
 * `onPanelChange`/`onPendingPanelChange`, before either mutates `selection`/`pendingSelection`, so
 * `onPanelRemove`/`onPendingPanelRemove` can still find the removed chip's own index a moment
 * later: the panel reports `change` and then `remove` synchronously in that order (`FilterPanel`'s
 * own `onRemoveChip`), so by the time `remove` arrives the state is already the *post*-removal one
 * and the chip is gone from it. Mirrors the pre-panel code's own `chips.value.findIndex(...)` — an
 * index taken before the mutation, clamped into the list that remains after it.
 */
let lastSidebarChips: ReturnType<typeof appliedFilters> = [];
let lastPendingChips: ReturnType<typeof appliedFilters> = [];

// ---------------------------------------------------------------------------------------------
// Applying a change
// ---------------------------------------------------------------------------------------------

/**
 * The sidebar's own live path: the visible selection, the applied chips and the URL all move at
 * once, but the read this drives waits out `FILTER_DEBOUNCE_MS` so a run of ticks reaches the
 * storefront as the one request the shopper's last tick deserves. **Armed first**, before anything
 * moves: `publishState()` resets the page window in the same turn, and that is one of the read's
 * own inputs — arming afterwards would let it through on its own.
 *
 * One handler for every kind of change the panel reports (a checkbox, a switch, a committed range,
 * a typed field, **Clear all**, a removed chip) — unlike the pre-panel code's separate
 * `onToggle`/`onRange`, because the panel always reports the *whole* resulting selection rather
 * than one value at a time, so there is nothing left to apply incrementally.
 */
function onPanelChange(next: UiFilterSelection): void {
  lastSidebarChips = appliedFilters(filterFacets.value, panelSelection.value);
  armFilterDebounce();
  const applied = applyPanelSelection(next, {
    sources: sourceMap.value,
    toggleKeys: toggleKeySet.value,
    priceSpan: priceSpan.value,
    appliedPrice: { min: priceMin.value, max: priceMax.value },
  });
  selection.value = applied.selection;
  priceMin.value = applied.price.min;
  priceMax.value = applied.price.max;
  publishState();
}

/**
 * **Clear all**, fired right after `onPanelChange` already ran for the same click (the panel
 * always emits `change` before `clear`). That first `publishState()` call can still read stale
 * facets: `requestOptions` is the sidebar's own debounced mirror, so a family a filter had just
 * narrowed away (no `colour` option, say) has not come back into the unfiltered facets yet, which
 * means `readableOptionKeys` cannot yet call it readable — so `publishState()`'s own patch never
 * clears that query key, leaving the old selection to round-trip straight back in through
 * `adoptRouteState()`. Flushing the debounce brings `facets.value` back in step *before*
 * publishing again, which is what actually clears every query key — the same ordering `onSort`'s
 * own comment explains at length, needed here because Clear all is the one path that both empties
 * the selection and needs that fresher read to publish correctly.
 */
function onPanelClear(): void {
  flushFilterDebounce();
  publishState();
}
/** Sort applies at once and flushes any sidebar change still waiting out its debounce, so the one
 *  request this triggers carries both. Flushed *before* `publishState()`, not after: that call
 *  reads `facets.value` (through `readableOptionKeys`) to decide which option keys its patch
 *  clears, and a flush is what brings the facets back in step with whatever selection is actually
 *  applied — reading them stale very nearly left a cleared filter's own query key uncleared, since
 *  a facet family a filtered answer had dropped was not yet back in the "readable" set. */
function onSort(value: string): void {
  sort.value = value;
  flushFilterDebounce();
  publishState();
}
/** Columns is layout, not a request parameter — flushed anyway, so a shopper who was mid-filter
 *  when they changed it is not left waiting on a debounce window they have moved past.
 *
 *  Flushed **last** here, unlike `onSort`: the flush assigns the mirror synchronously, so anything
 *  that changes a request input *after* it queues the mirror's own watcher behind the result's and
 *  the read goes out twice — once on the half-applied value, once on the final one. `onSort` is
 *  safe because `sort.value` is itself a request input and moves first; this handler's own write is
 *  layout only, and the request input it touches is `publishState()`'s page-window reset. It owes
 *  nothing to `onSort`'s facets ordering either, because it changes no filter: `publishState()`
 *  reads the facets to decide which filter query keys to clear, and there is nothing here to
 *  clear. */
function onColumns(value: string): void {
  columnsChoice.value = value;
  publishState();
  flushFilterDebounce();
}

/** Spec Acceptance: "after Clear all, [focus lands] on the count." The sidebar panel's own head
 *  draws **Clear all** and moves focus to its own title itself (spec → Behaviour), which is a
 *  sensible place to land right beside the button that was pressed — this is only the empty
 *  state's own **Clear filters** button, a block-drawn control the panel knows nothing about, so
 *  it still has to clear and focus by hand. */
async function onClearAll(): Promise<void> {
  selection.value = {};
  priceMin.value = '';
  priceMax.value = '';
  flushFilterDebounce();
  publishState();
  await nextTick();
  focusCount();
}

/**
 * `FilterPanel.focusChip(index)` reads its own `chipEls` ref array, which a shrinking `v-for` does
 * not always re-populate at the chip's *new* index in time for the same tick this fires in (the
 * surviving chip's remove button keeps its DOM node across the removal, but the ref callback that
 * records it under the new index is not guaranteed to have run yet). Querying the panel's own root
 * for the Nth remove button in document order is exactly what a shopper's or a screen reader's own
 * next stop would be, and does not depend on that internal bookkeeping.
 */
function focusNthRemoveButton(panel: InstanceType<typeof FilterPanel> | null, index: number): void {
  const root = (panel as { $el?: Element } | null)?.$el;
  const button = root?.querySelectorAll('[data-part="removeButton"]')[index];
  (button as HTMLElement | undefined)?.focus();
}

/**
 * Spec Acceptance: "After removing a chip, focus lands on the next chip or on the count." Applies
 * at once, the same as Clear all (`onPanelClear`) and for the same reason: `onPanelChange` has
 * already run for this same click and may have published over stale facets, so this flushes and
 * republishes before working out where focus goes — the one thing the panel cannot do itself.
 */
async function onPanelRemove(removal: { facetId: string; value: string }): Promise<void> {
  const index = lastSidebarChips.findIndex(
    (chip) => chip.facetId === removal.facetId && chip.value === removal.value
  );
  flushFilterDebounce();
  publishState();
  await nextTick();
  const remaining = appliedFilters(filterFacets.value, panelSelection.value);
  if (remaining.length === 0 || index < 0) {
    focusCount();
    return;
  }
  focusNthRemoveButton(sidebarPanelEl.value, Math.min(index, remaining.length - 1));
}

/** Widen the window first, resolve an armed sidebar wait second — the ordering `onColumns` explains
 *  at length. Flushing first assigned the mirror on the old window, and the wider one that followed
 *  queued the mirror behind the result's own watcher: two reads for one press, the first of them
 *  for a window the press had already replaced. */
function onLoadMore(): void {
  loadingMore.value = true;
  pagesLoaded.value += 1;
  flushFilterDebounce();
}

// ---------------------------------------------------------------------------------------------
// The drawer
// ---------------------------------------------------------------------------------------------

const drawerOpen = ref(false);
/** Latches on the first open, so the pending-count request below is never made on a page where
 *  nobody opened the drawer. */
const drawerUsed = ref(false);
const pendingSelection = ref<FilterSelection>({});
const pendingMin = ref('');
const pendingMax = ref('');

const pendingSelected = computed(() => (drawerUsed.value ? selected.value : null));
const pendingFilters = computed(() =>
  requestFiltersFor(pendingSelection.value, pendingMin.value, pendingMax.value)
);
/** The pending count read's own debounced echo of `pendingFilters` — the same
 *  `FILTER_DEBOUNCE_MS` window the sidebar's live path waits out, so a shopper ticking several
 *  boxes inside the drawer sends the pending-count request once rather than once per tick. */
const debouncedPendingFilters = ref(pendingFilters.value);
let pendingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function armPendingDebounce(): void {
  if (pendingDebounceTimer !== null) clearTimeout(pendingDebounceTimer);
  pendingDebounceTimer = setTimeout(() => {
    pendingDebounceTimer = null;
    debouncedPendingFilters.value = pendingFilters.value;
  }, FILTER_DEBOUNCE_MS);
}
/** Resolves an armed pending wait at once — opening the drawer fresh and Clear all inside it both
 *  call this rather than leaving the count to catch up on its own after a window nobody is
 *  chaining into. */
function flushPendingDebounce(): void {
  if (pendingDebounceTimer !== null) {
    clearTimeout(pendingDebounceTimer);
    pendingDebounceTimer = null;
  }
  debouncedPendingFilters.value = pendingFilters.value;
}

const pendingOptions = computed(() => ({
  page: 1,
  pageSize: 1,
  sort: sort.value === '' ? undefined : sort.value,
  filters: debouncedPendingFilters.value,
  ...categoryScopeOption.value,
}));
const pendingProducts = storeWideScope.value
  ? storefront.catalog.products(pendingOptions)
  : storefront.catalog.collectionProducts(pendingSelected, pendingOptions);
const pendingTotal = computed(() => pendingProducts.data.value?.total ?? total.value);

function openDrawer(): void {
  pendingSelection.value = { ...selection.value };
  pendingMin.value = priceMin.value;
  pendingMax.value = priceMax.value;
  drawerUsed.value = true;
  drawerOpen.value = true;
  flushPendingDebounce();
}
/** The drawer's own path: every kind of change the panel reports, applied to the *pending* copy —
 *  nothing here reaches the page until `applyPending()`. */
function onPendingPanelChange(next: UiFilterSelection): void {
  lastPendingChips = appliedFilters(filterFacets.value, pendingPanelSelection.value);
  const applied = applyPanelSelection(next, {
    sources: sourceMap.value,
    toggleKeys: toggleKeySet.value,
    priceSpan: priceSpan.value,
    appliedPrice: { min: pendingMin.value, max: pendingMax.value },
  });
  pendingSelection.value = applied.selection;
  pendingMin.value = applied.price.min;
  pendingMax.value = applied.price.max;
  armPendingDebounce();
}

/**
 * The same focus contract as `onPanelRemove`, for a chip removed from inside the drawer — with
 * nothing left, there is no count to fall back to inside a dialog, so focus is left where the
 * browser already puts it (the dialog itself, never outside it, because `Drawer` is a true modal).
 */
async function onPendingPanelRemove(removal: { facetId: string; value: string }): Promise<void> {
  const index = lastPendingChips.findIndex(
    (chip) => chip.facetId === removal.facetId && chip.value === removal.value
  );
  flushPendingDebounce();
  await nextTick();
  const remaining = appliedFilters(filterFacets.value, pendingPanelSelection.value);
  if (remaining.length === 0 || index < 0) return;
  focusNthRemoveButton(drawerPanelEl.value, Math.min(index, remaining.length - 1));
}

/** Spec: "Filtering in the drawer changes nothing on the page until **Show N products** is
 *  pressed." This is the only path out of the pending copy into the applied one — applied, like
 *  every other immediate-apply control, so it flushes the main debounce too rather than leaving a
 *  sidebar change the shopper made before opening the drawer stranded. Flushed before
 *  `publishState()` for the same reason `onSort` is. */
function applyPending(): void {
  selection.value = { ...pendingSelection.value };
  priceMin.value = pendingMin.value;
  priceMax.value = pendingMax.value;
  flushFilterDebounce();
  publishState();
  drawerOpen.value = false;
}

/**
 * **Clear all**, from the drawer's own foot (drawn by the Drawer's footer slot now, not the
 * panel's own hidden copy — see the drawer template below). Reproduces exactly what `FilterPanel`'s
 * internal Clear all does: `clearedSelection()` is `{}`, and `onPendingPanelChange` is the very
 * handler the panel's own `change` event already calls, so the pending copy, the price fields and
 * the pending-count debounce all land exactly where they would have. Focus is left alone, same as
 * the panel's own drawer-mode Clear all (`onClear(false)`): the browser keeps it on the button.
 */
function onDrawerClearAll(): void {
  onPendingPanelChange({});
  flushPendingDebounce();
}

/** Neither debounce outlives the component — a filter ticked right before navigating away must
 *  not fire a request into a storefront read nothing is listening to any more. */
onUnmounted(() => {
  if (filterDebounceTimer !== null) clearTimeout(filterDebounceTimer);
  if (pendingDebounceTimer !== null) clearTimeout(pendingDebounceTimer);
});

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------

/**
 * The shared product grid (spec "Product grid", 3040): 2 columns below 48rem with 2rem × 1rem
 * gaps; from 48rem 3 (or 2), gaps 3rem × 1.5rem — the 4-column setting shows 3 here; `columns` from
 * 64rem. Static strings from a lookup, so Tailwind emits every one of them.
 */
const GRID_COLUMNS: Record<string, string> = {
  '2': 'grid-cols-2',
  '3': 'grid-cols-2 @tablet:grid-cols-3',
  '4': 'grid-cols-2 @tablet:grid-cols-3 @content:grid-cols-4',
};
const gridClass: ComputedRef<string> = computed(
  () =>
    `grid gap-x-4 gap-y-8 @tablet:gap-x-6 @tablet:gap-y-12 ${GRID_COLUMNS[columnsChoice.value] ?? GRID_COLUMNS['3']!}`
);

/** A block whose `filters[]` is empty has nothing to put in a sidebar, a drawer or behind the
 *  Filter button — the "empty optional parts render nothing" rule, so the grid simply gets the
 *  whole width. */
const showSidebar = computed(() => hasSidebar.value && filterFacets.value.length > 0);
const hasFilters = computed(() => filterFacets.value.length > 0);
const hasSort = computed(() => sortOptions.value.length > 0);
const showTopBar = computed(() => hasFilters.value || hasSort.value);

const layoutClass = computed(() =>
  showSidebar.value
    ? '@content:grid @content:grid-cols-[15rem_1fr] @content:items-start @content:gap-12'
    : ''
);
/**
 * The top bar is the below-64rem control row: the Filter button beside the sort select. From 64rem
 * the spec hides it outright ("The mobile top bar is hidden") and the toolbar carries Sort by and
 * Columns instead — which is what the `sidebar` variant does. `drawer-only` has no sidebar, so its
 * Filter button is the only way into the filters and has to survive at every width; its **sort**
 * does not, because the toolbar's own sort select is shown from exactly the same 64rem.
 *
 * So the two halves are hidden separately rather than the whole bar being kept: the bar itself goes
 * from 64rem only in `sidebar` (`topBarClass`), and the sort inside it goes from 64rem in **both**
 * variants (`topBarSortClass`). Exactly one sort control is visible at every width in either
 * variant — the defect this replaced rendered two of them in `drawer-only` at desktop width, one
 * piece of state behind two comboboxes both named "Sort by". Container queries are invisible to
 * jsdom, so these two class strings are what the spec asserts.
 */
const topBarClass = computed(() =>
  [
    'mb-4 grid items-center gap-3',
    hasFilters.value ? 'grid-cols-[auto_1fr]' : 'grid-cols-1',
    hasSidebar.value ? '@content:hidden' : '',
  ].join(' ')
);
/** The top bar's own sort select: never shown from 64rem, where the toolbar's is. */
const TOP_BAR_SORT = '@content:hidden';

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const showPaging = computed(() => !showSkeletons.value && cards.value.length > 0);
function hrefForPage(page: number): string {
  const base = categoryScope.value
    ? categoryHref(routeCategoryPath ?? '')
    : catalogueScope.value
      ? CATALOGUE_PATH
      : `/collections/${collectionHandle.value ?? ''}`;
  return safeHref(page > 1 ? `${base}?page=${page}` : base) ?? base;
}
</script>

<template>
  <Section
    v-if="hasCollection || showNoCollectionHint || showNoCategoryHint"
    spacing="none"
    :aria-label="sectionLabel"
    :classes="{ root: 'pt-6 pb-[var(--eldra-section-md)]' }"
  >
    <Container width="wide">
      <EditorPlaceholder
        v-if="showNoCollectionHint"
        :icon="BoxIcon"
        :label="t('grid.noCollectionLabel')"
        :help="t('grid.noCollectionHelp')"
      />

      <EditorPlaceholder
        v-else-if="showNoCategoryHint"
        :icon="BoxIcon"
        :label="t('grid.noCategoryLabel')"
        :help="t('grid.noCategoryHelp')"
      />

      <EditorPlaceholder
        v-else-if="showUnresolvedCollectionHint"
        :icon="BoxIcon"
        :label="t('storefront.unresolvedCollectionLabel')"
        :help="t('storefront.unresolvedCollectionHelp')"
      />

      <template v-else>
        <div :class="layoutClass">
          <aside
            v-if="showSidebar"
            :aria-label="t('grid.filters')"
            class="@content:block @content:sticky @content:top-[calc(1.5rem_+_var(--eldra-header-height,0px))] hidden"
          >
            <!-- The panel's own head (`show-head`, the default) draws a visible "Filters" `h2`
                 right before its `h3` group triggers, which is what keeps a whole-page axe run's
                 `heading-order` rule happy under the page's own `h1` — no hidden heading to add
                 beside it any more. -->
            <FilterPanel
              ref="sidebarPanelEl"
              dense
              mode="sidebar"
              show-applied
              :facets="filterFacets"
              :model-value="panelSelection"
              :currency="money.currency.value"
              :id-prefix="`collection-grid-sidebar-${uid}`"
              @change="onPanelChange"
              @clear="onPanelClear"
              @remove="onPanelRemove"
            />
          </aside>

          <div class="min-w-0">
            <!-- Top bar: Filter + sort, below 64rem (always in drawer-only). -->
            <div v-if="showTopBar" :class="topBarClass">
              <Button
                v-if="hasFilters"
                variant="outline"
                :icon-left="AdjustmentsIcon"
                :classes="{ container: 'min-h-11' }"
                aria-haspopup="dialog"
                :aria-expanded="drawerOpen ? 'true' : 'false'"
                :aria-controls="drawerId"
                @click="openDrawer"
              >
                {{ t('grid.filter') }}
                <Badge
                  v-if="activeCount > 0"
                  tone="primary"
                  pill
                  :classes="{ root: 'ms-1' }"
                  :hidden-suffix="t('grid.nActive', { count: activeCount })"
                >
                  <span aria-hidden="true">{{ activeCount }}</span>
                </Badge>
              </Button>
              <FieldWrapper
                v-if="hasSort"
                :label="t('grid.sortBy')"
                :classes="{ root: TOP_BAR_SORT, label: 'sr-only' }"
              >
                <Select
                  :model-value="sort"
                  size="md"
                  :options="sortOptions"
                  :leading-icon="SortIcon"
                  :classes="{ value: 'font-semibold' }"
                  @update:model-value="onSort"
                />
              </FieldWrapper>
            </div>

            <!-- Toolbar: the count, and Sort by + Columns from 64rem. -->
            <div class="border-border flex flex-wrap items-center gap-x-6 gap-y-2 border-b pb-4">
              <p
                ref="countEl"
                tabindex="-1"
                role="status"
                aria-live="polite"
                class="text-body-sm text-muted tabular-nums"
              >
                {{ countText }}
              </p>
              <div class="@content:flex ms-auto hidden items-center gap-6">
                <FieldWrapper
                  v-if="hasSort"
                  :label="t('grid.sortBy')"
                  :classes="{
                    root: 'flex items-center gap-2',
                    label: 'text-body-sm text-muted mb-0 shrink-0 font-medium',
                  }"
                >
                  <Select
                    :model-value="sort"
                    size="sm"
                    :options="sortOptions"
                    @update:model-value="onSort"
                  />
                </FieldWrapper>
                <FieldWrapper
                  v-if="showColumnSelect"
                  :label="t('grid.columns')"
                  :classes="{
                    root: 'flex items-center gap-2',
                    label: 'text-body-sm text-muted mb-0 shrink-0 font-medium',
                  }"
                >
                  <Select
                    :model-value="columnsChoice"
                    size="sm"
                    :options="columnOptions"
                    @update:model-value="onColumns"
                  />
                </FieldWrapper>
              </div>
            </div>

            <!-- Results. -->
            <div class="mt-6">
              <VisuallyHidden as="h2" :id="productsHeadingId">{{
                t('grid.products')
              }}</VisuallyHidden>

              <!-- One region for the whole grid, always mounted and empty until there is
                   something to say: a live region inserted with its message already in it is
                   announced unreliably, and the cards deliberately do not announce for themselves
                   (`:announce="false"` below). -->
              <VisuallyHidden as="p" role="status">{{ announcement }}</VisuallyHidden>

              <ul
                v-if="showSkeletons"
                role="list"
                :aria-labelledby="productsHeadingId"
                :class="gridClass"
                aria-hidden="true"
              >
                <li v-for="index in skeletonCount" :key="index" class="flex flex-col gap-3">
                  <Skeleton variant="media" ratio="4x5" />
                  <Skeleton variant="text" :lines="2" />
                </li>
              </ul>

              <ul
                v-else-if="cards.length > 0"
                role="list"
                :aria-labelledby="productsHeadingId"
                :aria-busy="updating ? 'true' : undefined"
                :class="[gridClass, updating ? UPDATING_PULSE : '']"
                :inert="updating || undefined"
              >
                <li v-for="entry in cards" :key="entry.item.handle">
                  <!-- No quick add: the spec's tab order for this block runs straight from the
                       cards to Load more, and a cart action is `product-detail`'s own. -->
                  <ProductCard
                    :product="entry.product"
                    ratio="4x5"
                    :heading-level="3"
                    :classes="CARD_CLASSES"
                    :quick-add="false"
                    :revalidating="entry.revalidating"
                    :announce="false"
                    :link-as="entry.internal ? EldraRouterLink : undefined"
                  />
                </li>
              </ul>

              <EmptyState
                v-else
                variant="noResults"
                :icon="AdjustmentsIcon"
                :title="emptyTitle"
                :text="emptyText"
                :heading-level="3"
              >
                <template #actions>
                  <Button variant="primary" @click="onClearAll">
                    {{ t('grid.clearFilters') }}
                  </Button>
                </template>
              </EmptyState>
            </div>

            <!-- Paging. -->
            <div v-if="showPaging" class="mt-12">
              <LoadMore
                v-if="isLoadMore"
                :shown="cards.length"
                :total="total"
                :noun="t('grid.productsNoun')"
                :pending="loadingMore"
                @load="onLoadMore"
              />
              <Pagination
                v-else
                :page="currentPage"
                :total-pages="totalPages"
                :href-for-page="hrefForPage"
                :link-as="EldraRouterLink"
                :aria-label="t('grid.pagination')"
              />
            </div>
          </div>
        </div>

        <Drawer
          v-if="hasFilters"
          :id="drawerId"
          v-model="drawerOpen"
          side="right"
          :title="t('grid.filter')"
          width="min(24rem, 100%)"
          :classes="{ footer: 'grid grid-cols-[auto_1fr]' }"
        >
          <!-- `show-head false`: the Drawer's own title above is already this panel's heading, so
               it draws no second one of its own. The panel's own foot is hidden
               (`classes.foot: 'hidden'`): at 360 it used to sit `static` at the end of the
               scrolling groups, bottom off-screen in a short viewport, so a shopper had to scroll
               the whole filter list to find Clear all / Show N products. The Drawer's own `footer`
               slot below draws the foot instead — a true sibling of the scrolling `body`, outside
               its `overflow-y-auto`, so it stays pinned at the bottom of the dialog while the
               groups scroll under it (spec "Filter panel" → Anatomy item 14: "Drawer foot (drawer
               mode, supplied by the Drawer)"). `classes.footer` turns the Drawer's own flex foot
               into the spec's 2-column grid (`auto | 1fr`); its `border-t`/`bg-background` are the
               Drawer's own foot chrome already, which is exactly the top rule and background fill
               the spec asks for. -->
          <FilterPanel
            ref="drawerPanelEl"
            mode="drawer"
            :show-head="false"
            show-applied
            :facets="filterFacets"
            :model-value="pendingPanelSelection"
            :currency="money.currency.value"
            :result-count="pendingTotal"
            :id-prefix="`collection-grid-drawer-${uid}`"
            :classes="{ foot: 'hidden' }"
            @change="onPendingPanelChange"
            @clear="flushPendingDebounce"
            @apply="applyPending"
            @remove="onPendingPanelRemove"
          />

          <template #footer>
            <Button variant="outline" type="button" @click="onDrawerClearAll">
              {{ filterPanelMessages.filterPanelClearAll }}
            </Button>
            <Button variant="primary" type="button" block @click="applyPending">
              {{
                pendingTotal === null
                  ? filterPanelMessages.filterPanelShowProducts
                  : filterPanelMessages.filterPanelShowResults(pendingTotal)
              }}
            </Button>
          </template>
        </Drawer>
      </template>
    </Container>
  </Section>
</template>
