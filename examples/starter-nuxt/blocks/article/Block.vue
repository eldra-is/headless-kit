<script setup lang="ts">
import { computed } from 'vue';
import { EldraRichText } from '@eldra/theme-vue';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      title?: string;
      author?: string;
      body?: unknown;
      coverImage?: { url?: string; altText?: string | null } | null;
    }
);
</script>

<template>
  <article class="article container">
    <h1>{{ d.title }}</h1>
    <address v-if="d.author">By {{ d.author }}</address>
    <img v-if="d.coverImage?.url" :src="d.coverImage.url" :alt="d.coverImage.altText ?? ''" />
    <EldraRichText :entry-id="entry.id" field="body" :doc="d.body" api-id="article" />
  </article>
</template>

<style scoped>
.article {
  max-width: 48rem;
  padding-block: var(--theme-section);
}
address {
  color: var(--eldra-color-muted);
  margin-block: 0.5rem 2rem;
  font-style: normal;
}
img {
  width: 100%;
  margin-block-end: 2rem;
}
</style>
