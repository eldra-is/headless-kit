<script setup lang="ts">
/**
 * Responsive image gallery. `variant`:
 *  - `grid`: even `grid-cols-2 sm:grid-cols-3` tiles, all square.
 *  - `masonry`: CSS multi-column layout (`columns-*`), images keep their
 *    natural aspect ratio.
 *  - `carousel`: `@eldrajs/ui`'s `Carousel`, `controls="below"` with a counter, roughly the same
 *    peek-of-the-next-tile sizing the old hand-rolled track used (`{ base: 1.3, md: 2.2, lg: 3.3 }`).
 * `lightbox` (default on unless explicitly `false`) makes every thumbnail a button that opens the
 * current image full-size in `@eldrajs/ui`'s `Lightbox`, with its own previous/next stepping,
 * counter and `←`/`→` keyboard support (`useDialog` + `useCarousel`, the same building blocks
 * `Drawer`/`Carousel` use) — none of that is hand-rolled here any more.
 *
 * `Lightbox`'s own `images` need `width`/`height` (spec: reserves the viewer's stage without
 * layout shift). `EldraMedia.width`/`.height` are optional — real CMS assets normally carry their
 * own intrinsic size, but a media item that predates that field (or a provider that never records
 * it) does not, so this falls back to the demo assets' own 1600×1000 (see `preview.json`) rather
 * than pass `undefined` into a prop the package types as required.
 */
import { computed, ref } from 'vue';
import { Carousel, Container, Lightbox, Section } from '@eldrajs/ui';
import { focusRing } from '../../app/utils/classes';
import { useBlockData } from '../../app/composables/useBlockData';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import UiImage from '../../app/components/ui/UiImage.vue';

const FALLBACK_WIDTH = 1600;
const FALLBACK_HEIGHT = 1000;

const props = defineProps<{ entry: EldraBlockEntry<'gallery'> }>();
const { data } = useBlockData(props, 'gallery');
const t = useT();

const images = computed(() => data.value.images ?? []);
const variant = computed(() => data.value.variant ?? 'grid');
const lightboxEnabled = computed(() => data.value.lightbox !== false);
const headingId = `gallery-heading-${useUiId()}`;
/**
 * The outer `Section` is named by the heading only when there is one to point at (with none it
 * falls back to a plain `<div>` — spec "Container and section" → Accessibility) **and** the
 * `carousel` variant is not active: that variant's own `Carousel` renders its own
 * `role="region"`/`aria-roledescription="carousel"` wrapper with its own accessible name (below),
 * and naming the `Section` too would give two nested landmarks an identical accessible name (axe
 * `landmark-unique`).
 */
const sectionLabelledBy = computed(() =>
  data.value.heading && variant.value !== 'carousel' ? headingId : undefined
);

/** `Carousel`'s own required `ariaLabel`: the heading text when there is one (content, not UI
 *  copy — the same "use the visible heading when it exists" rule `sectionLabelledBy` follows),
 *  else a generic fallback through `t()`. Shared with the `Lightbox` below for the same reason. */
const ariaLabel = computed(() => data.value.heading || t('gallery.viewer'));

const total = computed(() => images.value.length);

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

const lightboxImages = computed(() =>
  images.value.map((image) => ({
    src: image.url,
    alt: image.altText ?? '',
    width: image.width ?? FALLBACK_WIDTH,
    height: image.height ?? FALLBACK_HEIGHT,
  }))
);

function openLightbox(imageIndex: number): void {
  if (!lightboxEnabled.value) return;
  lightboxIndex.value = imageIndex;
  lightboxOpen.value = true;
}
</script>

<template>
  <Section spacing="md" :labelled-by="sectionLabelledBy">
    <Container width="wide">
      <h2
        v-if="data.heading"
        :id="headingId"
        class="text-center text-3xl font-semibold md:text-4xl"
      >
        {{ data.heading }}
      </h2>

      <div v-if="variant === 'grid'" class="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <component
          :is="lightboxEnabled ? 'button' : 'div'"
          v-for="(image, imageIndex) in images"
          :key="imageIndex"
          v-bind="lightboxEnabled ? { type: 'button' } : {}"
          :class="[focusRing, 'block']"
          @click="openLightbox(imageIndex)"
        >
          <UiImage
            :src="image.url"
            :alt="image.altText ?? ''"
            aspect="1/1"
            class="w-full"
            :classes="{ frame: 'rounded-md' }"
          />
        </component>
      </div>

      <div v-else-if="variant === 'masonry'" class="mt-10 columns-2 gap-4 sm:columns-3">
        <component
          :is="lightboxEnabled ? 'button' : 'div'"
          v-for="(image, imageIndex) in images"
          :key="imageIndex"
          v-bind="lightboxEnabled ? { type: 'button' } : {}"
          :class="[focusRing, 'mb-4 block w-full break-inside-avoid']"
          @click="openLightbox(imageIndex)"
        >
          <UiImage
            :src="image.url"
            :alt="image.altText ?? ''"
            class="w-full"
            :classes="{ frame: 'rounded-md' }"
          />
        </component>
      </div>

      <!-- Only mounted once there is at least one image: an empty `Carousel` shell (permanently
           disabled arrows, an empty track) is not a useful state for the freshly-inserted block to
           render, and `grid`/`masonry` already handle zero images the same way — nothing extra. -->
      <Carousel
        v-else-if="total > 0"
        class="mt-10"
        :aria-label="ariaLabel"
        controls="below"
        counter
        :per-view="{ base: 1.3, md: 2.2, lg: 3.3 }"
      >
        <!-- The slide itself (the top-level child `useCarousel` annotates with `role="group"`) is
             a plain `<li>`, not the thumbnail trigger directly: axe's `aria-allowed-role` refuses
             `role="group"` on a `<button>`, so a clickable slide needs the same one-level-in nesting
             `Carousel`'s own `ProductRow` story uses (an `<li>` wrapping the interactive content). -->
        <li v-for="(image, imageIndex) in images" :key="imageIndex" class="list-none">
          <component
            :is="lightboxEnabled ? 'button' : 'div'"
            v-bind="lightboxEnabled ? { type: 'button' } : {}"
            :class="[focusRing, 'block w-full']"
            @click="openLightbox(imageIndex)"
          >
            <UiImage
              :src="image.url"
              :alt="image.altText ?? ''"
              aspect="4/3"
              class="w-full"
              :classes="{ frame: 'rounded-md' }"
            />
          </component>
        </li>
      </Carousel>

      <Lightbox
        v-if="lightboxEnabled && total > 0"
        v-model="lightboxOpen"
        v-model:index="lightboxIndex"
        :images="lightboxImages"
        :aria-label="ariaLabel"
      />
    </Container>
  </Section>
</template>
