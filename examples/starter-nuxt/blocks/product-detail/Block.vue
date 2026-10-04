<script setup lang="ts">
/**
 * Product detail · the product page's buy box (spec `02-blocks.md` "Product detail", 3172–3300):
 * gallery, title, price, rating, variant pickers, honest stock status, quantity, add to cart,
 * delivery notes and description tabs, plus a quick-add bar on narrow widths. The title, price,
 * images, options, inventory and rating all come from `useStorefront()`; the CMS fields decide what
 * the block shows and add the editorial copy around it.
 *
 * **Which product.** `productHandle` is empty on a product template, where the route supplies it
 * (`storefront.route.productHandle`); an author fills it in by hand for a featured-product landing
 * section. With neither, the editor sees the "Choose a product" placeholder and the live site
 * renders nothing (Global Constraints, "Editor vs live").
 *
 * **`gallery-right` mirrors visually only.** The gallery is first in the DOM in both variants and
 * only the `@tablet:order-*` utilities swap the columns, so reading and focus order never change
 * (spec Variants, `gallery-right` row).
 *
 * **The buy area is a real `<form>`**, the way a storefront's add-to-cart form always is: the
 * pickers are its radio groups, the stepper its quantity field and Add to cart its submit button,
 * so `Enter` inside the form buys.
 *
 * **Each radio group gets a unique native `name`.** `VariantPicker`'s `legend` prop (separate from
 * `name`, see `packages/ui/src/components/variant-picker/VariantPicker.vue`) is what makes this
 * possible without also changing the visible/accessible legend text: `instanceId` (`useUiId()`)
 * combines with `option.name` into the radios' `name` attribute, so two product-detail blocks on
 * one page — or a repeated option name within one — never share a group, while `legend`
 * (`option.label`) keeps reading "Colour", never "Colour v-3".
 *
 * **Stock is derived, never stored** — `stock.ts` owns the four-state rule so the template branches
 * once and the whole matrix is provable without mounting anything. `role="status"`/`aria-live`
 * around it is what announces a variant change politely, and nothing here moves focus when the
 * selection changes (spec Acceptance criteria, 4.1.3/3.2.2).
 *
 * **No countdowns, viewer counts or invented urgency** — the block has no fields for them on
 * purpose (spec Do/Don't).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  Badge,
  Button,
  Container,
  Dialog,
  EditorPlaceholder,
  FieldWrapper,
  FormLayout,
  Input,
  Link,
  Price,
  QuantityStepper,
  Rating,
  Section,
  StockBadge,
  Tab,
  TabPanel,
  Tabs,
  VariantPicker,
  useToast,
  type FormLayoutSubmitPayload,
} from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useRevalidating } from '../../app/composables/useRevalidating';
import { useStorefront } from '../../app/composables/useStorefront';
import { useStorefrontFeedback } from '../../app/composables/useStorefrontFeedback';
import { CART_ADD_TOAST_ID, isOutOfStock } from '../../app/storefront/feedback';
import { roundMoney, useMoney } from '../../app/storefront/money';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import Gallery from './parts/Gallery.vue';
import StickyBuyBar from './parts/StickyBuyBar.vue';
import { deriveStockLine, type LowStockThreshold } from './stock';

interface PerkItem {
  icon?: string;
  title?: string;
  text?: string;
}
interface TabItem {
  label?: string;
  body?: { content?: unknown[] } | null;
}

const props = defineProps<{ entry: EldraBlockEntry<'product-detail'> }>();
const { data, entryId } = useBlockData(props, 'product-detail');
const t = useT();
const editing = useEditing();
const storefront = useStorefront();
const feedback = useStorefrontFeedback();
const toast = useToast();

const titleId = `product-detail-title-${useUiId()}`;
/** Every `VariantPicker` radio group on the page needs a unique native `name`, or two
 *  product-detail blocks (or a repeated `option.name` within one) would join the same group — see
 *  the module doc comment for why `legend` is what keeps the human-readable text ("Colour") out of
 *  that name. */
const instanceId = useUiId();

/* ------------------------------------------------------------------------- */
/* The product                                                               */
/* ------------------------------------------------------------------------- */

