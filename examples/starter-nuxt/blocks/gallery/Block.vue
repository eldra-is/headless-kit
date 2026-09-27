<script setup lang="ts">
/**
 * Gallery: a set of photos as a grid, masonry columns or a carousel, every image opening
 * `@eldrajs/ui`'s `Lightbox` at that image with its caption (spec `02-blocks.md` 2720–2845,
 * "Gallery"). `variant`:
 *
 *  - `grid`: an even grid of `aspect`-cropped tiles, 2 columns below `@tablet` (48rem), 3 from
 *    `@tablet`, `columns` from `@content` (64rem) — `GRID_COLUMN_CLASS` below is the static
 *    per-`columns` lookup the `@content` step reads.
 *  - `masonry`: CSS multi-column (`columns-2` / `@tablet:columns-3` / `@content:columns-N`,
 *    `MASONRY_COLUMN_CLASS`'s own lookup), each image at its own natural ratio (`aspect` ignored —
 *    no `aspect` prop reaches `UiImage`, so its frame falls back to `ratio="auto"`) with
 *    `break-inside-avoid` on every `<li>` so items never split across columns and read down each
 *    column, then the next (DOM order — `columns` is a layout-only CSS property, it never
 *    reorders).
 *  - `carousel`: `@eldrajs/ui`'s `Carousel`, `controls="header"` so the block head (heading, intro)
 *    and the arrows/counter share one row (spec "Carousel" row: "the controls … sit in the block
 *    head on the right") — the heading/intro markup is therefore duplicated into the `#header`
 *    slot rather than rendered as a separate block head above the component, the same "head moves
 *    inside the named-region component" shape `testimonials`'/`hero`'s own carousel variants use.
 *
 * Every tile is a real `<button type="button" aria-haspopup="dialog">` this starter draws itself
 * (`focusRing`, from `app/utils/classes.ts` — the one interactive element left that is not a
 * package component) with a decorative `UiImage` and an always-visible `aria-hidden` zoom badge
 * (`EldraIcon` `zoom-in`), never hover-only (spec Accessibility: "The zoom badge is `aria-hidden`
 * and always visible, so the action is never hover-only"). Clicking (or `Enter`/`Space`, wired
 * explicitly — jsdom's `<button>` has no native key-to-click translation to rely on for the test
 * suite, and a real browser already does this for free either way) opens the one shared `Lightbox`
 * at that image's position; `useDialog` (inside `Lightbox`) captures whatever had focus the instant
 * it opens and restores it on close, which is what returns focus to the tile that opened it with no
 * extra code here — the same mechanism every modal in this package already returns focus through.
 *
 * `items[].image` is optional at the type level even though the field is required in Studio (an
 * item can exist — captions typed in ahead of picking a photo — with no image chosen yet, exactly
 * `mock.json`'s own state: six captioned items, zero real images, since media is never present in
 * Studio's insert seed). Spec States: "Missing image: the item is skipped on the live site. The
 * editor shows the Image placeholder in its place." — so live filters every item down to the ones
 * with a real image (`validItems`); editing renders every item, an per-tile `EditorPlaceholder`
 * standing in for a missing image (the same "Choose an image" hint `feature-grid`'s own image media
 * type uses for the same state). The whole gallery still needs at least two real images to render
 * live at all (spec States, "Empty (freshly inserted)": "Nothing renders on the live site until
 * there are at least 2 images") — `showItems` is that gate; a `0`-item `items` list (never Studio's
 * own seed, but a plausible state after clearing every row) shows the block-level "Add images" hint
 * instead, the spec's own wording at line 2784.
 */
import { computed, ref } from 'vue';
import { Carousel, Container, EditorPlaceholder, Lightbox, Section } from '@eldrajs/ui';
import type { LightboxImage } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { focusRing } from '../../app/utils/classes';

const FALLBACK_WIDTH = 1600;
const FALLBACK_HEIGHT = 1000;

/** Spec "Gallery" → Fields: `aspect` stores `1x1`/`4x5`/`3x2`; `UiImage`'s own `aspect` prop reads
 *  the slash-separated form (see its `ASPECT_TO_RATIO`). */
