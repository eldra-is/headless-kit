<script setup lang="ts">
import { computed, provide, watchEffect } from 'vue';
import RenderNode from './RenderNode.vue';
import { defaultMarkComponents, defaultNodeComponents } from './defaults';
import {
  richTextMarkComponentsKey,
  richTextNodeComponentsKey,
  richTextRevealOptionsKey,
} from './keys';
import type {
  RevealDirectiveValue,
  RichTextDocument,
  RichTextMarkOverrides,
  RichTextNodeOverrides,
} from './types';

const props = withDefaults(
  defineProps<{
    content: RichTextDocument | null | undefined;
    nodes?: RichTextNodeOverrides;
    marks?: RichTextMarkOverrides;
    as?: string;
    scrollTransitions?: RevealDirectiveValue;
  }>(),
  {
    nodes: () => ({}),
    marks: () => ({}),
    as: 'div',
    scrollTransitions: false,
  }
);

const resolvedNodes = computed<RichTextNodeOverrides>(() => ({
  ...defaultNodeComponents,
  ...props.nodes,
}));

const resolvedMarks = computed<RichTextMarkOverrides>(() => ({
  ...defaultMarkComponents,
  ...props.marks,
}));

const revealOptions = computed(() => props.scrollTransitions);

provide(richTextNodeComponentsKey, resolvedNodes);
provide(richTextMarkComponentsKey, resolvedMarks);
provide(richTextRevealOptionsKey, revealOptions);

if (import.meta.env?.DEV) {
  const warned = new Set<string>();
  watchEffect(() => {
    const walk = (node: RichTextDocument | undefined | null) => {
      if (!node) return;
      if (
        node.type &&
        node.type !== 'doc' &&
        node.type !== 'text' &&
        resolvedNodes.value[node.type] === undefined &&
        !warned.has(node.type)
      ) {
        warned.add(node.type);
        console.warn(
          `[RichText] No renderer registered for "${node.type}". Children will be rendered without a wrapper.`
        );
      }
      node.content?.forEach(walk);
    };
    walk(props.content);
  });
}
</script>

<template>
  <component :is="as" class="rich-text">
    <RenderNode v-if="content" :node="content" />
  </component>
</template>
