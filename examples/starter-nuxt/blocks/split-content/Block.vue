<script setup lang="ts">
/**
 * A story told in rows of image and text that alternate sides (spec `02-blocks.md` "Split content",
 * lines 974–1070) — "our process"/"about the materials" sections. There is no `variant`: the
 * alternation itself is the design, and `startWith` only flips which side the *first* row's image
 * takes (`image-left` or `image-right`); every following row alternates from there.
 *
 * **Source order vs. visual order (spec → Keyboard & accessibility, 1.3.2).** Every row's markup
 * below puts the image (or, in the editor, its placeholder) before the text column, in that fixed
 * order — never swapped per row. The left/right alternation is done entirely with the CSS grid
 * `order` property (`imageOrderClass`/`textOrderClass`), which only ever changes *visual* position,
 * never DOM order — so tab/reading order is "image, then text" in every row, on every screen,
 * whichever side is showing, exactly the spec's own requirement. `rowGridColsClass` supplies the
 * matching column-width pair: the image's own track is always `7fr` and the text's `5fr`, whichever
 * physical column each currently occupies (spec → Layout, "48–64rem": "odd rows are 7fr 5fr (image
 * left) and even rows are 5fr 7fr (image right)").
 *
 * A row with no `image` (an author's deliberate choice — spec → States, "No image": "single column,
 * text max 40rem") drops the grid entirely and renders the text alone; the same emptiness in the
 * editor (`useEditing()`) instead shows an `EditorPlaceholder` in the image's place so there is
 * still something to click to add one (the same pattern `hero`'s own image slot uses).
 *
 * `rows[].text` is optional rich text with a small toolbar (bold/italic/link/undo/redo only — no
 * headings or lists, per the field's own `metadata.toolbar`), rendered through `EldraRichText` with
 * no `api-id`: like `faq`'s own per-item `answer` field, `rows[].text` lives one level inside a list
 * item, and `useEldraBlockField`/`isBlockFieldLocalized` only resolve a field's `localized` flag by
 * matching a flat top-level `fieldId` — there is no nested-path addressing, so passing `api-id`
 * here would silently (and wrongly) resolve `localized: false` regardless of the manifest. See
 * `blocks/faq/Block.vue`'s own comment for the full reasoning.
 *
 * `useRichTextScrollRegions` is applied once, to a ref around the whole `<ol>`, rather than once per
 * row: its own contract only needs a ref that *contains* every rendered rich-text root (it wraps
 * every `<table>`/marks every `<pre>` under whatever element it is given — see that composable's
 * doc comment), and a `<ol>` full of `EldraRichText` roots shares one common ancestor here, so one
 * call covers every row's rich text at once.
 */
import { computed, ref } from 'vue';
import { Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { DEFAULT_IMAGE_FRAMING, type ImageFraming } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useT } from '../../app/composables/useT';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

type Side = 'image-left' | 'image-right';

interface SplitContentRow {
  image?: { url: string; altText?: string | null; framing?: ImageFraming | null } | null;
  eyebrow?: string;
  heading?: string;
  text?: { content?: unknown[] } | null;
  linkLabel?: string;
  href?: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'split-content'> }>();
const { data, entryId } = useBlockData(props, 'split-content');
const editing = useEditing();
const t = useT();

const startWith = computed<Side>(() => data.value.startWith ?? 'image-left');
const rows = computed<SplitContentRow[]>(() => data.value.rows ?? []);

function oppositeSide(side: Side): Side {
  return side === 'image-left' ? 'image-right' : 'image-left';
}

/** Row 1 takes `startWith`'s side; every row after that alternates — see the module doc comment. */
function rowSide(index: number): Side {
  return index % 2 === 0 ? startWith.value : oppositeSide(startWith.value);
}

function rowHasImage(row: SplitContentRow): boolean {
  return Boolean(row.image);
}

function rowFraming(row: SplitContentRow): ImageFraming | undefined {
  return row.image?.framing ?? DEFAULT_IMAGE_FRAMING;
}

/** The image's own column is always `7fr`, wherever it lands — see the module doc comment. */
function rowGridColsClass(index: number): string {
  return rowSide(index) === 'image-left'
    ? '@tablet:grid-cols-[7fr_5fr]'
    : '@tablet:grid-cols-[5fr_7fr]';
}
/** The image is always first in the DOM (see the template); `order` only ever needs to move it —
 *  the text column's own class is just its mirror. */
function imageOrderClass(index: number): string {
  return rowSide(index) === 'image-right' ? '@tablet:order-2' : '';
}
function textOrderClass(index: number): string {
  return rowSide(index) === 'image-right' ? '@tablet:order-1' : '';
}

function rowHref(row: SplitContentRow): string | null {
  return safeHref(row.href);
}
function rowHasLink(row: SplitContentRow): boolean {
  return Boolean(row.linkLabel) && rowHref(row) !== null;
}
function rowLinkAs(row: SplitContentRow): typeof EldraRouterLink | undefined {
  const href = rowHref(row);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** An optional rich-text field with nothing written yet is an empty TipTap doc (or absent
 *  entirely) — either way, no paragraph content to render. */
function rowHasText(row: SplitContentRow): boolean {
  return Array.isArray(row.text?.content) && row.text!.content!.length > 0;
}

const rowsRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(rowsRoot, (caption) => caption ?? t('splitContent.richTextTableLabel'));
</script>

<template>
  <Section spacing="md" :aria-label="t('splitContent.label')">
    <Container width="wide">
      <ol ref="rowsRoot" role="list" class="@tablet:gap-16 grid gap-12">
        <li
          v-for="(row, index) in rows"
          :key="index"
          class="@tablet:gap-12 @content:gap-16 grid items-center gap-6"
          :class="rowHasImage(row) ? rowGridColsClass(index) : ''"
        >
          <UiImage
            v-if="rowHasImage(row)"
            :src="row.image!.url"
            :alt="row.image!.altText ?? ''"
            :framing="rowFraming(row)"
            :entry-id="entryId"
            :field-path="`rows.${index}.image`"
            aspect="4/3"
            rounded="xl"
            :class="imageOrderClass(index)"
          />
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('splitContent.imageHintLabel')"
            :classes="{ root: 'aspect-[4/3] w-full rounded-xl bg-surface-strong' }"
            :class="imageOrderClass(index)"
          />

          <div
            class="grid gap-4"
            :class="[rowHasImage(row) ? 'max-w-[30rem]' : 'max-w-[40rem]', textOrderClass(index)]"
          >
            <p v-if="row.eyebrow" class="text-overline text-accent">{{ row.eyebrow }}</p>
            <h2
              v-if="row.heading"
              class="font-heading text-text @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em]"
            >
              {{ row.heading }}
            </h2>
            <EditorPlaceholder
              v-else-if="editing"
              inline
              :label="t('splitContent.headingHintLabel')"
              :help="t('splitContent.headingHintHelp')"
            />

            <EldraRichText
              v-if="rowHasText(row)"
              class="prose-eldra text-body-lg text-muted [&>*+*]:mt-3"
              :entry-id="entryId"
              :field="`rows.${index}.text`"
              :doc="row.text"
            />

            <Link
              v-if="rowHasLink(row)"
              :href="rowHref(row)!"
              :as="rowLinkAs(row)"
              variant="standalone"
              arrow
              :classes="{ root: 'mt-1 text-lg' }"
            >
              {{ row.linkLabel }}
            </Link>
          </div>
        </li>
      </ol>
    </Container>
  </Section>
</template>
