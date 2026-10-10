<template>
  <section>
    <h1>{{ entry.data.heading }}</h1>
  </section>
</template>
<script setup lang="ts">
defineProps<{ entry: { data: Record<string, unknown> } }>();
</script>
