<script setup lang="ts">
/**
 * Product carousel: a horizontally scrolling row of product cards — "You may also like" (backend
 * recommendations for the product being viewed), "Recently viewed" (the shopper's local history)
 * or a named collection (design spec `02-blocks.md` "Product carousel", lines 3302–3398). Every
 * card is built through `toProductCard()` (`app/storefront/toProductCard.ts`), the one mapping
 * this block, `collection-grid` and `search` all share, so cards agree pixel for pixel across the
 * storefront.
 *
 * `related` excludes the product currently being viewed and any sold-out item (spec Do/Don't:
 * "leave out the product being viewed and any sold-out items from `related`") — the storefront's
 * own `catalog.related()` returns the raw recommendation list unfiltered, exactly like a real
 * backend service would, so the filtering lives here rather than in `app/storefront/*`.
 * `recently-viewed` and `collection` show whatever the storefront returns as-is: the design spec's
 * own default content for `recently-viewed` includes a sold-out item on purpose.
 *
 * `@eldrajs/ui`'s `Carousel` never hides its own header controls once every slide already fits the
 * view — only the individual prev/next buttons disable at the ends. This block approximates the
 * spec's "when every product fits the view the controls are not rendered" from the resolved
 * product count against the smallest (`base`) `perView` step (`showControls` below, hiding the
 * arrows through the package's own `classes` override), not from real scroll geometry
 * at every width — so a short row keeps its controls at desktop even when nothing scrolls there,
 * which is the safe side of the approximation, kept rather than patching the package component.
 *
 * `quickAdd` is left off every card: this block's own "Uses" list in the design spec names Badge,
 * Price and the swatch summary but never quick add, and turning it on would give each card two
 * separate tab stops (the stretched title link, then the quick-add button) where the spec's
 * keyboard table describes exactly one ("Tab moves through every card in order").
 */
import { computed, inject, toValue } from 'vue';
import {
  Button,
  Carousel,
  Container,
  CURRENCY_KEY,
  EditorPlaceholder,
  Link,
  LOCALE_KEY,
  ProductCard,
  Section,
  Skeleton,
  VisuallyHidden,
} from '@eldrajs/ui';
import type { CarouselPart, SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRevalidating } from '../../app/composables/useRevalidating';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type {
  StorefrontCollectionSelector,
  StorefrontProductListItem,
} from '../../app/storefront/types';
import { collectionSelector, selectorNeedsPublish } from '../../app/storefront/collectionSelector';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import { useMoney } from '../../app/storefront/money';

const props = defineProps<{ entry: EldraBlockEntry<'product-carousel'> }>();
const { data } = useBlockData(props, 'product-carousel');
const t = useT();
const isEditing = useEditing();
const headingId = `product-carousel-heading-${useUiId()}`;
/** The h2 recipe, also applied to the heading's own link so `Link`'s standalone size and weight do
 *  not shrink the title (tailwind-merge keeps the later font-size/weight). */
const HEADING_CLASSES =
  'font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]';

const storefront = useStorefront();

/** `CURRENCY_KEY`/`LOCALE_KEY` (`@eldrajs/ui`) carry a `MaybeRefOrGetter`, the same shape
 *  `provideEldraUiCurrency`/`provideEldraUiLocale` accept — unwrapped once here rather than left
 *  for `ProductCard`'s own internal default, so every card in this block reads the same resolved
 *  value explicitly. */
const injectedCurrency = inject(CURRENCY_KEY, undefined);
const injectedLocale = inject(LOCALE_KEY, undefined);
const currency = computed(() => toValue(injectedCurrency));
const locale = computed(() => toValue(injectedLocale));

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

const variant = computed(() => data.value.variant ?? 'related');
const isRecentlyViewed = computed(() => variant.value === 'recently-viewed');
const isCollection = computed(() => variant.value === 'collection');

const limit = computed(() => {
  const parsed = Number(data.value.limit ?? '8');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
});

const background = computed<SectionBackground>(() => data.value.background ?? 'none');
const showSwatchesField = computed(() => data.value.showSwatches ?? true);

