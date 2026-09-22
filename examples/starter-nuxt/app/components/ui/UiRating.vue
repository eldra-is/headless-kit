<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../../composables/useT';

const MAX = 5;

const props = defineProps<{
  /** 0–5. Rounded to the nearest whole star for the filled/outline split. */
  value: number;
  /** Optional visible review count, e.g. "(128)". */
  count?: number;
}>();

const t = useT();
const label = computed(() => t('rating.outOf', { value: props.value, max: MAX }));
const stars = computed(() =>
  Array.from({ length: MAX }, (_, index) => index < Math.round(props.value))
);
</script>

<template>
  <span class="inline-flex items-center gap-1">
    <span class="inline-flex gap-0.5" role="img" :aria-label="label">
      <svg
        v-for="(filled, index) in stars"
        :key="index"
        class="h-4 w-4"
        :class="filled ? 'text-warning' : 'text-border'"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.9l-5.2 2.61.99-5.79-4.21-4.1 5.82-.85L10 1.5z"
        />
      </svg>
    </span>
    <span v-if="count !== undefined" class="text-muted text-sm">({{ count }})</span>
  </span>
</template>
