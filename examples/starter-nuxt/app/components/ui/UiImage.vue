<script setup lang="ts">
import { computed } from 'vue';
import { imageFramingAttrs, imageFramingStyle, type ImageFraming } from '@eldrajs/theme-vue';

const props = withDefaults(
  defineProps<{
    src: string;
    /** Required; pass an empty string for a purely decorative image. */
    alt: string;
    framing?: ImageFraming | null;
    /** Entry/field the framing belongs to — enables the Studio overlay's
     * interactive framing controls. Omit for images with no CMS entry
     * (e.g. a static logo) to still get plain `imageFramingStyle`. */
    entryId?: string;
    fieldPath?: string;
    /** `aspect-ratio` value, e.g. `"16/9"`, applied as an inline style. */
    aspect?: string;
    sizes?: string;
    /** Marks an above-the-fold image: `loading="eager"` + `fetchpriority="high"`. */
    priority?: boolean;
  }>(),
  {
    framing: null,
    entryId: undefined,
    fieldPath: undefined,
    aspect: undefined,
    sizes: '100vw',
    priority: false,
  }
);

const framingAttrs = computed(() => {
  if (!props.framing) return null;
  return props.entryId && props.fieldPath
    ? imageFramingAttrs(props.entryId, props.fieldPath, props.framing)
    : { style: imageFramingStyle(props.framing) };
});

const style = computed(() => {
  const merged: Record<string, string> = { ...(framingAttrs.value?.style ?? {}) };
  if (props.aspect) merged['aspect-ratio'] = props.aspect;
  return merged;
});

const dataAttrs = computed(() => {
  const attrs = framingAttrs.value;
  if (!attrs || !('data-eldra-framing' in attrs)) return {};
  return {
    'data-eldra-framing': attrs['data-eldra-framing'],
    'data-eldra-framing-entry': attrs['data-eldra-framing-entry'],
    'data-eldra-framing-value': attrs['data-eldra-framing-value'],
  };
});
</script>

<template>
  <img
    :src="src"
    :alt="alt"
    :role="alt === '' ? 'presentation' : undefined"
    :sizes="sizes"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : undefined"
    :style="style"
    v-bind="dataAttrs"
  />
</template>
