<script setup lang="ts">
/**
 * A standalone block of formatted text with an optional heading, for brand stories, policies and
 * care notes (spec `02-blocks.md` "Rich text", lines 2943-3033). There is no `variant` field —
 * `alignment` (`left`/`center`) and `container` (`narrow`/`content`, `Container`'s own widths)
 * together pick one of three layouts:
 *
 *  - `left` + `narrow`: the heading stacks above the text in the container's own 40rem column.
 *  - `left` + `content`: **split** — from the block's own 64rem width (`@content`, `Section`'s
 *    `@container` root) the heading sits in a `5fr` column and the text in `7fr` (capped at
 *    40rem), 4rem gap, top-aligned. Below 64rem it stacks, same as `left` + `narrow`.
 *  - `center` (either container): heading and text centred, the text capped at 44rem (`content`)
 *    or 40rem (`narrow`) via `.prose-eldra-center` (`app/assets/main.css`) alongside `.prose-eldra`.
 *
 * The split's two grid tracks only ever apply while there is something to put in the heading
 * track (`hasHeadingSlot`: a real heading, or — in the editor — its empty-heading hint). With no
 * heading at all (spec States → "Minimal content": "One paragraph, no heading. The text starts at
 * the section's top padding") there is nothing to split against, so the block falls back to the
 * same single flowing column `left` + `narrow` uses, letting the text use the full `content` width
 * rather than the 40rem cap that only makes sense next to a heading column.
 *
 * **No landmark without a heading.** `Section`'s own `labelledBy` prop already implements "a
 * `<section aria-labelledby>` with a heading, a plain `<div>` without one" (see that component's
 * doc comment) — this block only ever passes `labelledBy`, never `ariaLabel`, and lets it fall
 * through to a `<div>` when there is no heading, the same as `gallery`'s own `sectionLabelledBy`.
 *
 * **Body headings start at h3.** `EldraRichText` renders a `heading` node at whatever level its
 * TipTap `attrs.level` carries, clamped only to the generic 1-6 range — there is no
 * `headingOffset`/`minHeadingLevel`-style prop on the component, and the toolbar's `heading`
 * control id is level-agnostic, so nothing in `block.json` can restrict which level an editor
 * inserts. `floorRichTextHeadingLevels` (`./headingLevels.ts`) floors every heading in the TipTap
 * document itself — never the rendered HTML — at h3 before it reaches `EldraRichText`; see that
 * module's own doc comment for the full reasoning and the `minHeadingLevel`-on-the-package
 * follow-up it names.
 *
 * `body` is required, but — like `quote`'s `quote` and `faq`'s `items` — a freshly inserted block
 * still has an empty one: the whole `Section` is gated on `hasBody || editing`, the same "no
 * required content, no render" rule every rebuilt block with required content follows.
 */
import { computed, ref } from 'vue';
import { Container, EditorPlaceholder, Section } from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import { floorRichTextHeadingLevels } from './headingLevels';

type Alignment = 'left' | 'center';
type ContainerOption = 'narrow' | 'content';

const props = defineProps<{ entry: EldraBlockEntry<'rich-text'> }>();
const { data, entryId } = useBlockData(props, 'rich-text');
const editing = useEditing();
const t = useT();
const headingId = `rich-text-heading-${useUiId()}`;

const headingText = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => headingText.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);
/** Whether the layout should reserve a heading track at all — see the module doc comment. */
const hasHeadingSlot = computed(() => hasHeading.value || showHeadingHint.value);

const alignment = computed<Alignment>(() => data.value.alignment ?? 'left');
const containerWidth = computed<ContainerOption>(() => data.value.container ?? 'narrow');
const isCentered = computed(() => alignment.value === 'center');
const isSplit = computed(
  () => alignment.value === 'left' && containerWidth.value === 'content' && hasHeadingSlot.value
);

const body = computed(() => floorRichTextHeadingLevels(data.value.body));
const hasBody = computed(() => Array.isArray(body.value?.content) && body.value.content.length > 0);
const showBodyHint = computed(() => editing.value && !hasBody.value);
const showBlock = computed(() => hasBody.value || editing.value);

const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] @tablet:text-h2';

/** `grid` for the split (single column below `@content`, two from it); `flex flex-col` otherwise
 *  (stacked `left`/`narrow`, or centred). 1.25rem (`gap-5`) is the stacked gap the spec's Layout
 *  section gives every non-split arrangement ("Heading h2, then the text 1.25rem below"); the
 *  split's own 4rem (`gap-16`) column gap only takes over from `@content`. */
const columnsClass = computed(() => {
  if (isSplit.value) {
    return 'grid gap-5 @content:grid-cols-[5fr_7fr] @content:items-start @content:gap-16';
  }
  if (isCentered.value) return 'flex flex-col items-center gap-5 text-center';
  return 'flex flex-col gap-5';
});

/** Only the text column ever gets a width cap (spec Variants: "text in 7fr (text at most 40rem)",
 *  "the text column at most 44rem (40rem in narrow)") — the heading never does. */
const bodyColumnClass = computed(() => {
  if (isSplit.value) return 'max-w-[40rem]';
  if (isCentered.value) {
    return containerWidth.value === 'content' ? 'mx-auto max-w-[44rem]' : 'mx-auto max-w-[40rem]';
  }
  return '';
});

const richTextClass = computed(() => ['prose-eldra', isCentered.value ? 'prose-eldra-center' : '']);

const columnsRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(
  columnsRoot,
  (caption) => caption ?? t('richTextBlock.richTextTableLabel')
);
</script>

<template>
  <Section v-if="showBlock" spacing="md" :labelled-by="hasHeading ? headingId : undefined">
    <Container :width="containerWidth">
      <div ref="columnsRoot" :class="columnsClass">
        <template v-if="hasHeadingSlot">
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ headingText }}</h2>
          <EditorPlaceholder
            v-else
            :id="headingId"
            inline
            :label="t('richTextBlock.headingHintLabel')"
            :help="t('richTextBlock.headingHintHelp')"
          />
        </template>

        <div :class="bodyColumnClass">
          <EldraRichText
            v-if="hasBody"
            :class="richTextClass"
            :entry-id="entryId"
            field="body"
            :doc="body"
            api-id="rich-text"
          />
          <EditorPlaceholder
            v-else-if="showBodyHint"
            inline
            :label="t('richTextBlock.bodyHintLabel')"
            :help="t('richTextBlock.bodyHintHelp')"
          />
        </div>
      </div>
    </Container>
  </Section>
</template>
