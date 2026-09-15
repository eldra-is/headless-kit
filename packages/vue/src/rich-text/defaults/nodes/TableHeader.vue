<script setup lang="ts">
import type { NodeComponentProps } from '../../types';
defineProps<NodeComponentProps>();
</script>

<template>
  <th>
    <slot />
  </th>
</template>
