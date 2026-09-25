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
 * It is also a container-query context (`@container`), kept for other components that key off a
 * `@container` ancestor. `Button` itself no longer grows at any container width — see the
 * operator ruling recorded under Deviations in the README — but the root stays block-level `flex`
 * rather than `inline-flex` regardless: `container-type: inline-size` applies inline-size
 * containment, and a shrink-to-fit box would then measure itself as zero.
 */
const BASE = '@container flex items-center';
const LOOSE = 'flex-wrap gap-3';

/**
 * Attached (a segmented control): gap 0, inner corners square, neighbours overlapping by 1px so
 * there is one shared boundary rather than two, and the focused button raised above its neighbours
 * so the focus ring is never covered (2.4.11). `role="group"` with an `aria-label` ("View") comes
 * from the attrs the consumer passes.
 *
 * The raise is `z-10`, not `position: relative`. Every Button is already `relative` (it positions
 * its own spinner), so the neighbours are positioned too and paint in source order — a `relative`
 * on the focused one changed nothing at all, and the next button's 1px overlap kept covering the
 * ring. `isolate` on the group keeps that `z-10` from escaping into the page's own layers.
 *
 * The corner and overlap rules are logical, not physical (`rounded-s-none`/`rounded-e-none`,
 * `-ms-px`), so the control reads correctly in an RTL document instead of squaring the wrong end.
 */
const ATTACHED = [
  'gap-0 isolate',
  '[&>*:not(:first-child)]:-ms-px',
  '[&>*:not(:first-child)]:rounded-s-none',
  '[&>*:not(:last-child)]:rounded-e-none',
  '[&>*:focus-visible]:z-10',
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
