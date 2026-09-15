<script setup lang="ts">
import type { MarkComponentProps } from '../../types';
defineProps<MarkComponentProps>();
</script>

<template>
  <mark><slot /></mark>
</template>
