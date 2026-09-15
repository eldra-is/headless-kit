<script setup lang="ts">
import { computed, inject } from 'vue';
import type { Component, ObjectDirective } from 'vue';
import { resolveOverride } from '@eldrajs/rich-text';
import RenderMarks from './RenderMarks.vue';
import { defaultNodeComponents } from './defaults';
import { richTextNodeComponentsKey, richTextRevealOptionsKey } from './keys';
import type { RevealDirectiveValue, RichTextNode, RichTextNodeOverrides } from './types';

type RevealDirective = ObjectDirective<HTMLElement, RevealDirectiveValue>;
type RevealBinding = Parameters<NonNullable<RevealDirective['beforeMount']>>[1];
type RevealUpdatedPrevVNode = Parameters<NonNullable<RevealDirective['updated']>>[3];

const props = defineProps<{
  node: RichTextNode;
}>();

const nodeComponents = inject(
  richTextNodeComponentsKey,
  computed<RichTextNodeOverrides>(() => ({}))
);
const revealValue = inject(
  richTextRevealOptionsKey,
  computed<RevealDirectiveValue>(() => false)
);

// The host app's `reveal` directive is used when it registered one; otherwise this is a no-op, so
// the renderer needs no animation library of its own.
const getGlobalRevealDirective = (binding: RevealBinding) =>
  binding.instance?.$?.appContext.directives.reveal as RevealDirective | undefined;

const vReveal: RevealDirective = {
  beforeMount(element, binding, vnode) {
    if (binding.value === false) return;
    getGlobalRevealDirective(binding)?.beforeMount?.(element, binding, vnode, null);
  },
  mounted(element, binding, vnode) {
    if (binding.value === false) return;
    getGlobalRevealDirective(binding)?.mounted?.(element, binding, vnode, null);
  },
  updated(element, binding, vnode, prevVnode: RevealUpdatedPrevVNode) {
    if (binding.value === false && binding.oldValue === false) return;
    getGlobalRevealDirective(binding)?.updated?.(element, binding, vnode, prevVnode);
  },
  unmounted(element, binding, vnode) {
    if (binding.value === false) return;
    getGlobalRevealDirective(binding)?.unmounted?.(element, binding, vnode, null);
  },
};

const resolved = computed(() => {
  const type = props.node.type ?? '';
  const override = nodeComponents.value[type];
  const fallback = defaultNodeComponents[type];

  if (override === undefined && !fallback) return null;
  return resolveOverride<Component>(override, fallback ?? '');
});
</script>

<template>
  <RenderMarks v-if="node.type === 'text'" :marks="node.marks ?? []">
    {{ node.text }}
  </RenderMarks>

  <component
    :is="resolved.is"
    v-else-if="resolved"
    v-reveal="revealValue"
    :class="resolved.class"
    :style="resolved.style"
    :node="node"
    :attrs="node.attrs ?? {}"
  >
    <RenderNode v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </component>

  <template v-else>
    <RenderNode v-for="(child, index) in node.content ?? []" :key="index" :node="child" />
  </template>
</template>