const handle = computed<string | null>(() => {
  const chosen = (data.value.productHandle ?? '').trim();
  if (chosen !== '') return chosen;
  return storefront.route.productHandle;
});
const productResult = storefront.catalog.product(handle);
const product = computed(() => productResult.data.value);

/**
 * **The prerender contract** (`app/storefront/types.ts`): this page's HTML was built with the
 * product's real title, images, price and stock line, so the three states below are about what the
 * page does *not* have, never about what it already shows.
 *
 * - `showStatus` — the skeleton/loading line, and the "we couldn't load this" line. Only ever with
 *   no product at all: an error over a product the visitor can see keeps the product (the `v-if`
 *   chain in the template puts `product` first, and this reads `product === null` as well so the
 *   rule is stated rather than implied by template order).
 * - `notFound` — the read finished, answered nothing, and did not fail: the handle names a product
 *   this catalogue does not have. A prerendered page outlives its catalogue, so this is a real
 *   visitor state (a bookmarked link to a discontinued product), not only an author mistake.
 * - `revalidating` — the two states in which a fresher value is on its way, both drawn the same
 *   way: the volatile refresh (`StorefrontResult.revalidating`, money and the stock line), and a
 *   *different* product loading over the one on screen (`loading && data !== null`, the handle
 *   changed). The values stay, dimmed with a spinner; the page never regresses to a skeleton for
 *   something it can already show. Both go through `useRevalidating`, which holds them at `false`
 *   until after mount — a hydrating page's result is already `loading` with its payload data in
 *   place, so reading either signal straight through would paint a busy state the server never
 *   wrote (see that composable's own comment).
 */
const showStatus = computed(
  () =>
    handle.value !== null &&
    product.value === null &&
    (productResult.pending.value || productResult.error.value !== null)
);
const notFound = computed(
  () =>
    handle.value !== null &&
    product.value === null &&
    !productResult.pending.value &&
    !productResult.loading.value &&
    productResult.error.value === null
);

/**
 * `Price` and `StockBadge` keep their prerendered value, dim it, draw a spinner beside it and
 * announce the refresh themselves — `announce` is left at its default here, unlike the card lists,
 * because a product page has exactly one price and one stock line to speak about.
 */
const {
  price: priceRevalidating,
  stock: stockRevalidating,
  refreshing,
} = useRevalidating({
  keys: () => productResult.revalidating.value,
  refreshing: () => productResult.loading.value && product.value !== null,
});

/** Spec Field → layout mapping: "Mounting records the product in `history.recordView`" — the
 *  `product-carousel` block's `recently-viewed` source is the other half of this. */
onMounted(() => {
  if (handle.value !== null) storefront.history.recordView(handle.value);
});
watch(handle, (next) => {
  if (next !== null) storefront.history.recordView(next);
});

/* ------------------------------------------------------------------------- */
/* Fields                                                                    */
/* ------------------------------------------------------------------------- */

const galleryRight = computed(() => data.value.variant === 'gallery-right');
const showCategory = computed(() => data.value.showCategory !== false);
const showRatingField = computed(() => data.value.showRating !== false);
const showQuantity = computed(() => data.value.showQuantity !== false);
const showWishlist = computed(() => data.value.showWishlist !== false);
const stickyBarEnabled = computed(() => data.value.stickyBar !== false);
const threshold = computed<LowStockThreshold>(() => data.value.lowStockThreshold ?? '3');
const perks = computed<PerkItem[]>(() =>
  (data.value.perks ?? []).filter((perk: PerkItem) => Boolean(perk.title))
);
const tabs = computed<TabItem[]>(() =>
  (data.value.tabs ?? []).filter((tab: TabItem) => Boolean(tab.label))
);

const sizeGuideHref = computed(() => safeHref(data.value.sizeGuideHref));
const sizeGuideLabel = computed(() => data.value.sizeGuideLabel?.trim() || t('product.sizeGuide'));
const sizeGuideAs = computed(() =>
  sizeGuideHref.value !== null && isInternalHref(sizeGuideHref.value) ? EldraRouterLink : undefined
);

/** The trail comes from the store, not from a field, but it still ends up in an `href`, so it goes
 *  through the same `safeHref` gate every author-supplied destination in this theme passes; a level
 *  whose destination does not survive it is dropped rather than rendered as a broken link. */
