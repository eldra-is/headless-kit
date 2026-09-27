<script setup lang="ts">
/**
 * FAQ: frequently asked questions as a native accordion, with an optional intro and a link to
 * customer care for anything the list doesn't answer (spec `02-blocks.md` "FAQ", 1406–1522).
 *
 * `exclusive` (the block's own field, renamed from v1's `single` — same bool, same storage
 * shape, `block.json`'s own `migrations` entry) maps to `Accordion`'s `multiple` prop, inverted:
 * `exclusive: true` -> `:multiple="false"`, which puts every `AccordionItem` in the same native
 * `<details name>` group so the browser itself closes the previously open sibling — no JavaScript
 * coordinates it (see that component's own doc comment). `name` is passed explicitly
 * (`faq-<uiId>`) so the group survives even though `Accordion` would otherwise generate one of its
 * own; it is simply discarded by `Accordion` itself whenever `exclusive` is false (`multiple`
 * true), per that component's own `context` computed.
 *
 * `items[].open` decides each item's *initial* open state only — `AccordionItem`'s own
 * `modelValue` is a controllable model (`useControllableModel`, `packages/ui`): passing a plain,
 * unlistened `:model-value` seeds the starting value and every further open/close is then driven
 * entirely by the native `<details>` element itself (see that package's own Accordion stories,
 * which use the identical one-way pattern). Per the field table, "Default: only the first item is
 * open (or none)" — `itemOpen()` below falls back to `index === 0` only when an item's own `open`
 * is genuinely unset (`??`, not `||`), so an editor who explicitly sets every item's `open` to
 * `false` really does get every item closed.
 *
 * Each answer is rich text, but it lives one level inside a `list` item (`items[].answer`), not as
 * one of the block's own top-level fields. `useEldraBlockField`/`isBlockFieldLocalized`
 * (`@eldrajs/theme-vue`, `@eldrajs/theme-core`) resolve a field's `localized` flag by matching a
 * flat `fieldId` against the block's *top-level* registered fields only — there is no nested-path
 * addressing for a list item's own fields. Passing `api-id="faq"` here would silently resolve
 * `localized: false` for every answer regardless of the manifest (a wrong answer, not a missing
 * feature), so `EldraRichText` renders each answer through the same component (and gets the same
 * real markup) but with no `api-id` — read rendering only, no editing/localization binding
 * pretending to know a field path the bindings do not actually support (see `split-content`'s own
 * `rows[].text` for the identical reasoning).
 *
 * Answers cap at 65ch: that comes for free from `AccordionItem`'s own panel class
 * (`max-w-[65ch]`, see that component's source) — nothing here repeats it.
 *
 * `variant`:
 *  - `one-column` (default): a centred head (heading, intro) inside a `narrow` (40rem) container —
 *    the container's own width is what caps the accordion at 40rem, no extra class needed — then
 *    the accordion 1.5rem below, then the contact line centred 2rem further down.
 *  - `two-column`: a `content` (64rem) container. From `@content` (64rem of the block's own width)
 *    a `4fr` head column (heading, intro, the contact line — "the contact line sits inside the
 *    head") sits beside a `7fr` accordion column, 4rem gap, top-aligned; the head column is sticky
 *    2rem from the top of the viewport, plus the height of a sticky header when there is one
 *    (`--eldra-header-height`, the variable `header` sets — 0 when absent). Below `@content` it
 *    stacks, head left-aligned, 2rem above the accordion.
 *
 * "An empty items list hides the whole block" (spec States -> Empty): the entire `<Section>` is
 * gated on `hasItems || editing`, matching every other rebuilt block's "no required content, no
 * render" rule — the editor branch is what lets the heading/intro/first-question hints (spec line
 * 1473) show on a freshly inserted block that has neither a heading nor a single item yet.
 */
import { computed, ref } from 'vue';
import { Accordion, AccordionItem, Container, EditorPlaceholder, Link, Section } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { EldraRichText } from '@eldrajs/theme-vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useRichTextScrollRegions } from '../../app/composables/useRichTextScrollRegions';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

interface FaqItem {
  question?: string;
  answer?: { content?: unknown[] } | null;
  open?: boolean;
}

const props = defineProps<{ entry: EldraBlockEntry<'faq'> }>();
const { data, entryId } = useBlockData(props, 'faq');
const editing = useEditing();
const t = useT();

const uiId = useUiId();
const headingId = `faq-heading-${uiId}`;
const accordionName = `faq-${uiId}`;

type Variant = 'one-column' | 'two-column';
const variant = computed<Variant>(() => data.value.variant ?? 'one-column');
const isTwoColumn = computed(() => variant.value === 'two-column');

const exclusive = computed(() => data.value.exclusive ?? true);
const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);
const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] @tablet:text-h2';

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => editing.value && !hasIntro.value);

