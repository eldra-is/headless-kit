<script setup lang="ts">
/**
 * Disclosure list of questions built on `UiAccordion`/`UiAccordionItem`.
 * `single` closes a sibling item when a new one opens (see
 * `UiAccordion.vue`).
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
 * field path the bindings do not actually support. See task-7-report.md.
 */
import { computed } from 'vue';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import UiAccordion from '../../app/components/ui/UiAccordion.vue';
import UiAccordionItem from '../../app/components/ui/UiAccordionItem.vue';
import UiSection from '../../app/components/ui/UiSection.vue';

const props = defineProps<{ entry: EldraBlockEntry<'faq'> }>();
const { data, entryId } = useBlockData(props, 'faq');

const items = computed(() => data.value.items ?? []);
</script>

<template>
  <UiSection spacing="md" container-size="narrow">
    <div class="text-center">
      <h2 class="text-3xl font-semibold md:text-4xl">{{ data.heading }}</h2>
      <p v-if="data.intro" class="text-muted mt-3 text-lg">{{ data.intro }}</p>
    </div>

    <UiAccordion class="mt-10" :single="data.single ?? false">
      <UiAccordionItem v-for="(item, index) in items" :key="index" :title="item.question">
        <EldraRichText
          class="prose-eldra"
          :entry-id="entryId"
          :field="`items.${index}.answer`"
          :doc="item.answer"
        />
      </UiAccordionItem>
    </UiAccordion>
  </UiSection>
</template>
