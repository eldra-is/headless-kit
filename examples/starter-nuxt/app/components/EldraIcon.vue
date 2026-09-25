<script setup lang="ts">
/**
 * A Tabler icon *by name* — the shape a CMS field gives a block
 * (`feature-grid`'s `item.icon` is a string an editor picks in Studio).
 *
 * `@eldrajs/ui`'s `Icon` is the primitive: it owns the spec's four sizes, the
 * stroke weight and the decorative/labelled ARIA state. What it cannot do is
 * turn a *name* into a component — it takes the icon component itself, which
 * is what keeps `@tabler/icons-vue` out of the package's dependencies. So this
 * adapter resolves the name to markup through `useEldraIcon` (the Nuxt route,
 * Storybook's glob, or a test's stub — see that composable) and hands `Icon` a
 * component that renders it.
 *
 * Deliberately not under `app/components/ui/`: it is not a primitive of its
 * own, it is the theme's name→component bridge to one.
 */
import { computed, defineComponent, h, type Component } from 'vue';
import { Icon, type IconSize } from '@eldrajs/ui';
import { useEldraIcon } from '../composables/useEldraIcon';

const props = withDefaults(
  defineProps<{
    /** Tabler outline icon name, e.g. `bolt`. Unknown or missing renders nothing. */
    name?: string;
    /** One of `Icon`'s four sizes. */
    size?: IconSize;
    /** An accessible name, when the icon carries meaning nothing else on screen carries. */
    label?: string;
  }>(),
  { name: undefined, size: 'xl', label: undefined }
);

const svg = useEldraIcon(computed(() => props.name));

/**
 * Tabler publishes each icon as a complete `<svg>` document with its own
 * `class`, `width`/`height` and `stroke-width`. Rebuilding the root from the
 * body alone leaves `Icon` in charge of all three (its `size-*` class, the
 * spec's 1.75 stroke, `aria-hidden`/`role`/`aria-label`), which is the whole
 * point of routing through the primitive rather than inlining the markup.
 * The identity only changes when the markup does, so the icon is not remounted
 * on every render. It is a stateful component rather than a bare render
 * function on purpose: a *functional* component that declares no props passes
 * only `class`, `style` and listeners through to its root, so `Icon`'s
 * `stroke-width`, `role` and `aria-*` would silently never reach the `<svg>`.
 */
const icon = computed<Component | null>(() => {
  const markup = svg.value;
  if (markup === null) return null;
  const body = markup.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return defineComponent({
    name: 'EldraTablerIcon',
    setup: () => () =>
      h('svg', {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        innerHTML: body,
      }),
  });
});
</script>

<template>
  <Icon v-if="icon" :icon="icon" :size="size" :label="label" />
</template>
