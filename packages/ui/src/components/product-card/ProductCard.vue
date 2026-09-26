<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useMessages } from '../../composables/useMessages';
import Image from '../image/Image.vue';
import Price from '../price/Price.vue';
import Rating from '../rating/Rating.vue';
import Badge from '../badge/Badge.vue';
import StockBadge from '../badge/StockBadge.vue';
import Button from '../button/Button.vue';
import Skeleton from '../skeleton/Skeleton.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type { ProductCardProduct, ProductCardProps } from './types';

const props = withDefaults(defineProps<ProductCardProps>(), {
  showVendor: false,
  showRating: true,
  showSwatches: true,
  quickAdd: true,
  ratio: '4x5',
  headingLevel: 3,
  loading: false,
  currency: undefined,
  locale: undefined,
  as: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  /** Spec "Product card" → Events: "`quickAdd`: fires with the product when the quick-add button
   * is activated. The result is announced by the cart Toast (`role="status"`)." — announcing the
   * outcome is the caller's own responsibility (this package's Toast lands in a later task). */
  quickAdd: [product: ProductCardProduct];
}>();

const messages = useMessages();

/** Spec "Product card" → Variants, "Sold out" row. Drives the media opacity, the badge-stack
 * outline "Sold out" badge, and the quick-add area's disabled state. */
const isSoldOut = computed(() => props.product.available === false);

/**
 * The caller's own sale/new decision (spec anatomy part 2), per `ProductCardProduct.badge`'s own
 * comment: the spec's "derived automatically ... when tagged `new`" needs a tag vocabulary this
 * component's type does not carry, so the badge's *presence* is trusted from the caller rather
 * than re-derived from `price`/tags. Suppressed while sold out — Task 1's own acceptance
 * criterion ("a third badge is never rendered") and the spec's own sold-out row, which names only
 * the outline "Sold out" badge.
 */
const badgeKind = computed(() => (isSoldOut.value ? null : (props.product.badge?.variant ?? null)));

/**
 * The sale badge's own percentage text (spec "Product card" → Behaviour: "badge reads the
 * rounded percentage, '−20%'"), derived from `price` regardless of what `badgeKind` itself came
 * from — the same `compareAt > amount` rule `Price`'s own `isSale` uses, so the two never
 * disagree about whether there is a discount to report.
 */
const discountPercent = computed(() => {
  const { amount, compareAt } = props.product.price;
  if (compareAt == null || compareAt <= amount) return 0;
  return Math.round(((compareAt - amount) / compareAt) * 100);
});

/** `Rating` is hidden whenever the product has none to show, regardless of `showRating` (spec:
 * "Hide when the store has no reviews at all"). */
const showRatingResolved = computed(() => props.showRating && props.product.rating != null);
const ratingValue = computed(() => props.product.rating?.value ?? 0);
const ratingCount = computed(() => props.product.rating?.count ?? 0);

/**
 * An additional stock status line beyond the spec's own 8-part anatomy, which draws no row for
 * `ProductCardProduct.stock` at all. It exists so that field — and the `StockBadge` half of this
 * task's "Composes ... Badge/StockBadge ..." brief — has a real use beyond the sold-out badge
 * (which is a plain `Badge`, not `StockBadge` — see that computed's own comment): a caller with a
 * more granular signal than plain `available` (low stock, a pre-order date) renders it as its own
 * line above the quick-add control, in the same place a "Only 3 left" line sits on most storefront
 * cards. Suppressed while sold out, where the disabled quick-add button already carries the same
 * "unavailable" meaning and a second line would repeat it.
 */
const showStockLine = computed(() => props.product.stock != null && !isSoldOut.value);
const stockLevel = computed(() => props.product.stock ?? 'in');

const swatches = computed(() => props.product.colours ?? []);
const showSwatchesResolved = computed(() => props.showSwatches && swatches.value.length > 0);
/** Spec "Product card" → Anatomy, part 7: "up to three dots + '+N'". */
const visibleSwatches = computed(() => swatches.value.slice(0, 3));
const overflowCount = computed(() => Math.max(0, swatches.value.length - 3));

/** `as` follows `Link`/`Rating`'s own contract: a string tag still takes `href`, a component
 * takes the destination as `to`. */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');
const linkAttrs = computed(() =>
  isComponentAs.value ? { to: props.product.url } : { href: props.product.url }
);
const headingTag = computed(() => `h${props.headingLevel}`);

/**
 * The quick-add button's full accessible name (spec "Product card" → Accessibility: "Quick add
 * names the product: 'Quick add' + hidden ' Merino crew sweater'"), applied as the rendered
 * `<Button>`'s `aria-label` below rather than assembled from visible + visually-hidden content.
 *
 * `Button` only turns its own `label` prop into `aria-label` for `iconOnly`/`loading` buttons
 * (see `Button.vue`), so a plain `aria-label` attribute passed here falls through as an ordinary
 * (non-`class`/`style`) attribute — and Vue's fallthrough-attribute merge applies *after* the
 * component's own template bindings, so it replaces `Button`'s own `:aria-label="ariaLabel"`
 * (`undefined` for a plain outline button) outright. Confirmed empirically against this exact
 * component before relying on it. This is also why the name is a whole-sentence function message
 * rather than the visible `quickAddLabel` plus a raw title glued on: `is-IS`'s own translation
 * puts the product name in the *middle* of the sentence ("Setja {title} í körfu"), which content
 * splicing (visible text + a trailing hidden run) cannot express for every locale, only English's
 * own word order.
 */
const quickAddName = computed(() => messages.value.quickAdd(props.product.title));

function onQuickAdd(): void {
  emit('quickAdd', props.product);
}

/**
 * Spec "Product card" → Sizes, Card row: "fills its grid column; minimum 14rem recommended."
 * `rounded-lg` gives the proxy focus ring's outline/box-shadow the same corner radius as the
 * media frame below (spec "Product card" → Accessibility, 2.4.7: "the ring is drawn around the
 * whole card ... because the link's own outline would only wrap the title"; Acceptance: "with
 * `radius-lg` corners"). `group` is read by the media's own hover-zoom below — plain `:hover` on
 * this element already fires whenever the pointer is over ANY descendant, including the title
 * link's card-covering `::after` (see `linkClass`), so no `:has()`/`group-has-*` trick is needed.
 */
const rootClass = computed(() =>
  partClass(
    cx('group relative flex h-full min-w-56 flex-col rounded-lg eldra-focus eldra-focus-proxy'),
    props.classes,
    'root'
  )
);

/** The media's own positioning context for the absolutely placed badge stack (spec "Product
 * card" → Sizes, "Badge stack" row). */
const mediaClass = computed(() => partClass('relative', props.classes, 'media'));

/**
 * `Image`'s own `media` part (the `<img>`/`<video>`, not `Image`'s root) — passed through
 * `Image`'s `classes` prop rather than a bare `class` attribute on `<Image>`, because `Image.vue`
 * merges a bare `class` into its own *root* (`partClass(cx('block', attrs.class), ...)`), not the
 * media element, which would scale the whole frame (and its rounded corners) on hover instead of
 * the picture inside it. Spec "Product card" → Behaviour & motion: "Image zoom on hover: transform
 * over `duration-base`, `ease-out`, scaling from the image's focal point" — from the image's
 * *centre* here, not a per-image focal point: `ProductCardProduct` carries no focal data for the
 * card to read (see the README's Deviations entry). "Removed with reduced motion (instant)":
 * `motion-reduce:transition-none` removes the animation, the scale itself still applies instantly.
 * Sold out (spec States, "Sold out" row: "image at 60% opacity") composes alongside it.
 */
const imageMediaClass = computed(() =>
  cx(
    'transition-transform duration-base ease-out group-hover:scale-[1.03] motion-reduce:transition-none',
    isSoldOut.value && 'opacity-60'
  )
);

/**
 * Spec "Product card" → Sizes, "Badge stack" row: "top and left 0.75rem, gap 0.25rem, wraps."
 * `z-10` keeps it above the media (and, incidentally, above the title link's stretched `::after`,
 * though badges are never inside its box in normal flow anyway).
 */
const badgesClass = computed(() =>
  partClass('absolute left-3 top-3 z-10 flex flex-wrap gap-1', props.classes, 'badges')
);

/**
 * Spec "Product card" → Behaviour: "Body (3–7) grows to fill the card so every card in a row
 * aligns its quick-add button." `flex-1` is what makes that true once the card's own root is
 * stretched to a row's tallest sibling (a CSS grid with `items-stretch`, the default). Gap
 * (spec "Product card" → Sizes, "Body gap" row: "0.25rem").
 */
const bodyClass = computed(() =>
  partClass('mt-3 flex flex-1 flex-col gap-1', props.classes, 'body')
);

const vendorClass = computed(() => partClass('text-caption text-muted', props.classes, 'vendor'));

/** Spec "Product card" → Sizes, "Title" row: "1rem, line-height 1.4, weight 600, clamp 2 lines" —
 * exactly `text-card-title` (`tailwind.css`), reused rather than a near-duplicate utility. */
const titleClass = computed(() =>
  partClass('text-card-title text-text line-clamp-2', props.classes, 'title')
);

/**
 * The stretched link (spec "Product card" → Anatomy, part 4; → Accessibility, 2.4.7). `after:` is
 * `position: absolute; inset: 0` with no `position: relative` of its own, so it anchors to the
 * nearest *positioned* ancestor — `root` above — covering the whole card rather than only this
 * `<a>`'s own text box; giving this element `relative` too would break that by anchoring the
 * pseudo-element to itself instead. `hover:underline` only visibly affects the text (the
 * pseudo-element carries no content of its own), matching the States table's "title underlined
 * 1px" row exactly, even though the *hit area* the hover reads from is the whole card.
 * `outline-hidden` suppresses the native focus ring: the visible one is `root`'s proxy ring
 * above, not this element's own.
 */
const linkClass = computed(() =>
  partClass(
    'text-text no-underline outline-hidden hover:underline decoration-1 underline-offset-[0.2em] after:absolute after:inset-0',
    props.classes,
    'link'
  )
);

const priceClass = computed(() => partClass('', props.classes, 'price'));
const ratingClass = computed(() => partClass('', props.classes, 'rating'));
const stockLineClass = computed(() => partClass('', props.classes, 'stockLine'));

const swatchesClass = computed(() =>
  partClass('flex items-center gap-1.5', props.classes, 'swatches')
);

/** Spec "Product card" → Sizes, "Colour dots" row: "0.875rem circles ... a 1px inset hairline
 * (`text` at 25% strength) so pale colours stay visible" (Accessibility, 1.4.11). A real border,
 * not a `box-shadow`, for the same forced-colours reason `VariantPicker`'s own swatch edge is a
 * real border rather than a shadow. The one per-item colour the spec allows (`swatch`, from
 * product data) is set as an inline style by the template, never a class. */
const swatchClass = computed(() =>
  partClass('size-3.5 shrink-0 rounded-full border border-text/25', props.classes, 'swatch')
);

/** Spec "Product card" → Sizes, "Colour dots" row: "'+N' (0.8125rem, `muted`)" — `text-caption`
 * is exactly that size. */
const swatchOverflowClass = computed(() =>
  partClass('text-caption text-muted', props.classes, 'swatchOverflow')
);

/**
 * Spec "Product card" → Sizes, "Quick add" row: "extra 0.5rem (`space-2`) above" — on top of the
 * standard 0.75rem (`space-3`) rhythm the rest of the card uses between `media`/`body`, so
 * `mt-5` (1.25rem = 0.75rem + 0.5rem) rather than a second, separately-tracked margin.
 *
 * `relative z-10` (task brief): the quick-add control sits above the title link's card-covering
 * `::after` (which carries no `z-index` of its own, so the browser's default stacking order would
 * otherwise let source order decide, and the link is later in the DOM here) — this is what makes
 * "clicking quick add never navigates" true regardless of DOM order.
 */
const quickAddClass = computed(() => partClass('relative z-10 mt-5', props.classes, 'quickAdd'));

/**
 * The loading root's own class (spec "Product card" → Variants, Loading row). The loading branch
 * in the template below renders a plain `<div role="group">`, not `<article role="group">`: the
 * ARIA-in-HTML spec's allowed-roles table does not permit `group` on `<article>` (axe's
 * `aria-allowed-role` rule catches it), and there is no real article content to justify the tag
 * while loading anyway. A stray HTML comment was deliberately not left beside that `<div>` in the
 * template either — with `v-if`/`v-else` as the only two top-level nodes, Vue collapses them into
 * one conditional root and `wrapper.element` (and every `data-v-app` mount) is that element
 * directly; a sibling comment node there turns the whole template into a genuine multi-root
 * Fragment instead, and every one of those becomes the *mount container* `<div>` for the purposes
 * of `wrapper.element`/`.classes()`, not the card's own root — confirmed the hard way while
 * writing this component's own tests, which is why the explanation lives here instead.
 */
const skeletonClass = computed(() => partClass('flex h-full flex-col', props.classes, 'skeleton'));
</script>

<template>
  <div
    v-if="loading"
    data-part="root"
    :class="rootClass"
    role="group"
    aria-busy="true"
    :aria-label="messages.loadingProduct"
  >
    <div data-part="skeleton" :class="skeletonClass">
      <Skeleton variant="media" :ratio="ratio" />
      <div class="mt-3 flex flex-1 flex-col gap-1">
        <Skeleton variant="text" :classes="{ line: 'w-[80%]' }" />
        <Skeleton variant="text" :classes="{ line: 'w-[35%]' }" />
        <Skeleton variant="text" :classes="{ line: 'w-[50%]' }" />
      </div>
      <Skeleton variant="btn" class="mt-5" />
    </div>
  </div>

  <article v-else data-part="root" :class="rootClass">
    <div data-part="media" :class="mediaClass">
      <Image
        :media="product.featuredImage"
        :decorative="!product.featuredImage"
        :ratio="ratio"
        rounded="lg"
        :classes="{ media: imageMediaClass }"
      />
      <div v-if="badgeKind || isSoldOut" data-part="badges" :class="badgesClass">
        <Badge
          v-if="badgeKind === 'sale'"
          variant="sale"
          :label="`−${discountPercent}%`"
          hidden-suffix=" off"
        />
        <Badge v-else-if="badgeKind === 'new'" variant="new" :label="messages.newBadge" />
        <Badge v-if="isSoldOut" outline :label="messages.soldOut" />
      </div>
    </div>

    <div data-part="body" :class="bodyClass">
      <p v-if="showVendor && product.vendor" data-part="vendor" :class="vendorClass">
        {{ product.vendor }}
      </p>
      <component :is="headingTag" data-part="title" :class="titleClass">
        <component :is="as ?? 'a'" data-part="link" :class="linkClass" v-bind="linkAttrs">{{
          product.title
        }}</component>
      </component>
      <Price
        data-part="price"
        :class="priceClass"
        :amount="product.price.amount"
        :compare-at="product.price.compareAt"
        :from="product.price.from"
        size="sm"
        :currency="currency"
        :locale="locale"
      />
      <Rating
        v-if="showRatingResolved"
        data-part="rating"
        :class="ratingClass"
        :value="ratingValue"
        :count="ratingCount"
      />
      <StockBadge
        v-if="showStockLine"
        data-part="stockLine"
        :class="stockLineClass"
        :level="stockLevel"
      />
      <template v-if="showSwatchesResolved">
        <div data-part="swatches" :class="swatchesClass" aria-hidden="true">
          <span
            v-for="colour in visibleSwatches"
            :key="colour.name"
            data-part="swatch"
            :class="swatchClass"
            :style="{ backgroundColor: colour.swatch }"
          />
          <span v-if="overflowCount > 0" data-part="swatchOverflow" :class="swatchOverflowClass"
            >+{{ overflowCount }}</span
          >
        </div>
        <VisuallyHidden>{{ messages.swatchesAvailable(swatches.length) }}</VisuallyHidden>
      </template>
    </div>

    <Button
      v-if="quickAdd && !isSoldOut"
      data-part="quickAdd"
      variant="outline"
      size="md"
      block
      type="button"
      :class="quickAddClass"
      :aria-label="quickAddName"
      @click="onQuickAdd"
      >{{ messages.quickAddLabel }}</Button
    >
    <Button
      v-else-if="quickAdd && isSoldOut"
      data-part="quickAdd"
      variant="outline"
      size="md"
      block
      disabled
      type="button"
      :class="quickAddClass"
      >{{ messages.soldOut }}</Button
    >
  </article>
</template>
