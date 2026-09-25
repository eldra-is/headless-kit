<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import Icon from '../icon/Icon.vue';
import {
  emptyClass,
  groupClass,
  groupLabelClass,
  listboxClass,
  optionBoxClass,
  optionCheckClass,
  optionClass,
  optionHintClass,
  optionIconClass,
  optionLabelClass,
  optionMetaClass,
  optionSwatchClass,
  optionTickClass,
  panelClass,
  searchClass,
  type PanelClasses,
} from './panelParts';
import type { SelectOption } from './types';
import type { MatchParts, PanelSection } from './useOptionList';

/**
 * The popover a `Select` and a `MultiSelect` both open: the search field, the listbox with its
 * groups and option rows, and the empty state — plus a `footer` slot, which only a multi-select
 * fills.
 *
 * It exists so that the two controls share one panel rather than two copies of the same markup.
 * Everything it knows is a prop: it owns no open/closed state, no query, no value, and no keyboard
 * (that is `useListbox`). What it does own is the DOM the parents cannot: the panel element and
 * the search input, both exposed so the parent can position the one and focus the other, and the
 * pointer-press guard that keeps a press inside the panel from blurring the focused element.
 *
 * `multiple` is the one behavioural switch, and it is the spec's own: a multi-select's rows carry a
 * checkbox instead of a trailing check mark, and its listbox is `aria-multiselectable="true"`.
 */

const props = withDefaults(
  defineProps<{
    /** The panel element's own id. `useOverlay` reads it to recognise teleported parts. */
    panelId: string;
    /** The listbox's id — what the trigger's `aria-controls` points at. */
    listboxId: string;
    /** The visible options, already filtered and bucketed into their groups. */
    sections: PanelSection[];
    /** Whether any option is visible at all. */
    hasOptions: boolean;
    /** Per option value, where the query matched its label. */
    highlights: Map<string, MatchParts | null>;
    /** The element id of a row, which is what `aria-activedescendant` points at. */
    optionId: (value: string) => string;
    /** The active row's value, or `undefined`. */
    activeValue?: string;
    /** Every selected value. A single select passes exactly one. */
    selectedValues: string[];
    /** Whether the search field shows, and what is in it. */
    searchable: boolean;
    query: string;
    searchPlaceholder: string;
    /** The empty state's text ("No matches for “teal”"). */
    emptyText: string;
    /** The visible label's id, for the listbox's own name; `fallbackLabel` when there is none. */
    labelledBy?: string;
    fallbackLabel?: string;
    /** Checkbox rows and `aria-multiselectable="true"`. */
    multiple?: boolean;
    /** Inline position from `useFloating`, and the placement it resolved to. */
    panelStyle?: Record<string, string>;
    placement?: string;
    classes?: PanelClasses;
  }>(),
  {
    activeValue: undefined,
    labelledBy: undefined,
    fallbackLabel: undefined,
    multiple: false,
    panelStyle: undefined,
    placement: undefined,
    classes: undefined,
  }
);

const emit = defineEmits<{
  /** The search field's value changed. */
  search: [query: string];
  /** A row was clicked. Whether it can be chosen at all is the parent's rule. */
  select: [option: SelectOption];
  /** The pointer moved onto an enabled row, which makes it active. */
  activate: [value: string];
  /** A key pressed in the search field. The parent owns the keyboard. */
  keydown: [event: KeyboardEvent];
}>();

const root = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);

defineExpose({ root, searchInput });

const isActive = (option: SelectOption): boolean => props.activeValue === option.value;
const isSelected = (option: SelectOption): boolean => props.selectedValues.includes(option.value);

const panelClasses = computed(() => panelClass(props.classes));
const searchClasses = computed(() => searchClass(props.classes));
const listboxClasses = computed(() => listboxClass(props.classes, props.hasOptions));
const optionHintClasses = computed(() => optionHintClass(props.classes));
const optionSwatchClasses = computed(() => optionSwatchClass(props.classes));
const optionIconClasses = computed(() => optionIconClass(props.classes));
const optionCheckClasses = computed(() => optionCheckClass(props.classes));
const emptyClasses = computed(() => emptyClass(props.classes));

const rowClass = (option: SelectOption): string =>
  optionClass(props.classes, option, {
    active: isActive(option),
    selected: isSelected(option),
    multiple: props.multiple,
  });

const boxClass = (option: SelectOption): string =>
  optionBoxClass(props.classes, {
    selected: isSelected(option),
    disabled: option.disabled === true,
  });

/**
 * Spec "Select" → Behaviour: "The active option is scrolled into view with a 0.25rem margin
 * whenever it changes" — the margin is the row's own `scroll-my-1`.
 *
 * It lives here rather than in either parent because it is the one part of "the active row" that
 * needs an element, and the panel is what has the elements. Both controls get it from one copy.
 */
function scrollActiveIntoView(): void {
  const value = props.activeValue;
  if (value === undefined || typeof document === 'undefined') return;
  document.getElementById(props.optionId(value))?.scrollIntoView?.({ block: 'nearest' });
}

onMounted(scrollActiveIntoView);
watch(
  () => props.activeValue,
  () => void nextTick(scrollActiveIntoView)
);

function onSearchInput(event: Event): void {
  emit('search', (event.target as HTMLInputElement).value);
}

/**
 * Anything inside the panel that wants the pointer's default action: it takes focus, or places a
 * caret. The search field and — in a multi-select — the footer's Clear and Done buttons.
 */
const FOCUSABLE = 'input, button, a[href], textarea, select, [tabindex]:not([tabindex^="-"])';

