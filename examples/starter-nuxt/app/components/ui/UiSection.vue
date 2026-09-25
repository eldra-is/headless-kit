<script setup lang="ts">
import { computed } from 'vue';
import UiContainer from './UiContainer.vue';

/**
 * `py-section` / `py-section-lg` are the spec's section rhythm
 * (`--eldra-section-md` / `--eldra-section-lg`), named for Tailwind in
 * `app/assets/main.css`.
 */
const SPACING = {
  none: 'py-0',
  sm: 'py-8',
  md: 'py-section',
  lg: 'py-section-lg',
} as const;

const BACKGROUND = {
  none: '',
  surface: 'bg-surface',
  'surface-strong': 'bg-surface-strong',
  primary: 'bg-primary text-primary-contrast',
  accent: 'bg-accent text-accent-contrast',
} as const;

/**
 * The two backgrounds that invert what sits on them. `@eldrajs/ui`'s
 * components read `group-data-[section=primary|accent]/section:` to flip their
 * own colours (a `Button` on a primary section becomes a `primary-contrast`
 * fill with `primary` text, a `Link` takes the contrast colour), so a section
 * with one of these backgrounds marks itself instead of every block inside it
 * hand-writing the inversion.
 */
const SECTION_GROUND = new Set(['primary', 'accent']);

const props = withDefaults(
  defineProps<{
    spacing?: keyof typeof SPACING;
    background?: keyof typeof BACKGROUND;
    /** Size of the `UiContainer` this section wraps its content in. */
    containerSize?: 'narrow' | 'content' | 'wide' | 'full';
  }>(),
  { spacing: 'md', background: 'none', containerSize: 'content' }
);

/**
 * `@container` makes this section the containing block every `@`-prefixed
 * container query inside it measures — which is what the design spec asks for:
 * a primary `md` button grows to the 2.75rem touch target "below a 48rem
 * container", the block it sits in, not the viewport (`@max-tablet` in
 * `@eldrajs/ui`). Without a container ancestor that query never matches and
 * the rule is silently dead.
 */
const classes = computed(() => [
  '@container',
  SPACING[props.spacing],
  BACKGROUND[props.background],
  SECTION_GROUND.has(props.background) ? 'group/section' : '',
]);

const ground = computed(() =>
  SECTION_GROUND.has(props.background) ? props.background : undefined
);
</script>

<template>
  <section :class="classes" :data-section="ground">
    <UiContainer :size="containerSize">
      <slot />
    </UiContainer>
  </section>
</template>
