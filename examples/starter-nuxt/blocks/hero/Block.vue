<script setup lang="ts">
import { computed } from 'vue';
import { imageFramingAttrs, type ImageFraming } from '@eldrajs/theme-vue';
import { safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: { id: string; data: Record<string, unknown> } }>();
const d = computed(
  () =>
    props.entry.data as {
      heading?: string;
      subheading?: string;
      ctaLabel?: string;
      ctaHref?: string;
      align?: string;
      image?: { url?: string; alt?: string; framing?: ImageFraming | null } | null;
    }
);
const ctaHref = computed(() => safeHref(d.value.ctaHref));
const imageAttrs = computed(() =>
  imageFramingAttrs(props.entry.id, 'image', d.value.image?.framing)
);
</script>

<template>
  <section class="hero" :data-align="d.align ?? 'center'">
    <img
      v-if="d.image?.url"
      class="hero-media"
      v-bind="imageAttrs"
      :src="d.image.url"
      :alt="d.image.alt ?? ''"
    />
    <div class="container">
      <h1>{{ d.heading }}</h1>
      <p v-if="d.subheading">{{ d.subheading }}</p>
      <div class="actions">
        <slot name="actions">
          <a v-if="d.ctaLabel && ctaHref" class="button" :href="ctaHref">{{ d.ctaLabel }}</a>
        </slot>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  padding-block: var(--theme-section);
  text-align: center;
  isolation: isolate;
  overflow: hidden;
}
.hero[data-align='left'] {
  text-align: left;
}
.hero-media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  opacity: 0.25;
}
.button {
  display: inline-block;
  background: var(--eldra-color-primary);
  color: var(--eldra-color-primary-contrast);
  padding: 0.75rem 1.5rem;
  border-radius: 0.375rem;
  text-decoration: none;
}
</style>
