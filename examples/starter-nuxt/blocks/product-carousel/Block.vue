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
 * arrows/counter through the package's own `classes` override), not from real scroll geometry
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
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type { StorefrontProductListItem } from '../../app/storefront/types';
import { toProductCardEntries } from '../../app/storefront/toProductCard';

const props = defineProps<{ entry: EldraBlockEntry<'product-carousel'> }>();
const { data } = useBlockData(props, 'product-carousel');
const t = useT();
const isEditing = useEditing();
const headingId = `product-carousel-heading-${useUiId()}`;

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

const sourceHandleRef = computed(() => {
  const value = (data.value.sourceHandle ?? '').trim();
  return isCollection.value && value !== '' ? value : null;
});
const collectionOpts = computed(() => ({ page: 1, pageSize: limit.value }));
const productHandleRef = computed(() => storefront.route.productHandle);

const relatedResult = storefront.catalog.related(productHandleRef, limit.value);
const collectionResult = storefront.catalog.collectionProducts(sourceHandleRef, collectionOpts);
const recentlyViewedResult = storefront.catalog.byHandles(storefront.history.recentlyViewed);

const pending = computed(() => {
  if (isCollection.value) return collectionResult.pending.value;
  if (isRecentlyViewed.value) return recentlyViewedResult.pending.value;
  return relatedResult.pending.value;
});

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
const cards = computed(() =>
  toProductCardEntries(cappedProducts.value, { ratio: cardRatio.value })
);
/** Spec States → "Minimal": "with fewer than 2 products the block doesn't render." */
const hasEnoughProducts = computed(() => cards.value.length >= 2);

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
  ...(showControls.value ? {} : { prev: 'hidden', next: 'hidden', counter: 'hidden' }),
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
const showBlock = computed(() => (hasHeading.value ? showCarousel.value : showHeadingHint.value));
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
  >
    <Container width="wide">
      <EditorPlaceholder
        v-if="showHeadingHint"
        :id="headingId"
        inline
        :label="t('productCarousel.headingHintLabel')"
        :help="t('productCarousel.headingHintHelp')"
      />

      <Carousel
        v-else-if="showCarousel"
        :ariaLabel="carouselAriaLabel"
        controls="header"
        counter
        :dots="false"
        draggable
        :per-view="perView"
        :classes="carouselClasses"
      >
        <template #header>
          <div class="flex flex-1 flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <h2
              :id="headingId"
              class="font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
            >
              {{ heading }}
            </h2>
            <Button v-if="isRecentlyViewed" variant="link" type="button" @click="onClearHistory">
              {{ t('productCarousel.clearHistory') }}
            </Button>
            <Link
              v-else-if="hasViewAll"
              :href="viewAllHref!"
              :as="viewAllLinkAs"
              variant="standalone"
              arrow
            >
              {{ data.viewAllLabel
              }}<VisuallyHidden>{{ t('productCarousel.viewAllContext') }}</VisuallyHidden>
            </Link>
          </div>
        </template>

        <template v-if="pending">
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
