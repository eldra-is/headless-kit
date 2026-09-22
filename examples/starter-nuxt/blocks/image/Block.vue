<script setup lang="ts">
/**
 * A single framed image with an optional caption, in a `<figure>`/
 * `<figcaption>`. `aspect` (`auto`/`16/9`/`4/3`/`1/1`/`3/4`) sets the
 * rendered `aspect-ratio`; `auto` leaves the image's intrinsic ratio alone.
 * `width` maps directly onto `UiSection`'s `containerSize`
 * (`narrow`/`content`/`wide`/`full`) — the same four container tokens
 * `UiContainer` already exposes, so no separate width vocabulary is needed.
 *
 * Like `hero`, the image always gets a `framing` value (falling back to
 * `DEFAULT_IMAGE_FRAMING`) so the marker attributes and default cover style
 * are present even before an editor has framed anything — see
 * `test/framing.spec.ts`.
 */
import { computed } from 'vue';
import { DEFAULT_IMAGE_FRAMING } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'image'> }>();
const { data, entryId } = useBlockData(props, 'image');

const framing = computed(() => data.value.image?.framing ?? DEFAULT_IMAGE_FRAMING);
const aspect = computed(() => {
  const value = data.value.aspect;
  return value && value !== 'auto' ? value : undefined;
});
</script>

<template>
  <UiSection spacing="md" :container-size="data.width ?? 'content'">
    <figure v-if="data.image">
      <UiImage
        :src="data.image.url"
        :alt="data.image.altText ?? data.caption ?? ''"
        :framing="framing"
        :entry-id="entryId"
        field-path="image"
        :aspect="aspect"
        class="rounded-theme-lg w-full object-cover"
      />
      <figcaption v-if="data.caption" class="text-muted mt-3 text-sm">
        {{ data.caption }}
      </figcaption>
    </figure>
  </UiSection>
</template>
