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
import { computed, defineComponent, type Component } from 'vue';
import { Icon, type IconSize } from '@eldrajs/ui';
import { useEldraIcon } from '../composables/useEldraIcon';
import { renderTablerSvg, tablerSvgBody } from '../composables/iconComponent';

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
 * `tablerSvgBody` + `renderTablerSvg` (`app/composables/iconComponent.ts`) own the markup
 * transform, shared with the eight blocks that need the icon *component* rather than this
 * template — one implementation of one fragile regex, and one place where the rebuilt root's
 * attributes are decided. Rebuilding the root from the body alone is what leaves `Icon` in charge
 * of size, the spec's 1.75 stroke and `aria-hidden`/`role`/`aria-label`, which is the whole point
 * of routing through the primitive rather than inlining Tabler's own `<svg>`.
 *
 * `null` (an unknown or not-yet-resolved name) renders nothing at all here, rather than the empty
 * `<svg>` a required package `icon` prop needs — this is a template, so the caller's layout is not
 * holding a slot open for it.
 *
 * The identity only changes when the markup does, so the icon is not remounted on every render. A
 * stateful component rather than a bare render function on purpose: a *functional* component that
 * declares no props passes only `class`, `style` and listeners through to its root, so `Icon`'s
 * `stroke-width`, `role` and `aria-*` would silently never reach the `<svg>`.
 */
const icon = computed<Component | null>(() => {
  const markup = svg.value;
  if (markup === null) return null;
  const body = tablerSvgBody(markup);
  return defineComponent({
    name: 'EldraTablerIcon',
    setup: () => () => renderTablerSvg(body),
  });
});
</script>

<template>
  <Icon v-if="icon" :icon="icon" :size="size" :label="label" />
</template>
