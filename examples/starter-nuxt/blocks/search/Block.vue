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
 * **One query, one search.** `searchQuery` is adopted from `useStorefront().route.query` (the
 * query that actually brought the shopper here) after mount, and stays in sync with it going
 * forward, but is also `SearchBar`'s own two-way `v-model` — the same single-query wiring
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
 * **Idle, and what a prerendered page may say.** Before a query is asked — `/search` with no `?q=`,
 * which is also the only state the prerendered `search/index.html` a static host serves can be in,
 * since one file answers every query — the page shows its heading, the field and the popular
 * searches, and nothing else. The empty query is a real `search.run()` answer with `total: 0`, so
 * taking it at face value headed the page "No results for “”", offered spelling advice for
 * a word nobody typed, and baked all of it into the artifact.
 *
 * **A read in flight is not an answer.** `StorefrontResult.data` keeps the previous answer until the
 * next one lands, so this block compares `StorefrontSearchResponse.query` against the query in the
 * field and treats anything else as no answer at all — and reads `loading` ("a read is in flight"),
 * never `pending` ("a read in flight with nothing to show"), which is false for every search after
 * the first. `SearchBar` is handed `undefined` rather than an empty result shape while that is true:
 * its "nothing yet", which draws the loading view past 300ms, as against its "nothing found".
 *
 * **No results.** A `search.run()` response with `total === 0` **for a query that was asked**
 * replaces the normal head/tabs
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
import { computed, inject, onMounted, ref, toValue, watch } from 'vue';
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
import { useEldraLocale } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { stripStega } from '@eldrajs/theme-core/stega';
import { isInternalHref, searchQueryHref, SEARCH_PATH } from '../../app/utils/links';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import { useMoney } from '../../app/storefront/money';
import type { StorefrontCollectionSelector } from '../../app/storefront/types';
import { toSearchBarResults } from './results';
import PopularChips from './PopularChips.vue';
import TypeSection from './TypeSection.vue';

type ResultTypeId = 'products' | 'journal' | 'pages';
interface TypeConfig {
  type: ResultTypeId;
  label: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'search'> }>();
const { data } = useBlockData(props, 'search');
const editing = useEditing();
const { t } = useI18n();
const storefront = useStorefront();
const headingId = `search-heading-${useUiId()}`;

/** What the author writes in `heading` to have the shopper's query dropped into the sentence. */
const QUERY_PLACEHOLDER = '{query}';
const resultsLinkAs = isInternalHref(SEARCH_PATH) ? EldraRouterLink : undefined;
/**
 * The search page in the language the shopper is reading. `SearchBar`'s `action` is a real
 * `<form action>` — the no-JavaScript submit path, a document navigation the router never sees —
 * so it is prefixed here rather than by `EldraRouterLink`, which only the chips and the "see all"
 * link pass through. Submitting from `/is-IS/products/x` has to land on `/is-IS/search`, not back
 * in the default language. `path()` is the identity on a single-locale site.
 *
 * The path itself is `app/utils/links.ts`'s, because the header points at the same page and the
 * two must not disagree about it.
 */
const activeLocale = useEldraLocale();
const resultsAction = computed(() => activeLocale.path(SEARCH_PATH));

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
/** The chips `PopularChips.vue` renders, each already carrying the one `searchQueryHref()`. */
const popularChips = computed(() =>
  popularSearches.value.map((label) => ({ label, href: searchQueryHref(label) }))
);
const showPopularHint = computed(() => editing.value && isResultsPage.value && !hasPopular.value);

// --- the query and the one search call ----------------------------------------------------------

/** The query the URL carries, trimmed: `?q=%20` is somebody's stray space, not a search, and
 *  `SearchBar` trims its own input for exactly the same reason. */
const routeQuery = computed(() => (storefront.route.query ?? '').trim());

