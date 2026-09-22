<script setup lang="ts">
import { safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      copyright?: string;
      columns?: Array<{ heading?: string; links?: Array<{ label?: string; href?: string }> }>;
    }
);
</script>

<template>
  <footer class="footer">
    <div class="columns container">
      <section v-for="(column, i) in d.columns ?? []" :key="i" class="column">
        <h2 v-if="column.heading">{{ column.heading }}</h2>
        <ul>
          <li v-for="(link, j) in column.links ?? []" :key="j">
            <a v-if="safeHref(link.href)" :href="safeHref(link.href)!">{{ link.label }}</a>
          </li>
        </ul>
      </section>
      <p class="copyright">{{ d.copyright }}</p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  padding-block: var(--theme-section);
  background: var(--eldra-color-surface);
}
.columns {
  display: grid;
  gap: var(--theme-gutter);
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}
.column {
  padding: 0;
}
h2 {
  font-size: 1rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.copyright {
  grid-column: 1 / -1;
  color: var(--eldra-color-muted);
}
</style>
