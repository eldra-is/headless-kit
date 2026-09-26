<script setup lang="ts">
/**
 * Customer quotes. `variant`:
 *  - `grid`: a responsive card grid, every quote visible at once.
 *  - `carousel`: `@eldrajs/ui`'s `Carousel`, `controls="below"` with a counter, roughly the same
 *    peek-of-the-next-card sizing the old hand-rolled track used
 *    (`{ base: 1.15, md: 2.2, lg: 3.3 }`). `Carousel` renders its own
 *    `role="region"`/`aria-roledescription="carousel"` wrapper, named by its own `ariaLabel` —
 *    the block's own heading text (content, not UI copy) when there is one.
 */
import { computed } from 'vue';
import { Carousel, Container, Rating, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import UiImage from '../../app/components/ui/UiImage.vue';

const props = defineProps<{ entry: EldraBlockEntry<'testimonials'> }>();
const { data } = useBlockData(props, 'testimonials');
const t = useT();

const items = computed(() => data.value.items ?? []);
const isCarousel = computed(() => data.value.variant === 'carousel');
const headingId = `testimonials-heading-${useUiId()}`;
/**
 * The outer `Section` is named by the heading only for the `grid` variant. In `carousel` the
 * `Carousel` below is already a `role="region"` named by its own `ariaLabel`, and naming the
 * `Section` too would give two nested landmarks an identical accessible name (axe
 * `landmark-unique`).
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

const ariaLabel = computed(() => data.value.heading || t('testimonials.carousel'));

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

      <Carousel
        v-if="isCarousel"
        class="mt-10"
        :aria-label="ariaLabel"
        controls="below"
        counter
        :per-view="{ base: 1.15, md: 2.2, lg: 3.3 }"
      >
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
          <Rating
            v-if="item.rating !== undefined"
            class="mt-3"
            :value="item.rating"
            :count="1"
            :show-value="false"
            :show-count="false"
          />
        </div>
      </Carousel>

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
          <Rating
            v-if="item.rating !== undefined"
            class="mt-3"
            :value="item.rating"
            :count="1"
            :show-value="false"
            :show-count="false"
          />
        </div>
      </div>
    </Container>
  </Section>
</template>
