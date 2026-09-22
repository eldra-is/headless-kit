<script setup lang="ts">
/**
 * Grid of features, each an icon or image with a title and body copy.
 * `columns` (`2 | 3 | 4`) sets the grid width from `sm` up; `variant`:
 *  - `cards`: each item is a bordered, padded card (`bg-surface`).
 *  - `plain`: no card chrome, just icon/image + copy stacked.
 * An item with `href` renders as a `UiLink` wrapping the whole card so the
 * entire tile is clickable; without one it's a plain `div`.
 */
import { computed } from 'vue';
import { safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import { useBlockData } from '../../app/composables/useBlockData';
import UiIcon from '../../app/components/ui/UiIcon.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiLink from '../../app/components/ui/UiLink.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'feature-grid'> }>();
const { data } = useBlockData(props, 'feature-grid');

const COLUMNS = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

const items = computed(() => data.value.items ?? []);
const columnsClass = computed(() => COLUMNS[data.value.columns ?? '3']);
const isCards = computed(() => (data.value.variant ?? 'cards') === 'cards');

function itemHref(href: string | undefined): string | null {
  return href ? safeHref(href) : null;
}
</script>

<template>
  <UiSection spacing="md" container-size="wide">
    <div class="mx-auto max-w-2xl text-center">
      <h2 class="text-3xl font-semibold md:text-4xl">{{ data.heading }}</h2>
      <p v-if="data.intro" class="text-muted mt-3 text-lg">{{ data.intro }}</p>
    </div>

    <div class="mt-12 grid grid-cols-1 gap-6" :class="columnsClass">
      <component
        :is="itemHref(item.href) ? UiLink : 'div'"
        v-for="(item, index) in items"
        :key="index"
        v-bind="itemHref(item.href) ? { href: itemHref(item.href) } : {}"
        class="block"
        :class="[
          isCards ? 'border-border bg-surface rounded-theme-lg border p-6' : '',
          itemHref(item.href) ? focusRing : '',
        ]"
      >
        <UiIcon v-if="item.icon" :name="item.icon" />
        <UiImage
          v-else-if="item.image"
          :src="item.image.url"
          :alt="item.image.altText ?? ''"
          aspect="1/1"
          class="rounded-theme-md h-12 w-12 object-cover"
        />
        <h3 class="text-text mt-4 text-lg font-semibold">{{ item.title }}</h3>
        <p v-if="item.body" class="text-muted mt-2">{{ item.body }}</p>
      </component>
    </div>
  </UiSection>
</template>