/**
 * Which collection the `collection` variant shows. `sourceCollection` is the
 * `reference` field an author picks in Studio; it stores the collection's id, so
 * a renamed collection cannot silently empty this block. `sourceHandle` is the
 * handle field this block shipped with — still honoured, so a merchant's
 * existing carousel keeps working after the theme update, and it is what
 * `mock.json` (Storybook, previews) still carries.
 *
 * `collectionSelector` prefers the reference's resolved `slug`, falls back to
 * its bare id (a page builder draft overlay, or a depth-0 read — see
 * `app/storefront/collectionSelector.ts`) and only then to the legacy handle: a
 * picked collection overrides the handle in every case, which is what the
 * field's own help text promises.
 */
const source = computed<StorefrontCollectionSelector | null>(() =>
  isCollection.value
    ? collectionSelector(data.value.sourceCollection, data.value.sourceHandle)
    : null
);
const collectionOpts = computed(() => ({ page: 1, pageSize: limit.value }));
const productHandleRef = computed(() => storefront.route.productHandle);

const relatedResult = storefront.catalog.related(productHandleRef, limit.value);
const collectionResult = storefront.catalog.collectionProducts(source, collectionOpts);
const recentlyViewedResult = storefront.catalog.byHandles(storefront.history.recentlyViewed);

/**
 * The one result this variant is showing. Three are created (a block cannot conditionally call a
 * composable), but only this one's state is ever read — and reading it in one place is what lets
 * the prerender rules below be written once instead of three times.
 */
const activeResult = computed(() => {
  if (isCollection.value) return collectionResult;
  if (isRecentlyViewed.value) return recentlyViewedResult;
  return relatedResult;
});
const pending = computed(() => activeResult.value.pending.value);

/**
 * **The prerender contract** (`app/storefront/types.ts`): this row's cards are in the page's HTML
 * from the first paint, so a skeleton is only ever right when there is genuinely nothing to show.
 *
 * - `showSkeletons` — `pending && no data`. Stated as both halves rather than trusting `pending` to
 *   imply the second: a storefront that raised `pending` over results the visitor can see would
 *   otherwise blank the row.
 * - `revalidating` — the two states in which a fresher value is on its way: the volatile refresh
 *   (money and the stock line, re-read a moment after mount) and a whole read in flight over cards
 *   that are already on screen (a different product's recommendations, a changed collection). Both
 *   are drawn the same way — the cards stay put, their two values dimmed with a spinner — and
 *   `useRevalidating` holds both at `false` until after mount, so the browser's first render is the
 *   server's: a hydrating page's result is already `loading` with its payload data in place, so
 *   reading the flag straight through would paint a busy row the server never wrote.
 */
const hasData = computed(() => activeResult.value.data.value !== null);
const showSkeletons = computed(() => pending.value && !hasData.value);
const { any: cardsRevalidating, refreshing } = useRevalidating({
  keys: () => activeResult.value.revalidating.value,
  refreshing: () => activeResult.value.loading.value && hasData.value,
});

/**
 * Each card dims its two values and draws a spinner beside them, but `announce: false` — the row
 * says it once, below, rather than letting eight cards hold sixteen polite live regions all
 * speaking at the same moment (`@eldrajs/ui`'s `announce` prop).
 */
const announcement = computed(() =>
  cardsRevalidating.value ? t('storefront.updatingValues') : ''
);

/** See the module doc comment: `related` filters out the product being viewed and sold-out items
 *  itself; `collection`/`recently-viewed` render whatever the storefront returns. */
const products = computed<StorefrontProductListItem[]>(() => {
  if (isCollection.value) return collectionResult.data.value?.items ?? [];
  if (isRecentlyViewed.value) return recentlyViewedResult.data.value ?? [];
  const items = relatedResult.data.value ?? [];
  return items.filter(
    (item) => item.handle !== storefront.route.productHandle && item.available !== false
  );
});
const cappedProducts = computed(() => products.value.slice(0, limit.value));
/**
 * The cards actually rendered. `toProductCardEntries` (`app/storefront/toProductCard.ts`) is the
 * one place a storefront-derived URL is sanitised: it drops an item whose `url` is not a
 * `safeHref` — the card's link is required, so there is no linkless card to fall back to — and
 * reports per card whether the destination routes (`entry.internal`). That is why the counts below
 * are taken off `cards`, not `cappedProducts`: a dropped item must not keep the block above its
 * "fewer than 2 products" floor or leave the carousel controls claiming a slide that isn't there.
 */
