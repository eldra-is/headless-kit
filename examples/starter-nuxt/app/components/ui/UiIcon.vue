<script setup lang="ts">
import { computed } from 'vue';
import { useEldraIcon } from '../../composables/useEldraIcon';

const props = defineProps<{ name?: string }>();
const svg = useEldraIcon(computed(() => props.name));
</script>

<template>
  <span
    v-if="svg"
    class="text-primary block h-8 w-8 [&>svg]:h-full [&>svg]:w-full"
    aria-hidden="true"
    v-html="svg"
  />
</template>
