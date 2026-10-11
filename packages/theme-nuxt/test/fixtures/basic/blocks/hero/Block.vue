<script setup lang="ts">
defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
</script>

<template>
  <section class="hero">
    <h1>{{ entry.data.heading }}</h1>
    <p>{{ entry.data.subheading }}</p>
    <slot name="actions"><span data-eldra-slot-fallback>Default action</span></slot>
  </section>
</template>
