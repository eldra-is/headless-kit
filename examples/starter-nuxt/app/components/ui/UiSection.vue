<script setup lang="ts">
import { computed } from 'vue';
import UiContainer from './UiContainer.vue';

const SPACING = {
  none: 'py-0',
  sm: 'py-8',
  md: 'py-section',
  lg: 'py-[calc(var(--theme-section)*1.5)]',
} as const;

const BACKGROUND = {
  none: '',
  surface: 'bg-surface',
  'surface-strong': 'bg-surface-strong',
  primary: 'bg-primary text-primary-contrast',
  accent: 'bg-accent text-accent-contrast',
} as const;

const props = withDefaults(
  defineProps<{
    spacing?: keyof typeof SPACING;
    background?: keyof typeof BACKGROUND;
    /** Size of the `UiContainer` this section wraps its content in. */
    containerSize?: 'narrow' | 'content' | 'wide' | 'full';
  }>(),
  { spacing: 'md', background: 'none', containerSize: 'content' }
);

const classes = computed(() => [SPACING[props.spacing], BACKGROUND[props.background]]);
</script>

<template>
  <section :class="classes">
    <UiContainer :size="containerSize">
      <slot />
    </UiContainer>
  </section>
</template>
