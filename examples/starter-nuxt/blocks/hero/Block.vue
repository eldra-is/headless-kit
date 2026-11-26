<script setup lang="ts">
/**
 * The first block on a landing page: a large heading with a short pitch, one or two buttons and a
 * strong product image (spec `02-blocks.md` "Hero", lines 601–743). `variant`:
 *
 *  - `image-right` / `image-left`: two equal columns from 64rem (copy + a square image), stacked
 *    with the image first below that.
 *  - `image-background`: a full-bleed image behind a full `overlay` scrim, copy bottom-left. The
 *    `Section` itself takes `background="primary"` once there is an image — `@eldrajs/ui`'s own
 *    `data-section="primary"` inversion is what inverts `Button` (and, via
 *    `Section`'s base `text-primary-contrast`, the plain copy text) onto the scrim, so nothing
 *    here hand-rolls the inversion. With no image yet (`mock.json` never seeds media — see
 *    `docs/starter-kit.md`) there is nothing to scrim, so the ground falls back to
 *    `surface-strong` with ordinary text instead of `primary-contrast` on nothing.
 *  - `centered`: centred copy above a wide image (4:3 → 21:9 → 3:1).
 *  - `split-carousel`: copy in a `5fr` column beside `@eldrajs/ui`'s `Carousel` in `7fr`, one 4:5
 *    slide per `slides[]` item.
 *  - `card`: one wide photo (21:9) with the copy on a `background` card overlapping its
 *    bottom-left corner, and an optional small caption link on the photo (`captionLabel`,
 *    `captionDetail`, `captionHref` — "Glazed milk jug $34", a shoppable caption). Below 1101px
 *    of block width the card leaves the photo and sits under it, pulled up over its bottom edge
 *    (16:10 photo; 4:5 below 761px), and the caption moves to the photo's top-right corner. The
 *    copy comes before the photo in the DOM, so the heading is still the first thing read; `order`
 *    puts the photo above it, and from 1101px the card is positioned over the photo.
 *
 * The copy (eyebrow, heading, subheading, buttons) is the same shape in every variant, so it is
 * written once below; only the surrounding grid/flex wrapper and the media alongside it differ per
 * variant (`outerClass`/`copyClass` computed from `variant`).
 *
 * The `actions` slot is filled by `EldraLayout` when a `cta` block is placed in this hero's
 * declared `actions` zone; the built-in buttons below are the fallback shown when the slot is
 * empty (`block.json`'s `slots[0]`, unchanged from version 1).
 */
import { computed } from 'vue';
import { Button, Carousel, Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import type { SectionBackground, SectionSpacing } from '@eldrajs/ui';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useI18n } from 'vue-i18n';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import UiImage from '../../app/components/ui/UiImage.vue';
import EldraIcon from '../../app/components/EldraIcon.vue';

