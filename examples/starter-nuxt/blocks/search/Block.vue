<script setup lang="ts">
/**
 * Search results page: a combobox field with grouped suggestions as you type, a results page
 * mixing products and content, and a helpful no-results state (spec `02-blocks.md` "Search results
 * page", 3609-3717). `field-only` is the same field with none of the results-page content, used by
 * the header's search overlay and the 404 page.
 *
 * The field is `@eldrajs/ui`'s `SearchBar` at size `lg` — the package owns the combobox pattern,
 * `aria-activedescendant`, the two-step `Esc`, the "See all N results" row and the polite live
 * region. This block never re-implements any of that: `blocks/search/results.ts` only maps
 * `search.run()`'s response into its shape, capped by this block's own `suggestionsPerGroup` and
 * ranking sold-out products last.
 *
 * **One query, one search.** `searchQuery` is seeded from `useStorefront().route.query` (the
 * query that actually brought the shopper here) and stays in sync with it going forward, but is
 * also `SearchBar`'s own two-way `v-model` — the same single-query wiring
 * `blocks/navigation/Block.vue`'s header search uses. That single ref drives one `search.run()`
 * call feeding both the field's own live suggestion panel and this page's heading, summary, tabs
 * and result sections: a results page is an instant-search page, so retyping the query updates
 * everything on it together, and it avoids a second, redundant fetch for the common case where
 * the field's value already matches the page's own query.
 *
 * **Tabs.** `types[]` (in field order) decides which of Products/Journal/Pages can have a tab and
 * a section; a type with zero results never gets one, and a page where only one type actually has
 * results renders no `Tabs` widget at all (spec → States, "Minimal") — the same content that would
 * sit in the "All" tab renders directly instead. `TypeSection.vue` is the one grid/list renderer
 * every one of those three places (the "All" panel's per-type sections, a single type's own panel,
 * and the tabs-hidden fallback) shares, rather than writing the products/journal/pages markup
 * three times; `showHeader` is the only thing that differs between them (a type-specific panel or
 * tab already names its own content, so it skips the heading/count/"View all" row).
 *
 * **No results.** A `search.run()` response with `total === 0` replaces the normal head/tabs
 * content with its own `role="status"` stack (spec → Accessibility: "announced when the page loads
 * after a search"): its own `h1`, advice with an optional "Did you mean" link from the backend's
 * `suggestion`, the popular-search chips again, and up to four `ProductCard`s from
 * `noResultsCollection` via `useStorefront().catalog.collectionProducts()`.
 *
 * The demo storefront's `search.run()` matches the query text against the catalogue and journal,
 * and its `best-sellers` collection feeds the no-results "Customers love these" row; the block's
 * own spec still provides a stub `search`/`catalog` where a test needs a pending or empty result on
 * demand.
 */
import { computed, inject, ref, toValue, watch } from 'vue';
import {
  Container,
  CURRENCY_KEY,
  EditorPlaceholder,
  Link,
  LOCALE_KEY,
  ProductCard,
  Section,
  SearchBar,
  Tab,
  TabPanel,
  Tabs,
} from '@eldrajs/ui';
import type { SearchResultType } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { stripStega } from '@eldrajs/theme-core/stega';
import { isInternalHref } from '../../app/utils/links';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import { useMoney } from '../../app/storefront/money';
import type { StorefrontCollectionSelector } from '../../app/storefront/types';
import { toSearchBarResults } from './results';
import TypeSection from './TypeSection.vue';

type ResultTypeId = 'products' | 'journal' | 'pages';
interface TypeConfig {
  type: ResultTypeId;
  label: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'search'> }>();
const { data } = useBlockData(props, 'search');
const editing = useEditing();
const t = useT();
const storefront = useStorefront();
const headingId = `search-heading-${useUiId()}`;

/** The results page this block's own links point back to — `SearchBar`'s own default `action`. */
const RESULTS_URL = '/search';
/** What the author writes in `heading` to have the shopper's query dropped into the sentence. */
const QUERY_PLACEHOLDER = '{query}';
const resultsLinkAs = isInternalHref(RESULTS_URL) ? EldraRouterLink : undefined;

function searchHref(query: string): string {
  return `${RESULTS_URL}?q=${encodeURIComponent(query)}`;
}

/** `CURRENCY_KEY`/`LOCALE_KEY` (`@eldrajs/ui`), unwrapped once and passed to every `ProductCard`
 *  explicitly — the same pattern `product-carousel`'s own Block.vue follows. */
