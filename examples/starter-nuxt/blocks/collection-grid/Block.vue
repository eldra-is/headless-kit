<script setup lang="ts">
/**
 * Collection grid: a collection's products as a filterable, sortable card grid — a sticky filter
 * sidebar from 64rem of the block's own width, a filter drawer below that (and at every width in
 * `drawer-only`) (spec `02-blocks.md` "Collection grid", 3047–3170, over the shared "Product grid"
 * and "Progress bar" parts at 3036–3045).
 *
 * **Where the data comes from.** Everything a shopper sees — cards, prices, filter values, counts,
 * the total — is `useStorefront().catalog.collectionProducts()`; the CMS fields only configure the
 * block and carry the empty-state copy. The collection is the `collectionHandle` field when an
 * author set one, else `route.collectionHandle` (the field's own help text: "Leave empty on a
 * collection template — the route supplies it"). Cards are always built by `toProductCard()`, the
 * one mapping every commerce block shares.
 *
 * **Where the state goes.** Selected filters, sort, columns and page belong in the URL so results
 * can be shared and the back button works (spec Do/Don't), but `blocks/**` may not touch a router:
 * the block writes its state out through `route.setQuery()` — the one writer `StorefrontRoute`
 * exposes — and the page turns that into a URL. It reads back only what that interface can give
 * back: `route.page`, which is what makes the `pages` style's numbered links real navigation rather
 * than component state. Filters and sort have no reader on `StorefrontRoute` today, so they survive
 * as this component's own state for the life of the page; restoring them from a shared URL needs a
 * reader added to `StorefrontRoute`, not worked around here.
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
  inject,
  nextTick,
  onMounted,
  ref,
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
  LoadMore,
  MESSAGES_KEY,
  Pagination,
  ProductCard,
  Section,
  Select,
  Skeleton,
  VisuallyHidden,
  enUS as uiEnUS,
  provideEldraUiMessages,
  type SelectOption,
  type UiMessages,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { iconComponent } from '../../app/composables/iconComponent';
import { useRevalidating } from '../../app/composables/useRevalidating';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
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
import { safeHref } from '../../app/utils/links';
import ActiveFilters, { type ActiveFilterChip } from './parts/ActiveFilters.vue';
import FilterGroups from './parts/FilterGroups.vue';
import {
  FACET_SOURCE,
  GROUP_KIND,
  isFilterSource,
  visibleFacetValues,
  type FilterGroup,
  type FilterSelection,
  type FilterSource,
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
const t = useT();
const storefront = useStorefront();
const route = storefront.route;

/**
 * A chip's remove button is named by the package's own `removeTag` message ("Remove Size: M") — it
 * has no `messages` prop of its own to override, and `aria-label` on a `Chip` lands on its root. The
 * spec names it "Remove filter Size: M", so the block re-provides the message set for its own
 * subtree with that one entry replaced, delegating every other key to whatever the app provided
 * (`app/plugins/eldra-ui-messages.ts`).
 *
 * **Getters, not a spread.** That plugin deliberately provides an object of getters over
 * `preview.locale` rather than a snapshot, because `useMessages` spreads the injected object
 * *inside a `computed`* — reading a key through a getter there is what makes a Studio locale switch
 * reach the package's own strings. A spread here would invoke every one of those getters once, at
 * setup, and freeze every package string in this block's subtree (ProductCard, Drawer, Pagination,
 * Select, LoadMore, Chip) at the mount-time locale while the block's own `useT()` strings kept
 * switching. So this mirrors the plugin's own `Object.defineProperty` loop and reads through.
 */
const inheritedMessages = inject(MESSAGES_KEY, undefined);
const blockMessages = {} as Partial<UiMessages>;
for (const key of Object.keys(uiEnUS) as Array<keyof UiMessages>) {
  Object.defineProperty(blockMessages, key, {
    enumerable: true,
    get: () =>
      key === 'removeTag'
        ? (label: string) => t('grid.removeFilter', { label })
        : inheritedMessages?.[key],
  });
}
provideEldraUiMessages(blockMessages);

