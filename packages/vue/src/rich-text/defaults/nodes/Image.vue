<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { safeImageSrc } from '@eldrajs/rich-text';
import type { NodeComponentProps } from '../../types';

defineOptions({ inheritAttrs: false });

const props = defineProps<NodeComponentProps>();
const fallthroughAttrs = useAttrs();

const src = computed(() => safeImageSrc(props.attrs.src));
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="props.attrs.alt ?? ''"
    :title="props.attrs.title || undefined"
    :data-asset-id="props.attrs.assetId || undefined"
    loading="lazy"
    decoding="async"
    :class="fallthroughAttrs.class"
    :style="fallthroughAttrs.style"
  />
</template>
