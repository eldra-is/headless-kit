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
import { useEldraIcon } from '../../app/composables/useEldraIcon';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { toProductCard } from '../../app/storefront/toProductCard';
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
 * component, while `EldraIcon` needs a `name` prop bound first — the same adapter
 * `blocks/image/Block.vue` builds for `EditorPlaceholder.icon`, at module scope so a re-render
 * never remounts (and re-fetches) it.
 */
function tablerIcon(name: string, displayName: string): Component {
  return defineComponent({
    name: displayName,
    setup() {
      const svg = useEldraIcon(name);
      return () => {
        const markup = svg.value;
        if (markup === null) return h('svg', { viewBox: '0 0 24 24' });
        const body = markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
        return h('svg', {
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          innerHTML: body,
        });
      };
    },
  });
}
/** The filter icon (Filter button and the no-results empty state) and the mobile sort trigger's. */
const AdjustmentsIcon = tablerIcon('adjustments', 'CollectionGridAdjustmentsIcon');
const SortIcon = tablerIcon('arrows-sort', 'CollectionGridSortIcon');
/** The freshly-inserted editor hint's box icon (spec States, "Empty (freshly inserted)"). */
const BoxIcon = tablerIcon('box', 'CollectionGridBoxIcon');

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

const columnsField = computed(() => normaliseChoice(data.value.columns, ['2', '3', '4'], '3'));
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

const collectionHandle = computed<string | null>(() => {
  const own = (data.value.collectionHandle ?? '').trim();
  return own !== '' ? own : route.collectionHandle;
});
const hasCollection = computed(
  () => collectionHandle.value !== null && collectionHandle.value !== ''
);
const showNoCollectionHint = computed(() => editing.value && !hasCollection.value);

const collection = storefront.catalog.collection(collectionHandle);
const collectionTitle = computed(
  () => collection.data.value?.title ?? collectionHandle.value ?? ''
);
const sectionLabel = computed(() => t('grid.sectionLabel', { collection: collectionTitle.value }));

// ---------------------------------------------------------------------------------------------
// Applied state (sidebar: live) and the drawer's pending copy
// ---------------------------------------------------------------------------------------------

const selection = ref<FilterSelection>({});
const priceMin = ref('');
const priceMax = ref('');

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
const sort = ref('');
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

/** The shopper's own column choice, seeded from the field and reset whenever the field changes. */
const columnsChoice = ref(columnsField.value);
watch(columnsField, (value) => {
  columnsChoice.value = value;
});
const columnOptions = computed<SelectOption[]>(() =>
  ['2', '3', '4'].map((value) => ({ value, label: value }))
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
const products = storefront.catalog.collectionProducts(collectionHandle, requestOptions);

const items = computed(() => products.data.value?.items ?? []);
const total = computed(() => products.data.value?.total ?? 0);
const facets = computed(() => products.data.value?.facets ?? []);
const pending = products.pending;

/**
 * Loading a *further* page is not the same state as filtering. "While filtering, the grid shows the
 * same number of Skeleton cards and the count reads 'Updating…'" (spec States → Loading), but on
 * Load more "focus stays on the button" (spec Accessibility) — which it cannot if the button is
 * replaced by skeletons mid-press. So a load-more request keeps every card already on screen and
 * the real count, and marks only the button busy (`LoadMore`'s own `pending`).
 */
const loadingMore = ref(false);
watch(pending, (value) => {
  if (!value) loadingMore.value = false;
});
const showSkeletons = computed(() => pending.value && !loadingMore.value);

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
  if (showSkeletons.value) return t('grid.updating');
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

const pendingHandle = computed(() => (drawerUsed.value ? collectionHandle.value : null));
const pendingOptions = computed(() => ({
  page: 1,
  pageSize: 1,
  sort: sort.value === '' ? undefined : sort.value,
  filters: requestFiltersFor(pendingSelection.value, pendingMin.value, pendingMax.value),
}));
const pendingProducts = storefront.catalog.collectionProducts(pendingHandle, pendingOptions);
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
const showPaging = computed(() => !showSkeletons.value && items.value.length > 0);
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

      <template v-else>
        <div :class="layoutClass">
          <aside
            v-if="showSidebar"
            :aria-label="t('grid.filters')"
            class="@content:block @content:sticky @content:top-[calc(1.5rem_+_var(--eldra-header-height,0px))] hidden"
          >
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
                v-else-if="items.length > 0"
                role="list"
                :aria-labelledby="productsHeadingId"
                :class="gridClass"
              >
                <li v-for="item in items" :key="item.handle">
                  <!-- No quick add: the spec's tab order for this block runs straight from the
                       cards to Load more, and a cart action is `product-detail`'s own. -->
                  <ProductCard
                    :product="toProductCard(item, { ratio: '4x5' })"
                    ratio="4x5"
                    :heading-level="3"
                    :quick-add="false"
                    :link-as="EldraRouterLink"
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
                :shown="items.length"
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
