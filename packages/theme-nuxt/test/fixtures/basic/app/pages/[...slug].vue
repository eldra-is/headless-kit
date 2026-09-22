<script setup lang="ts">
import { EldraBlockZone, EldraLayout } from '@eldrajs/theme-vue';

const { page, template, entry, layout, blocks, reusableComponentProjection, pending, error } =
  useEldraPage();
</script>

<template>
  <main
    :data-page-id="page?.id"
    :data-layout-root="(layout as { root?: { id?: string } } | null)?.root?.id"
  >
    <p v-if="pending">Loading…</p>
    <p v-else-if="error" data-eldra-error>{{ error }}</p>
    <p v-else-if="page === null && template === null">Not found</p>
    <EldraLayout
      v-else-if="layout !== null"
      :layout="layout"
      :blocks="blocks"
      :reusable-component-projection="reusableComponentProjection"
      :template-entry="entry ?? undefined"
      nonce="fixture-layout-nonce"
    />
    <EldraBlockZone v-else :blocks="blocks" />
  </main>
</template>
