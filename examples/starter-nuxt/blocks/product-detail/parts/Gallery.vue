<script setup lang="ts">
/**
 * The product gallery as a mosaic: every image on the page at once, the first one wide (5:4) across
 * both columns and the rest in pairs below it (4:5), each one a button that opens `@eldrajs/ui`'s
 * `Lightbox` at that image. Split out of `Block.vue` so that file keeps to state and the
 * information column; this part owns nothing but which image the viewer opens on.
 *
 * `role="group"` named "Product images" (spec Keyboard & accessibility) — a group, not a region,
 * because the block's own `<section>` is already the named landmark.
 *
 * **Every tile is a `<button>`**, named by position and the image's own description ("Open image 2
 * of 3: …"), so the photos stay reachable from the keyboard and a screen reader hears each
 * description once; the `<img>` inside is decorative (`alt=""`) for the same reason the old stage
 * image was, and the `Lightbox` renders the real `alt` on the full-size photo. The tiles are drawn
 * by this theme — the one interactive element here that is not a package component — hence
 * `focusRing` from `app/utils/classes.ts`, the same shape the `gallery` block's tiles use.
 *
 * **The shape follows the count**: one image fills the column; two sit side by side (a wide first
 * image over a lone second one would leave half a row empty); three or more lead with the wide one,
 * and an odd one out at the end spans the row as well, so the mosaic always closes square.
 *
 * The viewer is opened with `zoom` on: a shopper can enlarge the current photo to its real size and
 * pan across it (mouse or arrow keys), and a phone keeps its own pinch-zoom.
 */
import { computed, ref } from 'vue';
import { Badge, Lightbox } from '@eldrajs/ui';
import type { LightboxImage } from '@eldrajs/ui';
import UiImage from '../../../app/components/ui/UiImage.vue';
import { useI18n } from 'vue-i18n';
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
  /** Shows the sale flag over the first image. */
  onSale: boolean;
}>();

const { t } = useI18n();

/** `Lightbox` needs real intrinsic pixel sizes; a storefront image may not carry them, and these
 *  are the same 4:5 fallbacks the tiles reserve. */
const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 1500;

const current = ref(0);
const lightboxOpen = ref(false);

const count = computed(() => props.images.length);

const lightboxImages = computed<LightboxImage[]>(() =>
  props.images.map((image) => ({
    src: image.src,
    alt: image.alt,
    width: image.width ?? FALLBACK_WIDTH,
    height: image.height ?? FALLBACK_HEIGHT,
  }))
);

function tileLabel(image: GalleryImage, index: number): string {
  return t('product.openImage', { index: index + 1, count: count.value, alt: image.alt });
}

function open(index: number): void {
  current.value = index;
  lightboxOpen.value = true;
}

/** Wide (both columns, 5:4) or a half (one column, 4:5) — see the module comment for the rule. */
function isWide(index: number): boolean {
  if (count.value === 1) return true;
  if (count.value === 2) return false;
  if (index === 0) return true;
  // After the wide first one the rest pair up; an odd one out at the very end spans the row.
  return index === count.value - 1 && (count.value - 1) % 2 === 1;
}

const TILE = 'group relative block w-full cursor-zoom-in overflow-hidden rounded-lg bg-surface';
</script>

<template>
  <div role="group" :aria-label="t('product.images')">
    <ul role="list" class="grid grid-cols-2 gap-3">
      <li
        v-for="(image, index) in images"
        :key="image.src + index"
        :class="isWide(index) ? 'relative col-span-2' : 'relative col-span-1'"
      >
        <button
          type="button"
          aria-haspopup="dialog"
          :aria-label="tileLabel(image, index)"
          :class="[focusRing, TILE]"
          @click="open(index)"
        >
          <UiImage
            :src="image.src"
            alt=""
            :aspect="isWide(index) ? '5/4' : '4/5'"
            :priority="index === 0"
            class="motion-safe:duration-base w-full group-hover:scale-[1.02] motion-safe:transition-transform"
          />
        </button>
        <!-- After the button, so it paints over the photo; it is text, not a control, so the
             pointer passes through it to the tile. -->
        <div v-if="index === 0 && onSale" class="pointer-events-none absolute top-3 left-3">
          <Badge variant="sale" :label="t('product.saleBadge')" />
        </div>
      </li>
    </ul>

    <Lightbox
      v-if="images.length > 0"
      v-model="lightboxOpen"
      v-model:index="current"
      :images="lightboxImages"
      :aria-label="t('product.viewer', { title })"
      thumbnails
      zoom
    />
  </div>
</template>
