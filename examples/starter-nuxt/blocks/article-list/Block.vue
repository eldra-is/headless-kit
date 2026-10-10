<script setup lang="ts">
/**
 * Article list: journal stories as a card grid, a featured-first layout or thumbnail rows, with
 * optional category chips and pagination (spec `02-blocks.md` "Article list", 2599-2718).
 *
 * **One card, three layouts.** Every story is a `<li>` wrapping `@eldrajs/ui`'s `ContentCard`
 * (which renders its own `<article>` root — no extra one is added around it) — never a bespoke
 * card of this block's own — restyled per variant through its
 * `classes` prop (the same technique `feature-grid`'s own `classes.iconTile`/`classes.cue`
 * override uses): `grid` leaves the card's own vertical layout untouched; `featured-first` turns
 * the first story's `root` into a two-column grid (image | text, `@tablet:`/`@content:` gaps) and
 * enlarges its title from 64rem; `list` turns every story's `root` into a thumbnail-beside-text
 * grid and hides the excerpt below 48rem of block width (`@max-tablet:hidden`, the same variant
 * `Breadcrumb`'s own collapsing trail uses).
 *
 * **Three documented package limits.** (1) `ContentCard`'s own contract renders no media slot at
 * all with no image — a plain card "renders as the surface variant" instead (its own acceptance
 * criteria) — so a missing cover image here becomes a padded, image-less card rather than the
 * design's literal striped placeholder; `Image`'s own live placeholder is real but only reachable
 * when `ContentCard` actually mounts an `<Image>`, which it never does with no `image`. (2)
 * `ContentCard`'s `ratio` has no `1x1`, so `list`'s below-48rem thumbnail stays the same 3:2 frame,
 * narrowed by the grid track rather than a true square. (3) **No image framing.** `ContentCard`
 * takes its media as an `image` *prop* (`{src, alt, width, height}`) and exposes no media slot, so
 * a card's image can only be rendered by the component itself — never through this theme's
 * `UiImage`, which is what emits the `data-eldra-framing*` markers Studio's framing controls key
 * off and applies the focal point/zoom. `items[].image` therefore declares no `metadata.framing`:
 * offering an editor a framing control whose result the render ignores is worse than not offering
 * it, and the alternative — forking `ContentCard` to add a media slot — is exactly what the
 * starter's "never fork a package component" rule forbids (a media slot on `ContentCard` is a
 * sub-project 1 addition to raise, not something to work around here). The 3:2 crop is taken from
 * the top, as `block.json`'s own `helpText` says. None of the three is a fork — all follow the
 * component's published contract as given.
 *
 * **No route reading.** Blocks may not read the URL — `StorefrontRoute` carries `page`, never a
 * path. So both the active chip and `hrefForPage` key off
 * this block's *own* fields instead of the address bar: `selfPath` is `categoryHref` (the field
 * documenting "this instance is the category page for X") falling back to `viewAllHref` (the
 * journal index) — the one the mock ships, and the one every default chip's own `href` equals, so
 * "All" reads active with no special case. A chip is active when its own `href` equals `selfPath`;
 * `hrefForPage` appends `?page=n` to it (page 1 plain).
 *
 * **Icons.** The active chip's check mark is a plain, template-level `EldraIcon` (decorative, `sm`
 * = 1rem) — no package prop needs a bare component for it. The empty state's `file-text` icon does
 * need one (`EmptyState.icon` takes an already-bound `IconComponent`, the same contract
 * `Badge`/`FeatureCard` have), so it is built the same module-scope way `pricing-table`'s own
 * `StarIcon` is, fixed to the one icon this block ever shows there.
 *
 * **Pagination window.** `perPage` slices `items`; `featured-first` treats whichever story leads
 * the *current* page as the featured one, not only the first story overall, so every page keeps a
 * split row rather than only page one.
 *
 * **Empty items.** With none to show: while editing, the "freshly inserted" hint (spec States,
 * "Showing your latest stories" / "Choose a source…") — this starter has no live journal query to
 * fall back to (`source` only documents intent; every mode renders `items` as given), so unlike
 * the spec's literal "the live site shows the latest stories straight away", an empty `items`
 * field live falls to `emptyTitle`'s `EmptyState` instead, and renders nothing further when that
 * field is also empty (this project's "empty optional content renders nothing live" rule).
 */
