<script setup lang="ts">
import { safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      heading?: string;
      body?: string;
      buttonLabel?: string;
      buttonHref?: string;
      variant?: string;
    }
);
const buttonHref = computed(() => safeHref(d.value.buttonHref));
</script>

<template>
  <section class="cta container" :data-variant="d.variant ?? 'primary'">
    <h2>{{ d.heading }}</h2>
    <p v-if="d.body">{{ d.body }}</p>
    <a v-if="d.buttonLabel && buttonHref" class="button" :href="buttonHref">{{ d.buttonLabel }}</a>
  </section>
</template>

<style scoped>
.cta {
  border-radius: 0.75rem;
  padding: var(--theme-gutter);
  margin-block: var(--theme-section);
}
.cta[data-variant='primary'] {
  background: var(--eldra-color-primary);
  color: var(--eldra-color-primary-contrast);
}
.cta[data-variant='subtle'] {
  background: var(--eldra-color-surface);
}
.cta[data-variant='primary'] .button {
  background: var(--eldra-color-primary-contrast);
  color: var(--eldra-color-primary);
}
</style>
