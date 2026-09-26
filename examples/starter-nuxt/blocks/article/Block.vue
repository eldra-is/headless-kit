<script setup lang="ts">
/**
 * Long-form rich text: heading, an optional meta line (byline/date) and
 * lead paragraph, then the rich-text body. `width` picks the container
 * (`narrow` 40rem, the default, or `content` 64rem) — narrow reads best for
 * continuous prose, `content` for a piece that embeds wider tables/images.
 *
 * `EldraRichText` gets `class="prose-eldra"`: Vue's automatic attrs
 * fallthrough merges it onto the component's single root `<div>` (see
 * `EldraRichText.ts` — it never sets `inheritAttrs: false`), so no wrapper
 * element is needed. `.prose-eldra` (app/assets/main.css, `@layer
 * components`) is the rich-text typography layer: headings, lists,
 * blockquote, code, table, image and link styles driven by the same design
 * tokens as the rest of the starter.
 */
import { computed } from 'vue';
import { EldraRichText } from '@eldrajs/theme-vue';
import { Container, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useUiId } from '../../app/composables/useUiId';

const props = defineProps<{ entry: EldraBlockEntry<'article'> }>();
const { data, entryId } = useBlockData(props, 'article');

const width = computed(() => data.value.width ?? 'narrow');
const headingId = `article-heading-${useUiId()}`;
</script>

<template>
  <Section spacing="md" :labelled-by="headingId">
    <Container :width="width">
      <article>
        <header>
          <h1 :id="headingId" class="text-4xl font-semibold md:text-5xl">{{ data.heading }}</h1>
          <p v-if="data.meta" class="text-muted mt-3 text-sm">{{ data.meta }}</p>
          <p v-if="data.lead" class="text-text mt-6 text-xl leading-relaxed">{{ data.lead }}</p>
        </header>
        <EldraRichText
          class="prose-eldra mt-10"
          :entry-id="entryId"
          field="body"
          :doc="data.body"
          api-id="article"
        />
      </article>
    </Container>
  </Section>
</template>