const money = useMoney();
const cards = computed(() =>
  toProductCardEntries(cappedProducts.value, {
    ratio: cardRatio.value,
    minorUnits: money.minor,
    revalidating: cardsRevalidating.value,
  })
);
/** Spec States → "Minimal": "with fewer than 2 products the block doesn't render." */
const hasEnoughProducts = computed(() => cards.value.length >= 2);

/** A collection the storefront could only have found by id, and did not: in the
 *  editor say why rather than vanish, since publishing is what fixes it. A live
 *  visitor still sees nothing at all. */
const showUnresolvedCollectionHint = computed(
  () =>
    isEditing.value &&
    selectorNeedsPublish(source.value) &&
    !pending.value &&
    !hasEnoughProducts.value
);

/** See the module doc comment: controls are dropped only when every product fits the view at
 *  EVERY width, i.e. the count is within the smallest (`base`) per-view step — the desktop step
 *  would hide them while a narrower container still has cards to scroll to. */
const perViewBase = computed(() => (isRecentlyViewed.value ? 2.4 : 1.5));
const showControls = computed(() => cards.value.length > perViewBase.value);

/** Spec → Layout: "the track bleeds to the block edge" below 48rem, so the peeking next card
 *  reaches the screen edge — negative gutter margin plus matching inline and scroll padding, reset
 *  once the track sits inside the container from 48rem. `--eldra-gutter-mobile` is the same
 *  variable `Container.vue` reads for its own mobile gutter; `blocks/tabs/Block.vue`'s tab row is
 *  the only other `-mx-*` bleed precedent in `blocks/*`. */
const TRACK_BLEED_CLASSES =
  '-mx-[var(--eldra-gutter-mobile)] px-[var(--eldra-gutter-mobile)] ' +
  'scroll-px-[var(--eldra-gutter-mobile)] @tablet:mx-0 @tablet:px-0 @tablet:scroll-px-0';
const carouselClasses = computed<Partial<Record<CarouselPart, string>>>(() => ({
  track: TRACK_BLEED_CLASSES,
  ...(showControls.value ? {} : { prev: 'hidden', next: 'hidden' }),
}));

const perView = computed(() =>
  isRecentlyViewed.value ? { base: 2.4, md: 4, lg: 6 } : { base: 1.5, md: 3, lg: 4 }
);
/** Spec "Product carousel" → Variants: 4:5 cards with swatches for `related`/`collection`,
 *  compact 1:1 cards with no swatches or rating for `recently-viewed`. */
const cardRatio = computed(() => (isRecentlyViewed.value ? '1x1' : '4x5'));

/**
 * While pending, `Carousel`'s own accessible name announces the loading state instead of
 * claiming to be the (not yet populated) product row — `storefront.loading` is the shared
 * commerce-block vocabulary (`app/i18n/messages.ts`), not a string this block owns itself.
 *
 * Otherwise it describes what the carousel holds ("New this season products") rather than repeating
 * the heading verbatim: the block's own `<section>` takes its name from the `<h2>` through
 * `labelled-by` (like every other heading-bearing block), and two nested `region` landmarks sharing
 * one accessible name are not distinguishable — axe's `landmark-unique`. Same shape as
 * `collection-grid`'s `grid.sectionLabel`.
 */
const carouselAriaLabel = computed(() =>
  pending.value
    ? t('storefront.loading')
    : t('productCarousel.carouselLabel', { heading: heading.value })
);
/** Bound below as `:ariaLabel` (camelCase), not `:aria-label` — see `blocks/hero/Block.vue`'s own
 *  `carouselAriaLabel` comment: `Carousel`'s `ariaLabel` is a *required* prop, and the kebab→camel
 *  prop match Vue applies to a bound attribute is a runtime-only behaviour, invisible to
 *  `nuxi typecheck`'s template type-checking. */

const viewAllHref = computed(() => safeHref(data.value.viewAllHref));
const hasViewAll = computed(
  () =>
    !isRecentlyViewed.value &&
    (data.value.viewAllLabel ?? '').trim() !== '' &&
    viewAllHref.value !== null
);
const viewAllLinkAs = computed(() =>
  viewAllHref.value !== null && isInternalHref(viewAllHref.value) ? EldraRouterLink : undefined
);

function onClearHistory(): void {
  storefront.history.clearViews();
}

