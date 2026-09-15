<script setup lang="ts">
import { computed } from 'vue';
import { renderTipTapText } from '@eldrajs/rich-text';
import type { RichTextDocument } from './types';

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(
  defineProps<{
    content: RichTextDocument | null | undefined;
    wordCount?: number;
    ellipsis?: string;
    as?: string;
  }>(),
  {
    ellipsis: '...',
    as: 'span',
  }
);

const renderedText = computed(() =>
  renderTipTapText(props.content, {
    wordCount: props.wordCount,
    ellipsis: props.ellipsis,
  })
);
</script>

<template>
  <component :is="as" v-bind="$attrs">
    {{ renderedText.text }}
  </component>
</template>
