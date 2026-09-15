<script setup lang="ts">
import type { NodeComponentProps } from '../../types';

const props = defineProps<NodeComponentProps>();
</script>

<template>
  <ol :start="typeof props.attrs.start === 'number' ? props.attrs.start : undefined">
    <slot />
  </ol>
</template>
