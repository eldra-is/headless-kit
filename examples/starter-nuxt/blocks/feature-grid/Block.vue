<script setup lang="ts">
/**
 * Grid of features, each an icon or image with a title and body copy.
 * `columns` (`2 | 3 | 4`) sets the grid width from `sm` up; `variant`:
 *  - `cards`: each item is a bordered, padded card (`bg-surface`).
 *  - `plain`: no card chrome, just icon/image + copy stacked.
 * An item with `href` renders as a `Link` wrapping the whole card so the
 * entire tile is clickable; without one it's a plain `div`. `Link` draws its
 * content inside a `data-part="label"` span, so that part is made `block`
 * here for the card's stacked layout — everything else about the tile is the
 * same markup either way.
 */
import { computed, type Component } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { useBlockData } from '../../app/composables/useBlockData';
import EldraIcon from '../../app/components/EldraIcon.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'feature-grid'> }>();
const { data } = useBlockData(props, 'feature-grid');

const COLUMNS = {
  '2': 'sm:grid-cols-2',
  '3': 'sm:grid-cols-2 lg:grid-cols-3',
  '4': 'sm:grid-cols-2 lg:grid-cols-4',
} as const;

const isCards = computed(() => (data.value.variant ?? 'cards') === 'cards');
const columnsClass = computed(() => COLUMNS[data.value.columns ?? '3']);

/**
 * A tile's own resolved link, `null` when the item has no (safe) destination:
 * `Link` takes the href verbatim, so sanitising is this block's job.
 */
const items = computed(() =>
  (data.value.items ?? []).map((item) => {
    const href = item.href ? safeHref(item.href) : null;
    return {
      ...item,
      href,
      as: href !== null && isInternalHref(href) ? EldraRouterLink : undefined,
    };
  })
);

/** The card box, shared by the linked and the plain tile. */
const tileClass = computed(() =>
  isCards.value ? 'border-border bg-surface rounded-lg border p-6' : ''
);

/**
 * A linked tile's `Link` props. The tile is a card, not a line of text, so the
 * standalone variant's inline-flex row and its hover underline are replaced on
 * the root (`classes` merges with `tailwind-merge`, so `block` really does
 * replace `inline-flex`), and the label part — the span `Link` wraps its
 * content in — becomes `block` for the stacked icon/title/body.
 */
function linkProps(href: string, as: Component | string | undefined): Record<string, unknown> {
  return {
    href,
    as,
    variant: 'standalone',
    classes: {
      root: `block font-normal hover:no-underline active:no-underline ${tileClass.value}`,
      label: 'block',
    },
  };
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
        :is="item.href ? Link : 'div'"
        v-for="(item, index) in items"
        :key="index"
        v-bind="item.href ? linkProps(item.href, item.as) : { class: tileClass }"
      >
        <EldraIcon v-if="item.icon" :name="item.icon" class="text-primary" />
        <UiImage
          v-else-if="item.image"
          :src="item.image.url"
          :alt="item.image.altText ?? ''"
          aspect="1/1"
          class="h-12 w-12 rounded-md object-cover"
        />
        <h3 class="text-text mt-4 text-lg font-semibold">{{ item.title }}</h3>
        <p v-if="item.body" class="text-muted mt-2">{{ item.body }}</p>
      </component>
    </div>
  </UiSection>
</template>