const injectedCurrency = inject(CURRENCY_KEY, undefined);
const injectedLocale = inject(LOCALE_KEY, undefined);
const currency = computed(() => toValue(injectedCurrency));
const locale = computed(() => toValue(injectedLocale));

const variant = computed(() => data.value.variant ?? 'results-page');
const isResultsPage = computed(() => variant.value === 'results-page');

const placeholder = computed(() => (data.value.placeholder ?? '').trim() || undefined);

// --- result types (field order, defaulting to all three) -----------------------------------

const DEFAULT_TYPES: TypeConfig[] = [
  { type: 'products', label: '' },
  { type: 'journal', label: '' },
  { type: 'pages', label: '' },
];

function isTypeId(value: unknown): value is ResultTypeId {
  return value === 'products' || value === 'journal' || value === 'pages';
}

const configuredTypes = computed<TypeConfig[]>(() =>
  (data.value.types ?? [])
    .filter((item): item is { type: ResultTypeId; label?: string } => isTypeId(item.type))
    .map((item) => ({ type: item.type, label: (item.label ?? '').trim() }))
);
const types = computed<TypeConfig[]>(() =>
  configuredTypes.value.length > 0 ? configuredTypes.value : DEFAULT_TYPES
);

function typeLabel(config: TypeConfig): string {
  if (config.label !== '') return config.label;
  if (config.type === 'products') return t('search.typeProducts');
  if (config.type === 'journal') return t('search.typeJournal');
  return t('search.typePages');
}

/** `journal` (this block's own field vocabulary) is `articles` in the storefront's search
 *  response and in `SearchBar`'s own `resultTypes`. */
function toResponseType(type: ResultTypeId): 'products' | 'articles' | 'pages' {
  return type === 'journal' ? 'articles' : type;
}

const resultTypesForBar = computed<SearchResultType[]>(() =>
  types.value.map((config) => toResponseType(config.type))
);

const suggestionsPerGroup = computed(() => {
  const n = Number(data.value.suggestionsPerGroup);
  return n === 2 || n === 3 || n === 4 ? n : 3;
});

// --- heading (results-page only) ------------------------------------------------------------

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && isResultsPage.value && !hasHeading.value);

// --- popular searches --------------------------------------------------------------------------

const popularSearches = computed(() =>
  (data.value.popularSearches ?? [])
    .map((item) => (item.label ?? '').trim())
    .filter((label) => label !== '')
);
const hasPopular = computed(() => popularSearches.value.length > 0);
const showPopularHint = computed(() => editing.value && isResultsPage.value && !hasPopular.value);

// --- the query and the one search call ----------------------------------------------------------

/** Seeded from, and kept following, `useStorefront().route.query` — the query that actually
 *  brought the shopper here (spec: `{query}` in the heading, and "keep the query in the field on
 *  the results page"). Also `SearchBar`'s own two-way `v-model`: see the module doc comment for
 *  why one ref serves both. */
const searchQuery = ref(storefront.route.query ?? '');
watch(
  () => storefront.route.query,
  (next) => {
    const value = next ?? '';
    if (value !== searchQuery.value) searchQuery.value = value;
  }
);

/**
 * The heading as it is shown. A heading with no `{query}` placeholder in it is
 * rendered exactly as it was authored, invisible editing payload included, so
 * it stays inline-editable in Studio's preview. One that does carry the
 * placeholder is a template, not the sentence on the page: the shopper's query
 * goes into it here, so the payload is stripped first — editing the composed
 * sentence in place would write the shopper's query back over the `{query}`
 * the author put there and lose the placeholder for good.
 */
const headingText = computed(() =>
  heading.value.includes(QUERY_PLACEHOLDER)
    ? stripStega(heading.value).replace(QUERY_PLACEHOLDER, searchQuery.value)
    : heading.value
);

const searchResult = storefront.search.run(searchQuery);
const response = computed(() => searchResult.data.value);
const isLoading = computed(() => searchResult.pending.value);

/** The store's currency and the page's locale, for the suggestion prices below and the
 *  `<ProductCard>`s the no-results state renders (`money.minor`). */
const money = useMoney();

const barResults = computed(() =>
  toSearchBarResults(response.value, suggestionsPerGroup.value, money.format)
);

// --- counts and visibility ------------------------------------------------------------------

function countFor(type: ResultTypeId): number {
  const current = response.value;
  if (current === null) return 0;
  if (type === 'products') return current.products.length;
  if (type === 'journal') return current.articles.length;
  return current.pages.length;
}

const totalCount = computed(() => response.value?.total ?? 0);
const hasAnswer = computed(() => !isLoading.value && response.value !== null);
const showResults = computed(() => hasAnswer.value && totalCount.value > 0);
const showNoResults = computed(() => hasAnswer.value && totalCount.value === 0);

