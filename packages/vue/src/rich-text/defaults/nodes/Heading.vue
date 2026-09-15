<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import type { NodeComponentProps } from '../../types';

defineOptions({ inheritAttrs: false });

const props = defineProps<NodeComponentProps>();
const fallthroughAttrs = useAttrs();

const tag = computed(() => {
  const raw = Number(props.attrs.level);
  const level = Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw : 2;
  return `h${level}`;
});
</script>

<template>
  <component :is="tag" :class="fallthroughAttrs.class" :style="fallthroughAttrs.style">
    <slot />
  </component>
</template>
