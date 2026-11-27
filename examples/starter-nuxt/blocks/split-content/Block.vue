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
 * **The theme's look** (the "makers" story): the image takes the wider `1.15fr` track and the
 * text `1fr`, side by side from 961px of block width (stacked, image first, below that), with a
 * 5:4 photo, the design's `h2`, the row text as a muted lead paragraph and the row link as an
 * outline button. The block can carry a short `list`, shown under the first row's text — a round initial (`primary`,
 * `accent` and `border-strong` in turn, `aria-hidden`: the name beside it says the same), a name,
 * one line and a small link whose accessible name adds the entry's name ("Shop Harbour Pottery"),
 * so three "Shop" links are never three identical names. `background` puts the whole block on
 * `surface`.
 *
 * `useRichTextScrollRegions` is applied once, to a ref around the whole `<ol>`, rather than once per
 * row: its own contract only needs a ref that *contains* every rendered rich-text root (it wraps
 * every `<table>`/marks every `<pre>` under whatever element it is given — see that composable's
 * doc comment), and a `<ol>` full of `EldraRichText` roots shares one common ancestor here, so one
 * call covers every row's rich text at once.
 */
import { computed, ref } from 'vue';
import {
  Button,
  Container,
  EditorPlaceholder,
  Link,
  Section,
  VisuallyHidden,
  type SectionBackground,
} from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { DEFAULT_IMAGE_FRAMING, type ImageFraming } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useI18n } from 'vue-i18n';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

type Side = 'image-left' | 'image-right';

interface SplitContentEntry {
  title?: string;
  text?: string;
  linkLabel?: string;
  href?: string;
}

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
const { t } = useI18n();

const startWith = computed<Side>(() => data.value.startWith ?? 'image-left');
const background = computed<SectionBackground>(() => data.value.background ?? 'none');
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
    ? '@min-[60.0625rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'
    : '@min-[60.0625rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]';
}
/** The image is always first in the DOM (see the template); `order` only ever needs to move it —
 *  the text column's own class is just its mirror. */
function imageOrderClass(index: number): string {
  return rowSide(index) === 'image-right' ? '@min-[60.0625rem]:order-2' : '';
}
function textOrderClass(index: number): string {
  return rowSide(index) === 'image-right' ? '@min-[60.0625rem]:order-1' : '';
}

/**
 * The image's root reserves the 5:4 box (`aspect="5/4"` has no `Image` ratio preset, so `UiImage`
 * puts it on the root as an inline `aspect-ratio`), but `Image`'s frame inside it is `ratio="auto"`
 * and would size itself from the photo's own proportions — a 3:2 photo left a strip of empty root
 * under it. `h-full` makes the frame fill the box it sits in, and the `object-cover` media fills the
 * frame, so the image is the full 5:4 the design draws beside the text.
 */
const IMAGE_FILL_CLASSES = { frame: 'h-full' };

/** The round initials cycle through three theme colours, all dark enough for the light letter. */
const AVATAR_TONES = ['bg-primary', 'bg-accent', 'bg-border-strong'] as const;
function entryTone(index: number): string {
  return AVATAR_TONES[index % AVATAR_TONES.length]!;
}
function entryInitial(entry: SplitContentEntry): string {
  return Array.from((entry.title ?? '').trim())[0]?.toLocaleUpperCase() ?? '';
}
/** The block's `list` belongs to the first row (a block-level field, so adding it never changed
 *  the stored shape of `rows`). */