const visibleTypes = computed(() => types.value.filter((config) => countFor(config.type) > 0));
const showTabs = computed(() => visibleTypes.value.length > 1);

const activeTab = ref('all');
watch(visibleTypes, (list) => {
  if (activeTab.value === 'all') return;
  if (!list.some((config) => config.type === activeTab.value)) activeTab.value = 'all';
});

// --- the summary line (results-page only) ----------------------------------------------------

function pluralise(count: number, one: string, many: string): string {
  return t(count === 1 ? one : many, { count });
}

const summaryText = computed(() => {
  if (isLoading.value) return t('search.searching');
  const headline = pluralise(totalCount.value, 'search.resultOne', 'search.resultMany');
  const breakdown = visibleTypes.value.map((config) => {
    if (config.type === 'products') {
      return pluralise(countFor('products'), 'search.productOne', 'search.productMany');
    }
    if (config.type === 'journal') {
      return pluralise(countFor('journal'), 'search.storyOne', 'search.storyMany');
    }
    return pluralise(countFor('pages'), 'search.pageOne', 'search.pageMany');
  });
  return breakdown.length > 0 ? `${headline}: ${breakdown.join(', ')}` : headline;
});

function viewAllText(config: TypeConfig): string {
  const count = countFor(config.type);
  if (config.type === 'products') return t('search.viewAllProducts', { count });
  if (config.type === 'journal') return t('search.viewAllJournal', { count });
  return t('search.viewAllPages', { count });
}

// --- no-results content -----------------------------------------------------------------------

const suggestion = computed(() => response.value?.suggestion?.trim() || null);

const noResultsCollectionHandle = computed(
  () => (data.value.noResultsCollection ?? '').trim() || null
);
/** This block names its collection by handle — it is a theme-authored fallback
 *  list, not a merchant's pick — so the selector `collectionProducts` takes is
 *  always the `{ slug }` form. */
const noResultsSelected = computed<StorefrontCollectionSelector | null>(() =>
  showNoResults.value && noResultsCollectionHandle.value !== null
    ? { slug: noResultsCollectionHandle.value }
    : null
);
const noResultsOpts = ref({ page: 1, pageSize: 4 });
const noResultsCollection = storefront.catalog.collectionProducts(noResultsSelected, noResultsOpts);
/**
 * `toProductCardEntries` (`app/storefront/toProductCard.ts`) sanitises each storefront-derived
 * `url` and drops an item whose URL is not a `safeHref` (`ProductCard`'s link is required, so a
 * linkless card does not exist), reporting per card whether the destination routes.
 */
const noResultsProducts = computed(() =>
  toProductCardEntries((noResultsCollection.data.value?.items ?? []).slice(0, 4), {
    ratio: '4x5',
    minorUnits: money.minor,
  })
);
const hasNoResultsProducts = computed(() => noResultsProducts.value.length > 0);

// --- section accessible name (results-page uses the heading; field-only names itself) --------

const sectionLabelledBy = computed(() =>
  isResultsPage.value && hasHeading.value ? headingId : undefined
);
const sectionAriaLabel = computed(() =>
  sectionLabelledBy.value === undefined ? t('search.searchLabel') : undefined
);

// --- layout ---------------------------------------------------------------------------------

/** Spec "Search results page" → Container/Section: "2rem top, `section-md` bottom" — the shared
 *  `sm`/`md`/`lg` scale is symmetric, so `spacing="none"` on `Section` and the padding is written
 *  here, the same pattern `collection-header`'s/`footer`'s own asymmetric padding uses. */
const sectionClasses = { root: 'pt-8 pb-[var(--eldra-section-md)]' };

const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] break-words ' +
  '[overflow-wrap:anywhere] @tablet:text-h2';

const CHIP_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-4 ' +
  'text-body-sm font-medium text-text hover:border-text ' +
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] @tablet:min-h-9';
</script>

