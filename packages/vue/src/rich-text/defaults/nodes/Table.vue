<script setup lang="ts">
import { computed } from 'vue';
import RenderNode from '../../RenderNode.vue';
import type { NodeComponentProps, RichTextNode } from '../../types';

const props = defineProps<NodeComponentProps>();

const rows = computed(() => props.node.content ?? []);

const isHeaderRow = (row: RichTextNode) =>
  row.type === 'tableRow' &&
  Array.isArray(row.content) &&
  row.content.length > 0 &&
  row.content.every((cell) => cell.type === 'tableHeader');

const headerRowCount = computed(() => {
  let count = 0;
  for (const row of rows.value) {
    if (!isHeaderRow(row)) break;
    count += 1;
  }
  return count;
});

const headRows = computed(() => rows.value.slice(0, headerRowCount.value));
const bodyRows = computed(() => rows.value.slice(headerRowCount.value));
</script>

<template>
  <table>
    <thead v-if="headRows.length > 0">
      <RenderNode v-for="(row, index) in headRows" :key="`head-${index}`" :node="row" />
    </thead>

    <tbody v-if="bodyRows.length > 0">
      <RenderNode v-for="(row, index) in bodyRows" :key="`body-${index}`" :node="row" />
    </tbody>
  </table>
</template>