/** The Carousel (and everything inside it) renders only once there is a heading to name it by and
 *  either the outcome is still unknown (`pending`) or there is enough content to show. */
const showCarousel = computed(() => hasHeading.value && (pending.value || hasEnoughProducts.value));
/** The whole block gates on having a heading — spec: a block with no required content renders
 *  nothing live; in the editor an empty heading gets its own hint instead of vanishing. */
const showBlock = computed(() =>
  hasHeading.value
    ? showCarousel.value || showUnresolvedCollectionHint.value
    : showHeadingHint.value
);
</script>

<template>
  <!-- `labelled-by`, like every other heading-bearing block: the `<section>` is only an exposed,
       named landmark when it points at its own heading. `headingId` is on the `<h2>` in the normal
       case and on the `EditorPlaceholder` in the freshly-inserted one, so the region is named in
       both. Without it "You may also like" was the one region on the home and product pages that
       landmark navigation could not reach by name. -->
  <Section
    v-if="showBlock"
    as="section"
    :background="background"
    spacing="md"
    :labelled-by="headingId"
    :aria-busy="refreshing ? 'true' : undefined"
  >
    <Container width="wide">
      <!-- One region for the whole row, always mounted and empty until there is something to say:
           a live region inserted with its message already in it is announced unreliably, and the
           cards deliberately do not announce for themselves (`announce: false` above). -->
      <VisuallyHidden as="p" role="status">{{ announcement }}</VisuallyHidden>
      <EditorPlaceholder
        v-if="showHeadingHint"
        :id="headingId"
        inline
        :label="t('productCarousel.headingHintLabel')"
        :help="t('productCarousel.headingHintHelp')"
      />

      <!-- `headingId` again: the `<h2>` lives inside the Carousel, which is not
           rendered in this state, so without it the `<section>` would point
           `aria-labelledby` at an id that is not in the document. -->
      <EditorPlaceholder
        v-else-if="showUnresolvedCollectionHint"
        :id="headingId"
        :label="t('storefront.unresolvedCollectionLabel')"
        :help="t('storefront.unresolvedCollectionHelp')"
      />

      <Carousel
        v-else-if="showCarousel"
        :ariaLabel="carouselAriaLabel"
        controls="header"
        :dots="false"
        draggable
        :per-view="perView"
        :classes="carouselClasses"
      >
        <template #header>
          <div class="flex flex-1 flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <h2 :id="headingId" :class="HEADING_CLASSES">
              <!-- The heading itself is the "view all" link: its visible text stays the heading (so
                   the Section this `<h2>` labels keeps that exact name) and the link's own
                   accessible name starts with it and adds `viewAllLabel` + context ("You may also
                   like — View all products"). A separate link in the same row as the arrows read
                   as a third control. No counter: a product row shows several cards at once, so
                   "3 / 6" while the track sits at its end reads wrong (spec "Carousel" → Product
                   row: no dots and no counter). -->
              <Link
                v-if="hasViewAll && !isRecentlyViewed"
                :href="viewAllHref!"
                :as="viewAllLinkAs"
                variant="standalone"
                arrow
                :aria-label="`${heading} — ${data.viewAllLabel}${t('productCarousel.viewAllContext')}`"
                :classes="{ root: `${HEADING_CLASSES} text-inherit` }"
              >
                {{ heading }}
              </Link>
              <template v-else>{{ heading }}</template>
            </h2>
            <Button v-if="isRecentlyViewed" variant="link" type="button" @click="onClearHistory">
              {{ t('productCarousel.clearHistory') }}
            </Button>
          </div>
        </template>

        <template v-if="showSkeletons">
          <div v-for="n in 4" :key="n" class="h-full">
            <Skeleton variant="media" :ratio="cardRatio" />
          </div>
        </template>
        <template v-else>
          <div v-for="entry in cards" :key="entry.item.handle" class="h-full">
            <ProductCard
              :product="entry.product"
              :ratio="cardRatio"
              :show-swatches="!isRecentlyViewed && showSwatchesField"
              :show-rating="!isRecentlyViewed"
              :quick-add="false"
              :heading-level="3"
              :revalidating="entry.revalidating"
              :announce="false"
              :link-as="entry.internal ? EldraRouterLink : undefined"
              :currency="currency"
              :locale="locale"
            />
          </div>
        </template>
      </Carousel>
    </Container>
  </Section>
</template>
