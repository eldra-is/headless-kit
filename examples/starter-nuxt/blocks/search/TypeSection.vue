<script setup lang="ts">
/**
 * One result-type's grid or list inside the `search` block's results page — the piece
 * `Block.vue` reuses for the "All" tab's per-type sections, a single type's own tab panel, and
 * the tabs-hidden ("Minimal", spec → States) fallback, so the products/journal/pages markup is
 * written once rather than three times. Not a block of its own (no `block.json`): a plain
 * colocated component, the same idea `blocks/article-list/Block.vue`'s own inline
 * `ArticleListEmptyIcon` follows for a smaller reusable piece.
 */
import { computed, type Component } from 'vue';
import { ContentCard, Link, ProductCard } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import type {
  StorefrontProductListItem,
  StorefrontSearchResponse,
} from '../../app/storefront/types';

type ResultTypeId = 'products' | 'journal' | 'pages';

const props = defineProps<{
  type: ResultTypeId;
  /**
   * Storefront-provided rows. Their URLs are *not* assumed safe or internal: they come off a
   * gateway response, so each one is sanitised here (`toProductCardEntries` for products,
   * `safeHref` for the journal/page rows) and a row whose URL does not survive is dropped rather
   * than rendered with a link to nowhere. `link-as` then follows `isInternalHref` per row, exactly
   * as every CMS-authored link in the theme does.
   */
  products: StorefrontProductListItem[];
  articles: StorefrontSearchResponse['articles'];
  pages: StorefrontSearchResponse['pages'];
  currency?: string;
  locale?: string;
  /** Whether this is the first section rendered in its panel (no top rule/margin). */
  first: boolean;
  /** The "All" tab's own per-type sections show a heading, count and "View all" link; a single
   *  type's own tab panel does not (its tab label already names it). */
  showHeader: boolean;
  label: string;
  count: number;
  viewAllText: string;
  viewAllHref: string;
  /** `EldraRouterLink` for the "View all" link (it always points back to the results page, an
   *  internal path) — kept as a prop, not a module-level import here too, only so `Block.vue`
   *  computes `isInternalHref` once rather than every section repeating it. */
  viewAllLinkAs?: Component;
}>();

/** See the `products` prop: sanitised, unusable rows dropped, `internal` per card. */
const productCards = computed(() => toProductCardEntries(props.products, { ratio: '4x5' }));

/** The journal rows that have a usable link, with the sanitised href and whether it routes. */
const articleRows = computed(() =>
  props.articles.flatMap((article) => {
    const href = safeHref(article.href);
    return href === null ? [] : [{ article, href, internal: isInternalHref(href) }];
  })
);

/** The page rows that have a usable link, same rule. */
const pageRows = computed(() =>
  props.pages.flatMap((page) => {
    const href = safeHref(page.href);
    return href === null ? [] : [{ page, href, internal: isInternalHref(href) }];
  })
);

const PRODUCTS_GRID_CLASS =
  'grid grid-cols-2 gap-x-4 gap-y-8 @tablet:grid-cols-3 @tablet:gap-x-6 @tablet:gap-y-10 ' +
  '@content:grid-cols-4 @content:gap-x-8';
const JOURNAL_GRID_CLASS = 'grid grid-cols-1 gap-6 @tablet:grid-cols-3 @tablet:gap-8';
</script>

<template>
  <section :class="first ? 'pt-8' : 'border-border mt-12 border-t pt-8'">
    <div v-if="showHeader" class="mb-5 flex items-baseline justify-between gap-4">
      <h2 class="text-body text-text font-semibold">
        {{ label }} <span class="text-muted font-normal">({{ count }})</span>
      </h2>
      <Link variant="standalone" :href="viewAllHref" :as="viewAllLinkAs" class="text-body-sm">
        {{ viewAllText }}
      </Link>
    </div>

    <div v-if="type === 'products'" :class="PRODUCTS_GRID_CLASS">
      <ProductCard
        v-for="entry in productCards"
        :key="entry.item.handle"
        :product="entry.product"
        ratio="4x5"
        :heading-level="3"
        :link-as="entry.internal ? EldraRouterLink : undefined"
        :currency="currency"
        :locale="locale"
      />
    </div>

    <div v-else-if="type === 'journal'" :class="JOURNAL_GRID_CLASS">
      <ContentCard
        v-for="(row, index) in articleRows"
        :key="index"
        :title="row.article.title"
        :href="row.href"
        :link-as="row.internal ? EldraRouterLink : undefined"
        :image="
          row.article.image
            ? {
                src: row.article.image.src,
                alt: '',
                width: row.article.image.width,
                height: row.article.image.height,
              }
            : null
        "
        ratio="3x2"
        :eyebrow="row.article.category"
        :meta="row.article.readingTime"
        :heading-level="3"
      />
    </div>

    <ul v-else role="list" class="border-border flex flex-col border-t">
      <li
        v-for="(row, index) in pageRows"
        :key="index"
        class="border-border border-b py-4 first:pt-0"
      >
        <Link
          variant="inline"
          :href="row.href"
          :as="row.internal ? EldraRouterLink : undefined"
          class="font-semibold"
        >
          {{ row.page.title }}
        </Link>
        <p class="text-body-sm text-muted">{{ row.page.path }}</p>
        <p class="text-body-sm text-muted">{{ row.page.snippet }}</p>
      </li>
    </ul>
  </section>
</template>