/**
 * Spec "Select" → Behaviour: "Pointer presses inside the list don't blur the focused element."
 * `mousedown`'s default action is what moves focus, so preventing it keeps focus where it is while
 * the click still lands.
 *
 * It guards the whole **panel**, not just the list: the padding around the list, the search field's
 * hairline row and the "No matches" text are all press targets, and a press on any of them used to
 * blur the search field — which `useOverlay` then reads as focus leaving the overlay, closing the
 * panel mid-search. Real controls are the exception, because they need the default action to take
 * focus themselves.
 */
function onPanelMouseDown(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest(FOCUSABLE) !== null) return;
  event.preventDefault();
}
</script>

<template>
  <div
    ref="root"
    :id="panelId"
    data-part="panel"
    :class="panelClasses"
    :style="panelStyle"
    :data-placement="placement"
    @mousedown="onPanelMouseDown"
  >
    <div v-if="searchable" class="border-border relative shrink-0 border-b">
      <!-- Tabler's `search` at 1rem, 0.625rem from the start edge. -->
      <svg
        class="text-muted pointer-events-none absolute inset-y-0 start-2.5 my-auto size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
        <path d="M21 21l-6 -6" />
      </svg>
      <input
        ref="searchInput"
        data-part="search"
        type="text"
        role="combobox"
        :class="searchClasses"
        :value="query"
        :placeholder="searchPlaceholder"
        :aria-label="searchPlaceholder"
        aria-autocomplete="list"
        aria-expanded="true"
        :aria-controls="listboxId"
        :aria-activedescendant="activeValue === undefined ? undefined : optionId(activeValue)"
        autocomplete="off"
        spellcheck="false"
        @input="onSearchInput"
        @keydown="emit('keydown', $event)"
      />
    </div>

    <div
      :id="listboxId"
      data-part="listbox"
      role="listbox"
      :class="listboxClasses"
      :aria-multiselectable="multiple ? 'true' : undefined"
      :aria-labelledby="labelledBy"
      :aria-label="fallbackLabel"
    >
      <div
        v-for="(section, sectionIndex) in sections"
        :key="section.key"
        :data-part="section.label ? 'group' : undefined"
        :role="section.label ? 'group' : 'presentation'"
        :class="section.label ? groupClass(classes, sectionIndex) : undefined"
        :aria-labelledby="section.labelId"
      >
        <div
          v-if="section.label"
          :id="section.labelId"
          data-part="groupLabel"
          role="presentation"
          :class="groupLabelClass(classes, sectionIndex)"
        >
          {{ section.label }}
        </div>

        <div
          v-for="option in section.options"
          :key="option.value"
          :id="optionId(option.value)"
          data-part="option"
          role="option"
          :class="rowClass(option)"
          :aria-selected="isSelected(option) ? 'true' : 'false'"
          :aria-disabled="option.disabled ? 'true' : undefined"
          @click="emit('select', option)"
          @mouseenter="option.disabled ? undefined : emit('activate', option.value)"
        >
          <slot
            name="option"
            :option="option"
            :selected="isSelected(option)"
            :active="isActive(option)"
          >
            <!-- Spec "Multi-select" → Sizes: the box carries the state, so it comes first on the
                 row and there is no check mark at the end. Decorative: `aria-selected` announces
                 it. -->
            <span
              v-if="multiple"
              data-part="optionCheck"
              :class="boxClass(option)"
              aria-hidden="true"
            >
              <!-- The same tick as `Checkbox`, at the spec's 0.25 × 0.5rem with a 2px stroke. The
                   svg is drawn at exactly that size over an 8 × 4 viewBox, so one unit is one
                   pixel: `stroke-width="2"` is 2px, and the ink — the centreline plus a 1-unit
                   round cap at each end — measures 8 × 4 units, which is 0.5rem × 0.25rem. -->
              <svg
                :class="optionTickClass(isSelected(option))"
                viewBox="0 0 8 4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M1 1.83l1.5 1.17l4.5 -2" />
              </svg>
            </span>

            <span
              v-if="option.swatch"
              data-part="optionSwatch"
              :class="optionSwatchClasses"
              :style="{ backgroundColor: option.swatch }"
              aria-hidden="true"
            />
            <Icon
              v-else-if="option.icon"
              data-part="optionIcon"
              :icon="option.icon"
              :classes="{ root: optionIconClasses }"
            />

            <span class="min-w-0 flex-1">
              <span data-part="optionLabel" :class="optionLabelClass(classes, option)">
                <template v-if="highlights.get(option.value)"
                  >{{ highlights.get(option.value)?.before
                  }}<span class="eldra-select-match">{{ highlights.get(option.value)?.match }}</span
                  >{{ highlights.get(option.value)?.after }}</template
                >
                <template v-else>{{ option.label }}</template>
              </span>
              <span v-if="option.hint" data-part="optionHint" :class="optionHintClasses">
                {{ option.hint }}
              </span>
            </span>

            <span
              v-if="option.meta"
              data-part="optionMeta"
              :class="optionMetaClass(classes, option)"
            >
              {{ option.meta }}
            </span>

            <!-- Spec "Select" → States, Option selected: "check mark in `text` (never colour
                 alone)". Decorative: `aria-selected` is what announces it. -->
            <svg
              v-if="!multiple && isSelected(option)"
              data-part="optionCheck"
              :class="optionCheckClasses"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M5 12l5 5l10 -10" />
            </svg>
          </slot>
        </div>
      </div>
    </div>

    <div v-if="!hasOptions" data-part="empty" :class="emptyClasses">
      <slot name="empty">{{ emptyText }}</slot>
    </div>

    <!-- Spec "Multi-select" → Anatomy: the footer "stays put while the list scrolls". -->
    <slot name="footer" />
  </div>
</template>
