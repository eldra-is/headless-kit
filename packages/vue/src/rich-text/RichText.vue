<script setup lang="ts">
import { computed, provide, watchEffect } from 'vue';
import { resolvePrices, type PriceResolver } from '@eldrajs/rich-text';
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
    /**
     * Writes a `price` node (a price token, WS-1474) in the shopper's currency: bind
     * `@eldrajs/sdk/tokens`' `resolvePriceNode` to it. Without one no price resolves, and the
     * paragraph or heading holding it is left out (`resolvePrices`).
     */
    resolvePrice?: PriceResolver | null;
  }>(),
  {
    nodes: () => ({}),
    marks: () => ({}),
    as: 'div',
    scrollTransitions: false,
    resolvePrice: null,
  }
);

const resolvedContent = computed(() => resolvePrices(props.content, props.resolvePrice));

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
    walk(resolvedContent.value);
  });
}
</script>

<template>
  <component :is="as" class="rich-text">
    <RenderNode v-if="resolvedContent" :node="resolvedContent" />
  </component>
</template>
