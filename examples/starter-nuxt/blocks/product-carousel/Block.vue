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
 * **The variant decides which settings exist.** `block.json` puts a `showWhen` condition on every
 * field only one variant reads, so Studio offers an author exactly the settings that variant
 * honours: the collection source (`sourceCollection`) only for `collection`, the
 * "view all" label for `related` and `collection`, and `viewAllHref` only for `related` — the
 * `collection` variant derives its own link from the collection that was picked (`viewAllHref`
 * below), and `recently-viewed` has no link at all. A hidden field keeps its stored value, so
 * switching variants back restores what the author typed.
 *
 * **Quick add is opt-in** (`quickAdd`, off by default and always off in `recently-viewed`). Off,
 * each card is one tab stop, the spec's keyboard table ("Tab moves through every card in order").
 * On, each card gains a second one, a small "Quick add" pill over the bottom-right of the photo. A
 * list row carries no variant id (`StorefrontProductListItem.productId`'s own comment), so a press
 * first reads the product (`catalog.product`, a result whose handle is `null` — no request — until
 * a pill is pressed) and adds the variant that product's page would add; then the same toast as the
 * product page's own add (`cart.added`, offering the cart), or the shared failure toast.
 *
 * **`layout`.** `carousel` (the default) is the row described above. `grid` shows the same cards
 * all at once: 4 across from 1101px of block width, 3 from 761px, 2 below, under a head row with
 * the heading on the left and, for `collection`, optional **filter chips** on the right
 * (`filters`: a label and a category handle each, after an "All" chip). A chip is a toggle
 * button (`aria-pressed`); choosing one narrows the collection read to that category
 * (`filters.category`, the same vocabulary `collection-grid` sends) and the cards dim while the
 * new read is in flight, as on any refresh. "All" — no chip — is the state the page is
 * prerendered in, so the chips never change what the server wrote. A chip that matches fewer than
 * two products still shows the block (with a short line when it matches none): the "fewer than 2
 * products" floor is about whether the block is worth showing at all, not about a shopper's own
 * narrowing.
 *
 * Cards are restyled through `ProductCard`'s `classes`, never forked: the title is not underlined
 * until hover, the price sits beside the title from 761px, and the quick-add pill shares the
 * photo's grid cell (the card root becomes a one-column grid so the pill can sit on the media
 * without knowing its height).
 */
import { computed, inject, nextTick, ref, toValue, watch } from 'vue';
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
  useToast,
  VisuallyHidden,
} from '@eldrajs/ui';
import type { CarouselPart, ProductCardPart, SectionBackground } from '@eldrajs/ui';
import { useEldraLocale } from '@eldrajs/theme-vue';
import { useStorefrontFeedback } from '../../app/composables/useStorefrontFeedback';
import { CART_ADD_TOAST_ID } from '../../app/storefront/feedback';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRevalidating } from '../../app/composables/useRevalidating';
import { useStorefront } from '../../app/composables/useStorefront';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import type {
  StorefrontCollectionSelector,
  StorefrontProduct,
  StorefrontProductListItem,
} from '../../app/storefront/types';
import {
  collectionSelector,
  selectorNeedsPublish,
  selectorSlug,
} from '../../app/storefront/collectionSelector';
import { toProductCardEntries } from '../../app/storefront/toProductCard';
import { useMoney } from '../../app/storefront/money';

const props = defineProps<{ entry: EldraBlockEntry<'product-carousel'> }>();
const { data } = useBlockData(props, 'product-carousel');
const { t } = useI18n();
const isEditing = useEditing();
const headingId = `product-carousel-heading-${useUiId()}`;
/** The h2 recipe, also applied to the heading's own link so `Link`'s standalone size and weight do
 *  not shrink the title (an app utility outranks the kit's `eldra:` classes by cascade layer). */
