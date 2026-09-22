<script setup lang="ts">
const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      heading?: string;
      features?: Array<{ icon?: string; title?: string; description?: string }>;
    }
);
</script>

<template>
  <section class="container">
    <h2 v-if="d.heading">{{ d.heading }}</h2>
    <ul class="grid">
      <li v-for="(feature, i) in d.features ?? []" :key="i" class="feature">
        <UiIcon :name="feature.icon" />
        <h3>{{ feature.title }}</h3>
        <p v-if="feature.description">{{ feature.description }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
}
.feature {
  padding: var(--theme-gutter);
  border: 1px solid var(--eldra-color-border);
  border-radius: 0.75rem;
}
</style>