const ASPECT_TO_UI_IMAGE: Record<string, string> = { '1x1': '1/1', '4x5': '4/5', '3x2': '3/2' };

/** Spec "Gallery" → Layout: "From 64rem: `columns` (3 by default)." A static per-`columns` lookup,
 *  not a computed template literal — Tailwind only ships classes it can see written out. */
const GRID_COLUMN_CLASS: Record<'2' | '3' | '4', string> = {
  '2': '@content:grid-cols-2',
  '3': '@content:grid-cols-3',
  '4': '@content:grid-cols-4',
};
const MASONRY_COLUMN_CLASS: Record<'2' | '3' | '4', string> = {
  '2': '@content:columns-2',
  '3': '@content:columns-3',
  '4': '@content:columns-4',
};

interface GalleryItem {
  image?: EldraMedia;
  caption?: string;
}

/** One rendered tile: the source item, whether it has a real image, and — only when it does — its
 *  position among the images that actually have one (what the Lightbox and every tile's own
 *  "image N of total" label count against, never the raw, possibly-placeholder-holding list
 *  index). */
interface GalleryEntry {
  item: GalleryItem;
  hasImage: boolean;
  validIndex: number | null;
}

const props = defineProps<{ entry: EldraBlockEntry<'gallery'> }>();
const { data } = useBlockData(props, 'gallery');
const t = useT();
const isEditing = useEditing();
const headingId = `gallery-heading-${useUiId()}`;

const variant = computed(() => data.value.variant ?? 'grid');
const isCarousel = computed(() => variant.value === 'carousel');
const isMasonry = computed(() => variant.value === 'masonry');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);
const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const hasHead = computed(() => hasHeading.value || hasIntro.value || showHeadingHint.value);

/** `carousel`'s own `Carousel` already renders a named `role="region"` (see `carouselAriaLabel`
 *  below) — labelling the outer `Section` too would give two nested landmarks the same accessible
 *  name (axe `landmark-unique`), the same reasoning `testimonials`/`feature-grid` apply to their
 *  own carousel variant. */
const sectionLabelledBy = computed(() =>
  hasHeading.value && !isCarousel.value ? headingId : undefined
);
const carouselAriaLabel = computed(() => heading.value || t('gallery.carouselFallback'));
const viewerAriaLabel = computed(() =>
  hasHeading.value ? t('gallery.viewerHeading', { heading: heading.value }) : t('gallery.viewer')
);

const columns = computed<'2' | '3' | '4'>(() => data.value.columns ?? '3');
const showCaptions = computed(() => data.value.showCaptions !== false);
/** Spec "Gallery" → Fields, `aspect` row: default `1:1` for `grid`, `4:5` for `carousel`;
 *  `masonry` never reads this (see the module doc comment). */
const effectiveAspect = computed(() => data.value.aspect ?? (isCarousel.value ? '4x5' : '1x1'));
const tileAspect = computed(() => ASPECT_TO_UI_IMAGE[effectiveAspect.value] ?? '1/1');

const gridClass = computed(() => [
  'grid grid-cols-2 gap-3 @tablet:grid-cols-3 @tablet:gap-4 @content:gap-6',
  GRID_COLUMN_CLASS[columns.value],
]);
const masonryClass = computed(() => [
  'columns-2 gap-3 @tablet:columns-3 @tablet:gap-4 @content:gap-6',
  MASONRY_COLUMN_CLASS[columns.value],
]);

function hasImage(item: GalleryItem): item is GalleryItem & { image: EldraMedia } {
  return Boolean(item.image?.url);
}

const allItems = computed<GalleryItem[]>(() => data.value.items ?? []);
/** Every item with a real image, in order — what the Lightbox shows and what every tile's own
 *  position/count is read against, live or editing alike. */
const validItems = computed(() => allItems.value.filter(hasImage));
const total = computed(() => validItems.value.length);
const hasEnoughImages = computed(() => total.value >= 2);

/** Live: only items with a real image render at all (Global Constraints, "Editor vs live"; spec
 *  States, "Missing image": "skipped on the live site"). Editing: every item renders, so a
 *  still-imageless item shows its own placeholder instead of vanishing. */
