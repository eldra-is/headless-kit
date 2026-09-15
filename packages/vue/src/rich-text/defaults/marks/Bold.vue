<script setup lang="ts">
import type { MarkComponentProps } from '../../types';
defineProps<MarkComponentProps>();
</script>

<template>
  <strong><slot /></strong>
</template>