const categoryTrail = computed(() =>
  (product.value?.categoryTrail ?? []).flatMap((level) => {
    const href = safeHref(level.href);
    return href === null ? [] : [{ label: level.label, href }];
  })
);

/** Spec States, Minimal row: "With no reviews, the rating is hidden" — and the `showRating` field's
 *  own note, "Hidden anyway when the product has fewer than 3 reviews": an average over one or two
 *  opinions is noise, not information. */
const rating = computed(() => product.value?.rating ?? null);
const showRating = computed(
  () => showRatingField.value && rating.value !== null && rating.value.count >= 3
);

/* ------------------------------------------------------------------------- */
/* Money                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * `money.format` is for the two places a price has to appear *inside* another string — the Add to
 * cart label and the quick-add bar's meta line — where a `<Price>` element cannot go; `money.minor`
 * converts a storefront amount (major units) into the minor units `<Price>` itself reads. Both are
 * bound to the same currency and locale the `<Price>` above the button resolves, so the two can
 * never disagree about the formatting.
 */
const money = useMoney();

const formattedPrice = computed(() =>
  product.value === null ? '' : money.format(product.value.price.amount)
);

/** Spec States, Sale row: 'The saving badge ("Save $32") is calculated from the two prices, never
 *  typed in.' Only a real sale counts — a `compareAt` at or below the current price is ignored, the
 *  same rule `Price`'s own sale state applies. */
const saving = computed<string | null>(() => {
  const price = product.value?.price;
  if (price === undefined) return null;
  const compareAt = price.compareAt ?? null;
  if (compareAt === null || compareAt <= price.amount) return null;
  return money.format(roundMoney(compareAt - price.amount));
});
const onSale = computed(() => saving.value !== null);

/* ------------------------------------------------------------------------- */
/* Options and the selected variant                                          */
/* ------------------------------------------------------------------------- */

const options = computed(() => product.value?.options ?? []);

/** One selected value per option, keyed by the option's own `name`. */
const selection = ref<Record<string, string>>({});

/**
 * Spec Do/Don't: "Don't pre-select a sold-out variant" — the default is the first *available* value,
 * falling back to the first value only for an option with nothing available at all (which still
 * needs a checked radio, so a shopper can ask to be notified). Re-seeded whenever the product
 * changes, never on every render, so a shopper's own choice survives an unrelated re-render.
 */
watch(
  options,
  (next) => {
    const seeded: Record<string, string> = {};
    for (const option of next) {
      const first = option.values.find((value) => value.available) ?? option.values[0];
      if (first !== undefined) seeded[option.name] = first.value;
    }
    selection.value = seeded;
  },
  { immediate: true }
);

const selectedValues = computed(() =>
  options.value.map((option) =>
    option.values.find((value) => value.value === selection.value[option.name])
  )
);
/** "Oat / M" — what every stock message, the wishlist name and the quick-add bar read. */
const variantLabel = computed(() =>
  selectedValues.value
    .filter((value) => value !== undefined)
    .map((value) => value!.label)
    .join(' / ')
);
const variantAvailable = computed(() =>
  selectedValues.value.every((value) => value === undefined || value.available)
);

/* ------------------------------------------------------------------------- */
/* Stock                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The cart refused an add for stock. The product read is the page's source of truth for stock
 * (`gateway.ts` reads real inventory for it), but the cart service is the one that actually
 * commits it: when the two disagree, the cart has just proved it knows something the read did not,
 * and continuing to offer a button that cannot work is the worse of the two errors. So the page
 * holds that one fact locally and shows the sold-out state the spec already defines — Notify me, the
 * sold-out line, no stepper — rather than inventing a fifth state for it.
 *
 * Dropped as soon as anything fresher could contradict it: a product read that came back *different*
 * — which is exactly what "the refresh said otherwise" means, since a refresh that changes nothing
 * keeps every object at its own identity (`app/storefront/volatile.ts`) and has not contradicted
 * anything — or another variant chosen, which is not the variant the backend refused.
 */
const refusedForStock = ref(false);
watch([() => productResult.data.value, variantLabel], () => {
  refusedForStock.value = false;
});

