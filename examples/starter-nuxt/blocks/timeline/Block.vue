<script setup lang="ts">
/**
 * Timeline: numbered process steps or dated milestones that read left to right from 64rem of the
 * block's own width and top to bottom below that (spec `02-blocks.md` 1999–2100, "Timeline").
 *
 * `variant`:
 *  - `steps` ("how it's made"): 2.5rem circular markers on a `background` fill with a ring and the
 *    step number (`aria-hidden`, bold tabular figures). Each title starts with visually hidden
 *    text so the number is not read twice (spec → Keyboard & accessibility).
 *  - `history` (dated milestones): 1rem hollow dot markers (`background` fill, `accent` ring) and
 *    a bold `accent` year line above each title. `items[].year` is `history`-only — never shown
 *    for `steps`, whatever value it holds.
 *
 * Ring width: the spec calls for a 1.5px ring on the `steps` marker (2px on `history`'s). Neither
 * `@eldrajs/ui`'s `tailwind.css` `@theme` nor its tokens expose a 1.5px border-width scale value —
 * only per-component custom properties inside the package itself, which blocks may not reach into
 * (global constraint: blocks never fork/patch the package). The nearest real Tailwind border
 * utility is the default `border` (1px), used here for `steps`'s ring so it stays visibly thinner
 * than `history`'s `border-2` (2px) — the two are meant to read as different weights, and 1px vs
 * 2px preserves that distinction closer than rounding both to 2px would.
 *
 * Layout: below `@content` (64rem) each item is its own 2-column grid, marker beside body — the
 * `grid-cols-1` override from `@content` collapses that to one column, so the *same* two grid
 * children (marker, then body) simply stack via ordinary row auto-placement with no separate
 * "horizontal" template needed. The outer `<ol>` mirrors this: a plain `flex-col` list below
 * `@content`, an N-column grid (from `columns`) above it.
 *
 * Connectors are two separate decorative, `aria-hidden` `<span>`s per item (one for the vertical
 * line used below `@content`, one for the short horizontal stub used from `@content`) rather than
 * one element reused for both: the two geometries share no positioning logic (a full-height line
 * down the marker column vs. a short stub reaching into the column gap at the marker's own
 * mid-height), and each is simply hidden at the breakpoint it doesn't apply to. Neither renders
 * for the last item (spec → Layout, States: "the last item has no connector" in both layouts); a
 * mid-sequence item that happens to sit last in a wrapped row keeps its stub with no extra logic,
 * since only the *overall* last item is excluded.
 *
 * Empty items (spec → States, "Empty (freshly inserted)"): the whole section renders nothing live
 * (same "no required content, no render" rule `faq`/`newsletter` use) and, in the editor, shows the
 * heading hint plus one marker ("1", or the `history` dot) beside a single item hint — never a
 * plain boxed placeholder standing in for the whole list, since the spec's own empty screenshot
 * shows a real marker next to the hint text.
 */
import { computed } from 'vue';
import { Container, EditorPlaceholder, Link, Section, VisuallyHidden } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

interface TimelineItem {
  year?: string;
  title?: string;
  text?: string;
}

const props = defineProps<{ entry: EldraBlockEntry<'timeline'> }>();
const { data } = useBlockData(props, 'timeline');
const t = useT();
const editing = useEditing();

const headingId = `timeline-heading-${useUiId()}`;

type Variant = 'steps' | 'history';
const variant = computed<Variant>(() => data.value.variant ?? 'steps');
const isSteps = computed(() => variant.value !== 'history');

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => editing.value && !hasHeading.value);
const headingClass =
  'font-heading text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] @tablet:text-h2';

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');

const linkHref = computed(() => safeHref(data.value.linkHref));
const hasLink = computed(() => Boolean(data.value.linkLabel) && linkHref.value !== null);
const linkAs = computed(() =>
  linkHref.value !== null && isInternalHref(linkHref.value) ? EldraRouterLink : undefined
);

const items = computed<TimelineItem[]>(() => data.value.items ?? []);
const hasItems = computed(() => items.value.length > 0);

function isLastItem(index: number): boolean {
  return index === items.value.length - 1;
}

function stepLabel(index: number): string {
  return t('timeline.step', { n: index + 1 });
}

function hasText(item: TimelineItem): boolean {
  return (item.text ?? '').trim() !== '';
}

function hasYear(item: TimelineItem): boolean {
  return !isSteps.value && (item.year ?? '').trim() !== '';
}

/** `auto` = the item count, capped at 4 (spec → Fields, `columns`); at least 1 so the empty-editor
 *  placeholder (a single synthetic item) never looks up a 0-column class. */
const columnsCount = computed(() => {
  const setting = data.value.columns ?? 'auto';
  if (setting === 'auto') return Math.min(Math.max(items.value.length, 1), 4);
  const parsed = Number(setting);
  return Number.isFinite(parsed) ? parsed : 4;
});
const COLUMNS_CLASS: Record<number, string> = {
  1: '@content:grid-cols-1',
  2: '@content:grid-cols-2',
  3: '@content:grid-cols-3',
  4: '@content:grid-cols-4',
  5: '@content:grid-cols-5',
};
const listClass = computed(() => [
  'flex flex-col gap-8 @content:grid @content:gap-x-6 @content:gap-y-12',
  COLUMNS_CLASS[columnsCount.value] ?? COLUMNS_CLASS[4],
]);

