<script setup lang="ts">
defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
</script>

<template>
  <a class="cta" :href="'#'">{{ entry.data.label }}</a>
</template>