const HEADING_CLASSES =
  'font-heading text-[1.75rem] @min-[47.5625rem]:text-[2.25rem] leading-[1.1] font-medium tracking-[-0.01em] text-balance';

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
 * a renamed collection cannot silently empty this block. It replaced a
 * `sourceHandle` string field in version 3, and that value is not read here any
 * more even when an entry still carries it (Core keeps it as `sourceHandle__v2`)
 * — a stale handle must not win over, or stand in for, the collection an author
 * picked.
 *
 * `collectionSelector` prefers the reference's resolved `slug` and falls back to
 * its bare id (a page builder draft overlay, or a depth-0 read — see
 * `app/storefront/collectionSelector.ts`). No route fallback: this block never
 * sits on a collection route's own subject.
 */
const source = computed<StorefrontCollectionSelector | null>(() =>
  isCollection.value ? collectionSelector(data.value.sourceCollection) : null
);
/** The grid layout's chips — see the module doc comment. Only the `collection` variant reads a
 *  collection, so only it has anything to narrow. At most six, each with a label and a handle. */
const isGrid = computed(() => data.value.layout === 'grid');
const filterChips = computed(() =>
  isCollection.value && isGrid.value
    ? (data.value.filters ?? [])
        .map((chip) => ({
          label: (chip.label ?? '').trim(),
          category: (chip.category ?? '').trim(),
        }))
        .filter((chip) => chip.label !== '' && chip.category !== '')
        .slice(0, 6)
    : []
);
const hasFilterChips = computed(() => filterChips.value.length > 0);
const allFilterLabel = computed(
  () => (data.value.allFilterLabel ?? '').trim() || t('productCarousel.allFilter')
);
/** `null` is "All" — the prerendered state. */
const activeCategory = ref<string | null>(null);
/** A chip an editor removes (or a layout switch away from `grid`) must not leave the read narrowed
 *  to a category no chip names any more. */
watch(filterChips, (chips) => {
  if (activeCategory.value !== null && !chips.some((c) => c.category === activeCategory.value)) {
    activeCategory.value = null;
  }
});
const collectionOpts = computed(() =>
  activeCategory.value === null
    ? { page: 1, pageSize: limit.value }
    : { page: 1, pageSize: limit.value, filters: { category: [activeCategory.value] } }
);

/**
 * **Three results, and only the variant's own reads anything.** A block cannot create a result
 * conditionally (a variant is a field an author edits, so all three have to exist for the life of
 * the block), but every source below is empty for a variant that is not showing — so the two
 * results this carousel is not rendering ask the storefront nothing, on the server and in the
 * browser alike.
 *
 * That is the prerender contract's other half (`app/storefront/types.ts`): a result's sources must
 * be *final at setup time on both sides*, or its prerendered key and the key the browser computes
 * disagree and the page refetches data it already has. `recentlyViewed` is the case that proves
 * it — it is `localStorage`, empty on the server and filled a moment after mount by
 * `product-detail`'s `recordView`, so an ungated `byHandles` prerendered as `[[]]` and re-ran in
 * the browser as `[["<the product being viewed>"]]`: a full products read on every product page,
 * for a row nobody was looking at. Gated, the handle list is `[]` on both sides and nothing is
 * requested; the `recently-viewed` variant, which genuinely cannot be prerendered for a visitor's
 * own history, still reads it live and is the only variant that does.
 */
const relatedHandle = computed(() =>
  isCollection.value || isRecentlyViewed.value ? null : storefront.route.productHandle
);
const NO_HANDLES: string[] = [];
const viewedHandles = computed(() =>
  isRecentlyViewed.value ? storefront.history.recentlyViewed.value : NO_HANDLES
);