/** Marker column width below `@content`: 2.5rem (`steps`) or 1rem (`history`); a single column
 *  from `@content`, where marker and body simply stack in DOM order instead. */
const itemClass = computed(() => [
  'relative grid items-start gap-x-4 gap-y-4 @content:grid-cols-1',
  isSteps.value ? 'grid-cols-[2.5rem_1fr]' : 'grid-cols-[1rem_1fr]',
  isSteps.value ? '@content:gap-y-5' : '',
]);

/** Below `@content` only: nudges the body (`steps`) or the dot (`history`) by 0.4rem so the title
 *  optically aligns with the marker (spec → Layout). Reset from `@content`, where the marker sits
 *  above the body instead of beside it. */
const bodyClass = computed(() => [
  'flex flex-col gap-2 @content:pr-4',
  isSteps.value ? 'mt-[0.4rem] @content:mt-0' : '',
]);
const historyDotClass = computed(() => (isSteps.value ? '' : 'mt-[0.4rem] @content:mt-0'));

/** Vertical connector (below `@content`): a 1px line down the centre of the marker column,
 *  starting under the marker and reaching past the item's own bottom edge into the 2rem gap that
 *  separates it from the next item (spec's own numbers: from 2.5rem for `steps`, 1.75rem for
 *  `history`). */
const verticalConnectorClass = computed(() => [
  'absolute w-px bg-border-strong @content:hidden',
  'bottom-[-2rem]',
  isSteps.value ? 'left-5 top-10' : 'left-2 top-7',
]);

/** Horizontal connector (from `@content`): a short 1px stub level with the marker's centre,
 *  starting 0.75rem after the marker and reaching 0.75rem into the column gap. */
const horizontalConnectorClass = computed(() => [
  'absolute hidden h-px bg-border-strong @content:block',
  '@content:-right-3',
  isSteps.value ? '@content:left-13 @content:top-5' : '@content:left-7 @content:top-2',
]);
</script>

<template>
  <Section
    v-if="hasItems || editing"
    :background="sectionBackground"
    spacing="md"
    :labelled-by="headingId"
  >
    <Container width="content">
      <div class="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div class="max-w-[40rem]">
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <template v-else-if="showHeadingHint">
            <EditorPlaceholder
              :id="headingId"
              inline
              :label="t('timeline.headingHintLabel')"
              :help="t('timeline.headingHintHelp')"
            />
          </template>
          <p v-if="hasIntro" class="text-muted text-body-lg mt-3">{{ intro }}</p>
        </div>
        <Link v-if="hasLink" :href="linkHref!" :as="linkAs" variant="standalone" arrow>
          {{ data.linkLabel }}
        </Link>
      </div>

      <ol v-if="hasItems" role="list" :class="listClass">
        <li v-for="(item, index) in items" :key="index" :class="itemClass">
          <div class="relative">
            <div
              v-if="isSteps"
              class="border-text bg-background text-text flex size-10 items-center justify-center rounded-full border"
            >
              <span aria-hidden="true" class="text-base font-bold tabular-nums">{{
                index + 1
              }}</span>
            </div>
            <div
              v-else
              aria-hidden="true"
              class="border-accent bg-background size-4 rounded-full border-2"
              :class="historyDotClass"
            />
            <span
              v-if="!isLastItem(index)"
              aria-hidden="true"
              data-part="connector"
              :class="verticalConnectorClass"
            />
            <span
              v-if="!isLastItem(index)"
              aria-hidden="true"
              data-part="connector"
              :class="horizontalConnectorClass"
            />
          </div>

          <div :class="bodyClass">
            <p v-if="hasYear(item)" class="text-accent text-base font-bold tabular-nums">
              {{ item.year }}
            </p>
            <h3 class="font-heading text-lg font-semibold">
              <VisuallyHidden v-if="isSteps">{{ stepLabel(index) }}</VisuallyHidden
              >{{ item.title }}
            </h3>
            <p v-if="hasText(item)" class="text-muted text-base">{{ item.text }}</p>
          </div>
        </li>
      </ol>
      <ol v-else-if="editing" role="list" :class="listClass">
        <li :class="itemClass">
          <div class="relative">
            <div
              v-if="isSteps"
              class="border-text bg-background text-text flex size-10 items-center justify-center rounded-full border"
            >
              <span aria-hidden="true" class="text-base font-bold tabular-nums">1</span>
            </div>
            <div
              v-else
              aria-hidden="true"
              class="border-accent bg-background size-4 rounded-full border-2"
              :class="historyDotClass"
            />
          </div>
          <EditorPlaceholder
            inline
            :label="t('timeline.itemHintLabel')"
            :help="t('timeline.itemHintHelp')"
          />
        </li>
      </ol>
    </Container>
  </Section>
</template>
