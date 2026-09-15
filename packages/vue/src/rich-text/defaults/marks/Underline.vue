<script setup lang="ts">
import type { MarkComponentProps } from '../../types';
defineProps<MarkComponentProps>();
</script>

<template>
  <u><slot /></u>
</template>
