<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import type { VisuallyHiddenProps } from './types';

const props = withDefaults(defineProps<VisuallyHiddenProps>(), {
  as: 'span',
  focusable: false,
  classes: undefined,
});

/**
 * Tailwind's own `sr-only` (and `not-sr-only` under the `focus:` variant) — the
 * clip-rect technique, kept in one place so nothing in this package reinvents
 * it with a literal size or a `display: none` that would also hide the content
 * from screen readers.
 */
const rootClass = computed(() =>
  partClass(cx('sr-only', props.focusable && 'focus:not-sr-only'), props.classes, 'root')
);
</script>

<template>
  <component :is="as" data-part="root" :class="rootClass">
    <slot />
  </component>
</template>
