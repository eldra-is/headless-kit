<script setup lang="ts">
import type { MarkComponentProps } from '../../types';
defineProps<MarkComponentProps>();
</script>

<template>
  <s><slot /></s>
</template>
