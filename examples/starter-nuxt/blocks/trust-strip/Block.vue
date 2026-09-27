<script setup lang="ts">
/**
 * Trust strip: a quiet strip of 3-4 store promises (shipping, returns, secure payment, handmade),
 * each an icon with a short line, with an optional row of accepted payment marks (spec
 * `02-blocks.md` 3837-3939, "Trust strip"). Plain layout only — no `@eldrajs/ui` component beyond
 * `Section`/`Container`/`Link`/`VisuallyHidden`/`EditorPlaceholder`.
 *
 * **Two independent axes, one `<ul>`.** `variant` (`columns` shows icon + title + text, `inline`
 * shows icon + title only) and `mobileLayout` (`grid` wraps below 48rem, `scroll` scrolls sideways
 * below 48rem) both apply to the same list markup rather than branching into separate templates:
 * below 48rem the list is either a 2-column grid or a horizontally scrolling row, and from 48rem
 * (`@tablet:`) every combination converges on the same equal-width row, gaining 1px `border`
 * dividers from 64rem (`@content:`) — see `listClass`/`itemClass` below. Each item is `[icon, div]`:
 * on mobile that stacks (icon above the title/text column), and flipping the outer flex direction
 * to a row at `@tablet:` puts the icon to the left with no change to the DOM — the same trick
 * `stats`'s own `outerClass` and several other rebuilt blocks use for a breakpoint-only layout
 * change (`grid` → `@tablet:flex`, matching the precedent already set by `logo-cloud`'s own list).
 *
 * **The `scroll` mobile layout** bleeds to the container edge with the negative-gutter-margin
 * recipe `tabs`'s own tab row set as the starter's precedent (`--eldra-gutter-mobile`, the same
 * variable `Container.vue` reads for its own mobile gutter), and hides its scrollbar with
 * `eldra-scrollbar-hide` (`@eldrajs/ui`'s own utility, already emitted by this build since the
 * theme's Tailwind entry imports the package's `tailwind.css`). No explicit `role="region"`:
 * axe's `aria-allowed-role` rejects that role on a `<ul>` (it would also strip the list's own
 * implicit role, failing `listitem` for every child) — a focusable, named `<ul>` is the valid shape
 * for a labelled, keyboard-scrollable list, and arrow-key scrolling is the browser's own native
 * behaviour for a focused scrollable element — no script needed, the same shape
 * `useRichTextScrollRegions`' table wrapper relies on.
 *
 * **The extra tab stop exists only while the list is actually scrollable** (spec → Keyboard table:
 * "the scrolling region (**scroll layout only**)"). `mobileLayout: "scroll"` alone is not enough:
 * from `@tablet:` (48rem) the very same list becomes the plain, non-scrolling equal-width row (see
 * above), so `tabindex`/`aria-label`/`focusRing` cannot be tied to `isScrollMobile` alone without
 * leaving an inert tab stop above 48rem — a Vue attribute has no way to read a CSS container query.
 * `isFocusableScrollRegion` instead measures the list's own `scrollWidth`/`clientWidth` (a
 * `ResizeObserver`, set up in `onMounted`/torn down in `onBeforeUnmount`, guarded for an
 * environment with no `ResizeObserver` such as jsdom under Vitest) and is only ever true once the
 * list is both in `scroll` mode and actually wider than its own box.
 *
 * **Payment marks never use brand colour** (controller ruling): `apple-pay` has no Tabler icon, so
 * it renders `brand-apple` while its hidden name still reads "Apple Pay"; the other three map onto
 * their own Tabler brand icon. Every mark is a fixed-size chip with a `text`-toned icon plus a
 * `VisuallyHidden` name, inside a `<ul aria-label="…">` the same way `payments` items name
 * themselves without a label prop of their own (this is a plain `<ul>`, not an `@eldrajs/ui`
 * component, so it takes a literal `aria-label`, not the package's `ariaLabel` prop convention).
 *
 * "The live site renders nothing with no titled item" (spec States → Empty): `renderedItems` caps
 * the list at four (spec: "A fifth is rejected in the editor") and, outside the editor, drops any
 * item with no title; the whole `<Section>` then gates on at least one such item existing. Inside
 * the editor every one of the (capped) items still renders, with an `EditorPlaceholder` standing in
 * for a still-empty one — the same "hint tile in place of empty content" shape `stats`'s and
 * `team`'s own per-item hints use.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Container, EditorPlaceholder, Link, Section, VisuallyHidden } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { focusRing } from '../../app/utils/classes';
import { isInternalHref, safeHref } from '../../app/utils/links';

interface TrustItem {
  icon?: string;
  title?: string;
  text?: string;
  linkLabel?: string;
  href?: string;
}

interface PaymentItem {
  brand?: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'trust-strip'> }>();
const { data } = useBlockData(props, 'trust-strip');
const t = useT();
const isEditing = useEditing();
const headingId = `trust-strip-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'columns');
const isColumns = computed(() => variant.value !== 'inline');

const mobileLayout = computed(() => data.value.mobileLayout ?? 'grid');
const isScrollMobile = computed(() => mobileLayout.value === 'scroll');

const sectionBackground = computed<SectionBackground>(() => data.value.background ?? 'surface');

const listEl = ref<HTMLUListElement | null>(null);
const overflowsHorizontally = ref(false);

function measureListOverflow(): void {
  const el = listEl.value;
  overflowsHorizontally.value = el !== null && el.scrollWidth > el.clientWidth;
}

let listResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  measureListOverflow();
  if (typeof ResizeObserver === 'undefined' || listEl.value === null) return;
  listResizeObserver = new ResizeObserver(() => measureListOverflow());
  listResizeObserver.observe(listEl.value);
});

onBeforeUnmount(() => {
  listResizeObserver?.disconnect();
  listResizeObserver = null;
});

/** See the module doc comment: the extra tab stop exists only while `mobileLayout` is `scroll`
 *  AND the list is actually wider than its own box (i.e. below 48rem — from 48rem the same list
 *  becomes the non-scrolling row and this goes back to `false`). */
