<script setup lang="ts">
import { computed } from 'vue';
import { imageFramingAttrs, type ImageFraming } from '@eldrajs/theme-vue';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      caption?: string;
      fullWidth?: boolean;
      image?: { url?: string; altText?: string | null; framing?: ImageFraming | null } | null;
    }
);
const imageAttrs = computed(() =>
  imageFramingAttrs(props.entry.id, 'image', d.value.image?.framing)
);
</script>

<template>
  <figure :class="{ container: !d.fullWidth, full: d.fullWidth }">
    <img
      v-if="d.image?.url"
      v-bind="imageAttrs"
      :src="d.image.url"
      :alt="d.image.altText ?? d.caption ?? ''"
    />
    <figcaption v-if="d.caption">{{ d.caption }}</figcaption>
  </figure>
</template>

<style scoped>
figure {
  margin-block: var(--theme-section);
  overflow: hidden;
}
figure.full {
  margin-inline: 0;
}
img {
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  height: auto;
  display: block;
}
figcaption {
  margin-block-start: 0.5rem;
  color: var(--eldra-color-muted);
}
</style>