/**
 * `StorefrontProduct.inventory` is the theme's one inventory number (see `app/storefront/types.ts`):
 * the count of the variant this page would sell, or `null` from a store that tracks no units — and
 * also `null` whenever the source cannot say which variant a count belongs to, since "only 2 left in
 * L" about M's two units is worse than no line at all. Either way `null` is what keeps "only N left"
 * off a made-to-order product, and off a product whose count would be guesswork.
 */
const stockLine = computed(() =>
  deriveStockLine({
    stock: refusedForStock.value ? 'out' : (product.value?.stock ?? 'in'),
    inventory: product.value?.inventory ?? null,
    variantAvailable: variantAvailable.value,
    variantLabel: variantLabel.value,
    threshold: threshold.value,
    shipsBy: product.value?.shipsBy ?? null,
  })
);
const soldOut = computed(() => stockLine.value.state === 'out');
const isBackorder = computed(() => stockLine.value.state === 'backorder');

/** Spec States, Back-order row: `warning` with the clock icon. `StockBadge`'s own `preorder` level
 *  draws the clock in `muted` (it serves a quieter product-card context too), so the block asks for
 *  the spec's colour through the component's sanctioned per-part `classes`, never by patching it. */
const stockClasses = computed(() =>
  isBackorder.value ? { root: 'text-warning font-semibold' } : { root: 'font-semibold' }
);

/* ------------------------------------------------------------------------- */
/* Quantity, cart, wishlist                                                  */
/* ------------------------------------------------------------------------- */

const quantity = ref(1);
/** Spec States, Low stock row: "The stepper maximum matches the inventory." A shopper who already
 *  typed 6 must not keep a quantity the store cannot fill after switching to a thinner variant. */
watch(
  () => stockLine.value.max,
  (max) => {
    if (quantity.value > max) quantity.value = max;
  }
);

const addToCartLabel = computed(() => {
  if (soldOut.value) return t('product.notifyMe');
  if (isBackorder.value) return t('product.backorder');
  return t('product.addToCart', { price: formattedPrice.value });
});

const wishlisted = computed(() =>
  handle.value === null ? false : storefront.wishlist.has(handle.value)
);
const wishlistLabel = computed(() => {
  const title = product.value?.title ?? '';
  return wishlisted.value
    ? t('product.removeFromWishlist', { title })
    : t('product.saveToWishlist', { title });
});
function toggleWishlist(): void {
  if (handle.value !== null) storefront.wishlist.toggle(handle.value);
}

const addToCartEl = ref<HTMLElement | null>(null);
const addToCartTarget = ref<HTMLElement | null>(null);
/** `Button` is a component, so the sticky bar's observer needs the real element behind it — read
 *  from the wrapper this block owns rather than by reaching into the component's internals. */
watch(
  [addToCartEl, addToCartLabel],
  async () => {
    await nextTick();
    addToCartTarget.value = addToCartEl.value?.querySelector('button') ?? null;
  },
  { immediate: true }
);

/**
 * Add to cart, and — either way — something the shopper can see. The button's own spinner stopping
 * is not feedback: it looks identical whether the line was added or the gateway refused it, which is
 * exactly how a 409 `CART_INSUFFICIENT_STOCK` became "Add to cart does nothing".
 *
 * **On success**, a toast — never the drawer. The design spec is explicit about this
 * (`01-core-components.md` → "Drawer": "a Toast (not the drawer) to confirm 'Added to cart' unless
 * the shopper asked to see the cart"), and the reason is the shopper's place on the page: they were
 * reading a product, they pressed one button, and a modal `<dialog>` over everything takes their
 * focus and their scroll position for a decision they did not ask to make. So the toast confirms it
 * and *offers* the cart: its action opens the hosted drawer when one is live (`drawerAvailable` — the
 * shopper asking to see the cart is exactly what the spec's exception is about), and is an ordinary
 * link to `/cart` when none is, which is the same destination the header's bag has in that state.
 *
 * **On failure**, one shared toast through `useStorefrontFeedback()` (the sentence comes from the
 * gateway's `errorId`, not from this block), plus the one reaction a page can usefully have: a
 * refusal for stock flips its own stock line to sold out.
 */