/**
 * The field's own value — `SearchBar`'s two-way `v-model`, so it is exactly what the shopper has
 * typed and never a rewritten copy (trimming it here would fight them mid-word).
 *
 * **It starts empty even when the route already carries a query**, and that is the whole point.
 * `/search` is prerendered once, with no query at all, so the HTML a static host serves for
 * `/search?q=mug` is the idle state (the page `pages/search.page.json` seeds). A first client render that already
 * knew the query would disagree with that markup: Vue would patch it and repaint the block instead
 * of hydrating it, and the shopper would see the idle heading flash. `onMounted` never runs on the
 * server and runs *after* the first client render, which makes the two equal by construction — the
 * same gate `app/composables/useRevalidating.ts` puts on the refresh treatment, for the same reason.
 * The watch below then carries every later change, so a client navigation is unaffected.
 */
const searchQuery = ref('');
onMounted(() => {
  if (routeQuery.value !== searchQuery.value) searchQuery.value = routeQuery.value;
});
watch(routeQuery, (next) => {
  if (next !== searchQuery.value) searchQuery.value = next;
});

/** What the page is *about*: the field's value with its surrounding space gone. Everything that
 *  decides something — whether a query was asked at all, what the heading says, what is searched
 *  for — reads this rather than the raw field. */
const query = computed(() => searchQuery.value.trim());

/** Whether there is a query to answer at all. `/search` with no `?q=` — the idle state, and every
 *  prerender of this route — has none, and a page with no question on it must not print an answer. */
const hasQuery = computed(() => query.value !== '');

/**
 * The heading as it is shown. A heading with no `{query}` placeholder in it is
 * rendered exactly as it was authored, invisible editing payload included, so
 * it stays inline-editable in Studio's preview. One that does carry the
 * placeholder is a template, not the sentence on the page: the shopper's query
 * goes into it here, so the payload is stripped first — editing the composed
 * sentence in place would write the shopper's query back over the `{query}`
 * the author put there and lose the placeholder for good.
 */
const headingText = computed(() => {
  if (!heading.value.includes(QUERY_PLACEHOLDER)) return heading.value;
  // No query to drop in: "Results for “”" is what the shopper would read, and — on `/search`, whose
  // shell is prerendered with no query at all — what the HTML a static host serves would *say*. The
  // theme's own idle title takes its place. Studio keeps the authored sentence: an author editing
  // the page has no query either, and a heading they cannot see is a heading they cannot change.
  if (!hasQuery.value && !editing.value) return t('search.idleTitle');
  return stripStega(heading.value).replace(QUERY_PLACEHOLDER, query.value);
});

// The trimmed query, not the field's raw value: a read for `" "` is a read for nothing, and the
// response echoes back what it was asked, which is what `response` below compares against.
const searchResult = storefront.search.run(query);
/**
 * The answer to the query that is **in the field right now**, or `null` while the read for it is
 * still in flight.
 *
 * `searchResult.data` keeps the previous answer until the next one lands — right for a page of
 * prerendered products, wrong for a results page the shopper is retyping: the stale answer made
 * the heading, the summary and the sections describe the query before this one, and because the
 * first thing `search.run()` ever answers is the empty query's own `{ total: 0 }`, a page whose
 * first real query was still in flight showed the whole no-results state for it.
 * `StorefrontSearchResponse.query` is the query its own answer is about, so the two compare
 * directly.
 */
const response = computed(() => {
  const answer = searchResult.data.value;
  return answer !== null && answer.query === query.value ? answer : null;
});
/**
 * `loading`, not `pending`: `pending` is the skeleton flag — "a read in flight with **nothing to
 * show**" — so it is false for every search after the first one, and neither this page's "Searching…"
 * line nor `SearchBar`'s own loading view ever appeared. `loading` is "a read is in flight",
 * narrowed to the reads this page has no answer for.
 */
const isLoading = computed(() => response.value === null && searchResult.loading.value);

/** The store's currency and the page's locale, for the suggestion prices below and the
 *  `<ProductCard>`s the no-results state renders (`money.minor`). */
const money = useMoney();

const barResults = computed(() =>
  toSearchBarResults(response.value, suggestionsPerGroup.value, money.format)
);

// --- counts and visibility ------------------------------------------------------------------