const displayItems = computed<GalleryItem[]>(() =>
  isEditing.value ? allItems.value : validItems.value
);
const entries = computed<GalleryEntry[]>(() => {
  let position = 0;
  return displayItems.value.map((item) => {
    const withImage = hasImage(item);
    const entry: GalleryEntry = {
      item,
      hasImage: withImage,
      validIndex: withImage ? position : null,
    };
    if (withImage) position += 1;
    return entry;
  });
});

/** Whether the tiles/carousel (and the Lightbox) mount at all: live needs at least two real images
 *  (spec States, "Empty (freshly inserted)": "Nothing renders on the live site until there are at
 *  least 2 images"); editing only needs *some* item to edit, real image or not. */
const showItems = computed(() =>
  isEditing.value ? allItems.value.length > 0 : hasEnoughImages.value
);
/** The block-level "no images yet" hint (spec line 2784) — only for a genuinely empty list; an
 *  item with a caption but no image yet gets its own per-tile placeholder instead (see
 *  `entries`/`hasImage` above), not this one. */
const showItemsHint = computed(() => isEditing.value && allItems.value.length === 0);

function tileLabel(entry: GalleryEntry): string {
  if (!hasImage(entry.item) || entry.validIndex === null) return '';
  return t('gallery.viewLarger', {
    index: entry.validIndex + 1,
    count: total.value,
    alt: entry.item.image.altText ?? '',
  });
}

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

function openLightbox(entry: GalleryEntry): void {
  if (entry.validIndex === null) return;
  lightboxIndex.value = entry.validIndex;
  lightboxOpen.value = true;
}

/** Caption always shows in the Lightbox regardless of `showCaptions` (spec "Gallery" → Fields,
 *  `showCaptions` row: "Captions always show in the Lightbox"). */
const lightboxImages = computed<LightboxImage[]>(() =>
  validItems.value.map((item) => {
    const caption = (item.caption ?? '').trim();
    return {
      src: item.image.url,
      alt: item.image.altText ?? '',
      caption: caption === '' ? undefined : caption,
      width: item.image.width ?? FALLBACK_WIDTH,
      height: item.image.height ?? FALLBACK_HEIGHT,
    };
  })
);

/** The scale-on-hover the tile image gets (spec "Gallery" → Layout: "On hover, the image scales to
 *  1.03 over `duration-base` `ease-out`"), gated entirely behind `motion-safe:` (Global
 *  Constraints, "Motion is gated behind `motion-safe:`") rather than a plain `transition`/`scale`
 *  pair with a `motion-reduce:transition-none` opt-out — the spec's own "Reduced motion: the tile
 *  hover zoom is off" needs the scale itself never applied, not merely un-animated. */
const TILE_MEDIA_CLASS =
  'motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-out ' +
  'motion-safe:group-hover:scale-[1.03]';
</script>

