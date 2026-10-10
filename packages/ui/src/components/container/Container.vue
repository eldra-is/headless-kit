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
 * Spec "Container and section" → Sizes: the three finite widths cap the box at the token value —
 * `eldra-container-narrow`/`-content`/`-wide` (`tailwind.css`, "Container's own max-width
 * utilities"), each reading the matching `--eldra-container-*` variable, not Tailwind's
 * auto-generated `max-w-narrow`/`-content`/`-wide`. Those two sets share the same three numbers,
 * but the stock ones now compile from the *literal* lengths the `--container-*` theme namespace
 * needs for its `@narrow:`/`@content:`/`@wide:` container-query variants (see that `@theme`
 * block's own comment) — a `var()` there silently drops the variants entirely, which is why the
 * breakpoint scale and the width scale had to split into two different utilities even though they
 * name the same three numbers. `Container` reads the `var()`-driven ones, so a consumer still
 * restyles a block's width at runtime by setting `--eldra-container-{narrow,content,wide}`. Every
 * element in this package keeps Tailwind's preflight `box-sizing: border-box`, so the gutter
 * padding below is *inside* that cap: "the gutter is added outside the maximum, so content never
 * exceeds the token width" falls out of border-box for free, with nothing extra to write. `full`
 * gets neither: "100%, no gutters".
 */
const WIDTH: Record<ContainerWidth, string> = {
  narrow: 'eldra-container-narrow',
  content: 'eldra-container-content',
  wide: 'eldra-container-wide',
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