import { computed, defineComponent, h, type Component } from 'vue';
import {
  Button,
  Container,
  ContentCard,
  EditorPlaceholder,
  EmptyState,
  Link,
  Pagination,
  Section,
  type ContentCardPart,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { iconComponent } from '../../app/composables/iconComponent';
import { useStorefront } from '../../app/composables/useStorefront';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'article-list'> }>();
const { data } = useBlockData(props, 'article-list');
const editing = useEditing();
const { t } = useI18n();
const storefront = useStorefront();
const headingId = `article-list-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'grid');
const isFeaturedFirst = computed(() => variant.value === 'featured-first');
const isList = computed(() => variant.value === 'list');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);

const viewAllLabel = computed(() => (data.value.viewAllLabel ?? '').trim());
const viewAllHref = computed(() => safeHref(data.value.viewAllHref));
const hasViewAllLink = computed(() => viewAllLabel.value !== '' && viewAllHref.value !== null);
const viewAllLinkAs = computed(() =>
  viewAllHref.value !== null && isInternalHref(viewAllHref.value) ? EldraRouterLink : undefined
);

const hasHead = computed(() => hasHeading.value || showHeadingHint.value || hasViewAllLink.value);

/** See the module doc comment: this block's own stand-in for "the current page", since a block
 *  may not read the URL. */
const selfPath = computed(
  () => safeHref(data.value.categoryHref) ?? safeHref(data.value.viewAllHref)
);

const rawItems = computed(() => data.value.items ?? []);
const showItemsHint = computed(() => editing.value && rawItems.value.length === 0);

/** `6` (the spec's own default) whenever the field is unset or not a positive number — the
 *  "bare" fixture (no `perPage` at all) and any stray value both fall back the same way. */
const perPage = computed(() => {
  const n = Number(data.value.perPage);
  return Number.isFinite(n) && n > 0 ? n : 6;
});

const totalPages = computed(() => Math.max(1, Math.ceil(rawItems.value.length / perPage.value)));
const currentPage = computed(() => Math.min(Math.max(storefront.route.page, 1), totalPages.value));

const pageItems = computed(() => {
  const start = (currentPage.value - 1) * perPage.value;
  return rawItems.value.slice(start, start + perPage.value);
});
const hasPageItems = computed(() => pageItems.value.length > 0);

const showFilters = computed(() => Boolean(data.value.showFilters));
const filters = computed(() =>
  (data.value.filters ?? [])
    .map((filter) => ({
      label: (filter.label ?? '').trim(),
      href: safeHref(filter.href),
    }))
    .filter(
      (filter): filter is { label: string; href: string } =>
        filter.label !== '' && filter.href !== null
    )
    .map((filter) => ({
      ...filter,
      active: filter.href === selfPath.value,
      linkAs: isInternalHref(filter.href) ? EldraRouterLink : undefined,
    }))
);
const hasFilters = computed(() => showFilters.value && filters.value.length > 0);

const showExcerptField = computed(() => data.value.showExcerpt ?? true);

const emptyTitle = computed(() => (data.value.emptyTitle ?? '').trim());
const emptyText = computed(() => (data.value.emptyText ?? '').trim() || null);
const showEmptyState = computed(
  () => !editing.value && !hasPageItems.value && emptyTitle.value !== ''
);

const showPaginationField = computed(() => Boolean(data.value.showPagination));
const canPaginate = computed(
  () => showPaginationField.value && hasPageItems.value && selfPath.value !== null
);

/** Appends `?page=n` to this block's own `selfPath` (see the module doc comment); page 1 is the
 *  plain path, with no query at all. */
function hrefForPage(page: number): string {
  const base = selfPath.value ?? '';
  return page <= 1 ? base : `${base}?page=${page}`;
}
const paginationLinkAs = computed(() =>
  selfPath.value !== null && isInternalHref(selfPath.value) ? EldraRouterLink : undefined
);

/** `EmptyState.icon` (like `Badge.icon`/`FeatureCard.icon`) takes a bare, already-bound icon
 *  component with no props of its own, so this goes through the theme's shared name→component
 *  adapter (`app/composables/iconComponent.ts`). */
const FileTextIcon: Component = iconComponent('file-text');

interface CardView {
  key: number;
  title: string;
  dek: string | null;
  href: string | null;
  linkAs: typeof EldraRouterLink | undefined;
  categoryLabel: string | null;
  publishedAt: string | null;
  readingTime: string | null;
  image: { src: string; alt: string; width?: number; height?: number } | null;
  featured: boolean;
}

const cards = computed<CardView[]>(() =>
  pageItems.value.map((item, index) => {
    const href = safeHref(item.href);
    const media = item.image;
    return {
      key: index,
      title: (item.title ?? '').trim(),
      dek: showExcerptField.value ? (item.dek ?? '').trim() || null : null,
      href,
      linkAs: href !== null && isInternalHref(href) ? EldraRouterLink : undefined,
      categoryLabel: (item.categoryLabel ?? '').trim() || null,
      publishedAt: item.publishedAt || null,
      readingTime: (item.readingTime ?? '').trim() || null,
      image: media ? { src: media.url, alt: '', width: media.width, height: media.height } : null,
      featured: isFeaturedFirst.value && index === 0,
    };
  })
);

/** Static, variant-keyed class lookups (Tailwind cannot see a dynamically built class name). */
const GRID_ROOT_CLASS =
  'grid grid-cols-1 gap-y-8 @tablet:grid-cols-2 @tablet:gap-x-6 @tablet:gap-y-12 @content:grid-cols-3 @content:gap-x-8';
const LIST_ROOT_CLASS = 'flex flex-col border-t border-border';
const listContainerClass = computed(() => (isList.value ? LIST_ROOT_CLASS : GRID_ROOT_CLASS));

const FEATURED_CARD_CLASSES: Partial<Record<ContentCardPart, string>> = {
  root: 'grid gap-6 @tablet:grid-cols-[7fr_5fr] @tablet:items-center @tablet:gap-8 @content:gap-12',
  title: '@content:text-[2rem] @content:leading-[1.15]',
  body: '@content:gap-4',
};
const LIST_CARD_CLASSES: Partial<Record<ContentCardPart, string>> = {
  root: 'grid grid-cols-[6.5rem_1fr] items-start gap-4 @tablet:grid-cols-[15rem_1fr] @tablet:items-center @tablet:gap-8',
  excerpt: '@max-tablet:hidden',
};

function cardClasses(card: CardView): Partial<Record<ContentCardPart, string>> | undefined {
  if (card.featured) return FEATURED_CARD_CLASSES;
  if (isList.value) return LIST_CARD_CLASSES;
  return undefined;
}

function itemWrapperClass(card: CardView): string {
  if (isList.value) return 'border-b border-border py-5 @tablet:py-6';
  return card.featured ? '@tablet:col-span-2 @content:col-span-3' : '';
}
</script>

<template>
  <Section spacing="md" :labelled-by="hasHeading ? headingId : undefined">
    <Container width="content">
      <div
        v-if="hasHead"
        class="@tablet:flex-row @tablet:items-baseline @tablet:justify-between mb-6 flex flex-col items-start gap-2"
      >
        <h2
          v-if="hasHeading"
          :id="headingId"
          class="font-heading text-text @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
        >
          {{ heading }}
        </h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          inline
          :label="t('articleList.headingHintLabel')"
          :help="t('articleList.headingHintHelp')"
        />

        <Link
          v-if="hasViewAllLink"
          :href="viewAllHref!"
          :as="viewAllLinkAs"
          variant="standalone"
          arrow
          :classes="{ root: 'text-control' }"
        >
          {{ viewAllLabel }}
        </Link>
      </div>

      <nav v-if="hasFilters" :aria-label="t('articleList.filterNav')" class="mb-8">
        <ul class="flex flex-wrap gap-2">
          <li v-for="filter in filters" :key="filter.href">
            <Link
              :href="filter.href"
              :as="filter.linkAs"
              :underline="false"
              :aria-current="filter.active ? 'true' : undefined"
              :classes="{
                root: filter.active
                  ? 'inline-flex min-h-10 items-center rounded-full border border-primary bg-primary px-4 text-control font-semibold text-primary-contrast'
                  : 'inline-flex min-h-10 items-center rounded-full border border-border-strong px-4 text-control font-medium text-text hover:border-text',
                label: 'inline-flex items-center gap-1',
              }"
            >
              <EldraIcon v-if="filter.active" name="check" size="sm" />
              {{ filter.label }}
            </Link>
          </li>
        </ul>
      </nav>

      <ul v-if="hasPageItems" role="list" :class="listContainerClass">
        <li v-for="card in cards" :key="card.key" :class="itemWrapperClass(card)">
          <ContentCard
            v-if="card.href"
            :title="card.title"
            :href="card.href"
            :link-as="card.linkAs"
            :image="card.image"
            ratio="3x2"
            :eyebrow="card.categoryLabel"
            :date="card.publishedAt"
            :meta="card.readingTime"
            :excerpt="card.dek"
            :heading-level="3"
            :classes="cardClasses(card)"
          />
        </li>
      </ul>
      <EditorPlaceholder
        v-else-if="showItemsHint"
        :label="t('articleList.itemsHintLabel')"
        :help="t('articleList.itemsHintHelp')"
      />
      <EmptyState
        v-else-if="showEmptyState"
        variant="noResults"
        :icon="FileTextIcon"
        :title="emptyTitle"
        :text="emptyText"
      >
        <template v-if="hasViewAllLink" #actions>
          <Button
            variant="outline"
            :href="viewAllHref!"
            :as="viewAllLinkAs"
            :label="viewAllLabel"
          />
        </template>
      </EmptyState>

      <Pagination
        v-if="canPaginate"
        class="mt-12"
        :page="currentPage"
        :total-pages="totalPages"
        :href-for-page="hrefForPage"
        :link-as="paginationLinkAs"
        :aria-label="t('articleList.pages')"
      />
    </Container>
  </Section>
</template>
