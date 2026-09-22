<script setup lang="ts">
import { safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () => props.entry.data as { brand?: string; links?: Array<{ label?: string; href?: string }> }
);
</script>

<template>
  <header class="nav">
    <nav class="container" :aria-label="d.brand || 'Primary navigation'">
      <NuxtLink to="/" class="brand">{{ d.brand }}</NuxtLink>
      <ul>
        <li v-for="(link, i) in d.links ?? []" :key="i">
          <NuxtLink v-if="safeHref(link.href)" :to="safeHref(link.href)!">{{
            link.label
          }}</NuxtLink>
        </li>
      </ul>
    </nav>
  </header>
</template>

<style scoped>
.nav {
  border-bottom: 1px solid var(--eldra-color-border);
}
nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem;
}
ul {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.brand {
  font-weight: 700;
  text-decoration: none;
  color: inherit;
}
</style>