/**
 * The product rows that can actually be drawn as cards. `TypeSection.vue` builds the same list from
 * the same rows, and `toProductCardEntries` drops any whose URL is unusable or whose price the
 * storefront could not learn (`app/storefront/toProductCard.ts`) — so counting the raw rows instead
 * would head a tab "Products (3)" over a grid showing fewer, or, when the pricing read failed, none.
 */
const productCards = computed(() =>
  toProductCardEntries(response.value?.products ?? [], { ratio: '4x5', minorUnits: money.minor })
);

function countFor(type: ResultTypeId): number {
  const current = response.value;
  if (current === null) return 0;
  if (type === 'products') return productCards.value.length;
  if (type === 'journal') return current.articles.length;
  return current.pages.length;
}

const totalCount = computed(() => response.value?.total ?? 0);
const hasAnswer = computed(() => !isLoading.value && response.value !== null);
const showResults = computed(() => hasAnswer.value && totalCount.value > 0);
/**
 * The no-results state answers a question, so it needs one asked: `hasQuery`. Without that gate the
 * empty query's own `{ total: 0 }` *is* an answer, and `/search` with no `?q=` — the state a shopper
 * arrives in, and the one baked into the prerendered HTML a static host serves — headed itself
 * "No results for “”" and offered spelling advice for a word nobody typed.
 */
const showNoResults = computed(() => hasAnswer.value && hasQuery.value && totalCount.value === 0);
/** Nothing asked yet: the heading and the field, with the popular searches under them as the one
 *  thing a shopper can act on. The results page's own resting state, not a variant of it. */
const showIdle = computed(() => isResultsPage.value && !hasQuery.value);

const visibleTypes = computed(() => types.value.filter((config) => countFor(config.type) > 0));
const showTabs = computed(() => visibleTypes.value.length > 1);

const activeTab = ref('all');
watch(visibleTypes, (list) => {
  if (activeTab.value === 'all') return;
  if (!list.some((config) => config.type === activeTab.value)) activeTab.value = 'all';
});

// --- the summary line (results-page only) ----------------------------------------------------

/** `MessageKey`, not `string`: `t()` takes the key union, and every call site here passes a
 *  literal. Typed as `string` this compiled only because nothing type-checked this file — see
 *  `docs/starter-kit.md` on which blocks the app program reaches. */
function pluralise(count: number, one: MessageKey, many: MessageKey): string {
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
            :action="resultsAction"
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

        <!-- The count line answers a query; with none asked there is nothing to count. -->
        <p
          v-if="isResultsPage && hasQuery && !showNoResults"
          role="status"
          class="text-body-sm text-muted"
        >
          {{ summaryText }}
        </p>

        <!-- Idle: nothing asked yet. The popular searches are the one thing to act on. -->
        <PopularChips
          v-if="showIdle && hasPopular"
          :heading="t('search.popularSearches')"
          :items="popularChips"
          :link-as="resultsLinkAs"
        />
      </div>

      <!-- No results: its own status region and its own h1, replacing the tabs/sections below. -->
      <div
        v-if="isResultsPage && showNoResults"
        role="status"
        class="flex max-w-[40rem] flex-col gap-4"
      >
        <h1 :class="headingClass">{{ t('search.noResultsTitle', { query }) }}</h1>
        <p class="text-body-sm text-muted">
          {{ t('search.noResultsAdvice') }}
          <Link
            v-if="suggestion"
            variant="inline"
            :href="searchQueryHref(suggestion)"
            :as="resultsLinkAs"
          >
            {{ t('search.didYouMean', { suggestion }) }}
          </Link>
        </p>

        <PopularChips
          v-if="hasPopular"
          :heading="t('search.popularSearches')"
          :items="popularChips"
          :link-as="resultsLinkAs"
        />

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
          :ariaLabel="t('search.resultTabs')"
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
              :view-all-href="searchQueryHref(query)"
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
              :view-all-href="searchQueryHref(query)"
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
            :view-all-href="searchQueryHref(query)"
            :view-all-link-as="resultsLinkAs"
          />
        </template>
      </template>
    </Container>
  </Section>
</template>
