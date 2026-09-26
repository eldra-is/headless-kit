<script setup lang="ts">
/**
 * Customer quotes. `variant`:
 *  - `grid`: a responsive card grid, every quote visible at once.
 *  - `carousel`: a scroll-snap track exposing one quote (mobile) or a few
 *    (wider) at a time, stepped by previous/next `Button`s or
 *    `ArrowLeft`/`ArrowRight` on the track (`useCarousel`). The track is a
 *    `role="region"` landmark labelled by the block's own heading, with an
 *    `aria-live="polite"` "slide X of Y" counter so the current position is
 *    announced to assistive tech without relying on visible scroll position.
 */
import { computed } from 'vue';
import { Button, Container, Section } from '@eldrajs/ui';
import { focusRing } from '../../app/utils/classes';
import { useBlockData } from '../../app/composables/useBlockData';
import { useCarousel } from '../../app/composables/useCarousel';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiRating from '../../app/components/ui/UiRating.vue';

const props = defineProps<{ entry: EldraBlockEntry<'testimonials'> }>();
const { data } = useBlockData(props, 'testimonials');
const t = useT();

const items = computed(() => data.value.items ?? []);
const isCarousel = computed(() => data.value.variant === 'carousel');
const headingId = `testimonials-heading-${useUiId()}`;
/**
 * The outer `Section` is named by the heading only for the `grid` variant. In `carousel` the
 * track below is already a `role="region"` named by the same heading, and naming the `Section`
 * too would give two nested landmarks an identical accessible name (axe `landmark-unique`).
 *
 * It still renders as an actual `<section>` either way (`as="section"` below, not left to
 * `Section`'s own labelled/unlabelled choice): each quote card has its own `<footer>` for the
 * author line, and HTML gives `<footer>` its `contentinfo` landmark role only when it has no
 * `article`/`aside`/`main`/`nav`/`section` ancestor — an unlabelled `<div>` does not suppress
 * that the way an unlabelled `<section>` does, so a plain `<div>` here turned every card's
 * `<footer>` into a second `contentinfo` landmark nested inside the carousel's own `role="region"`
 * (axe `landmark-contentinfo-is-top-level`).
 */
const sectionLabelledBy = computed(() => (isCarousel.value ? undefined : headingId));

const total = computed(() => items.value.length);
const { index, trackRef, next, previous, onTrackKeydown } = useCarousel(total);

/**
 * Fallback avatar for an item with no `avatar` media: the first letters of
 * the author's first two words (e.g. "Freyja B." → "FB"), uppercased. A
 * freshly-placed block's item can reach here with no `author` yet (Studio
 * seeds one blank repeater item so the block renders something before the
 * author fills it in) — fall back to an empty string instead of crashing.
 */
function initialsOf(name: string | undefined): string {
  if (!name) return '';
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
  <Section spacing="md" as="section" :labelled-by="sectionLabelledBy">
    <Container width="wide">
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
          :class="[
            focusRing,
            'scrollbar-hidden flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2',
          ]"
          @keydown="onTrackKeydown"
        >
          <div
            v-for="(item, itemIndex) in items"
            :key="itemIndex"
            class="border-border bg-surface w-[85%] shrink-0 snap-start rounded-lg border p-6 sm:w-[45%] lg:w-[30%]"
          >
            <blockquote class="text-text text-lg">“{{ item.quote }}”</blockquote>
            <footer class="mt-4 flex items-center gap-3">
              <UiImage
                v-if="item.avatar"
                :src="item.avatar.url"
                :alt="''"
                aspect="1/1"
                class="h-10 w-10"
                :classes="{ frame: 'rounded-full' }"
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
          <Button variant="outline" size="sm" @click="previous">{{
            t('carousel.previous')
          }}</Button>
          <span class="text-muted text-sm" aria-live="polite">{{
            t('carousel.slideOf', { index: index + 1, total })
          }}</span>
          <Button variant="outline" size="sm" @click="next">{{ t('carousel.next') }}</Button>
        </div>
      </div>

      <div v-else class="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(item, itemIndex) in items"
          :key="itemIndex"
          class="border-border bg-surface rounded-lg border p-6"
        >
          <blockquote class="text-text text-lg">“{{ item.quote }}”</blockquote>
          <footer class="mt-4 flex items-center gap-3">
            <UiImage
              v-if="item.avatar"
              :src="item.avatar.url"
              :alt="''"
              aspect="1/1"
              class="h-10 w-10"
              :classes="{ frame: 'rounded-full' }"
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
    </Container>
  </Section>
</template>
