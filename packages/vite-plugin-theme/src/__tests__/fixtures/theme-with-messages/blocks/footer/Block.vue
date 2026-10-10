<template>
  <footer>{{ entry.data.copyright }}</footer>
</template>
<script setup lang="ts">
defineProps<{ entry: { data: Record<string, unknown> } }>();
</script>
