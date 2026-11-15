<script setup lang="ts">
/**
 * A step indicator: an ordered list showing how far something has come ("Confirmed, Packed, On its
 * way, Delivered"). It only reports — no step is a link or a button, and nothing here takes focus.
 * For steps a visitor moves between, use `Tabs`; for a trail of pages, `Breadcrumb`.
 *
 * Not in design spec 1 (README, "Additions beyond the spec"). A real `<ol>`, so the order and the
 * count are announced; the current step carries `aria-current="step"`, and the other two states are
 * said in visually hidden text after the label, so no state rests on colour or weight alone.
 */
import { computed } from 'vue';
import { useEldraScope } from '../../composables/useEldraScope';
import { useMessages } from '../../composables/useMessages';
import { CHECK_PATHS } from '../../icons/paths';
import type { StepIndicatorProps, StepIndicatorState } from './types';

const eldra = useEldraScope();

const props = withDefaults(defineProps<StepIndicatorProps>(), {
  orientation: 'horizontal',
  classes: undefined,
});

const m = useMessages();

const vertical = computed(() => props.orientation === 'vertical');

function stateOf(index: number): StepIndicatorState {
  if (index < props.current) return 'done';
  return index === props.current ? 'current' : 'upcoming';
}

/** What a screen reader hears after the label. The current step says it with `aria-current`. */
function statusText(state: StepIndicatorState): string | undefined {
  if (state === 'done') return m.value.stepCompleted;
  if (state === 'upcoming') return m.value.stepNotStarted;
  return undefined;
}

/** The stroke `Badge` and `StockBadge` draw their small icons with: a check this size needs it. */
const ICON_STROKE_WIDTH = 2.25;

/**
 * Horizontal: equal columns that share the row and may shrink to nothing (`auto-cols-fr` is
 * `minmax(0, 1fr)`), so four long labels wrap inside their own column instead of widening the list.
 */
const rootClass = computed(() => [
  'eldra:m-0 eldra:min-w-0 eldra:list-none eldra:p-0',
  vertical.value
    ? 'eldra:flex eldra:flex-col eldra:gap-3'
    : 'eldra:grid eldra:grid-flow-col eldra:auto-cols-fr eldra:gap-2',
]);

const stepClass = computed(() => [
  'eldra:flex eldra:min-w-0',
  vertical.value ? 'eldra:flex-row eldra:items-start eldra:gap-2.5' : 'eldra:flex-col eldra:gap-2',
  props.classes?.step,
]);

/**
 * The marker. Horizontal: a 0.25rem bar across the column, `primary` up to and including the
 * current step, `border` after it. Vertical: a 1.25rem circle, filled `primary` with a check
 * (done) or a dot (current), an empty ring (upcoming). The transparent border is what a
 * forced-colours mode draws once it has removed the fill.
 */
function markerClass(state: StepIndicatorState) {
  const reached = state !== 'upcoming';
  if (!vertical.value) {
    return [
      'eldra:block eldra:h-1 eldra:w-full eldra:rounded-full eldra:border eldra:border-transparent',
      reached ? 'eldra:bg-primary' : 'eldra:bg-border',
      props.classes?.marker,
    ];
  }
  return [
    'eldra:mt-0.5 eldra:flex eldra:size-5 eldra:shrink-0 eldra:items-center eldra:justify-center eldra:rounded-full eldra:border-2',
    reached
      ? 'eldra:border-primary eldra:bg-primary eldra:text-primary-contrast'
      : 'eldra:border-border-strong eldra:bg-transparent',
    props.classes?.marker,
  ];
}

const contentClass = computed(() => [
  'eldra:flex eldra:min-w-0 eldra:flex-1 eldra:flex-col',
  props.classes?.content,
]);

function labelClass(state: StepIndicatorState) {
  return [
    'eldra:text-body-sm eldra:flex eldra:min-w-0 eldra:items-start eldra:gap-1 eldra:break-words',
    state === 'current' ? 'eldra:font-semibold' : 'eldra:font-normal',
    state === 'upcoming' ? 'eldra:text-muted' : 'eldra:text-text',
    props.classes?.label,
  ];
}

/** 1rem, nudged 0.125rem down toward the centre of the label's first line. */
const labelIconClass = computed(() => [
  'eldra:mt-0.5 eldra:size-4 eldra:shrink-0',
  props.classes?.labelIcon,
]);

const statusClass = computed(() => ['eldra:sr-only', props.classes?.status]);

const descriptionClass = computed(() => [
  'eldra:text-caption eldra:text-muted eldra:min-w-0 eldra:break-words',
  props.classes?.description,
]);
</script>

<template>
  <ol
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :data-orientation="orientation"
    :class="rootClass"
  >
    <li
      v-for="(step, index) in steps"
      :key="index"
      data-part="step"
      :data-state="stateOf(index)"
      :aria-current="stateOf(index) === 'current' ? 'step' : undefined"
      :class="stepClass"
    >
      <span data-part="marker" :class="markerClass(stateOf(index))" aria-hidden="true">
        <template v-if="vertical">
          <svg
            v-if="stateOf(index) === 'done'"
            class="eldra:size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            :stroke-width="ICON_STROKE_WIDTH"
            stroke-linecap="round"
            stroke-linejoin="round"
            focusable="false"
          >
            <path v-for="d in CHECK_PATHS" :key="d" :d="d" />
          </svg>
          <span
            v-else-if="stateOf(index) === 'current'"
            class="eldra:bg-primary-contrast eldra:size-2 eldra:rounded-full"
          />
        </template>
      </span>
      <span data-part="content" :class="contentClass">
        <span data-part="label" :class="labelClass(stateOf(index))">
          <svg
            v-if="!vertical && stateOf(index) === 'done'"
            data-part="labelIcon"
            :class="labelIconClass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            :stroke-width="ICON_STROKE_WIDTH"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path v-for="d in CHECK_PATHS" :key="d" :d="d" />
          </svg>
          <span class="eldra:min-w-0"
            >{{ step.label
            }}<span v-if="statusText(stateOf(index))" data-part="status" :class="statusClass">
              ({{ statusText(stateOf(index)) }})</span
            ></span
          >
        </span>
        <span v-if="step.description" data-part="description" :class="descriptionClass">{{
          step.description
        }}</span>
      </span>
    </li>
  </ol>
</template>
