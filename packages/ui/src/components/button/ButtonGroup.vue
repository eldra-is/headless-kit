<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import type { ButtonGroupProps } from './types';

const props = withDefaults(defineProps<ButtonGroupProps>(), {
  attached: false,
  classes: undefined,
});

/**
 * The layout helper from spec "Button" → Button group: a flex row that wraps, `space-3` gap, items
 * centred.
 *
 * It is also a container-query context (`@container`), which is what lets an md Button inside it
 * grow to `target-touch` when the *block* is narrower than 48rem. That is why the root stays
 * block-level `flex` rather than `inline-flex`: `container-type: inline-size` applies inline-size
 * containment, and a shrink-to-fit box would then measure itself as zero.
 */
const BASE = '@container flex items-center';
const LOOSE = 'flex-wrap gap-3';

/**
 * Attached (a segmented control): gap 0, inner corners square, neighbours overlapping by 1px so
 * there is one shared boundary rather than two, and the focused button raised above its neighbours
 * so the focus ring is never covered (2.4.11). `role="group"` with an `aria-label` ("View") comes
 * from the attrs the consumer passes.
 */
const ATTACHED = [
  'gap-0 isolate',
  '[&>*:not(:first-child)]:-ml-px',
  '[&>*:not(:first-child)]:rounded-l-none',
  '[&>*:not(:last-child)]:rounded-r-none',
  '[&>*:focus-visible]:relative',
].join(' ');

const rootClass = computed(() =>
  partClass(cx(BASE, props.attached ? ATTACHED : LOOSE), props.classes, 'root')
);
</script>

<template>
  <div data-part="root" :class="rootClass" :role="attached ? 'group' : undefined">
    <slot />
  </div>
</template>
