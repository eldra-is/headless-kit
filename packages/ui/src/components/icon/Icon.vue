<script setup lang="ts">
import { computed } from 'vue';
import { partClass } from '../../utils/cx';
import type { IconProps, IconSize } from './types';

const props = withDefaults(defineProps<IconProps>(), {
  size: 'md',
  label: undefined,
  classes: undefined,
});

/**
 * The spec's sizes as Tailwind utilities. The theme's `--spacing` is 0.25rem,
 * so `size-4`/`size-5`/`size-6`/`size-8` are exactly 1/1.25/1.5/2rem — no
 * literal length appears here or in the built CSS.
 */
const SIZE_CLASS: Record<IconSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
};

/** The spec's outline stroke weight. */
const STROKE_WIDTH = 1.75;

// Tabler icons set `width`/`height` to 24 as presentation attributes; the
// `size-*` class below wins because CSS beats presentation attributes. The icon
// takes the current text colour (Tabler's default `stroke="currentColor"`),
// which is what lets one icon work on every section background. The template
// must stay single-root, or `<component :is>` ends up inside a fragment and the
// class and ARIA attributes land on nothing.
const rootClass = computed(() =>
  partClass(`${SIZE_CLASS[props.size]} shrink-0`, props.classes, 'root')
);
</script>

<template>
  <component
    :is="icon"
    :class="rootClass"
    :stroke-width="STROKE_WIDTH"
    :aria-hidden="label === undefined ? 'true' : undefined"
    :role="label === undefined ? undefined : 'img'"
    :aria-label="label"
    focusable="false"
  />
</template>
