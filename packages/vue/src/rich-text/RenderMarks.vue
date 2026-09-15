<script setup lang="ts">
import { computed, inject } from 'vue';
import type { Component } from 'vue';
import { resolveOverride } from '@eldra-is/rich-text';
import { defaultMarkComponents } from './defaults';
import { richTextMarkComponentsKey } from './keys';
import type { RichTextMark, RichTextMarkOverrides } from './types';

const props = defineProps<{
  marks: RichTextMark[];
}>();

const markComponents = inject(
  richTextMarkComponentsKey,
  computed<RichTextMarkOverrides>(() => ({}))
);

const resolved = computed(() => {
  if (props.marks.length === 0) return null;
  const type = props.marks[0].type;
  const override = markComponents.value[type];
  const fallback = defaultMarkComponents[type];

  if (override === null) return null;
  // An unknown mark still gets a span; only an explicit null unwraps.
  return resolveOverride<Component>(override, fallback ?? 'span');
});
</script>

<template>
  <template v-if="!resolved">
    <slot />
  </template>

  <component
    :is="resolved.is"
    v-else
    :class="resolved.class"
    :style="resolved.style"
    :mark="marks[0]"
    :attrs="marks[0].attrs ?? {}"
  >
    <RenderMarks :marks="marks.slice(1)">
      <slot />
    </RenderMarks>
  </component>
</template>
