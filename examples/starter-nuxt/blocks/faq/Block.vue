<script setup lang="ts">
const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      heading?: string;
      items?: Array<{ question?: string; answer?: string }>;
    }
);
</script>

<template>
  <section class="container">
    <h2 v-if="d.heading">{{ d.heading }}</h2>
    <details v-for="(item, i) in d.items ?? []" :key="i">
      <summary>{{ item.question }}</summary>
      <p>{{ item.answer }}</p>
    </details>
  </section>
</template>

<style scoped>
details {
  border-bottom: 1px solid var(--eldra-color-border);
  padding-block: var(--theme-stack);
}
summary {
  cursor: pointer;
  font-weight: 600;
}
</style>
