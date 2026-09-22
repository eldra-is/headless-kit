<script setup lang="ts">
const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      title?: string;
      images?: Array<{
        caption?: string;
        image?: { url?: string; altText?: string | null } | null;
      }>;
    }
);
</script>

<template>
  <section class="container">
    <h2 v-if="d.title">{{ d.title }}</h2>
    <ul class="grid">
      <li v-for="(item, i) in d.images ?? []" :key="i">
        <figure>
          <img
            v-if="item.image?.url"
            :src="item.image.url"
            :alt="item.image.altText ?? item.caption ?? ''"
          />
          <figcaption v-if="item.caption">{{ item.caption }}</figcaption>
        </figure>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  gap: var(--theme-gutter);
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}
figure {
  margin: 0;
}
figcaption {
  color: var(--eldra-color-muted);
  margin-block-start: 0.5rem;
}
</style>