async function primaryAction(): Promise<void> {
  if (soldOut.value) {
    notifyOpen.value = true;
    return;
  }
  const buyable = product.value;
  // Both ids, because the backend resolves the pair (`app/storefront/cart.ts`'s `CartAddInput`). A
  // product read that answered no buyable variant has nothing to add — `mapProductDetails` leaves
  // `variantId` empty rather than inventing one from the product's own id.
  if (buyable === null || buyable.variantId === '') return;
  const cart = storefront.cart;
  const failure = await cart.add({
    productId: buyable.productId,
    variantId: buyable.variantId,
    quantity: quantity.value,
  });

  if (failure !== null) {
    if (isOutOfStock(failure)) refusedForStock.value = true;
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
      : { label: t('cart.viewCart'), href: '/cart' },
  });
}

/* ------------------------------------------------------------------------- */
/* Back-in-stock dialog                                                      */
/* ------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const notifyOpen = ref(false);
const notifyEmail = ref('');
const notifyError = ref<string | null>(null);
const notifySubmitting = ref(false);
const notifySucceeded = ref(false);

/** `FormLayout` refuses to emit `submit` while any field still carries `aria-invalid` (see its own
 *  doc comment), so the error clears as soon as the value changes rather than only on the next
 *  successful submit — the same shape the `newsletter` block documents. */
watch(notifyEmail, () => {
  notifyError.value = null;
});
watch(notifyOpen, (open) => {
  if (open) return;
  notifyError.value = null;
  notifySucceeded.value = false;
  notifyEmail.value = '';
});

async function submitNotify(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  if (notifySubmitting.value) return;
  const email = String(payload.data.get('email') ?? '').trim();
  if (!EMAIL_PATTERN.test(email)) {
    notifyError.value = t('product.notifyInvalid');
    return;
  }
  const variantId = product.value?.variantId;
  if (variantId === undefined || variantId === '') return;
  notifySubmitting.value = true;
  const ack = await storefront.catalog.notifyBackInStock({ email, variantId });
  notifySubmitting.value = false;
  if (ack.ok) {
    notifySucceeded.value = true;
    return;
  }
  notifyError.value =
    ack.reason === 'unsupported' ? t('product.notifyUnsupported') : t('product.notifyInvalid');
}

/* ------------------------------------------------------------------------- */
/* Presentation                                                              */
/* ------------------------------------------------------------------------- */

/** Spec Container/Section line: 1rem top below 48rem block width, 2rem from 48rem, `section-md`
 *  bottom — `Section`'s own `spacing` steps are symmetrical, so the block sets its own halves
 *  through the sanctioned `classes` prop. */
const SECTION_SPACING = 'pt-4 @tablet:pt-8 pb-[var(--eldra-section-md)]';

/** Spec Layout: the `h1` is "styled at the h2 scale" — 1.625rem, stepping up to the `text-h2`
 *  token's own 2rem from 64rem. */
const TITLE_CLASS =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] text-balance ' +
  '@content:text-h2';

const quantityStepperClasses = { decrease: 'size-12', increase: 'size-12', input: 'h-12' };

const tabsRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(tabsRoot, (caption) => caption ?? t('product.tabsLabel'));

function tabValue(index: number): string {
  return String(index);
}
</script>

