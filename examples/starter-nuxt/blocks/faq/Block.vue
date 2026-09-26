<script setup lang="ts">
/**
 * Disclosure list of questions built on `@eldrajs/ui`'s `Accordion`/`AccordionItem`. `single`
 * (the block's own field) maps to `Accordion`'s `multiple` prop, inverted: `single: true` ->
 * `:multiple="false"`, which puts every `AccordionItem` in the same native `<details name>` group
 * so the browser itself closes the previously open sibling — no JavaScript coordinates it (see
 * that component's own doc comment).
 *
 * Each answer is rich text, but it lives one level inside a `list` item
 * (`items[].answer`), not as one of the block's own top-level fields.
 * `useEldraBlockField`/`isBlockFieldLocalized` (`@eldrajs/theme-vue`,
 * `@eldrajs/theme-core`) resolve a field's `localized` flag by matching a
 * flat `fieldId` against the block's *top-level* registered fields only —
 * there is no nested-path addressing for a list item's own fields. Passing
 * `api-id="faq"` here would silently resolve `localized: false` for every
 * answer regardless of the manifest (a wrong answer, not a missing
 * feature), so `EldraRichText` renders each answer through the same
 * component (and gets the same real markup) but with no `api-id` — read
 * rendering only, no editing/localization binding pretending to know a
 * field path the bindings do not actually support.
 */
import { computed } from 'vue';
import { EldraRichText } from '@eldrajs/theme-vue';
import { Accordion, AccordionItem, Container, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useUiId } from '../../app/composables/useUiId';

const props = defineProps<{ entry: EldraBlockEntry<'faq'> }>();
const { data, entryId } = useBlockData(props, 'faq');

const items = computed(() => data.value.items ?? []);
const headingId = `faq-heading-${useUiId()}`;
</script>

<template>
  <Section spacing="md" :labelled-by="headingId">
    <Container width="narrow">
      <div class="text-center">
        <h2 :id="headingId" class="text-3xl font-semibold md:text-4xl">{{ data.heading }}</h2>
        <p v-if="data.intro" class="text-muted mt-3 text-lg">{{ data.intro }}</p>
      </div>

      <Accordion class="mt-10" :multiple="!(data.single ?? false)">
        <AccordionItem v-for="(item, index) in items" :key="index" :title="item.question">
          <EldraRichText
            class="prose-eldra"
            :entry-id="entryId"
            :field="`items.${index}.answer`"
            :doc="item.answer"
          />
        </AccordionItem>
      </Accordion>
    </Container>
  </Section>
</template>
