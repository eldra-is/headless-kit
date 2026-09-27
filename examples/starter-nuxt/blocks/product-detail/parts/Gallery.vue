<script setup lang="ts">
/**
 * The product gallery: one 4:5 stage with the sale flag, an `aria-hidden` index pill, a zoom
 * button that opens `@eldrajs/ui`'s `Lightbox`, and a thumbnail strip below (spec `02-blocks.md`
 * "Product detail" → Layout, Gallery). Split out of `Block.vue` so that file keeps to state and
 * the information column; this part owns nothing but which image is current.
 *
 * `role="group"` named "Product images" (spec Keyboard & accessibility) — a group, not a region,
 * because the block's own `<section>` is already the named landmark.
 *
 * The stage image is decorative (`alt=""`): every thumbnail already carries the same description in
 * its own name ("Show image 2 of 5: …"), and the `Lightbox` renders the real `alt` on the full-size
 * photo, so announcing it a third time on the stage would only repeat it. With one image there is
 * nothing to pick between, so both the strip and the index pill are dropped (spec States,
 * "Minimal": "One image hides the thumbnails and the index").
 *
 * Thumbnails are `<button>`s this theme draws itself — the one interactive element here that is not
 * a package component, hence `focusRing` from `app/utils/classes.ts`, the same shape the `gallery`
 * block's own tiles use. The current one is marked three ways so it never depends on colour alone
 * (spec Keyboard & accessibility): `aria-current="true"`, a 2px `text` inset ring, and a
 * `background` gap between the ring and the photo.
 */
import { computed, ref } from 'vue';
import { Badge, Button, Lightbox } from '@eldrajs/ui';
import type { LightboxImage } from '@eldrajs/ui';
import EldraIcon from '../../../app/components/EldraIcon.vue';
import UiImage from '../../../app/components/ui/UiImage.vue';
import { useT } from '../../../app/composables/useT';
import { focusRing } from '../../../app/utils/classes';

export interface GalleryImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

const props = defineProps<{
  images: GalleryImage[];
  /** The product title, for the viewer's accessible name. */
  title: string;
  /** Shows the sale flag over the stage. */
  onSale: boolean;
}>();

const t = useT();

/** `Lightbox` needs real intrinsic pixel sizes; a storefront image may not carry them, and these
 *  are the same 4:5 fallbacks the stage reserves. */
const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 1500;

const current = ref(0);
const lightboxOpen = ref(false);

const count = computed(() => props.images.length);
const hasStrip = computed(() => count.value > 1);
const currentImage = computed(() => props.images[current.value] ?? props.images[0]);

const lightboxImages = computed<LightboxImage[]>(() =>
  props.images.map((image) => ({
    src: image.src,
    alt: image.alt,
    width: image.width ?? FALLBACK_WIDTH,
    height: image.height ?? FALLBACK_HEIGHT,
  }))
);

function thumbnailLabel(image: GalleryImage, index: number): string {
  return t('product.showImage', { index: index + 1, count: count.value, alt: image.alt });
}

function show(index: number): void {
  current.value = index;
}

/**
 * Spec Layout: "a row of thumbnails sized so 5 fit exactly (0.5rem gaps), scrolling sideways (no
 * visible scrollbar) when there are more than 5" — five tracks and four 0.5rem gaps make each
 * basis `(100% - 2rem) / 5`. `eldra-scrollbar-hide` is `@eldrajs/ui`'s own utility, the same one
 * the `trust-strip` block's scrolling row uses, rather than a second hand-written recipe.
 */
const THUMBNAIL_BASIS = 'shrink-0 basis-[calc((100%-2rem)/5)]';

/** Spec Keyboard & accessibility: the current thumbnail has "a 2px `text` ring with a 2px
 *  `background` gap"; the others "a 1px `border` inset line, `border-strong` on hover
 *  (`duration-fast`)". Both are drawn as rings so the tile never changes size when it becomes
 *  current. */
const THUMBNAIL_CURRENT =
  'ring-2 ring-text ring-offset-2 ring-offset-background motion-safe:transition-shadow';
const THUMBNAIL_IDLE =
  'ring-1 ring-border hover:ring-border-strong motion-safe:transition-shadow ' +
  'motion-safe:duration-fast';
</script>

<template>
  <div role="group" :aria-label="t('product.images')" class="flex flex-col gap-3">
    <div class="relative">
      <UiImage
        v-if="currentImage"
        :src="currentImage.src"
        alt=""
        aspect="4/5"
        rounded="lg"
        class="w-full"
      />

      <div v-if="onSale" class="absolute top-3 left-3 flex flex-wrap gap-1">
        <Badge variant="sale" :label="t('product.saleBadge')" />
      </div>

      <!-- Decorative: every thumbnail and the zoom button already name the position in words. -->
      <span
        v-if="hasStrip"
        aria-hidden="true"
        class="bg-background text-text @tablet:hidden absolute bottom-3 left-3 rounded-full px-2 py-0.5 text-[0.875rem] tabular-nums"
      >
        {{ t('product.imageIndex', { index: current + 1, count }) }}
      </span>

      <!-- The positioning lives on a wrapper, not on the `Button` itself: the button's own
           `position: relative` (it draws its focus ring and spinner against itself) and an
           `absolute` utility passed in as a class are the same CSS property, so which one wins
           would depend on the order Tailwind happens to emit them in. -->
      <div v-if="currentImage" class="absolute right-3 bottom-3">
        <Button
          icon-only
          variant="outline"
          aria-haspopup="dialog"
          :classes="{ container: 'size-11 shadow-sm' }"
          :label="t('product.zoom', { index: current + 1, count })"
          @click="lightboxOpen = true"
        >
          <template #leadingIcon>
            <EldraIcon name="zoom-in" size="md" />
          </template>
        </Button>
      </div>
    </div>

    <ul v-if="hasStrip" role="list" class="eldra-scrollbar-hide flex gap-2 overflow-x-auto">
      <li v-for="(image, index) in images" :key="image.src + index" :class="THUMBNAIL_BASIS">
        <button
          type="button"
          :aria-current="index === current ? 'true' : undefined"
          :aria-label="thumbnailLabel(image, index)"
          :class="[
            focusRing,
            'block w-full cursor-pointer rounded-md',
            index === current ? THUMBNAIL_CURRENT : THUMBNAIL_IDLE,
          ]"
          @click="show(index)"
        >
          <UiImage
            :src="image.src"
            alt=""
            aspect="4/5"
            class="w-full"
            :classes="{ frame: 'rounded-md' }"
          />
        </button>
      </li>
    </ul>

    <Lightbox
      v-if="currentImage"
      v-model="lightboxOpen"
      v-model:index="current"
      :images="lightboxImages"
      :aria-label="t('product.viewer', { title })"
      thumbnails
    />
  </div>
</template>