const uid = useUiId();
const drawerId = `collection-grid-drawer-${uid}`;
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
 * Which collection this grid shows. `collection` is the `reference` field an
 * author picks in Studio; it stores the collection's id, so a renamed collection
 * cannot silently empty the block. `collectionHandle` is the handle field this
 * block shipped with — still honoured, so a merchant's existing grid keeps
 * working after the theme update, and it is what `mock.json` (Storybook,
 * previews) still carries. `route.collectionHandle` is the collection template's
 * own segment, the case the fields are both meant to be left empty for.
 *
 * `collectionSelector` prefers the reference's resolved `slug`, falls back to its
 * bare id (a page builder draft overlay, or a depth-0 read — see
 * `app/storefront/collectionSelector.ts`) and only then to the handle and the
 * route: a picked collection overrides both, which is what its help text
 * promises.
 */
const selected = computed<StorefrontCollectionSelector | null>(() =>
  collectionSelector(data.value.collection, data.value.collectionHandle, route.collectionHandle)
);
/** The handle, when the collection is known by one. `collection()` below and the
 *  `/collections/<slug>` paging links have no other key to work from; the grid
 *  itself goes through `selected`, so an id-only collection still loads. */
const collectionHandle = computed<string | null>(() => selectorSlug(selected.value));
const hasCollection = computed(() => selected.value !== null);
const showNoCollectionHint = computed(() => editing.value && !hasCollection.value);

const collection = storefront.catalog.collection(collectionHandle);
const collectionTitle = computed(
  () => collection.data.value?.title ?? collectionHandle.value ?? ''
);
/** Falls back to the plain noun when nothing names the collection yet — an
 *  id-only reference has no title and no handle to borrow one from, and an empty
 *  `{collection}` would leave the landmark named " products". */