const isFocusableScrollRegion = computed(() => isScrollMobile.value && overflowsHorizontally.value);

/** At most four (spec States → "Many items: at most 4."); a fifth never reaches the DOM at all,
 *  editor included, so there is nothing for the editor's own item count to disagree with. */
const cappedItems = computed<TrustItem[]>(() => (data.value.items ?? []).slice(0, 4));

/** A `ResizeObserver` only reports the list's own box changing; the list growing or shrinking
 *  its *content* (an editor adding a third item) changes `scrollWidth` without any resize, so
 *  the measurement is re-run after the DOM settles whenever the rendered items change. */
watch(
  () => [cappedItems.value.length, mobileLayout.value],
  () => {
    void nextTick(measureListOverflow);
  }
);

function hasTitle(item: TrustItem): boolean {
  return (item.title ?? '').trim() !== '';
}

/** Live: only titled items render. Editing: every (capped) item renders, so an untitled one can
 *  show its own hint instead of vanishing while an editor is filling it in. */
const renderedItems = computed<TrustItem[]>(() => {
  if (isEditing.value) return cappedItems.value;
  return cappedItems.value.filter(hasTitle);
});

const showBlock = computed(() => {
  if (cappedItems.value.length === 0) return false;
  return isEditing.value || cappedItems.value.some(hasTitle);
});