const props = defineProps<{ entry: EldraBlockEntry<'hero'> }>();
const { data, entryId } = useBlockData(props, 'hero');
const editing = useEditing();
const { t } = useI18n();
const headingId = `hero-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'image-right');
const isImageRight = computed(() => variant.value === 'image-right');
const isImageColumnVariant = computed(
  () => variant.value === 'image-right' || variant.value === 'image-left'
);
const isImageBackground = computed(() => variant.value === 'image-background');
const isCentered = computed(() => variant.value === 'centered');
const isSplitCarousel = computed(() => variant.value === 'split-carousel');
const isCard = computed(() => variant.value === 'card');

const hasImage = computed(() => Boolean(data.value.image));
/** `image-background` only gets the scrim + inverted copy once there is an actual image to scrim
 *  over — see the module doc comment above. */
const hasScrimImage = computed(() => isImageBackground.value && hasImage.value);
const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);
const slides = computed(() => data.value.slides ?? []);
const hasSlides = computed(() => slides.value.length > 0);

/**
 * Only a heading that actually renders can label the section (an editor-only empty-state hint
 * replaces the `<h1>` — see the template — and must never leave `aria-labelledby` dangling).
 *
 * `split-carousel` additionally skips it even with a heading: `Carousel` already renders its own
 * named `role="region"` (`aria-label` set to this same heading, see `carouselAriaLabel` below),
 * and naming the outer `Section` too would give two nested landmarks an identical accessible name
 * (axe `landmark-unique`) — the same reasoning `testimonials`' own carousel variant uses.
 */
const sectionLabelledBy = computed(() =>
  data.value.heading && !isSplitCarousel.value ? headingId : undefined
);

/** Section background: `none` normally, `primary` for
 *  `image-background` with an image (so the package's own section-inversion mechanism takes over
 *  the copy and buttons), `surface-strong` for `image-background` with no image yet. */
const sectionBackground = computed<SectionBackground>(() => {
  if (!isImageBackground.value) return 'none';
  return hasImage.value ? 'primary' : 'surface-strong';
});
/** `image-background` sets its own padding (`outerClass` below) instead of the `spacing` field's
 *  section padding. */
const sectionSpacing = computed<SectionSpacing>(() =>
  isImageBackground.value || isCard.value ? 'none' : (data.value.spacing ?? 'md')
);
/** `card` sits close under the header (1.5rem, 0.75rem below 761px) and keeps a `section-sm` step
 *  below it, so a following block on the same ground — whose top padding the package drops for
 *  adjacent same-ground sections — still starts a step clear of the photo. */
const sectionRootClass = computed(() => {
  if (isImageBackground.value) return 'relative overflow-hidden';
  if (isCard.value) return 'pt-3 @min-[47.5625rem]:pt-6 pb-[var(--eldra-section-sm)]';
  return '';
});
const containerWidth = computed(() => (isCentered.value ? 'content' : 'wide'));

/**
 * The wrapper around copy + media, one per variant:
 *  - `image-right`/`image-left`: a two-column grid from 64rem (2rem/4rem gaps) — collapses to a
 *    single column with no image to share the row with (spec "No image" row).
 *  - `centered`: a plain block; the image (if any) follows with its own top margin.
 *  - `split-carousel`: a `5fr`/`7fr` grid from 64rem — collapses to a single column with no
 *    slides yet.
 *  - `image-background`: no media alongside the copy (the background image sits behind `Section`
 *    instead — see the template) — its own min-height/padding pins the copy to the bottom (spec
 *    "Hero" → Layout, `image-background`: "min height 34rem (38rem from 64rem)", "`section-md` top
 *    and 3rem bottom padding. From 64rem: min height 38rem, 7rem top and 4rem bottom padding.").
 *    Applied here (the copy `Container`'s child), not on `Section`, so the block's rendered height
 *    falls out of ordinary flow; the background `UiImage`/scrim then size against that height
 *    through `Section`'s own `position: relative`. `justify-end` on a column flex with this as the
 *    only in-flow child is what pins the copy to the bottom without the child needing to know the
 *    section's own height.
 */
const outerClass = computed(() => {
  if (isImageColumnVariant.value) {
    return hasImage.value
      ? 'grid gap-8 @content:grid-cols-2 @content:items-center @content:gap-16'
      : '';
  }
  if (isSplitCarousel.value) {
    return hasSlides.value
      ? 'grid gap-8 @content:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @content:items-center @content:gap-12'
      : '';
  }
  if (isImageBackground.value) {
    return (
      'relative flex flex-col justify-end min-h-[34rem] @content:min-h-[38rem] ' +
      'pt-[var(--eldra-section-md)] pb-12 @content:pt-[7rem] @content:pb-16'
    );
  }
  if (isCard.value) {
    // A column below 1101px (the photo, then the card pulled up over its bottom edge); from there
    // a plain block, the photo in flow and the card positioned over it.
    return hasImage.value ? 'relative flex flex-col @min-[68.8125rem]:block' : '';
  }
  return ''; // centered
});

/** Copy column max-width: 36rem alongside media, 44rem when there is nothing beside it to share
 *  the row with (spec "Hero" → States, "No image" row); `centered` always uses its own 44rem,
 *  centred as a block. */
const CARD_COPY_CLASS =
  'bg-background rounded-lg shadow-float px-5 py-6 @min-[47.5625rem]:px-10 @min-[47.5625rem]:py-9';
/** Over the photo from 1101px: bottom-left, 3rem in, at most 30rem wide. Below that the card is in
 *  flow under the photo and pulled up over it (4rem, with 0.75rem sides, below 761px; 3rem with
 *  1rem sides above). With no photo yet it is just the card. */
const CARD_PLACEMENT_CLASS =
  'relative z-[1] order-2 -mt-16 mx-3 @min-[47.5625rem]:-mt-12 @min-[47.5625rem]:mx-4 ' +
  '@min-[68.8125rem]:absolute @min-[68.8125rem]:left-12 @min-[68.8125rem]:bottom-12 ' +
  '@min-[68.8125rem]:m-0 @min-[68.8125rem]:max-w-[30rem]';
const copyClass = computed(() => {
  if (isCard.value) {
    return hasImage.value
      ? `${CARD_COPY_CLASS} ${CARD_PLACEMENT_CLASS}`
      : `${CARD_COPY_CLASS} max-w-[36rem]`;
  }
  if (isCentered.value) return 'mx-auto max-w-[44rem] text-center';
  if (isImageColumnVariant.value) return hasImage.value ? 'max-w-[36rem]' : 'max-w-[44rem]';
  return 'max-w-[36rem]';
});
/** Below `@content` (64rem) the image always comes first, whichever of `image-right`/`image-left`
 *  is set (spec "Hero" → Layout: "Below 48rem ... the image comes first" / "48–64rem: still
 *  stacked with the image first"); only from 64rem does `image-right` swap the order. */
const copyOrderClass = computed(() =>
  isImageColumnVariant.value ? (isImageRight.value ? 'order-2 @content:order-1' : 'order-2') : ''
);
const imageOrderClass = computed(() =>
  isImageRight.value ? 'order-1 @content:order-2' : 'order-1'
);
const buttonsRowClass = computed(() => {
  if (isCard.value) return 'mt-6 flex flex-wrap gap-3';
  return isCentered.value
    ? 'mt-3 flex flex-col items-center gap-3 @tablet:flex-row @tablet:justify-center'
    : 'mt-3 flex flex-col gap-3 @tablet:flex-row @tablet:items-center';
});
/** `card` buttons keep their own width and wrap; full width only on the narrowest phones. */
const buttonWidthClass = computed(() =>
  isCard.value ? '@min-[22.5rem]:w-auto w-full' : '@tablet:w-auto w-full'
);

/** `card`'s heading is the design's lighter display serif: 2rem on the narrowest phones, 2.25rem
 *  up to 760px, 3.25rem from there. */
const headingClass = computed(() =>
  isCard.value
    ? 'font-heading text-[2rem] @min-[22.5rem]:text-[2.25rem] @min-[47.5625rem]:text-[3.25rem] leading-[1.02] font-medium tracking-[-0.01em] text-balance'
    : 'font-heading @tablet:text-[3.5rem] text-[2.5rem] leading-[1.05] font-bold tracking-[-0.02em] text-balance'
);
const eyebrowSpacingClass = computed(() => (isCard.value ? 'mb-2' : 'mb-4'));
const subheadingClass = computed(() =>
  isCard.value
    ? 'mt-3.5 text-[1.125rem] leading-[1.6] text-pretty'
    : 'text-body-lg mt-5 max-w-[34rem] text-pretty'
);

const captionLabel = computed(() => (data.value.captionLabel ?? '').trim());
const captionDetail = computed(() => (data.value.captionDetail ?? '').trim());
const captionHref = computed(() => safeHref(data.value.captionHref));
/** The caption is a link or nothing: a label with no destination would be a pill that looks
 *  clickable and is not. */
const hasCaption = computed(
  () => isCard.value && hasImage.value && captionLabel.value !== '' && captionHref.value !== null
);
const captionLinkAs = computed(() => routerLinkAs(captionHref.value));
const carouselAriaLabel = computed(() => data.value.heading || t('hero.carouselFallback'));
/** Bound below as `:ariaLabel` (camelCase), not this file's usual `:aria-label`: Vue's template
 *  compiler passes a bound attribute's name through unchanged (the kebab→camel prop match is a
 *  *runtime* behaviour, `packages/runtime-core`'s own prop resolution), so under `nuxi typecheck`
 *  the literal `'aria-label'` key never satisfies a *required* `ariaLabel: string` prop like
 *  `Carousel`'s own — only surfacing when this block is statically imported and type-checked
 *  with the real generated block types. An *optional* `ariaLabel` (`Section`'s own, used
 *  elsewhere in this codebase) has no such problem: a "missing" optional prop is not a type
 *  error, so `:aria-label` still passes there. */

/** Eyebrow/subheading invert onto the scrim (spec: "eyebrow ... accent (inverted on the scrim)");
 *  the heading needs no override — it already inherits `Section`'s own `text-primary-contrast`
 *  base colour on the scrim, and plain `text-text` everywhere else, with no colour of its own. */
const eyebrowColorClass = computed(() =>
  hasScrimImage.value ? 'text-primary-contrast/80' : 'text-accent'
);
const subheadingColorClass = computed(() =>
  hasScrimImage.value ? 'text-primary-contrast/90' : 'text-muted'
);

/** Only a same-site destination routes through the router — see `EldraRouterLink`. `Button`/`Link`
 *  both take the same `as` contract. */
function routerLinkAs(href: string | null): typeof EldraRouterLink | undefined {
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

const primaryHref = computed(() => safeHref(data.value.primaryCtaHref));
const secondaryHref = computed(() => safeHref(data.value.secondaryCtaHref));
const hasPrimaryCta = computed(
  () => Boolean(data.value.primaryCtaLabel) && primaryHref.value !== null
);
const hasSecondaryCta = computed(
  () => Boolean(data.value.secondaryCtaLabel) && secondaryHref.value !== null
);
const primaryLinkAs = computed(() => routerLinkAs(primaryHref.value));
const secondaryLinkAs = computed(() => routerLinkAs(secondaryHref.value));

function slideHref(href: string | undefined): string | null {
  return safeHref(href);
}
function slideAlt(slide: { alt?: string; image?: { altText?: string | null } }): string {
  return slide.alt || slide.image?.altText || '';
}
</script>

<template>
  <Section
    :background="sectionBackground"
    :spacing="sectionSpacing"
    :labelled-by="sectionLabelledBy"
    :class="sectionRootClass"
  >
    <UiImage
      v-if="hasScrimImage"
      :src="data.image!.url"
      :alt="data.image!.altText ?? ''"
      :framing="framing"
      :entry-id="entryId"
      field-path="image"
      fill
    />
    <div v-if="hasScrimImage" class="bg-overlay absolute inset-0" aria-hidden="true" />

    <Container :width="containerWidth">
      <div :class="outerClass">
        <div :class="[copyClass, copyOrderClass]">
          <p
            v-if="data.eyebrow"
            class="text-overline"
            :class="[eyebrowColorClass, eyebrowSpacingClass]"
          >
            {{ data.eyebrow }}
          </p>
          <h1 v-if="data.heading" :id="headingId" :class="headingClass">
            {{ data.heading }}
          </h1>
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('hero.headingHintLabel')"
            :help="t('hero.headingHintHelp')"
          />

          <p
            v-if="data.subheading"
            :class="[subheadingClass, subheadingColorClass, isCentered ? 'mx-auto' : '']"
          >
            {{ data.subheading }}
          </p>
          <EditorPlaceholder
            v-else-if="editing"
            inline
            class="mt-5"
            :label="t('hero.subheadingHintLabel')"
          />

          <div :class="buttonsRowClass">
            <slot name="actions">
              <Button
                v-if="hasPrimaryCta"
                :href="primaryHref!"
                :as="primaryLinkAs"
                size="lg"
                variant="primary"
                :class="buttonWidthClass"
              >
                {{ data.primaryCtaLabel }}
              </Button>
              <Button
                v-if="hasSecondaryCta"
                :href="secondaryHref!"
                :as="secondaryLinkAs"
                size="lg"
                variant="outline"
                :class="buttonWidthClass"
              >
                {{ data.secondaryCtaLabel }}
              </Button>
              <EditorPlaceholder
                v-if="editing && !hasPrimaryCta && !hasSecondaryCta"
                inline
                :label="t('hero.buttonHintLabel')"
              />
            </slot>
          </div>
        </div>

        <!-- image-right / image-left -->
        <template v-if="isImageColumnVariant">
          <UiImage
            v-if="hasImage"
            :src="data.image!.url"
            :alt="data.image!.altText ?? ''"
            :framing="framing"
            :entry-id="entryId"
            field-path="image"
            rounded="xl"
            :classes="{ frame: 'aspect-[4/3]! @tablet:aspect-[3/2]! @content:aspect-[1/1]!' }"
            :class="['w-full', imageOrderClass]"
          />
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('hero.imageHintLabel')"
            :class="[
              '@tablet:aspect-[3/2] @content:aspect-[1/1] bg-surface-strong aspect-[4/3] w-full rounded-xl',
              imageOrderClass,
            ]"
          />
        </template>

        <!-- centered -->
        <template v-else-if="isCentered">
          <UiImage
            v-if="hasImage"
            :src="data.image!.url"
            :alt="data.image!.altText ?? ''"
            :framing="framing"
            :entry-id="entryId"
            field-path="image"
            rounded="xl"
            :classes="{ frame: 'aspect-[4/3]! @tablet:aspect-[21/9]! @content:aspect-[3/1]!' }"
            class="@content:mt-12 mt-8 w-full"
          />
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('hero.imageHintLabel')"
            class="@content:mt-12 @tablet:aspect-[21/9] @content:aspect-[3/1] bg-surface-strong mt-8 aspect-[4/3] w-full rounded-xl"
          />
        </template>

        <!-- card: the photo (above the card below 1101px, behind it from there) and its caption -->
        <template v-else-if="isCard">
          <div v-if="hasImage" class="relative order-1">
            <UiImage
              :src="data.image!.url"
              :alt="data.image!.altText ?? ''"
              :framing="framing"
              :entry-id="entryId"
              field-path="image"
              rounded="xl"
              :classes="{
                frame:
                  'aspect-[4/5]! @min-[47.5625rem]:aspect-[16/10]! @min-[68.8125rem]:aspect-[21/9]!',
              }"
              class="w-full"
            />
            <Link
              v-if="hasCaption"
              :href="captionHref!"
              :as="captionLinkAs"
              :underline="false"
              :classes="{ label: 'inline-flex min-w-0 items-center gap-2' }"
              data-eldra-hero-caption
              class="bg-background/90 text-text hover:bg-background hover:text-text absolute top-5 right-5 inline-flex max-w-[calc(100%-2.5rem)] items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold no-underline hover:no-underline active:no-underline @min-[68.8125rem]:top-auto @min-[68.8125rem]:bottom-5"
            >
              <span class="truncate">{{ captionLabel }}</span>
              <span v-if="captionDetail" class="text-muted font-normal">{{ captionDetail }}</span>
              <EldraIcon name="arrow-right" size="md" class="shrink-0" />
            </Link>
          </div>
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('hero.imageHintLabel')"
            class="bg-surface-strong mt-6 aspect-[4/5] w-full rounded-xl @min-[47.5625rem]:aspect-[16/10] @min-[68.8125rem]:aspect-[21/9]"
          />
        </template>

        <!-- split-carousel -->
        <template v-else-if="isSplitCarousel">
          <Carousel
            v-if="hasSlides"
            :ariaLabel="carouselAriaLabel"
            controls="below"
            dots
            :counter="false"
            draggable
            :per-view="{ base: 1.22, md: 2.17, lg: 1.56 }"
          >
            <figure v-for="(slide, index) in slides" :key="index">
              <Link
                v-if="slideHref(slide.href) !== null"
                :href="slideHref(slide.href)!"
                :as="routerLinkAs(slideHref(slide.href))"
                :underline="false"
                class="block"
              >
                <UiImage
                  :src="slide.image.url"
                  :alt="slideAlt(slide)"
                  :framing="slide.image.framing ?? undefined"
                  :entry-id="entryId"
                  :field-path="`slides.${index}.image`"
                  aspect="4/5"
                  rounded="xl"
                />
              </Link>
              <UiImage
                v-else
                :src="slide.image.url"
                :alt="slideAlt(slide)"
                :framing="slide.image.framing ?? undefined"
                :entry-id="entryId"
                :field-path="`slides.${index}.image`"
                aspect="4/5"
                rounded="xl"
              />
            </figure>
          </Carousel>
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('hero.imageHintLabel')"
            class="bg-surface-strong aspect-[4/5] w-full rounded-xl"
          />
        </template>
      </div>
    </Container>
  </Section>
</template>
