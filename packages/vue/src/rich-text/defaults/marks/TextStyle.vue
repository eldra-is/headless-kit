<script setup lang="ts">
import { computed } from 'vue';
import type { MarkComponentProps } from '../../types';

const props = defineProps<MarkComponentProps>();

const style = computed(() => {
  const out: Record<string, string> = {};
  if (typeof props.attrs.color === 'string') out.color = props.attrs.color;
  return out;
});

const hasStyle = computed(() => Object.keys(style.value).length > 0);
</script>

<template>
  <span v-if="hasStyle" :style="style"><slot /></span>
  <slot v-else />
</template>
