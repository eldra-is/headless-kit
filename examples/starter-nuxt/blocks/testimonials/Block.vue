<script setup lang="ts">
/**
 * Customer quotes. `variant`:
 *  - `grid`: a responsive card grid, every quote visible at once.
 *  - `carousel`: a scroll-snap track exposing one quote (mobile) or a few
 *    (wider) at a time, stepped by previous/next `UiButton`s or
 *    `ArrowLeft`/`ArrowRight` on the track (`useCarousel`). The track is a
 *    `role="region"` landmark labelled by the block's own heading, with an
 *    `aria-live="polite"` "slide X of Y" counter so the current position is
 *    announced to assistive tech without relying on visible scroll position.
 */
import { computed } from 'vue';
import { focusRing } from '../../app/utils/classes';
import { useBlockData } from '../../app/composables/useBlockData';
import { useCarousel } from '../../app/composables/useCarousel';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import UiButton from '../../app/components/ui/UiButton.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiRating from '../../app/components/ui/UiRating.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'testimonials'> }>();
const { data } = useBlockData(props, 'testimonials');
const t = useT();

const items = computed(() => data.value.items ?? []);
const isCarousel = computed(() => data.value.variant === 'carousel');
const headingId = `testimonials-heading-${useUiId()}`;

const total = computed(() => items.value.length);
const { index, trackRef, next, previous, onTrackKeydown } = useCarousel(total);

/**
 * Fallback avatar for an item with no `avatar` media: the first letters of
 * the author's first two words (e.g. "Freyja B." → "FB"), uppercased.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}
</script>

<template>
  <UiSection spacing="md" container-size="wide">
    <h2 :id="headingId" class="text-center text-3xl font-semibold md:text-4xl">
      {{ data.heading }}
    </h2>

    <div
      v-if="isCarousel"
      role="region"
      aria-roledescription="carousel"
      :aria-labelledby="headingId"
      class="mt-10"
    >
      <div
        ref="trackRef"
        tabindex="0"
        :class="[focusRing, 'flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2']"
        @keydown="onTrackKeydown"
      >
        <div
          v-for="(item, itemIndex) in items"
          :key="itemIndex"
          class="border-border bg-surface rounded-theme-lg w-[85%] shrink-0 snap-start border p-6 sm:w-[45%] lg:w-[30%]"
        >
          <blockquote class="text-text text-lg">“{{ item.quote }}”</blockquote>
          <footer class="mt-4 flex items-center gap-3">
            <UiImage
              v-if="item.avatar"
              :src="item.avatar.url"
              :alt="''"
              aspect="1/1"
              class="h-10 w-10 rounded-full object-cover"
            />
            <span
              v-else
              aria-hidden="true"
              class="bg-primary text-primary-contrast flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              >{{ initialsOf(item.author) }}</span
            >
            <div>
              <cite class="text-text block text-sm font-semibold not-italic">{{
                item.author
              }}</cite>
              <span v-if="item.role" class="text-muted block text-sm">{{ item.role }}</span>
            </div>
          </footer>
          <UiRating v-if="item.rating !== undefined" class="mt-3" :value="item.rating" />
        </div>
      </div>

      <div class="mt-6 flex items-center justify-center gap-4">
        <UiButton variant="outline" size="sm" @click="previous">{{
          t('carousel.previous')
        }}</UiButton>
        <span class="text-muted text-sm" aria-live="polite">{{
          t('carousel.slideOf', { index: index + 1, total })
        }}</span>
        <UiButton variant="outline" size="sm" @click="next">{{ t('carousel.next') }}</UiButton>
      </div>
    </div>

    <div v-else class="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="(item, itemIndex) in items"
        :key="itemIndex"
        class="border-border bg-surface rounded-theme-lg border p-6"
      >
        <blockquote class="text-text text-lg">“{{ item.quote }}”</blockquote>
        <footer class="mt-4 flex items-center gap-3">
          <UiImage
            v-if="item.avatar"
            :src="item.avatar.url"
            :alt="''"
            aspect="1/1"
            class="h-10 w-10 rounded-full object-cover"
          />
          <span
            v-else
            aria-hidden="true"
            class="bg-primary text-primary-contrast flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            >{{ initialsOf(item.author) }}</span
          >
          <div>
            <cite class="text-text block text-sm font-semibold not-italic">{{ item.author }}</cite>
            <span v-if="item.role" class="text-muted block text-sm">{{ item.role }}</span>
          </div>
        </footer>
        <UiRating v-if="item.rating !== undefined" class="mt-3" :value="item.rating" />
      </div>
    </div>
  </UiSection>
</template>
