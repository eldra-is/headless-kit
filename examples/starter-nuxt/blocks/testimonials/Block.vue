<script setup lang="ts">
/**
 * Customer reviews as a grid of cards, a swipeable carousel or one large featured quote, each with
 * an optional star rating and the product it refers to (spec `02-blocks.md` 1274–1404,
 * "Testimonials"). `variant`:
 *
 *  - `grid`: 1 → 2 → 3 columns of cards, every review visible at once. The spec's own column
 *    breakpoints are 40rem and 60rem of the block's own width — not this package's `@tablet`/
 *    `@content` (48rem/64rem) — so `gridClass` below uses Tailwind's arbitrary `@min-[…]:`
 *    container-query syntax directly rather than the package's three named breakpoints, which
 *    only exist at 48/64/80rem (`--container-tablet`/`-content`/`-wide` in `tailwind.css`). A
 *    single rendered card is centred and capped at 36rem instead of stretching a lone grid cell.
 *  - `carousel`: the same cards inside `@eldrajs/ui`'s `Carousel`. Its own `perView` breakpoints
 *    (`md`/`lg`) are hard-coded to exactly those two package breakpoints — 48rem/64rem, resolved
 *    into inline `--eldra-carousel-per-view-*` custom properties by `useCarousel.ts`'s
 *    `carouselPerViewStyle()` — so, unlike the grid above, there is no way to
 *    honour the spec's literal 40rem/60rem here; `{ base: 1.16, md: 2, lg: 3 }` is this block's own
 *    resolution, deliberately using the component's real 48rem/64rem edges instead.
 *  - `single-large`: the first review only, centred, with a larger quote in the heading font and
 *    the heading itself shrunk to a small label ("Customer review" in the default content).
 *
 * Every review is a `<figure>` with a `<blockquote>` and a `<figcaption>` (`Avatar`, `<cite>` name,
 * the meta line, `Rating`) — one shared shape, written once for `grid`/`carousel`'s card and once
 * more (larger) for `single-large`, the same "one shape, sized differently per variant" split
 * `hero`'s own image/copy markup uses. In `carousel`, each card is wrapped in a plain `<div>` — the
 * default slot's real top-level element `Carousel`'s `useCarousel` annotates as the slide itself
 * (`role="group"`, `aria-roledescription`, `aria-label="n of N"`) — rather than the `<figure>`
 * being that slide directly: axe's `aria-allowed-role` only lets `figure` keep an explicit role
 * once it has a `<figcaption>` child when that role is `doc-example`, never `group` (see the
 * carousel branch's own comment).
 *
 * `Rating`'s own no-reviews state only fires at `count: 0`; passing `count="1"` alongside
 * `showValue={false} showCount={false}` shows just the stars with the one accessible sentence, the
 * same trade `stats`'/the pre-rebuild `testimonials` block already made — the true review count is
 * never modelled by this block's fields, only a 1–5 average per item.
 *
 * On a `primary` section the head (heading/summary/link) and each review's stars invert through
 * `Section`'s own `group-data-[section=primary]/section:` mechanism (`Link`/`RatingStars`'s own
 * copy of it) — but the spec also says "cards stay light, with normal colours inside" for
 * `grid`/`carousel`, and that mechanism has no idea a card sits in between: it matches the
 * *nearest* `.group/section` ancestor, not by DOM distance or intervening background colour. Each
 * card is therefore marked `class="group/section"` itself, with no `data-section` — the same
 * "mark a surface by hand" tool `cta`'s own accent `banner` panel uses to *start* a new inverted
 * scope, used here in reverse to *stop* one, so a card's own `Rating`/product `Link` never read the
 * outer primary section at all. `single-large` has no such card (the review sits directly on the
 * section's own ground), so its `Rating` is deliberately left to invert normally — the one place in
 * this package's whole component set where that on-primary star/link inversion actually renders
 * (see `RatingStars.vue`'s own comment: "inert until a coloured `Section` … provides the group").
 * `text`/`muted` are plain fixed tokens with no such mechanism (`stats`'s own doc comment); the
 * heading, the quote and the name all carry no colour class of their own — inside a card that
 * inherits `text-text` from the card's own explicit `bg-surface`/`bg-background` (see
 * `cardBackgroundClass`), directly on the ground everywhere else — so they simply inherit the
 * right one, and
 * only the two genuinely `muted` parts (`summary`, the plain-text meta line) branch on `isInverted`.
 */