const entries = computed<SplitContentEntry[]>(() =>
  ((data.value.list ?? []) as SplitContentEntry[]).filter(
    (entry) => (entry.title ?? '').trim() !== ''
  )
);
function rowEntries(index: number): SplitContentEntry[] {
  return index === 0 ? entries.value : [];
}
function entryHref(entry: SplitContentEntry): string | null {
  return entry.linkLabel ? safeHref(entry.href) : null;
}
function entryLinkAs(entry: SplitContentEntry): typeof EldraRouterLink | undefined {
  const href = entryHref(entry);
  return href !== null && isInternalHref(href) ? EldraRouterLink : undefined;
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
  <Section :background="background" spacing="md" :aria-label="t('splitContent.label')">
    <Container width="wide">
      <ol ref="rowsRoot" role="list" class="grid gap-16 @min-[60.0625rem]:gap-24">
        <li
          v-for="(row, index) in rows"
          :key="index"
          class="grid items-center gap-8 @min-[60.0625rem]:gap-16"
          :class="rowHasImage(row) ? rowGridColsClass(index) : ''"
        >
          <UiImage
            v-if="rowHasImage(row)"
            :src="row.image!.url"
            :alt="row.image!.altText ?? ''"
            :framing="rowFraming(row)"
            :entry-id="entryId"
            :field-path="`rows.${index}.image`"
            aspect="5/4"
            rounded="xl"
            :classes="IMAGE_FILL_CLASSES"
            :class="imageOrderClass(index)"
          />
          <EditorPlaceholder
            v-else-if="editing"
            inline
            :label="t('splitContent.imageHintLabel')"
            :class="['bg-surface-strong aspect-[5/4] w-full rounded-xl', imageOrderClass(index)]"
          />

          <div
            class="min-w-0"
            :class="[rowHasImage(row) ? '' : 'max-w-[40rem]', textOrderClass(index)]"
          >
            <p v-if="row.eyebrow" class="text-overline text-accent mb-2">{{ row.eyebrow }}</p>
            <h2
              v-if="row.heading"
              class="font-heading text-text text-[1.75rem] leading-[1.1] font-medium tracking-[-0.01em] text-balance @min-[47.5625rem]:text-[2.25rem]"
            >
              {{ row.heading }}
            </h2>
            <EditorPlaceholder
              v-else-if="editing"
              inline
              :label="t('splitContent.headingHintLabel')"
              :help="t('splitContent.headingHintHelp')"
            />

            <!-- Each row's own heading above is an `h2`, so the row text's headings start at
                 `h3`. (`rows[].text`'s `metadata.toolbar` offers no heading control today, but the
                 floor costs nothing and survives a toolbar change.) -->
            <EldraRichText
              v-if="rowHasText(row)"
              class="prose-eldra text-muted mt-4 text-[1.125rem] leading-[1.6] [&>*+*]:mt-3"
              :entry-id="entryId"
              :field="`rows.${index}.text`"
              :doc="row.text"
              :min-heading-level="3"
            />

            <ul v-if="rowEntries(index).length > 0" role="list" class="border-border mt-6 border-t">
              <li
                v-for="(entry, entryIndex) in rowEntries(index)"
                :key="entryIndex"
                class="border-border grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 border-b py-3.5"
              >
                <span
                  class="font-heading text-primary-contrast grid size-12 place-items-center rounded-full text-[1.125rem]"
                  :class="entryTone(entryIndex)"
                  aria-hidden="true"
                  >{{ entryInitial(entry) }}</span
                >
                <span class="min-w-0">
                  <span class="block font-semibold">{{ entry.title }}</span>
                  <span v-if="entry.text" class="text-muted block text-sm">{{ entry.text }}</span>
                </span>
                <Link
                  v-if="entryHref(entry) !== null"
                  :href="entryHref(entry)!"
                  :as="entryLinkAs(entry)"
                  class="text-[0.9375rem] font-semibold"
                >
                  {{ entry.linkLabel }}<VisuallyHidden>&nbsp;{{ entry.title }}</VisuallyHidden>
                </Link>
              </li>
            </ul>

            <Button
              v-if="rowHasLink(row)"
              :href="rowHref(row)!"
              :as="rowLinkAs(row)"
              variant="outline"
              class="mt-7"
            >
              {{ row.linkLabel }}
            </Button>
          </div>
        </li>
      </ol>
    </Container>
  </Section>
</template>
