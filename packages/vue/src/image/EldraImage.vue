<script setup lang="ts">
import { computed } from 'vue';
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

const image = computed(() =>
  responsiveImage(props.src, {
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
