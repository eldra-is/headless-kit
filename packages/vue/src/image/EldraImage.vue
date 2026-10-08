<script setup lang="ts">
import { computed } from 'vue';
import { safeImageSrc } from '@eldrajs/rich-text';
import { responsiveImage, type EldraImageSource, type EldraSizedImageVariant } from '@eldrajs/sdk';

const props = withDefaults(
  defineProps<{
    src: EldraImageSource;
    alt: string;
    sizes: string;
    variant?: EldraSizedImageVariant;
    aspectRatio?: number;
    width?: number;
    height?: number;
    originalWidth?: number;
    loading?: 'lazy' | 'eager';
  }>(),
  { loading: 'lazy' }
);

const safeSource = computed<EldraImageSource>(() => {
  const source = props.src;
  if (typeof source === 'string') return safeImageSrc(source);
  const url = safeImageSrc(source?.url);
  return url ? { ...source, url } : undefined;
});

const image = computed(() =>
  responsiveImage(safeSource.value, {
    sizes: props.sizes,
    variant: props.variant,
    aspectRatio: props.aspectRatio,
    width: props.width,
    height: props.height,
    originalWidth: props.originalWidth,
  })
);
</script>

<template>
  <img v-if="image" :loading="props.loading" decoding="async" v-bind="image" :alt="props.alt" />
</template>