const items = computed<FaqItem[]>(() => data.value.items ?? []);
const hasItems = computed(() => items.value.length > 0);
const showItemsHint = computed(() => editing.value && !hasItems.value);

/** See the module doc comment: only genuinely unset (`undefined`/`null`) falls back to "first item
 *  on", an explicit `false` is respected. */
function itemOpen(item: FaqItem, index: number): boolean {
  return item.open ?? index === 0;
}

const contactText = computed(() => (data.value.contactText ?? '').trim());
const contactLinkLabel = computed(() => (data.value.contactLinkLabel ?? '').trim());
const contactHref = computed(() => safeHref(data.value.contactLinkHref));
const hasContactLink = computed(() => contactLinkLabel.value !== '' && contactHref.value !== null);
const contactLinkAs = computed(() =>
  contactHref.value !== null && isInternalHref(contactHref.value) ? EldraRouterLink : undefined
);

/** See `split-content`'s own identical call: one ref around every rendered `EldraRichText` root
 *  covers every answer's rich text at once, no per-item call needed. */
const accordionRoot = ref<HTMLElement | null>(null);
useRichTextScrollRegions(accordionRoot, (caption) => caption ?? t('faq.richTextTableLabel'));
</script>

<template>
  <Section
    v-if="hasItems || editing"
    :background="sectionBackground"
    spacing="md"
    :labelled-by="headingId"
  >
    <Container :width="isTwoColumn ? 'content' : 'narrow'">
      <!-- two-column: a 4fr sticky head column (heading, intro, contact line) beside a 7fr
           accordion column from 64rem, stacked below with the head left aligned -->
      <div
        v-if="isTwoColumn"
        class="@content:grid @content:grid-cols-[4fr_7fr] @content:items-start @content:gap-16 flex flex-col gap-8"
      >
        <div
          class="@content:sticky @content:top-[calc(2rem_+_var(--eldra-header-height,0px))] flex flex-col gap-4"
        >
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('faq.headingHintLabel')"
          />
          <p v-if="hasIntro" class="text-muted text-body-lg">{{ intro }}</p>
          <EditorPlaceholder v-else-if="showIntroHint" inline :label="t('faq.introHintLabel')" />
          <p v-if="hasContactLink" class="text-muted text-base">
            {{ contactText }}
            <Link
              :href="contactHref!"
              :as="contactLinkAs"
              variant="inline"
              :classes="{ root: 'font-semibold' }"
            >
              {{ contactLinkLabel }}
            </Link>
          </p>
        </div>

        <div ref="accordionRoot">
          <Accordion v-if="hasItems" :multiple="!exclusive" :name="accordionName">
            <AccordionItem
              v-for="(item, index) in items"
              :key="index"
              :title="item.question"
              :model-value="itemOpen(item, index)"
            >
              <EldraRichText
                class="prose-eldra"
                :entry-id="entryId"
                :field="`items.${index}.answer`"
                :doc="item.answer"
              />
            </AccordionItem>
          </Accordion>
          <EditorPlaceholder
            v-else-if="showItemsHint"
            inline
            :label="t('faq.itemHintLabel')"
            :help="t('faq.itemHintHelp')"
          />
        </div>
      </div>

      <!-- one-column: centred head, a 40rem accordion (the narrow container's own width), the
           contact line centred below -->
      <template v-else>
        <div class="mx-auto flex max-w-[40rem] flex-col items-center gap-3 text-center">
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('faq.headingHintLabel')"
          />
          <p v-if="hasIntro" class="text-muted text-body-lg">{{ intro }}</p>
          <EditorPlaceholder v-else-if="showIntroHint" inline :label="t('faq.introHintLabel')" />
        </div>

        <div ref="accordionRoot" class="mt-6">
          <Accordion v-if="hasItems" :multiple="!exclusive" :name="accordionName">
            <AccordionItem
              v-for="(item, index) in items"
              :key="index"
              :title="item.question"
              :model-value="itemOpen(item, index)"
            >
              <EldraRichText
                class="prose-eldra"
                :entry-id="entryId"
                :field="`items.${index}.answer`"
                :doc="item.answer"
              />
            </AccordionItem>
          </Accordion>
          <EditorPlaceholder
            v-else-if="showItemsHint"
            inline
            :label="t('faq.itemHintLabel')"
            :help="t('faq.itemHintHelp')"
          />
        </div>

        <p v-if="hasContactLink" class="text-muted mt-8 text-center text-base">
          {{ contactText }}
          <Link
            :href="contactHref!"
            :as="contactLinkAs"
            variant="inline"
            :classes="{ root: 'font-semibold' }"
          >
            {{ contactLinkLabel }}
          </Link>
        </p>
      </template>
    </Container>
  </Section>
</template>
