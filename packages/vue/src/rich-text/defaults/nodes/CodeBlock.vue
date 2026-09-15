<script setup lang="ts">
import { useAttrs } from 'vue';
import type { NodeComponentProps } from '../../types';

defineOptions({ inheritAttrs: false });

const props = defineProps<NodeComponentProps>();
const fallthroughAttrs = useAttrs();
</script>

<template>
  <pre
    :class="fallthroughAttrs.class"
    :style="fallthroughAttrs.style"
  ><code :class="props.attrs.language ? `language-${props.attrs.language}` : null"><slot /></code></pre>
</template>