import { computed } from 'vue';
import { Avatar, Carousel, Container, EditorPlaceholder, Link, Rating, Section } from '@eldrajs/ui';
import type { ContainerWidth, SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'testimonials'> }>();
const { data } = useBlockData(props, 'testimonials');
const t = useT();
const isEditing = useEditing();
const headingId = `testimonials-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'grid');
const isCarousel = computed(() => variant.value === 'carousel');
const isSingleLarge = computed(() => variant.value === 'single-large');

/** `single-large` defaults to `surface` (spec "Testimonials" → Fields, `sectionBackground` row);
 *  every other variant defaults to `none`, same shape as `hero`'s own variant-dependent default. */
const sectionBackground = computed<SectionBackground>(
  () => data.value.sectionBackground ?? (isSingleLarge.value ? 'surface' : 'none')
);
const isInverted = computed(() => sectionBackground.value === 'primary');
const containerWidth = computed<ContainerWidth>(() => (isSingleLarge.value ? 'content' : 'wide'));

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

/**
 * Only labels the outer `Section` for `grid`/`single-large`: `carousel`'s own `Carousel` below
 * already renders a named `role="region"` (`aria-label` — see `carouselAriaLabel`), and naming the
 * `Section` too would give two nested landmarks an identical accessible name (axe
 * `landmark-unique`) — the same reasoning `hero`'s `split-carousel` variant uses. `as="section"`
 * keeps the root a real, `@container`-bearing `<section>` regardless of which branch is active.
 */
const sectionLabelledBy = computed(() => (isCarousel.value ? undefined : headingId));
const carouselAriaLabel = computed(() => heading.value || t('testimonials.carousel'));
/** Bound below as `:ariaLabel` (camelCase), not `:aria-label` — see `blocks/hero/Block.vue`'s own
 *  `carouselAriaLabel` comment: `Carousel`'s `ariaLabel` is a *required* prop, and the kebab→camel
 *  prop match Vue applies to a bound attribute is a runtime-only behaviour, invisible to
 *  `nuxi typecheck`'s template type-checking. */

/** `summary`/`linkLabel`/`linkHref` are not shown in `single-large` (spec's field table, both
 *  rows: "Not shown in single-large"). */
const summary = computed(() => (isSingleLarge.value ? '' : (data.value.summary ?? '').trim()));
const hasSummary = computed(() => summary.value !== '');

const linkHref = computed(() => (isSingleLarge.value ? null : safeHref(data.value.linkHref)));
const hasLink = computed(() => Boolean(data.value.linkLabel) && linkHref.value !== null);
const linkAs = computed(() =>
  linkHref.value !== null && isInternalHref(linkHref.value) ? EldraRouterLink : undefined
);

const hasHead = computed(
  () =>
    !isSingleLarge.value &&
    (hasHeading.value || hasSummary.value || hasLink.value || showHeadingHint.value)
);

interface TestimonialItem {
  quote?: string;
  name?: string;
  meta?: string;
  avatar?: { url?: string } | null;
  rating?: string;
  productHref?: string;
}

function isItemEmpty(item: TestimonialItem): boolean {
  return (item.quote ?? '').trim() === '' && (item.name ?? '').trim() === '';
}

const allItems = computed<TestimonialItem[]>(() => data.value.items ?? []);
/** Live: only reviews with content render (Global Constraints, "Editor vs live"); editing: every
 *  review renders, so an empty one shows its own hint instead of vanishing — Studio seeds exactly
 *  one blank repeater item on insert (spec States → Empty: "the first testimonial"). */
const renderedItems = computed(() =>
  isEditing.value ? allItems.value : allItems.value.filter((item) => !isItemEmpty(item))
);
/** Spec "Testimonials" → Variants, `grid` row: "A single item is centred at max 36rem." */
const isSingleItem = computed(
  () => !isCarousel.value && !isSingleLarge.value && renderedItems.value.length === 1
);

const firstItem = computed<TestimonialItem | undefined>(() => allItems.value[0]);
const showFirstItemHint = computed(
  () => isEditing.value && (firstItem.value === undefined || isItemEmpty(firstItem.value))
);

/** `rating`'s stored value is the select's string option (`"none"` | `"1"`–`"5"`); `"none"` (and a
 *  freshly-inserted item's unset value) hides the row entirely (spec States: "No rating: the
 *  rating row is omitted"). */
function ratingValue(item: TestimonialItem): number | null {
  const raw = item.rating;
  if (raw === undefined || raw === 'none') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Spec "Testimonials" → Field → layout mapping: "meta → the meta line (a link when product is
 *  set)" — gated on `productHref` alone, not on `productLabel`, which is stored for Studio's own
 *  product picker and never rendered directly. */
function metaHref(item: TestimonialItem): string | null {
  return safeHref(item.productHref);
}
function metaLinkAs(item: TestimonialItem) {
  const href = metaHref(item);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** See the module doc comment's `gridClass` note: 40rem/60rem are the spec's own literal numbers,
 *  not this package's `@tablet`/`@content` (48rem/64rem). */
const GRID_CLASS =
  'grid grid-cols-1 gap-4 @min-[40rem]:grid-cols-2 @min-[60rem]:grid-cols-3 @min-[60rem]:gap-6';

/** Spec "Testimonials" → Card: "`surface` fill (`background` when the section is `surface` or
 *  `surface-strong`)" — keeps a card visible against a ground that is itself `surface`-toned. */
const cardBackgroundClass = computed(() =>
  sectionBackground.value === 'surface' || sectionBackground.value === 'surface-strong'
    ? 'bg-background'
    : 'bg-surface'
);
</script>

<template>
  <Section
    :background="sectionBackground"
    spacing="md"
    as="section"
    :labelled-by="sectionLabelledBy"
  >
    <Container :width="containerWidth">
      <!-- grid / carousel: heading + summary left, link right -->
      <div v-if="hasHead" class="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div class="max-w-[40rem]">
          <h2
            v-if="hasHeading"
            :id="headingId"
            class="font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
          >
            {{ heading }}
          </h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('testimonials.headingHintLabel')"
            :help="t('testimonials.headingHintHelp')"
          />
          <p v-if="hasSummary" class="mt-2 text-base" :class="isInverted ? '' : 'text-muted'">
            {{ summary }}
          </p>
        </div>
        <Link
          v-if="hasLink"
          :href="linkHref!"
          :as="linkAs"
          variant="standalone"
          arrow
          :underline="false"
        >
          {{ data.linkLabel }}
        </Link>
      </div>

      <!-- single-large: the first review only -->
      <div
        v-if="isSingleLarge"
        class="mx-auto flex max-w-[36rem] flex-col items-center gap-6 text-center"
      >
        <h2
          v-if="hasHeading"
          :id="headingId"
          class="text-[0.875rem] font-semibold"
          :class="isInverted ? '' : 'text-muted'"
        >
          {{ heading }}
        </h2>
        <EditorPlaceholder
          v-else-if="showHeadingHint"
          :id="headingId"
          inline
          :label="t('testimonials.headingHintLabel')"
          :help="t('testimonials.headingHintHelp')"
        />

        <figure
          v-if="firstItem && !isItemEmpty(firstItem)"
          class="flex flex-col items-center gap-6"
        >
          <Rating
            v-if="ratingValue(firstItem!) !== null"
            :value="ratingValue(firstItem!)!"
            size="lg"
            :count="1"
            :show-value="false"
            :show-count="false"
          />
          <blockquote
            class="font-heading @tablet:text-[1.75rem] max-w-[36ch] text-[1.375rem] leading-[1.35] font-medium tracking-[-0.01em] text-balance"
          >
            “{{ firstItem!.quote }}”
          </blockquote>
          <figcaption class="flex items-center gap-3 text-left">
            <Avatar :src="firstItem!.avatar?.url" :name="firstItem!.name" size="lg" />
            <div class="min-w-0">
              <cite class="block text-base font-semibold not-italic">{{ firstItem!.name }}</cite>
              <Link
                v-if="firstItem!.meta && metaHref(firstItem!) !== null"
                :href="metaHref(firstItem!)!"
                :as="metaLinkAs(firstItem!)"
                class="text-[0.875rem]"
              >
                {{ firstItem!.meta }}
              </Link>
              <span
                v-else-if="firstItem!.meta"
                class="block text-[0.875rem]"
                :class="isInverted ? '' : 'text-muted'"
              >
                {{ firstItem!.meta }}
              </span>
            </div>
          </figcaption>
        </figure>
        <EditorPlaceholder
          v-else-if="showFirstItemHint"
          inline
          :label="t('testimonials.itemHintLabel')"
          :help="t('testimonials.itemHintHelp')"
        />
      </div>

      <!-- carousel: the same cards inside Carousel -->
      <Carousel
        v-else-if="isCarousel"
        :ariaLabel="carouselAriaLabel"
        controls="below"
        counter
        :dots="false"
        draggable
        :per-view="{ base: 1.16, md: 2, lg: 3 }"
      >
        <!--
          The slide (this `<div>`, annotated `role="group"`/`aria-roledescription="slide"` by
          `useCarousel` since it isn't an `<li>`) has to be a different element from the review's
          own `<figure>`: axe's `aria-allowed-role` only allows `figure` to keep its *implicit*
          role once it has a `<figcaption>` child — an explicit `role="group"` on that same element
          is flagged (axe-core's `figure` role data: `allowedRoles: ['doc-example']` whenever
          `hasChild: 'figcaption'`, `true` only for a plain `figure`). The `<figure>` inside keeps
          its own default role untouched.
        -->
        <div v-for="(item, index) in renderedItems" :key="index" class="h-full">
          <figure
            class="group/section flex h-full flex-col gap-5 rounded-lg p-6"
            :class="cardBackgroundClass"
          >
            <template v-if="isEditing && isItemEmpty(item)">
              <EditorPlaceholder
                inline
                :label="t('testimonials.itemHintLabel')"
                :help="t('testimonials.itemHintHelp')"
              />
            </template>
            <template v-else>
              <Rating
                v-if="ratingValue(item) !== null"
                :value="ratingValue(item)!"
                size="md"
                :count="1"
                :show-value="false"
                :show-count="false"
              />
              <blockquote class="text-text flex-1 text-[1.125rem] leading-[1.55]">
                {{ item.quote }}
              </blockquote>
              <figcaption class="flex items-center gap-3 text-[0.875rem] leading-[1.4]">
                <Avatar :src="item.avatar?.url" :name="item.name" size="md" />
                <div class="min-w-0">
                  <cite class="text-text block font-semibold not-italic">{{ item.name }}</cite>
                  <Link
                    v-if="item.meta && metaHref(item) !== null"
                    :href="metaHref(item)!"
                    :as="metaLinkAs(item)"
                    tone="muted"
                  >
                    {{ item.meta }}
                  </Link>
                  <span v-else-if="item.meta" class="text-muted block">{{ item.meta }}</span>
                </div>
              </figcaption>
            </template>
          </figure>
        </div>
      </Carousel>

      <!-- grid -->
      <div v-else :class="GRID_CLASS">
        <figure
          v-for="(item, index) in renderedItems"
          :key="index"
          class="group/section flex h-full flex-col gap-5 rounded-lg p-6"
          :class="[cardBackgroundClass, isSingleItem ? 'mx-auto w-full max-w-[36rem]' : '']"
        >
          <template v-if="isEditing && isItemEmpty(item)">
            <EditorPlaceholder
              inline
              :label="t('testimonials.itemHintLabel')"
              :help="t('testimonials.itemHintHelp')"
            />
          </template>
          <template v-else>
            <Rating
              v-if="ratingValue(item) !== null"
              :value="ratingValue(item)!"
              size="md"
              :count="1"
              :show-value="false"
              :show-count="false"
            />
            <blockquote class="text-text flex-1 text-[1.125rem] leading-[1.55]">
              {{ item.quote }}
            </blockquote>
            <figcaption class="flex items-center gap-3 text-[0.875rem] leading-[1.4]">
              <Avatar :src="item.avatar?.url" :name="item.name" size="md" />
              <div class="min-w-0">
                <cite class="text-text block font-semibold not-italic">{{ item.name }}</cite>
                <Link
                  v-if="item.meta && metaHref(item) !== null"
                  :href="metaHref(item)!"
                  :as="metaLinkAs(item)"
                  tone="muted"
                >
                  {{ item.meta }}
                </Link>
                <span v-else-if="item.meta" class="text-muted block">{{ item.meta }}</span>
              </div>
            </figcaption>
          </template>
        </figure>
      </div>
    </Container>
  </Section>
</template>