const relatedResult = storefront.catalog.related(relatedHandle, limit.value);
const collectionResult = storefront.catalog.collectionProducts(source, collectionOpts);
const recentlyViewedResult = storefront.catalog.byHandles(viewedHandles);

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
  refreshing: () =>
    (activeResult.value.loading.value && hasData.value) || storefront.currency.pending.value,
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
  return items.filter((item) => item.handle !== relatedHandle.value && item.available !== false);
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
const shopperCurrency = useStorefront().currency.active;
const cards = computed(() =>
  toProductCardEntries(cappedProducts.value, {
    ratio: cardRatio.value,
    minorUnits: money.minor,
    shopperCurrency: shopperCurrency.value,
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

/**
 * Spec → Layout: "the track bleeds to the block edge" below 48rem, so the peeking next card reaches
 * the screen edge, and sits inside the container again from 48rem.
 *
 * One variable, not the `-mx-/px-/scroll-px-` trio this used to write (fix, 2026-10-04 — the first
 * card's focus ring was cut off flat on its left edge at desktop). `Carousel` reserves the ring's
 * own reach as padding on its track, because `overflow-x-auto` makes the track clip its slides'
 * rings; a `px-*` utility arriving here through `classes.track` is a *different* `tailwind-merge`
 * group from the `p-*` that reservation used, so both survived the merge and `padding-inline` —
 * which Tailwind emits after `padding` — simply won: `padding-left: 0` at 48rem and up, with the
 * ring clipped at the slide's own edge. `--eldra-carousel-bleed` is what the component now reads
 * for the inline axis (`max(bleed, ring reach)` for the padding, the negative margin that cancels it
 * and the scroll padding at once), so the bleed composes with the reservation instead of replacing
 * it and the three can never fall out of step. `--eldra-gutter-mobile` is still the same variable
 * `Container.vue` reads for its own mobile gutter.
 */
const TRACK_BLEED_CLASSES =
  '[--eldra-carousel-bleed:var(--eldra-gutter-mobile)] @tablet:[--eldra-carousel-bleed:0px]';
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
 * Inside a carousel the slide is the card's width, full stop. `ProductCard` carries the spec's
 * grid recommendation ("minimum 14rem recommended", spec "Product card" → Sizes) as a hard
 * `min-w-56`, which is right in a grid whose columns are sized for it and wrong in a slide whose
 * width is `(track − gaps) / perView`: at six per view on a 1228px track a slide is 189px, so a
 * 224px card ran 35px past its slide, swallowed the 16px gap and overlapped the next card — the
 * operator saw the recently-viewed row drawn with no space between its tiles. `min-w-0` (an app
 * utility) outranks the component's own `eldra:min-w-56` by cascade layer, so the card fills exactly
 * its slide on every variant and at every container width.
 */
const CARD_CLASS = 'min-w-0';

/**
 * While pending, `Carousel`'s own accessible name announces the loading state instead of
 * claiming to be the (not yet populated) product row — `storefront.loading` is the shared
 * commerce-block vocabulary (`i18n/en-US.json`'s `storefront` namespace), not a string this block
 * owns itself.
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

/**
 * Where "view all" goes, per variant — `block.json`'s `showWhen` conditions offer an author exactly
 * the fields the variant reads, and this is the other half of that promise.
 *
 * `collection` derives the destination from the collection that was picked rather than asking for
 * it a second time: `/collections/<slug>`, the same path `collection-grid` builds its own paging
 * links from. `viewAllHref` is never read here — Studio does not show it in this variant, and a
 * stale value left behind by an author who switched variants must not win over the collection in
 * front of them. A collection known only by id (a page builder draft overlay, or a depth-0 read —
 * `app/storefront/collectionSelector.ts`) has no slug, and there is no other key a collection page
 * can be addressed by, so the heading simply is not a link until the page is published.
 *
 * `related` keeps the authored href: a recommendations row has no collection page of its own.
 * `recently-viewed` never links (`hasViewAll` below) — the shopper's own history has no page.
 */
const collectionViewAllHref = computed<string | null>(() => {
  const slug = selectorSlug(source.value);
  return slug === null ? null : `/collections/${slug}`;
});
const viewAllHref = computed(() =>
  safeHref(isCollection.value ? collectionViewAllHref.value : data.value.viewAllHref)
);
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
const showCarousel = computed(
  () =>
    hasHeading.value && (pending.value || hasEnoughProducts.value || activeCategory.value !== null)
);
const showFilteredEmpty = computed(
  () => activeCategory.value !== null && !pending.value && cards.value.length === 0
);

/* ---------------------------------------------------------------------------------------------- */
/* Quick add                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

const showQuickAdd = computed(() => (data.value.quickAdd ?? false) && !isRecentlyViewed.value);
/** `null` until a pill is pressed, so the read asks for nothing on the server or on load. */
const quickAddHandle = ref<string | null>(null);
const quickAddResult = storefront.catalog.product(quickAddHandle);
const quickAddBusy = ref(false);
const toast = useToast();
const feedback = useStorefrontFeedback();
const activeLocale = useEldraLocale();

/** Resolves once the product read for `handle` has settled: the product, or `null` when the read
 *  failed or answered nothing. */
async function readProduct(handle: string): Promise<StorefrontProduct | null> {
  quickAddHandle.value = handle;
  await nextTick();
  const settled = (): boolean =>
    !quickAddResult.loading.value &&
    (quickAddResult.data.value?.handle === handle || quickAddResult.error.value !== null);
  if (!settled()) {
    await new Promise<void>((resolve) => {
      const stop = watch(
        () => [quickAddResult.loading.value, quickAddResult.data.value, quickAddResult.error.value],
        () => {
          if (!settled()) return;
          stop();
          resolve();
        }
      );
    });
  }
  const product = quickAddResult.data.value;
  return product !== null && product.handle === handle ? product : null;
}

async function onQuickAdd(item: { handle: string }): Promise<void> {
  if (quickAddBusy.value) return;
  quickAddBusy.value = true;
  try {
    const product = await readProduct(item.handle);
    if (product === null || product.variantId === '') {
      feedback.report(null, { id: CART_ADD_TOAST_ID });
      return;
    }
    const cart = storefront.cart;
    const failure = await cart.add({
      productId: product.productId,
      variantId: product.variantId,
      quantity: 1,
    });
    if (failure !== null) {
      feedback.report(failure, { id: CART_ADD_TOAST_ID });
      return;
    }
    toast.show({
      id: CART_ADD_TOAST_ID,
      title: t('cart.added'),
      action: cart.drawerAvailable.value
        ? {
            label: t('cart.viewCart'),
            onActivate: () => {
              cart.drawerOpen.value = true;
            },
          }
        : { label: t('cart.viewCart'), href: activeLocale.path('/cart') },
    });
  } finally {
    quickAddBusy.value = false;
  }
}

/* ---------------------------------------------------------------------------------------------- */
/* Card and grid styling                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/** The card's own parts, restyled to the theme (see the module doc comment). The root is a
 *  one-column grid so the quick-add pill can share the photo's cell; from 761px of block width
 *  the price moves beside the title. */
const CARD_ROOT_CLASS = 'grid grid-cols-1 grid-rows-[auto_1fr] content-start';
const cardClasses = computed<Partial<Record<ProductCardPart, string>>>(() => ({
  media: '[grid-area:1/1]',
  body:
    '[grid-area:2/1] @min-[47.5625rem]:grid @min-[47.5625rem]:grid-cols-[minmax(0,1fr)_auto] ' +
    '@min-[47.5625rem]:items-baseline @min-[47.5625rem]:content-start @min-[47.5625rem]:gap-x-3',
  title: 'leading-[1.35]',
  link:
    'no-underline hover:underline hover:decoration-1 hover:decoration-current ' +
    'hover:underline-offset-[0.2em]',
  price: 'whitespace-nowrap',
  rating: '@min-[47.5625rem]:col-span-2',
  stockLine: '@min-[47.5625rem]:col-span-2',
  swatches: 'mt-1 @min-[47.5625rem]:col-span-2',
  quickAdd:
    '[grid-area:1/1] z-10 m-3 mt-0 self-end justify-self-end w-auto h-10 min-h-10 rounded-full ' +
    'border-0 bg-background px-3.5 text-sm font-semibold text-text shadow-sm ' +
    'hover:bg-text hover:text-background disabled:opacity-90',
}));

const GRID_CLASS =
  'grid grid-cols-2 gap-x-3 gap-y-8 @min-[47.5625rem]:grid-cols-3 @min-[47.5625rem]:gap-x-5 ' +
  '@min-[47.5625rem]:gap-y-10 @min-[68.8125rem]:grid-cols-4';

function chipClass(active: boolean): string {
  return active
    ? 'border-text bg-text text-background'
    : 'border-border-strong text-text hover:bg-surface';
}
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

      <template v-else-if="showCarousel && isGrid">
        <div class="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <p v-if="data.eyebrow" class="text-overline text-accent mb-2">{{ data.eyebrow }}</p>
            <h2 :id="headingId" :class="HEADING_CLASSES">
              <Link
                v-if="hasViewAll"
                :href="viewAllHref!"
                :as="viewAllLinkAs"
                variant="standalone"
                arrow
                :aria-label="`${heading} — ${data.viewAllLabel}${t('productCarousel.viewAllContext')}`"
                :class="`${HEADING_CLASSES} text-inherit`"
              >
                {{ heading }}
              </Link>
              <template v-else>{{ heading }}</template>
            </h2>
          </div>
          <ul
            v-if="hasFilterChips"
            class="eldra-scrollbar-hide flex max-w-full gap-2 overflow-x-auto px-0.5 py-1"
            :aria-label="t('productCarousel.filterLabel', { heading })"
          >
            <li
              v-for="chip in [{ label: allFilterLabel, category: null }, ...filterChips]"
              :key="chip.category ?? ''"
            >
              <button
                type="button"
                class="eldra-focus inline-flex min-h-10 items-center rounded-full border px-4 text-[0.9375rem] font-medium whitespace-nowrap"
                :class="chipClass(activeCategory === chip.category)"
                :aria-pressed="activeCategory === chip.category ? 'true' : 'false'"
                @click="activeCategory = chip.category"
              >
                {{ chip.label }}
              </button>
            </li>
          </ul>
        </div>

        <ul v-if="showSkeletons" role="list" :class="GRID_CLASS">
          <li v-for="n in 4" :key="n"><Skeleton variant="media" :ratio="cardRatio" /></li>
        </ul>
        <ul v-else-if="cards.length > 0" role="list" :class="GRID_CLASS">
          <li v-for="entry in cards" :key="entry.item.handle">
            <ProductCard
              :product="entry.product"
              :ratio="cardRatio"
              :class="[CARD_CLASS, CARD_ROOT_CLASS]"
              :classes="cardClasses"
              :show-swatches="showSwatchesField"
              :show-rating="true"
              :quick-add="showQuickAdd"
              :heading-level="3"
              :revalidating="entry.revalidating"
              :announce="false"
              :link-as="entry.internal ? EldraRouterLink : undefined"
              :currency="entry.currency ?? currency"
              :locale="locale"
              @quick-add="onQuickAdd(entry.item)"
            />
          </li>
        </ul>
        <p v-else-if="showFilteredEmpty" class="text-muted">
          {{ t('productCarousel.filterEmpty') }}
        </p>
      </template>

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
            <div>
              <p v-if="data.eyebrow" class="text-overline text-accent mb-2">{{ data.eyebrow }}</p>
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
                  :class="`${HEADING_CLASSES} text-inherit`"
                >
                  {{ heading }}
                </Link>
                <template v-else>{{ heading }}</template>
              </h2>
            </div>
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
              :class="[CARD_CLASS, CARD_ROOT_CLASS]"
              :classes="cardClasses"
              :show-swatches="!isRecentlyViewed && showSwatchesField"
              :show-rating="!isRecentlyViewed"
              :quick-add="showQuickAdd"
              :heading-level="3"
              :revalidating="entry.revalidating"
              :announce="false"
              :link-as="entry.internal ? EldraRouterLink : undefined"
              :currency="entry.currency ?? currency"
              :locale="locale"
              @quick-add="onQuickAdd(entry.item)"
            />
          </div>
        </template>
      </Carousel>
    </Container>
  </Section>
</template>
