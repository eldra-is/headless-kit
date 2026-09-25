<script setup lang="ts">
import { computed } from 'vue';

const TONE = {
  neutral: 'bg-surface-strong text-text',
  primary: 'bg-primary text-primary-contrast',
  accent: 'bg-accent text-accent-contrast',
  success: 'bg-success text-primary-contrast',
  warning: 'bg-warning text-primary-contrast',
  danger: 'bg-danger text-primary-contrast',
} as const;

const props = withDefaults(defineProps<{ tone?: keyof typeof TONE }>(), { tone: 'neutral' });

const classes = computed(() => [
  'inline-flex items-center rounded-sm px-2 py-0.5 text-sm font-medium',
  TONE[props.tone],
]);
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