<template>
  <Section spacing="md" :labelled-by="sectionLabelledBy">
    <Container width="content">
      <!-- grid / masonry: a plain head above the tiles. carousel renders the same markup inside
           Carousel's own #header slot instead (see the module doc comment). -->
      <div v-if="hasHead && !isCarousel" class="mb-8">
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
          :label="t('gallery.headingHintLabel')"
          :help="t('gallery.headingHintHelp')"
        />
        <p v-if="hasIntro" class="text-muted mt-2 text-base">{{ intro }}</p>
      </div>

      <template v-if="showItems">
        <ul v-if="variant === 'grid'" role="list" :class="gridClass">
          <li v-for="(entry, index) in entries" :key="index">
            <figure>
              <button
                v-if="entry.hasImage"
                type="button"
                aria-haspopup="dialog"
                :aria-label="tileLabel(entry)"
                :class="[focusRing, 'group relative block w-full cursor-zoom-in rounded-lg']"
                @click="openLightbox(entry)"
                @keydown.enter.prevent="openLightbox(entry)"
                @keydown.space.prevent="openLightbox(entry)"
              >
                <UiImage
                  :src="entry.item.image!.url"
                  alt=""
                  :framing="entry.item.image!.framing ?? null"
                  :aspect="tileAspect"
                  rounded="lg"
                  class="w-full"
                  :classes="{ media: TILE_MEDIA_CLASS }"
                />
                <span
                  aria-hidden="true"
                  class="bg-background text-text absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full shadow-sm"
                >
                  <EldraIcon name="zoom-in" size="sm" />
                </span>
              </button>
              <EditorPlaceholder v-else inline :label="t('gallery.imageHintLabel')" />
              <figcaption
                v-if="showCaptions && entry.item.caption"
                class="text-body-sm text-muted mt-2"
              >
                {{ entry.item.caption }}
              </figcaption>
            </figure>
          </li>
        </ul>

        <ul v-else-if="isMasonry" role="list" :class="masonryClass">
          <li
            v-for="(entry, index) in entries"
            :key="index"
            class="@tablet:mb-4 @content:mb-6 mb-3 break-inside-avoid"
          >
            <figure>
              <button
                v-if="entry.hasImage"
                type="button"
                aria-haspopup="dialog"
                :aria-label="tileLabel(entry)"
                :class="[focusRing, 'group relative block w-full cursor-zoom-in rounded-lg']"
                @click="openLightbox(entry)"
                @keydown.enter.prevent="openLightbox(entry)"
                @keydown.space.prevent="openLightbox(entry)"
              >
                <UiImage
                  :src="entry.item.image!.url"
                  alt=""
                  :framing="entry.item.image!.framing ?? null"
                  rounded="lg"
                  class="w-full"
                  :classes="{ media: TILE_MEDIA_CLASS }"
                />
                <span
                  aria-hidden="true"
                  class="bg-background text-text absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full shadow-sm"
                >
                  <EldraIcon name="zoom-in" size="sm" />
                </span>
              </button>
              <EditorPlaceholder v-else inline :label="t('gallery.imageHintLabel')" />
              <figcaption
                v-if="showCaptions && entry.item.caption"
                class="text-body-sm text-muted mt-2"
              >
                {{ entry.item.caption }}
              </figcaption>
            </figure>
          </li>
        </ul>

        <Carousel
          v-else
          :aria-label="carouselAriaLabel"
          controls="header"
          counter
          :dots="false"
          draggable
          :per-view="{ base: 1.28, md: 2.25, lg: 3 }"
        >
          <template #header>
            <div v-if="hasHead">
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
                :label="t('gallery.headingHintLabel')"
                :help="t('gallery.headingHintHelp')"
              />
              <p v-if="hasIntro" class="text-muted mt-2 text-base">{{ intro }}</p>
            </div>
          </template>

          <li v-for="(entry, index) in entries" :key="index" class="list-none">
            <figure>
              <button
                v-if="entry.hasImage"
                type="button"
                aria-haspopup="dialog"
                :aria-label="tileLabel(entry)"
                :class="[focusRing, 'group relative block w-full cursor-zoom-in rounded-lg']"
                @click="openLightbox(entry)"
                @keydown.enter.prevent="openLightbox(entry)"
                @keydown.space.prevent="openLightbox(entry)"
              >
                <UiImage
                  :src="entry.item.image!.url"
                  alt=""
                  :framing="entry.item.image!.framing ?? null"
                  :aspect="tileAspect"
                  rounded="lg"
                  class="w-full"
                  :classes="{ media: TILE_MEDIA_CLASS }"
                />
                <span
                  aria-hidden="true"
                  class="bg-background text-text absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full shadow-sm"
                >
                  <EldraIcon name="zoom-in" size="sm" />
                </span>
              </button>
              <EditorPlaceholder v-else inline :label="t('gallery.imageHintLabel')" />
              <figcaption
                v-if="showCaptions && entry.item.caption"
                class="text-body-sm text-muted mt-2"
              >
                {{ entry.item.caption }}
              </figcaption>
            </figure>
          </li>
        </Carousel>
      </template>
      <EditorPlaceholder
        v-else-if="showItemsHint"
        :label="t('gallery.itemsHintLabel')"
        :help="t('gallery.itemsHintHelp')"
      />

      <Lightbox
        v-if="showItems && total > 0"
        v-model="lightboxOpen"
        v-model:index="lightboxIndex"
        :images="lightboxImages"
        :aria-label="viewerAriaLabel"
        thumbnails
      />
    </Container>
  </Section>
</template>
