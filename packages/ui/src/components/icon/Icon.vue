<script setup lang="ts">
import { computed } from 'vue';
import { partClass } from '../../utils/cx';
import { ICON_SIZE_CLASS, ICON_STROKE_WIDTH } from './sizes';
import type { IconProps } from './types';

const props = withDefaults(defineProps<IconProps>(), {
  size: 'md',
  label: undefined,
  classes: undefined,
});

// Tabler icons set `width`/`height` to 24 as presentation attributes; the
// `size-*` class below wins because CSS beats presentation attributes. The icon
// takes the current text colour (Tabler's default `stroke="currentColor"`),
// which is what lets one icon work on every section background. The template
// must stay single-root, or `<component :is>` ends up inside a fragment and the
// class and ARIA attributes land on nothing.
const rootClass = computed(() =>
  partClass(`${ICON_SIZE_CLASS[props.size]} shrink-0`, props.classes, 'root')
);
</script>

<template>
  <component
    :is="icon"
    data-eldra-ui
    data-part="root"
    :class="rootClass"
    :stroke-width="ICON_STROKE_WIDTH"
    :aria-hidden="label === undefined ? 'true' : undefined"
    :role="label === undefined ? undefined : 'img'"
    :aria-label="label"
    focusable="false"
  />
</template>
