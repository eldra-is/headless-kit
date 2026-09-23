<script setup lang="ts">
/**
 * Responsive image gallery. `variant`:
 *  - `grid`: even `grid-cols-2 sm:grid-cols-3` tiles, all square.
 *  - `masonry`: CSS multi-column layout (`columns-*`), images keep their
 *    natural aspect ratio.
 *  - `carousel`: scroll-snap track, stepped like `testimonials` (`useCarousel`).
 * `lightbox` (default on unless explicitly `false`) makes every thumbnail a
 * button that opens the current image full-size in a `UiDialog`, with its
 * own previous/next stepping and an `aria-live` "image X of Y" counter.
 */
import { computed, ref } from 'vue';
import { focusRing } from '../../app/utils/classes';
import { useBlockData } from '../../app/composables/useBlockData';
import { useCarousel } from '../../app/composables/useCarousel';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import UiButton from '../../app/components/ui/UiButton.vue';
import UiDialog from '../../app/components/ui/UiDialog.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'gallery'> }>();
const { data } = useBlockData(props, 'gallery');
const t = useT();

const images = computed(() => data.value.images ?? []);
const variant = computed(() => data.value.variant ?? 'grid');
const lightboxEnabled = computed(() => data.value.lightbox !== false);
const headingId = `gallery-heading-${useUiId()}`;

const total = computed(() => images.value.length);
const {
  index: trackIndex,
  trackRef,
  next: trackNext,
  previous: trackPrevious,
  onTrackKeydown,
} = useCarousel(total);

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const currentImage = computed(() => images.value[lightboxIndex.value]);

function openLightbox(imageIndex: number): void {
  if (!lightboxEnabled.value) return;
  lightboxIndex.value = imageIndex;
  lightboxOpen.value = true;
}

function nextImage(): void {
  lightboxIndex.value = total.value === 0 ? 0 : (lightboxIndex.value + 1) % total.value;
}

function previousImage(): void {
  lightboxIndex.value =
    total.value === 0 ? 0 : (lightboxIndex.value - 1 + total.value) % total.value;
}
</script>

<template>
  <UiSection spacing="md" container-size="wide">
    <h2 v-if="data.heading" :id="headingId" class="text-center text-3xl font-semibold md:text-4xl">
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
          class="rounded-theme-md w-full object-cover"
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
        <UiImage :src="image.url" :alt="image.altText ?? ''" class="rounded-theme-md w-full" />
      </component>
    </div>

    <div
      v-else
      role="region"
      aria-roledescription="carousel"
      :aria-labelledby="headingId"
      class="mt-10"
    >
      <div
        ref="trackRef"
        tabindex="0"
        :class="[focusRing, 'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2']"
        @keydown="onTrackKeydown"
      >
        <component
          :is="lightboxEnabled ? 'button' : 'div'"
          v-for="(image, imageIndex) in images"
          :key="imageIndex"
          v-bind="lightboxEnabled ? { type: 'button' } : {}"
          :class="[focusRing, 'w-[70%] shrink-0 snap-start sm:w-[40%] lg:w-[28%]']"
          @click="openLightbox(imageIndex)"
        >
          <UiImage
            :src="image.url"
            :alt="image.altText ?? ''"
            aspect="4/3"
            class="rounded-theme-md w-full object-cover"
          />
        </component>
      </div>

      <div class="mt-6 flex items-center justify-center gap-4">
        <UiButton variant="outline" size="sm" @click="trackPrevious">{{
          t('carousel.previous')
        }}</UiButton>
        <span class="text-muted text-sm" aria-live="polite">{{
          t('carousel.slideOf', { index: trackIndex + 1, total })
        }}</span>
        <UiButton variant="outline" size="sm" @click="trackNext">{{ t('carousel.next') }}</UiButton>
      </div>
    </div>

    <UiDialog
      v-if="lightboxEnabled"
      :open="lightboxOpen"
      :title="t('gallery.open')"
      panel-class="m-auto w-[calc(100%-2rem)] max-w-4xl rounded-theme-lg border shadow-theme-md"
      @update:open="lightboxOpen = $event"
    >
      <div v-if="lightboxOpen && currentImage" class="flex flex-col items-center gap-4">
        <UiImage
          :src="currentImage.url"
          :alt="currentImage.altText ?? ''"
          class="max-h-[85vh] w-auto object-contain"
        />
        <div class="flex items-center gap-4">
          <UiButton variant="outline" size="sm" @click="previousImage">{{
            t('gallery.previous')
          }}</UiButton>
          <span class="text-muted text-sm" aria-live="polite">{{
            t('gallery.imageOf', { index: lightboxIndex + 1, total })
          }}</span>
          <UiButton variant="outline" size="sm" @click="nextImage">{{
            t('gallery.next')
          }}</UiButton>
        </div>
      </div>
    </UiDialog>
  </UiSection>
</template>
