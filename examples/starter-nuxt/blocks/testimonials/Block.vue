<script setup lang="ts">
const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      heading?: string;
      items?: Array<{
        quote?: string;
        name?: string;
        role?: string;
        avatar?: { url?: string } | null;
      }>;
    }
);
</script>

<template>
  <section class="container">
    <h2 v-if="d.heading">{{ d.heading }}</h2>
    <div class="grid">
      <figure v-for="(item, i) in d.items ?? []" :key="i">
        <blockquote>{{ item.quote }}</blockquote>
        <figcaption>
          <img v-if="item.avatar?.url" :src="item.avatar.url" alt="" />
          <span>{{ item.name }}</span>
          <span v-if="item.role" class="muted">{{ item.role }}</span>
        </figcaption>
      </figure>
    </div>
  </section>
</template>

<style scoped>
figure {
  margin: 0;
  padding: var(--theme-gutter);
  background: var(--eldra-color-surface);
  border-radius: 0.75rem;
}
blockquote {
  margin: 0 0 1rem;
  font-size: 1.125rem;
}
figcaption {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}
img {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}
</style>
