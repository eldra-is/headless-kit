<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import type { ContainerProps, ContainerWidth } from './types';

const props = withDefaults(defineProps<ContainerProps>(), {
  width: 'content',
  classes: undefined,
  as: 'div',
});

/**
 * Spec "Container and section" → Sizes: the three finite widths cap the box at the token value
 * (`max-w-narrow`/`-content`/`-wide`, generated from the same `--container-*` theme keys the
 * gutter breakpoints below read — see `tailwind.css`'s `@theme` block). Every element in this
 * package keeps Tailwind's preflight `box-sizing: border-box`, so the gutter padding below is
 * *inside* that cap: "the gutter is added outside the maximum, so content never exceeds the token
 * width" falls out of border-box for free, with nothing extra to write. `full` gets neither: "100%,
 * no gutters".
 */
const WIDTH: Record<ContainerWidth, string> = {
  narrow: 'max-w-narrow',
  content: 'max-w-content',
  wide: 'max-w-wide',
  full: 'max-w-none',
};

/**
 * Gutters (spec "Container and section" → Sizes, Gutters table): 1rem below 48rem, 1.5rem from
 * 48rem, 2rem from 64rem — chosen by the **block** width, not the viewport. `@tablet` (48rem) and
 * `@content` (64rem) are container-query breakpoints, not media queries (`tailwind.css`'s `@theme`
 * block: `--container-tablet` is declared for exactly this edge, and `--container-content` already
 * names the 64rem desktop one), measured against the nearest `@container` ancestor — `Section`'s
 * own root — so a Container in a narrow page-builder column keeps the mobile gutter even on a wide
 * viewport, and one used with no `Section` ancestor simply stays at the mobile gutter throughout.
 */
const GUTTER =
  'px-[var(--eldra-gutter-mobile)] @tablet:px-[var(--eldra-gutter-tablet)] ' +
  '@content:px-[var(--eldra-gutter-desktop)]';

const rootClass = computed(() =>
  partClass(
    cx('mx-auto w-full', WIDTH[props.width], props.width === 'full' ? '' : GUTTER),
    props.classes,
    'root'
  )
);
</script>

<template>
  <component :is="as" data-part="root" :class="rootClass"><slot /></component>
</template>