const sectionLabel = computed(() =>
  collectionTitle.value === ''
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
function initialFilterSelection(): FilterSelection {
  const out: FilterSelection = {};
  const category = route.filters.category;
  if (category && category.length > 0) out.category = category;
  const size = route.filters.size;
  if (size && size.length > 0) out['option:size'] = size;
  const colour = route.filters.colour;
  if (colour && colour.length > 0) out['option:colour'] = colour;
  const availability = route.filters.availability;
  if (availability && availability.length > 0) out.availability = availability;
  return out;
}

const selection = ref<FilterSelection>(initialFilterSelection());
const priceMin = ref(route.filters.minPrice?.[0] ?? '');
const priceMax = ref(route.filters.maxPrice?.[0] ?? '');

const sortOptions = computed<SelectOption[]>(() => {
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
  route.sort !== null && sortOptions.value.some((option) => option.value === route.sort)
    ? route.sort
    : ''
);
watch(
  sortOptions,
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
  if (min !== '' || max !== '') out.price = [`${min}-${max}`];
  return Object.keys(out).length > 0 ? out : undefined;
}

const appliedFilters = computed(() =>
  requestFiltersFor(selection.value, priceMin.value, priceMax.value)
);

const requestOptions = computed(() => ({
  page: isLoadMore.value ? 1 : currentPage.value,
  pageSize: isLoadMore.value ? pageSize.value * pagesLoaded.value : pageSize.value,
  sort: sort.value === '' ? undefined : sort.value,
  filters: appliedFilters.value,
}));
const products = storefront.catalog.collectionProducts(selected, requestOptions);

const items = computed(() => products.data.value?.items ?? []);
const money = useMoney();
const total = computed(() => products.data.value?.total ?? 0);
const facets = computed(() => products.data.value?.facets ?? []);
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
 * - `refreshing` — a read in flight over results that *are* on screen: a filter, a
 *   sort, a page. The old cards stay exactly where they are and take the dimmed-value + spinner
 *   treatment, the grid is marked `aria-busy`, and the count reads "Updating…". This is what used
 *   to replace the whole grid with skeletons.
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
 * Both "a fresher value is on its way" states, drawn identically and gated identically: the
 * volatile refresh (money and the stock line, re-read a moment after mount) and a whole read in
 * flight over cards already on screen. `useRevalidating` holds both at `false` until after mount,
 * so the browser's first render is the server's — a hydrating page's result is already `loading`
 * with its payload data in place, so reading the flag straight through would paint dimmed cards,
 * spinners, `aria-busy` and "Updating…" that the server never wrote.
 *
 * Each card dims its two values and draws a spinner beside them, but `announce: false` — a 24-card
 * grid would otherwise hold 48 polite live regions all speaking at once (`@eldrajs/ui`'s `announce`
 * prop); the grid says it once instead, in `announcement` below.
 */
const { any: cardsRevalidating, refreshing } = useRevalidating({
  keys: () => products.revalidating.value,
  refreshing: () => loading.value && hasData.value && !loadingMore.value,
});
const announcement = computed(() =>
  cardsRevalidating.value ? t('storefront.updatingValues') : ''
);

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
    revalidating: cardsRevalidating.value,
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

const legends = computed<Record<FilterSource, string>>(() => ({
  category: t('grid.legendCategory'),
  'option:size': t('grid.legendSize'),
  'option:colour': t('grid.legendColour'),
  price: t('grid.legendPrice'),
  availability: t('grid.legendAvailability'),
}));

/** A group's title when the author set none and the store offers no facet label of its own — the
 *  legend, which is already the source's own name (`price`'s legend is a sentence, so not that). */
function defaultGroupLabel(source: FilterSource): string {
  return source === 'price' ? t('grid.price') : legends.value[source];
}

const groups = computed<FilterGroup[]>(() => {
  const rows = (data.value.filters ?? []) as FilterField[];
  const out: FilterGroup[] = [];
  for (const row of rows) {
    if (!isFilterSource(row.source)) continue;
    const source = row.source;
    const facetKey = FACET_SOURCE[source];
    const facet =
      facetKey === undefined ? undefined : facets.value.find((f) => f.source === facetKey);
    const values =
      source === 'price' ? [] : visibleFacetValues(facet, selection.value[source] ?? []);
    // A group whose store has nothing to offer is not a group. Price is the exception: its two
    // inputs exist whether or not the store reports a range. A group that still carries a selection
    // always has values — `visibleFacetValues` keeps them — so it can never be dropped out from
    // under an applied filter.
    if (source !== 'price' && values.length === 0) continue;
    out.push({
      source,
      label: (row.label ?? '').trim() || facet?.label || defaultGroupLabel(source),
      kind: GROUP_KIND[source],
      collapsed: row.collapsed === true,
      legend: legends.value[source],
      values,
    });
  }
  return out;
});

/** The groups by source, for labelling a chip whose group is rendered. */
const groupBySource = computed(
  () => new Map(groups.value.map((group) => [group.source, group] as const))
);

/**
 * The order active filters are listed in: the author's own `filters[]` order first, then any source
 * that carries a selection without a group of its own — a filter seeded from the URL, or one whose
 * group the author has since removed. Nothing selected is ever left out of this list.
 */
const activeSources = computed<FilterSource[]>(() => {
  const out: FilterSource[] = [];
  for (const row of (data.value.filters ?? []) as FilterField[]) {
    if (isFilterSource(row.source) && !out.includes(row.source)) out.push(row.source);
  }
  for (const source of Object.keys(selection.value) as FilterSource[]) {
    if (isFilterSource(source) && !out.includes(source)) out.push(source);
  }
  if (!out.includes('price')) out.push('price');
  return out;
});

// ---------------------------------------------------------------------------------------------
// Active filters
// ---------------------------------------------------------------------------------------------

/**
 * The active filters, derived from **the selection**, never from the response's facets. A facet is
 * computed over the current result set on most backends, so a value can stop being listed the
 * moment a narrowing filter is applied — and a chip derived from the facets would then vanish while
 * the filter stayed in every request, leaving the shopper no way to remove it. The facets are used
 * only to *label* a value; an unlabelled one falls back to its raw value, which is still removable.
 */
const chips = computed<ActiveFilterChip[]>(() => {
  const out: ActiveFilterChip[] = [];
  for (const source of activeSources.value) {
    const group = groupBySource.value.get(source);
    const label = group?.label ?? defaultGroupLabel(source);
    if (source === 'price') {
      if (priceMin.value === '' && priceMax.value === '') continue;
      const prefix = t('grid.pricePrefix');
      const from = priceMin.value === '' ? '' : `${prefix}${priceMin.value}`;
      const to = priceMax.value === '' ? '' : `${prefix}${priceMax.value}`;
      out.push({
        key: 'price',
        label: `${label}: ${from} ${t('grid.to')} ${to}`.replace(/\s+/g, ' ').trim(),
      });
      continue;
    }
    for (const value of selection.value[source] ?? []) {
      const match = group?.values.find((candidate) => candidate.value === value);
      out.push({ key: `${source}:${value}`, label: `${label}: ${match?.label ?? value}` });
    }
  }
  return out;
});
const activeCount = computed(() => chips.value.length);

/**
 * The empty-results advice: the author's own `emptyText`, then a sentence naming what is actually
 * filtered ("Nothing in Oat, size M is in stock right now.", spec States → Empty results). The
 * value labels, not the chip labels — the sentence reads as prose, not as a list of group titles.
 */
const activeValueLabels = computed(() => {
  const out: string[] = [];
  for (const source of activeSources.value) {
    if (source === 'price') continue;
    const group = groupBySource.value.get(source);
    for (const value of selection.value[source] ?? []) {
      const match = group?.values.find((candidate) => candidate.value === value);
      out.push(match?.label ?? value);
    }
  }
  return out;
});
const emptyTitle = computed(() => (data.value.emptyTitle ?? '').trim() || t('grid.noResultsTitle'));
const emptyText = computed(() => {
  const own = (data.value.emptyText ?? '').trim();
  const named =
    activeValueLabels.value.length > 0
      ? t('grid.nothingIn', { filters: activeValueLabels.value.join(', ') })
      : '';
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
 * `?minPrice=50&maxPrice=150` simply is not in the route while the block is being built: seeding
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
  const next = initialFilterSelection();
  if (!sameSelection(next, selection.value)) selection.value = next;
  const min = route.filters.minPrice?.[0] ?? '';
  if (min !== priceMin.value) priceMin.value = min;
  const max = route.filters.maxPrice?.[0] ?? '';
  if (max !== priceMax.value) priceMax.value = max;
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
  watch(() => [route.filters, route.sort, route.columns], adoptRouteState, { deep: true });
});

function publishState(): void {
  pagesLoaded.value = 1;
  route.setQuery({
    page: null,
    sort: sort.value === '' ? null : sort.value,
    columns: columnsChoice.value,
    category: selection.value.category ?? null,
    size: selection.value['option:size'] ?? null,
    colour: selection.value['option:colour'] ?? null,
    availability: selection.value.availability ?? null,
    minPrice: priceMin.value === '' ? null : priceMin.value,
    maxPrice: priceMax.value === '' ? null : priceMax.value,
  });
}

const countText = computed(() => {
  if (showSkeletons.value || refreshing.value) return t('grid.updating');
  if (total.value === 1) return t('grid.oneProduct');
  return t('grid.nProducts', { count: total.value });
});

const countEl = ref<HTMLElement | null>(null);
const activeFiltersEl = ref<InstanceType<typeof ActiveFilters> | null>(null);
function focusCount(): void {
  countEl.value?.focus();
}

// ---------------------------------------------------------------------------------------------
// Applying a change
// ---------------------------------------------------------------------------------------------

function toggleIn(values: FilterSelection, source: FilterSource, value: string, checked: boolean) {
  const current = values[source] ?? [];
  const next = checked
    ? current.includes(value)
      ? current
      : [...current, value]
    : current.filter((candidate) => candidate !== value);
  const out: FilterSelection = { ...values };
  if (next.length === 0) delete out[source];
  else out[source] = next;
  return out;
}

function onToggle(source: FilterSource, value: string, checked: boolean): void {
  selection.value = toggleIn(selection.value, source, value, checked);
  publishState();
}
function onMin(value: string): void {
  priceMin.value = value;
  publishState();
}
function onMax(value: string): void {
  priceMax.value = value;
  publishState();
}
function onSort(value: string): void {
  sort.value = value;
  publishState();
}
function onColumns(value: string): void {
  columnsChoice.value = value;
  publishState();
}

function clearSelection(): void {
  selection.value = {};
  priceMin.value = '';
  priceMax.value = '';
}

/** Spec Acceptance: "after Clear all, [focus lands] on the count." */
async function onClearAll(): Promise<void> {
  clearSelection();
  publishState();
  await nextTick();
  focusCount();
}

/** Spec Acceptance: "After removing a chip, focus lands on the next chip or on the count." */
async function onRemoveChip(key: string): Promise<void> {
  const index = chips.value.findIndex((chip) => chip.key === key);
  if (key === 'price') {
    priceMin.value = '';
    priceMax.value = '';
  } else {
    const separator = key.lastIndexOf(':');
    const source = key.slice(0, separator);
    const value = key.slice(separator + 1);
    if (isFilterSource(source)) selection.value = toggleIn(selection.value, source, value, false);
  }
  publishState();
  await nextTick();
  if (chips.value.length === 0 || index < 0) {
    focusCount();
    return;
  }
  const target = Math.min(index, chips.value.length - 1);
  if (activeFiltersEl.value?.focusChip(target) !== true) focusCount();
}

function onLoadMore(): void {
  loadingMore.value = true;
  pagesLoaded.value += 1;
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
const pendingOptions = computed(() => ({
  page: 1,
  pageSize: 1,
  sort: sort.value === '' ? undefined : sort.value,
  filters: requestFiltersFor(pendingSelection.value, pendingMin.value, pendingMax.value),
}));
const pendingProducts = storefront.catalog.collectionProducts(pendingSelected, pendingOptions);
const pendingTotal = computed(() => pendingProducts.data.value?.total ?? total.value);

function openDrawer(): void {
  pendingSelection.value = { ...selection.value };
  pendingMin.value = priceMin.value;
  pendingMax.value = priceMax.value;
  drawerUsed.value = true;
  drawerOpen.value = true;
}
function onPendingToggle(source: FilterSource, value: string, checked: boolean): void {
  pendingSelection.value = toggleIn(pendingSelection.value, source, value, checked);
}
function clearPending(): void {
  pendingSelection.value = {};
  pendingMin.value = '';
  pendingMax.value = '';
}
/** Spec: "Filtering in the drawer changes nothing on the page until **Show N products** is
 *  pressed." This is the only path out of the pending copy into the applied one. */
function applyPending(): void {
  selection.value = { ...pendingSelection.value };
  priceMin.value = pendingMin.value;
  priceMax.value = pendingMax.value;
  publishState();
  drawerOpen.value = false;
}

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
const showSidebar = computed(() => hasSidebar.value && groups.value.length > 0);
const hasFilters = computed(() => groups.value.length > 0);
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
  const base = `/collections/${collectionHandle.value ?? ''}`;
  return safeHref(page > 1 ? `${base}?page=${page}` : base) ?? base;
}
</script>

<template>
  <Section
    v-if="hasCollection || showNoCollectionHint"
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
            <!-- A whole-page axe run sees this aside's `h3` group triggers right after the page's
                 own `h1` (`heading-order`): this hidden `h2` (the aside's own accessible name) gives
                 them a level to nest under without changing anything sighted users see. -->
            <VisuallyHidden as="h2">{{ t('grid.filters') }}</VisuallyHidden>
            <FilterGroups
              dense
              :groups="groups"
              :selection="selection"
              :min="priceMin"
              :max="priceMax"
              :id-prefix="`collection-grid-sidebar-${uid}`"
              @toggle="onToggle"
              @update:min="onMin"
              @update:max="onMax"
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

            <ActiveFilters
              v-if="chips.length > 0"
              ref="activeFiltersEl"
              class="mt-4"
              :chips="chips"
              @remove="onRemoveChip"
              @clear="onClearAll"
            />

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
                :aria-busy="refreshing ? 'true' : undefined"
                :class="gridClass"
              >
                <li v-for="entry in cards" :key="entry.item.handle">
                  <!-- No quick add: the spec's tab order for this block runs straight from the
                       cards to Load more, and a cart action is `product-detail`'s own. -->
                  <ProductCard
                    :product="entry.product"
                    ratio="4x5"
                    :heading-level="3"
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
        >
          <!-- Same reasoning as the sidebar's own hidden `h2` above — a heading for the group
               triggers to nest under, independent of the Drawer's own visible title. -->
          <VisuallyHidden as="h2">{{ t('grid.filters') }}</VisuallyHidden>
          <FilterGroups
            :groups="groups"
            :selection="pendingSelection"
            :min="pendingMin"
            :max="pendingMax"
            :id-prefix="`collection-grid-drawer-${uid}`"
            @toggle="onPendingToggle"
            @update:min="pendingMin = $event"
            @update:max="pendingMax = $event"
          />
          <template #footer>
            <div class="grid grid-cols-[auto_1fr] items-center gap-3">
              <Button
                variant="outline"
                :classes="{ container: 'min-h-11' }"
                @click="clearPending"
                >{{ t('grid.clearAll') }}</Button
              >
              <Button
                variant="primary"
                block
                :classes="{ container: 'min-h-11' }"
                @click="applyPending"
                >{{ t('grid.showNProducts', { count: pendingTotal }) }}</Button
              >
            </div>
          </template>
        </Drawer>
      </template>
    </Container>
  </Section>
</template>
