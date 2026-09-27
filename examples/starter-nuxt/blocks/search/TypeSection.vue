<script setup lang="ts">
/**
 * One result-type's grid or list inside the `search` block's results page — the piece
 * `Block.vue` reuses for the "All" tab's per-type sections, a single type's own tab panel, and
 * the tabs-hidden ("Minimal", spec → States) fallback, so the products/journal/pages markup is
 * written once rather than three times. Not a block of its own (no `block.json`): a plain
 * colocated component, the same idea `blocks/article-list/Block.vue`'s own inline
 * `ArticleListEmptyIcon` follows for a smaller reusable piece.
 */
import type { Component } from 'vue';
import { ContentCard, Link, ProductCard } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref } from '../../app/utils/links';
import { toProductCard } from '../../app/storefront/toProductCard';
import type {
  StorefrontProductListItem,
  StorefrontSearchResponse,
} from '../../app/storefront/types';

type ResultTypeId = 'products' | 'journal' | 'pages';

defineProps<{
  type: ResultTypeId;
  /** Storefront-provided rows — always internal paths, the same assumption
   *  `product-carousel`/`article-list`'s own Block.vue makes for their own product/story links. */
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
        v-for="product in products"
        :key="product.handle"
        :product="toProductCard(product)"
        ratio="4x5"
        :heading-level="3"
        :link-as="EldraRouterLink"
        :currency="currency"
        :locale="locale"
      />
    </div>

    <div v-else-if="type === 'journal'" :class="JOURNAL_GRID_CLASS">
      <ContentCard
        v-for="(article, index) in articles"
        :key="index"
        :title="article.title"
        :href="article.href"
        :link-as="EldraRouterLink"
        :image="
          article.image
            ? {
                src: article.image.src,
                alt: '',
                width: article.image.width,
                height: article.image.height,
              }
            : null
        "
        ratio="3x2"
        :eyebrow="article.category"
        :meta="article.readingTime"
        :heading-level="3"
      />
    </div>

    <ul v-else role="list" class="border-border flex flex-col border-t">
      <li
        v-for="(page, index) in pages"
        :key="index"
        class="border-border border-b py-4 first:pt-0"
      >
        <Link
          variant="inline"
          :href="page.href"
          :as="isInternalHref(page.href) ? EldraRouterLink : undefined"
          class="font-semibold"
        >
          {{ page.title }}
        </Link>
        <p class="text-body-sm text-muted">{{ page.path }}</p>
        <p class="text-body-sm text-muted">{{ page.snippet }}</p>
      </li>
    </ul>
  </section>
</template>
