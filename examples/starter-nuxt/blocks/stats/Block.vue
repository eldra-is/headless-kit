<script setup lang="ts">
/**
 * Stats: two to four real, checkable figures with short labels that back up the brand story (spec
 * `02-blocks.md` 1072–1171, "Stats"). Plain layout only — no `@eldrajs/ui` component beyond
 * `Section`/`Container`/`EditorPlaceholder`, since the spec's own "Uses" line for this block is
 * "plain layout only (headings and lists); nothing is interactive."
 *
 * `variant`:
 *  - `row`: heading and intro share one flex-wrap row (the intro, capped at 26rem, naturally wraps
 *    onto its own line once the row runs out of space — ordinary `flex-wrap` reflow, not a
 *    breakpoint, so it also does the right thing in a narrow page-builder column), then the
 *    figures below.
 *  - `split`: identical head row below `@content` (64rem of the block's own width — "it looks like
 *    row"); from `@content` the outer wrapper becomes a two-column grid (`5fr`/`7fr`, 4rem gap) and
 *    the head switches from a row to heading-above-intro. `@content:` is one of the two container
 *    query variants the package currently compiles to nothing for (a fix is in flight) — written
 *    here exactly as the spec requires regardless, per the task's known-issue note.
 *
 * Colour: `Section` already sets the ground's plain-text colour on its own root (`text-text` on
 * `none`/`surface`/`surface-strong`, `text-primary-contrast`/`text-accent-contrast` on the two
 * inverting grounds) and that colour is a normal, inherited CSS `color` — so the heading and every
 * figure value carry no colour class of their own and simply inherit the right one on every
 * background, matching the spec's "Figures … become primary-contrast/accent-contrast" note with no
 * per-background branching. Only the two parts that are deliberately `muted` at rest (the intro and
 * each label) need a branch, since `muted` is a fixed token with no built-in inversion: on
 * `primary`/`accent` that class is dropped so they inherit the same full-contrast colour instead
 * (spec: "Labels … and intro become primary-contrast/accent-contrast", i.e. no longer muted). The
 * item rule (`border-t`) gets the matching border-colour swap ("item rules become currentColor").
 *
 * Figures are static — no count-up animation (spec Accessibility: "Don't animate counting up: it
 * bypasses reduced motion and reads wrongly mid-animation"), so this file carries no
 * transition/animation class anywhere.
 *
 * "Items with an empty value are not rendered live" (spec States → Empty): `renderedItems` drops
 * them outside the editor; inside the editor (`useEditing()`) every item still renders so its own
 * per-item hint can show where content goes (spec States → Empty: "two figures ('Add a figure',
 * e.g. 38)").
 */
import { computed } from 'vue';
import { Container, EditorPlaceholder, Section } from '@eldrajs/ui';
import type { SectionBackground } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';

const props = defineProps<{ entry: EldraBlockEntry<'stats'> }>();
const { data } = useBlockData(props, 'stats');
const t = useT();
const isEditing = useEditing();
const headingId = `stats-heading-${useUiId()}`;

const isSplit = computed(() => (data.value.variant ?? 'row') === 'split');

const sectionBackground = computed<SectionBackground>(() => data.value.sectionBackground ?? 'none');
const isInverted = computed(
  () => sectionBackground.value === 'primary' || sectionBackground.value === 'accent'
);

const heading = computed(() => (data.value.heading ?? '').trim());
const hasHeading = computed(() => heading.value !== '');
const showHeadingHint = computed(() => isEditing.value && !hasHeading.value);

const intro = computed(() => (data.value.intro ?? '').trim());
const hasIntro = computed(() => intro.value !== '');
const showIntroHint = computed(() => isEditing.value && !hasIntro.value);

interface StatsItem {
  value?: string;
  label?: string;
}

function isItemEmpty(item: StatsItem): boolean {
  return (item.value ?? '').trim() === '' && (item.label ?? '').trim() === '';
}

/** Live: only items with a value render (spec States → Empty). Editing: every item renders, so an
 * empty one can show its own hint rather than vanishing while an editor is filling it in. */
const renderedItems = computed<StatsItem[]>(() => {
  const items = data.value.items ?? [];
  if (isEditing.value) return items;
  return items.filter((item) => (item.value ?? '').trim() !== '');
});

/** Spec Layout: "a single item spans the full width." `col-span-full` (`grid-column: 1 / -1`)
 * works the same against the mobile 2-column grid and the tablet-up `auto-fit` track list. */
const isSingleItem = computed(() => renderedItems.value.length === 1);

const outerClass = computed(() => [
  'flex flex-col gap-8 @tablet:gap-12',
  isSplit.value
    ? '@content:grid @content:grid-cols-[5fr_7fr] @content:items-start @content:gap-16'
    : '',
]);

const headClass = computed(() => [
  'flex flex-wrap items-start justify-between gap-x-8 gap-y-3',
  isSplit.value ? '@content:flex-col @content:items-stretch @content:gap-3' : '',
]);

const headingClass =
  'font-heading @tablet:text-h2 text-[1.625rem] leading-[1.15] font-bold tracking-[-0.015em] text-balance';

const introClass = computed(() => [
  'text-body-lg max-w-[26rem]',
  isInverted.value ? '' : 'text-muted',
]);

const gridClass =
  'grid grid-cols-2 gap-x-6 gap-y-8 @tablet:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]';

const itemBorderClass = computed(() => (isInverted.value ? 'border-current' : 'border-border'));
const itemClass = computed(() => [
  'grid gap-3 border-t pt-5',
  itemBorderClass.value,
  isSingleItem.value ? 'col-span-full' : '',
]);

const valueClass =
  'font-heading text-[2.5rem] @tablet:text-[3.5rem] leading-none font-bold tracking-[-0.03em] tabular-nums wrap-anywhere';

const labelClass = computed(() => ['text-base max-w-[22ch]', isInverted.value ? '' : 'text-muted']);
</script>

<template>
  <Section :background="sectionBackground" spacing="md" :labelled-by="headingId">
    <Container width="content">
      <div :class="outerClass">
        <div :class="headClass">
          <h2 v-if="hasHeading" :id="headingId" :class="headingClass">{{ heading }}</h2>
          <EditorPlaceholder
            v-else-if="showHeadingHint"
            :id="headingId"
            inline
            :label="t('stats.headingHintLabel')"
          />
          <p v-if="hasIntro" :class="introClass">{{ intro }}</p>
          <EditorPlaceholder v-else-if="showIntroHint" inline :label="t('stats.introHintLabel')" />
        </div>

        <ul role="list" :class="gridClass">
          <li v-for="(item, index) in renderedItems" :key="index" :class="itemClass">
            <template v-if="isEditing && isItemEmpty(item)">
              <EditorPlaceholder
                inline
                :label="t('stats.itemHintLabel')"
                :help="t('stats.itemHintHelp')"
              />
            </template>
            <template v-else>
              <p :class="valueClass">{{ item.value }}</p>
              <p :class="labelClass">{{ item.label }}</p>
            </template>
          </li>
        </ul>
      </div>
    </Container>
  </Section>
</template>