function itemHref(item: TrustItem): string | null {
  return safeHref(item.href);
}
function itemHasHref(item: TrustItem): boolean {
  return itemHref(item) !== null;
}
function itemLinkAs(item: TrustItem): typeof EldraRouterLink | undefined {
  const href = itemHref(item);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** Spec → Layout, "Type": title 1rem weight 600 (0.875rem in `inline`), line-height 1.5 — which
 *  makes the 1rem title exactly 1.5rem tall, meeting the item-link target-size criterion (spec →
 *  Acceptance criteria, "Item links are at least 1.5rem tall") with no extra padding. */
const itemTitleClass = computed(() =>
  isColumns.value
    ? 'text-base leading-[1.5] font-semibold'
    : 'text-body-sm leading-[1.5] font-semibold'
);
const itemTextClass = 'text-body-sm leading-[1.5] text-muted';

/** Spec → Layout, mobile `grid`: "each item stacks the icon … then 0.5rem lower the title, then
 *  the text"; 48rem+: "icon to the left of the title and text (0.75rem gap)". Both shapes are the
 *  same `[icon, div]` flex pair, just flipped between column and row — see the module doc comment.
 *  Mobile gaps: `grid` is "gaps 1.5rem × 1rem" (`gap-x-6 gap-y-4`); `scroll` is "1.5rem apart" in
 *  `inline` (`gap-6`) and 1rem in `columns` (`gap-4`, unspecified by the spec's `scroll` bullet —
 *  kept at the same step as `grid`'s own row gap). */
const listClass = computed(() => {
  const mobile = isScrollMobile.value
    ? [
        'flex overflow-x-auto',
        isColumns.value ? 'gap-4' : 'gap-6',
        '-mx-[var(--eldra-gutter-mobile)] px-[var(--eldra-gutter-mobile)]',
        'scroll-px-[var(--eldra-gutter-mobile)]',
        'snap-x snap-mandatory eldra-scrollbar-hide',
      ]
    : isColumns.value
      ? ['grid grid-cols-2 gap-x-6 gap-y-4']
      : ['flex flex-wrap justify-center gap-x-6 gap-y-3'];
  const desktop = [
    '@tablet:mx-0 @tablet:px-0 @tablet:scroll-px-0 @tablet:overflow-visible @tablet:snap-none',
    '@tablet:flex @tablet:flex-row @tablet:flex-wrap',
    isColumns.value ? '@tablet:gap-6' : '@tablet:justify-center @tablet:gap-8',
    '@content:flex-nowrap @content:gap-0',
  ];
  return [...mobile, ...desktop].join(' ');
});

/** From 64rem, 1px `border` dividers with padding each side, none on the outer edges (spec →
 *  Layout, "From 64rem"). A plain `border-l`/`first:border-l-0` pair rather than `divide-x`: no
 *  `divide-*` utility is used anywhere else in this starter to follow as precedent. */
const itemClass = computed(() => {
  const base = ['flex'];
  if (isScrollMobile.value) {
    base.push('shrink-0 snap-start', isColumns.value ? 'w-[62%]' : 'whitespace-nowrap');
  }
  base.push(isColumns.value ? 'flex-col items-start gap-2' : 'flex-row items-center gap-2');
  base.push(
    '@tablet:w-auto @tablet:shrink @tablet:snap-align-none @tablet:whitespace-normal',
    isColumns.value
      ? '@tablet:flex-1 @tablet:flex-row @tablet:items-start @tablet:gap-3'
      : '@tablet:flex-row @tablet:items-center'
  );
  base.push(
    isColumns.value
      ? '@content:border-l @content:border-border @content:first:border-l-0 @content:px-6 @content:first:pl-0 @content:last:pr-0'
      : '@content:border-l @content:border-border @content:first:border-l-0 @content:px-8 @content:first:pl-0 @content:last:pr-0'
  );
  return base.join(' ');
});

const showPayments = computed(() => data.value.showPayments ?? true);
const paymentsLabelText = computed(() => (data.value.paymentsLabel ?? '').trim());
const hasPaymentsLabel = computed(() => paymentsLabelText.value !== '');

const DEFAULT_PAYMENT_BRANDS = ['visa', 'mastercard', 'paypal', 'apple-pay'];

/** Spec ruling (controller): Tabler ships no `brand-apple-pay` icon, so `apple-pay` renders
 *  `brand-apple` — the visually hidden name still says "Apple Pay". */
function paymentIcon(brand: string): string | null {
  switch (brand) {
    case 'visa':
      return 'brand-visa';
    case 'mastercard':
      return 'brand-mastercard';
    case 'paypal':
      return 'brand-paypal';
    case 'apple-pay':
      return 'brand-apple';
    default:
      return null;
  }
}
function paymentName(brand: string): string | null {
  switch (brand) {
    case 'visa':
      return t('trust.visa');
    case 'mastercard':
      return t('trust.mastercard');
    case 'paypal':
      return t('trust.paypal');
    case 'apple-pay':
      return t('trust.applePay');
    default:
      return null;
  }
}

/** Spec Fields table, `payments` row: "Visa, Mastercard, PayPal, Apple Pay" is the default — used
 *  only when the field itself is entirely unset (never once an editor deliberately empties it),
 *  the same "field absent vs. field cleared" distinction every other optional list in this starter
 *  respects. */
const paymentMarks = computed(() => {
  const raw = data.value.payments as PaymentItem[] | undefined;
  const brands = raw === undefined ? DEFAULT_PAYMENT_BRANDS : raw.map((mark) => mark.brand ?? '');
  return brands
    .map((brand) => ({ brand, icon: paymentIcon(brand), name: paymentName(brand) }))
    .filter((mark): mark is { brand: string; icon: string; name: string } => mark.icon !== null);
});
const showPaymentsRow = computed(() => showPayments.value && paymentMarks.value.length > 0);
</script>

<template>
  <Section v-if="showBlock" :background="sectionBackground" spacing="sm" :labelled-by="headingId">
    <Container width="wide">
      <VisuallyHidden as="h2" :id="headingId">{{ t('trust.title') }}</VisuallyHidden>

      <ul
        ref="listEl"
        :class="[listClass, isFocusableScrollRegion ? focusRing : '']"
        :tabindex="isFocusableScrollRegion ? 0 : undefined"
        :aria-label="isFocusableScrollRegion ? t('trust.scrollRegion') : undefined"
      >
        <li v-for="(item, index) in renderedItems" :key="index" :class="itemClass">
          <template v-if="isEditing && !hasTitle(item)">
            <EditorPlaceholder
              inline
              :label="t('trust.itemHintLabel')"
              :help="t('trust.itemHintHelp')"
            />
          </template>
          <template v-else>
            <EldraIcon :name="item.icon" :size="isColumns ? 'lg' : 'md'" class="text-text" />
            <div class="flex min-w-0 flex-col gap-1">
              <Link
                v-if="itemHasHref(item)"
                :href="itemHref(item)!"
                :as="itemLinkAs(item)"
                :aria-label="item.linkLabel || undefined"
                :classes="{ root: itemTitleClass }"
              >
                {{ item.title }}
              </Link>
              <p v-else :class="itemTitleClass">{{ item.title }}</p>
              <p v-if="isColumns && item.text" :class="itemTextClass">{{ item.text }}</p>
            </div>
          </template>
        </li>
      </ul>

      <div
        v-if="showPaymentsRow"
        class="border-border mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-4 border-t pt-6"
      >
        <div v-if="hasPaymentsLabel" class="text-muted flex items-center gap-2">
          <EldraIcon name="lock" size="sm" />
          <span class="text-body-sm">{{ paymentsLabelText }}</span>
        </div>
        <ul class="flex flex-wrap items-center gap-2" :aria-label="t('trust.payments')">
          <li
            v-for="mark in paymentMarks"
            :key="mark.brand"
            class="border-border bg-background flex h-8 w-12 items-center justify-center rounded-sm border"
          >
            <EldraIcon :name="mark.icon" size="lg" class="text-text" />
            <VisuallyHidden>{{ mark.name }}</VisuallyHidden>
          </li>
        </ul>
      </div>
    </Container>
  </Section>
</template>