<template>
  <Section
    spacing="none"
    :classes="sectionClasses"
    :labelled-by="sectionLabelledBy"
    :aria-label="sectionAriaLabel"
  >
    <Container width="wide">
      <div class="mb-8 flex flex-col gap-5">
        <h1 v-if="isResultsPage && hasHeading" :id="headingId" :class="headingClass">
          {{ headingText }}
        </h1>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :label="t('search.headingHintLabel')"
          :help="t('search.headingHintHelp')"
        />

        <div class="max-w-[40rem]">
          <SearchBar
            v-model="searchQuery"
            size="lg"
            :action="RESULTS_URL"
            :label="t('search.searchLabel')"
            :placeholder="placeholder"
            :results="barResults"
            :loading="isLoading"
            :popular="popularSearches"
            :result-types="resultTypesForBar"
            :pill="false"
            :autofocus="isResultsPage"
          />
        </div>

        <EditorPlaceholder
          v-if="showPopularHint"
          inline
          :label="t('search.popularHintLabel')"
          :help="t('search.popularHintHelp')"
        />

        <p v-if="isResultsPage && !showNoResults" role="status" class="text-body-sm text-muted">
          {{ summaryText }}
        </p>
      </div>

      <!-- No results: its own status region and its own h1, replacing the tabs/sections below. -->
      <div
        v-if="isResultsPage && showNoResults"
        role="status"
        class="flex max-w-[40rem] flex-col gap-4"
      >
        <h1 :class="headingClass">{{ t('search.noResultsTitle', { query: searchQuery }) }}</h1>
        <p class="text-body-sm text-muted">
          {{ t('search.noResultsAdvice') }}
          <Link
            v-if="suggestion"
            variant="inline"
            :href="searchHref(suggestion)"
            :as="resultsLinkAs"
          >
            {{ t('search.didYouMean', { suggestion }) }}
          </Link>
        </p>

        <template v-if="hasPopular">
          <p class="text-body-sm text-text font-semibold">{{ t('search.popularSearches') }}</p>
          <ul class="flex flex-wrap gap-2">
            <li v-for="label in popularSearches" :key="label">
              <Link
                :href="searchHref(label)"
                :as="resultsLinkAs"
                :underline="false"
                :classes="{ root: CHIP_CLASS }"
              >
                <EldraIcon name="search" size="sm" />
                {{ label }}
              </Link>
            </li>
          </ul>
        </template>

        <template v-if="hasNoResultsProducts">
          <p class="text-body-sm text-text font-semibold">{{ t('search.customersLove') }}</p>
          <div class="grid grid-cols-2 gap-4">
            <ProductCard
              v-for="entry in noResultsProducts"
              :key="entry.item.handle"
              :product="entry.product"
              ratio="4x5"
              :heading-level="2"
              :link-as="entry.internal ? EldraRouterLink : undefined"
              :currency="currency"
              :locale="locale"
            />
          </div>
        </template>
      </div>

      <!-- Results: tabs (2+ visible types) or the "All" content directly (0 or 1). -->
      <template v-else-if="isResultsPage && showResults">
        <Tabs
          v-if="showTabs"
          v-model="activeTab"
          variant="underline"
          :aria-label="t('search.resultTabs')"
        >
          <template #tabs>
            <Tab value="all" :title="`${t('search.all')} (${totalCount})`" />
            <Tab
              v-for="config in visibleTypes"
              :key="config.type"
              :value="config.type"
              :title="`${typeLabel(config)} (${countFor(config.type)})`"
            />
          </template>

          <TabPanel value="all">
            <TypeSection
              v-for="(config, index) in visibleTypes"
              :key="config.type"
              :type="config.type"
              :products="response!.products"
              :articles="response!.articles"
              :pages="response!.pages"
              :currency="currency"
              :locale="locale"
              :first="index === 0"
              show-header
              :label="typeLabel(config)"
              :count="countFor(config.type)"
              :view-all-text="viewAllText(config)"
              :view-all-href="searchHref(searchQuery)"
              :view-all-link-as="resultsLinkAs"
            />
          </TabPanel>

          <TabPanel v-for="config in visibleTypes" :key="config.type" :value="config.type">
            <TypeSection
              :type="config.type"
              :products="response!.products"
              :articles="response!.articles"
              :pages="response!.pages"
              :currency="currency"
              :locale="locale"
              first
              :show-header="false"
              :label="typeLabel(config)"
              :count="countFor(config.type)"
              :view-all-text="viewAllText(config)"
              :view-all-href="searchHref(searchQuery)"
              :view-all-link-as="resultsLinkAs"
            />
          </TabPanel>
        </Tabs>

        <template v-else>
          <TypeSection
            v-for="(config, index) in visibleTypes"
            :key="config.type"
            :type="config.type"
            :products="response!.products"
            :articles="response!.articles"
            :pages="response!.pages"
            :currency="currency"
            :locale="locale"
            :first="index === 0"
            show-header
            :label="typeLabel(config)"
            :count="countFor(config.type)"
            :view-all-text="viewAllText(config)"
            :view-all-href="searchHref(searchQuery)"
            :view-all-link-as="resultsLinkAs"
          />
        </template>
      </template>
    </Container>
  </Section>
</template>
