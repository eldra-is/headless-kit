<script setup lang="ts">
import { computed } from 'vue';
import { useEldraIcon } from '../composables/useEldraIcon';

const props = defineProps<{ name?: string }>();
const svg = useEldraIcon(computed(() => props.name));
</script>

<template>
  <span v-if="svg" class="icon" aria-hidden="true" v-html="svg" />
</template>

<style scoped>
.icon {
  display: block;
  width: 2rem;
  height: 2rem;
  color: var(--eldra-color-primary);
}
.icon :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