<template>
  <Section
    v-if="product"
    spacing="none"
    :labelled-by="titleId"
    :aria-busy="refreshing ? 'true' : undefined"
    :classes="{ root: SECTION_SPACING }"
  >
    <Container width="content">
      <div
        class="@tablet:grid-cols-[7fr_5fr] @tablet:items-start @tablet:gap-8 @content:gap-12 grid gap-6"
      >
        <!-- Gallery first in the DOM in both variants; only the order utilities mirror. -->
        <Gallery
          class="@tablet:sticky @tablet:top-6"
          :class="galleryRight ? '@tablet:order-2' : '@tablet:order-1'"
          :images="product.images"
          :title="product.title"
          :on-sale="onSale"
        />

        <div
          role="group"
          :aria-label="t('product.information')"
          class="flex flex-col gap-6"
          :class="galleryRight ? '@tablet:order-1' : '@tablet:order-2'"
        >
          <div class="flex flex-col gap-2">
            <!--
              A hand-drawn trail rather than `@eldrajs/ui`'s `Breadcrumb`: that component always
              renders its last item as the current page (`aria-current="page"`, never a link — see
              `BreadcrumbItem`'s own comment), and here the last level is the parent category, not
              this page. Spec Layout wants every level to stay a link, so the trail is a `<nav>`
              named "Breadcrumb" over package `Link`s instead.
            -->
            <nav
              v-if="showCategory && categoryTrail.length > 0"
              :aria-label="t('product.breadcrumb')"
            >
              <ol class="text-muted flex flex-wrap items-center gap-1 text-[0.875rem]">
                <li
                  v-for="(level, index) in categoryTrail"
                  :key="level.href"
                  class="flex items-center gap-1"
                >
                  <span v-if="index > 0" aria-hidden="true">/</span>
                  <Link :href="level.href" :as="EldraRouterLink" tone="muted">
                    {{ level.label }}
                  </Link>
                </li>
              </ol>
            </nav>

            <h1 :id="titleId" :class="TITLE_CLASS">{{ product.title }}</h1>

            <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Price
                :amount="money.minor(product.price.amount)"
                :compare-at="
                  product.price.compareAt == null ? null : money.minor(product.price.compareAt)
                "
                :revalidating="priceRevalidating"
              />
              <Badge
                v-if="saving"
                variant="sale"
                :label="t('product.saving', { amount: saving })"
              />
              <Rating
                v-if="showRating && rating"
                :value="rating.value"
                :count="rating.count"
                href="#reviews"
                :as="EldraRouterLink"
              />
            </div>

            <p class="text-muted text-[0.875rem]">{{ t('product.taxNote') }}</p>
          </div>

          <hr class="border-border" />

          <form class="flex flex-col gap-5" @submit.prevent="primaryAction">
            <!--
              Spec Layout, Pickers: the size-guide link sits "at the far end" of the legend row.
              `VariantPicker` draws its own legend and has no slot beside it, so the link is a
              sibling in a two-column row aligned to the fieldset's top edge — `items-start`, not
              `items-baseline`: a `<legend>`'s line box is rendered specially and does not give the
              fieldset a first baseline, so baseline alignment drops the link down to the options
              row instead of the legend's.
            -->
            <div
              v-for="option in options"
              :key="option.name"
              class="grid grid-cols-[1fr_auto] items-start gap-x-4"
            >
              <VariantPicker
                v-model="selection[option.name]"
                :name="`${option.name}-${instanceId}`"
                :legend="option.label"
                :type="option.type"
                :options="option.values"
              />
              <Link
                v-if="option.type === 'pills' && sizeGuideHref"
                :href="sizeGuideHref"
                :as="sizeGuideAs"
                tone="muted"
                class="justify-self-end text-[0.875rem]"
              >
                {{ sizeGuideLabel }}
              </Link>
            </div>

            <!-- Always mounted, so a variant change is announced rather than appearing silently. -->
            <p role="status" aria-live="polite">
              <StockBadge
                :level="stockLine.level"
                :message="t(stockLine.key, stockLine.params)"
                :revalidating="stockRevalidating"
                :classes="stockClasses"
              />
              <span v-if="stockLine.noteKey" class="text-muted mt-1 block pl-6 text-[0.875rem]">{{
                t(stockLine.noteKey)
              }}</span>
            </p>

            <FieldWrapper
              v-if="showQuantity && !soldOut"
              :label="t('product.quantity')"
              :classes="{ root: 'gap-2' }"
            >
              <QuantityStepper
                v-model="quantity"
                name="quantity"
                :max="stockLine.max"
                :classes="quantityStepperClasses"
              />
            </FieldWrapper>

            <div class="grid grid-cols-[1fr_auto] items-center gap-3">
              <div ref="addToCartEl" class="contents">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  block
                  :loading="storefront.cart.pending.value"
                  :label="addToCartLabel"
                >
                  <template v-if="soldOut" #leadingIcon>
                    <EldraIcon name="mail" size="md" />
                  </template>
                  {{ addToCartLabel }}
                </Button>
              </div>
              <Button
                v-if="showWishlist"
                type="button"
                icon-only
                variant="outline"
                size="lg"
                :pressed="wishlisted"
                :label="wishlistLabel"
                @click="toggleWishlist"
              >
                <template #leadingIcon>
                  <EldraIcon name="heart" size="md" />
                </template>
              </Button>
            </div>
          </form>

          <ul
            v-if="perks.length > 0"
            role="list"
            class="bg-surface flex flex-col gap-3 rounded-lg p-4"
          >
            <li v-for="(perk, index) in perks" :key="index" class="flex gap-3 text-[0.875rem]">
              <EldraIcon v-if="perk.icon" :name="perk.icon" size="md" class="text-text shrink-0" />
              <div class="min-w-0">
                <p class="font-semibold">{{ perk.title }}</p>
                <p v-if="perk.text" class="text-muted">{{ perk.text }}</p>
              </div>
            </li>
          </ul>

          <div v-if="tabs.length > 0" ref="tabsRoot">
            <Tabs variant="underline" :ariaLabel="t('product.tabsLabel')">
              <template #tabs>
                <Tab
                  v-for="(tab, index) in tabs"
                  :key="index"
                  :value="tabValue(index)"
                  :title="tab.label"
                />
              </template>
              <TabPanel v-for="(tab, index) in tabs" :key="index" :value="tabValue(index)">
                <!-- A `Tab` label is a button, not a heading, so the nearest heading above a
                     panel is this block's own `h1` (the product title) — the panel body's headings
                     therefore start at `h2`. Floored at 2 rather than 3 on purpose: with no `h2`
                     in between, an `h3` straight after the `h1` would be a level skip. -->
                <EldraRichText
                  class="prose-eldra [&>*+*]:mt-3"
                  :entry-id="entryId"
                  :field="`tabs.${index}.body`"
                  :doc="tab.body"
                  :min-heading-level="2"
                />
              </TabPanel>
            </Tabs>
          </div>
        </div>
      </div>

      <StickyBuyBar
        v-if="stickyBarEnabled"
        :target="addToCartTarget"
        :title="product.title"
        :meta="
          variantLabel
            ? t('product.quickAddMeta', { variant: variantLabel, price: formattedPrice })
            : formattedPrice
        "
        :action-label="addToCartLabel"
        :image="product.images[0] ?? null"
        :pending="storefront.cart.pending.value"
        @add="primaryAction"
      />

      <Dialog v-model="notifyOpen" :title="t('product.notifyTitle')" size="sm">
        <!-- Mounted before the sign-up is sent, and empty until there is something to say, so the
             confirmation is announced when it lands rather than appearing silently (4.1.3). -->
        <div role="status">
          <p v-if="notifySucceeded" class="text-text">{{ t('product.notifySuccess') }}</p>
        </div>
        <FormLayout
          v-if="!notifySucceeded"
          novalidate
          :submitting="notifySubmitting"
          @submit="submitNotify"
        >
          <FieldWrapper :label="t('product.notifyEmail')" :error="notifyError ?? undefined">
            <Input v-model="notifyEmail" type="email" name="email" autocomplete="email" required />
          </FieldWrapper>
          <template #actions>
            <Button type="submit" variant="primary" :label="t('product.notifySubmit')">
              {{ t('product.notifySubmit') }}
            </Button>
          </template>
        </FormLayout>
      </Dialog>
    </Container>
  </Section>

  <Section v-else-if="showStatus" spacing="none" :classes="{ root: SECTION_SPACING }">
    <Container width="content">
      <p role="status" class="text-muted">
        {{ productResult.error.value ? t('storefront.error') : t('storefront.loading') }}
      </p>
    </Container>
  </Section>

  <!-- The read answered, and the answer was "there is no such product". Said plainly, before the
       editor hint below, because on a live page this is what a visitor who followed an old link
       sees and the hint is not for them. -->
  <Section v-else-if="notFound" spacing="none" :classes="{ root: SECTION_SPACING }">
    <Container width="content">
      <p role="status" class="text-muted">{{ t('storefront.notFound') }}</p>
    </Container>
  </Section>

  <EditorPlaceholder
    v-else-if="editing"
    :label="t('product.hintLabel')"
    :help="t('product.hintHelp')"
  />
</template>
