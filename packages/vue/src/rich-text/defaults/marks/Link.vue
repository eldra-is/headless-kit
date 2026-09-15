<script setup lang="ts">
import { computed } from 'vue';
import { safeHref } from '@eldra-is/rich-text';
import type { MarkComponentProps } from '../../types';

const props = defineProps<MarkComponentProps>();

const href = computed(() => safeHref(props.attrs.href));

const isExternal = computed(
  () => typeof href.value === 'string' && /^https?:\/\//i.test(href.value)
);

const rel = computed(
  () => props.attrs.rel ?? (isExternal.value ? 'noopener noreferrer' : undefined)
);
const target = computed(() => props.attrs.target ?? undefined);
</script>

<template>
  <a :href="href" :rel="rel" :target="target">
    <slot />
  </a>
</template>
