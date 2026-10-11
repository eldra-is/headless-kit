<script setup lang="ts">
/**
 * A `list` facet: checkbox rows with counts, the first six behind a **Show all N**, and a search
 * field above a list of more than twelve (spec "Filter panel" → Variants, `list` facet row).
 *
 * The rows are the package's own `Checkbox`, restyled through its `classes` parts into the spec's
 * full-width row — a real `<input type="checkbox">` inside a `<label>`, with the package's drawn
 * box and its proxy focus ring, none of it forked. What is *not* taken from `Checkbox` is the
 * accessible name: the row carries an explicit `aria-label` of the whole sentence ("Sweaters, 18
 * products"), because the spec wants the count spoken as part of the name and in a place a
 * translation can choose, which a visible number with hidden words either side of it cannot give.
 *
 * A facet the store answers as a tree draws its children one indent in, inside a `role="group"`
 * named after the parent — a real grouping for a screen reader and **no extra tab stop**, which is
 * why it is a role on a wrapper rather than a tree widget: every row stays an ordinary checkbox in
 * source order, so `Tab`, `Esc` and **Show all N** behave exactly as they do in a flat facet.
 */
import { computed, ref } from 'vue';
import { useMessages } from '../../../composables/useMessages';
import { cx, partClass } from '../../../utils/cx';
import Button from '../../button/Button.vue';
import Checkbox from '../../checkbox/Checkbox.vue';
import Input from '../../input/Input.vue';
import {
  facetHasHiddenValues,
  facetIsSearchable,
  facetRows,
  facetValues,
  isValueDisabled,
  isValueSelected,
  visibleFacetValues,
} from '../useFilterPanel';
import type { FilterFacetValue } from '../types';
import { FACET_COUNT, FACET_ROW_GUTTER, FACET_ROW_HOVER, type FacetProps } from './shared';

const props = withDefaults(defineProps<FacetProps>(), {
  dense: false,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{ toggle: [value: string, checked: boolean] }>();

const m = useMessages(() => props.messages);

/**
 * The two pieces of state a list owns, and the reason `FilterGroup` keeps its body mounted while
 * collapsed: both die with the component, and a shopper who closes a group to look at another one
 * must not come back to a cleared search field.
 */
const expanded = ref(false);
const query = ref('');

const searchable = computed(() => facetIsSearchable(props.facet));
const listState = computed(() => ({ expanded: expanded.value, query: query.value }));
const visible = computed(() => visibleFacetValues(props.facet, listState.value));
const rows = computed(() => facetRows(visible.value));
const hasHidden = computed(() => facetHasHiddenValues(props.facet, listState.value));
const total = computed(() => facetValues(props.facet).length);
/** Only while a query is actually filtering: an empty facet is not a facet with no matches. */
const noMatches = computed(() => query.value.trim() !== '' && visible.value.length === 0);

const listId = computed(() => `${props.idPrefix}-values`);
const searchId = computed(() => `${props.idPrefix}-search`);

function selected(value: FilterFacetValue): boolean {
  return value.implied === true || isValueSelected(props.selection, props.facet.id, value.value);
}

function disabled(value: FilterFacetValue): boolean {
  return isValueDisabled(value, props.selection, props.facet.id);
}

/**
 * One row's whole accessible name. An implied child says so, because a ticked, disabled box with
 * no explanation reads as a dead end.
 */
function nameOf(value: FilterFacetValue, parent?: FilterFacetValue): string {
  let name = m.value.filterPanelValueName(value.label, value.count);
  if (disabled(value)) name += m.value.filterPanelNoneAvailable;
  if (value.implied === true && parent !== undefined) {
    name += `, ${m.value.filterPanelImpliedBy(parent.label)}`;
  }
  return name;
}

/* ------------------------------------------------------------------ classes */

/** Spec → Sizes, Facet search: "Input sm (2rem) of type search, 0.5rem above the list." */
const SEARCH_BASE = 'mb-2 w-full';
/** Spec → Sizes, Facet search: '"No matches" line: 0.875rem `muted`, 0.5rem vertical padding.' */
const NO_MATCHES_BASE = 'text-body-sm text-muted';
/** Only while there is a line to draw: an empty inline span takes no space of its own. */
const NO_MATCHES_SHOWN = 'block py-2';
/** Spec → Sizes, Option row: "Rows 0.125rem apart." */
const VALUES_BASE = 'flex min-w-0 flex-col gap-0.5';
/**
 * Spec → Sizes, Option row: "Min 2.25rem tall, padding 0.25rem 0.5rem with a −0.5rem side margin,
 * gap 0.625rem, `radius-sm`, line height 1.35."
 *
 * `Checkbox`'s own root is a `w-fit` two-column grid; a filter row is full width with its count at
 * the far end, which is what these overrides say — nothing about the box, the tick or their states
 * is restated, so every one of `Checkbox`'s own states still paints.
 */
const ROW_BASE = `grid w-full min-h-9 grid-cols-[auto_1fr] items-center gap-x-2.5 rounded-sm py-1 ${FACET_ROW_GUTTER}`;
/** Spec → Sizes, Option row: "Label wraps (breaks long words)." */
const ROW_LABEL_BASE = 'flex min-w-0 items-center gap-2.5 text-control break-words';
/** Spec → States, "Option row, checked": "label weight 600". */
const ROW_LABEL_CHECKED = 'font-semibold';
/** Spec → Sizes, Show all N: "Button link sm, 0.375rem above, 0.25rem gap, chevron 1rem." */
const SHOW_ALL_BASE = 'mt-1.5';
/** A nested child list, one indent in. */
const CHILDREN_BASE = 'ms-6 flex min-w-0 flex-col gap-0.5';

function rowClass(value: FilterFacetValue): string {
  return partClass(cx(ROW_BASE, !disabled(value) && FACET_ROW_HOVER), props.classes, 'row');
}

function rowLabelClass(value: FilterFacetValue): string {
  return partClass(
    cx(ROW_LABEL_BASE, selected(value) && ROW_LABEL_CHECKED),
    props.classes,
    'rowLabel'
  );
}

const searchClass = computed(() => partClass(SEARCH_BASE, props.classes, 'search'));
const noMatchesClass = computed(() =>
  partClass(cx(NO_MATCHES_BASE, noMatches.value && NO_MATCHES_SHOWN), props.classes, 'noMatches')
);
const valuesClass = computed(() => partClass(VALUES_BASE, props.classes, 'values'));
const countClass = computed(() => partClass(FACET_COUNT, props.classes, 'count'));
const showAllClass = computed(() => partClass(SHOW_ALL_BASE, props.classes, 'showAll'));
const checkboxClass = computed(() => partClass('', props.classes, 'checkbox'));
</script>

<template>
  <div class="min-w-0">
    <!-- Spec → Accessibility, Long lists: `<input type="search">` labelled "Search material
         values", placeholder "Search material", `aria-controls` pointing at the list. `Input`
         gives a `type="search"` field its clear button on its own. -->
    <!-- `data-part` on a wrapper rather than on `<Input>`: Vue applies fallthrough attributes
         after a child's own template bindings, so a bare `data-part` would land on `Input`'s
         inner `<input>` (it forwards `$attrs` there) and leave the field box unaddressable. -->
    <div v-if="searchable" data-part="search" :class="searchClass">
      <Input
        :id="searchId"
        v-model="query"
        type="search"
        size="sm"
        :aria-label="m.filterPanelSearchLabel(facet.label)"
        :placeholder="m.filterPanelSearchPlaceholder(facet.label)"
        :aria-controls="listId"
      >
        <template #leadingIcon>
          <!-- Tabler's `search`, stroke 1.75. Decorative: the field is named above. -->
          <svg
            class="size-4"
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
        </template>
      </Input>
    </div>

    <div :id="listId" data-part="values" :class="valuesClass">
      <template v-for="row in rows" :key="row.value.value">
        <Checkbox
          :model-value="selected(row.value)"
          :disabled="disabled(row.value)"
          :aria-label="nameOf(row.value)"
          :data-value="row.value.value"
          :classes="{
            root: rowClass(row.value),
            label: rowLabelClass(row.value),
            box: checkboxClass,
          }"
          @change="emit('toggle', row.value.value, $event)"
        >
          <span class="min-w-0">{{ row.value.label }}</span>
          <span data-part="count" :class="countClass">{{ row.value.count }}</span>
        </Checkbox>

        <div
          v-if="row.children.length > 0"
          role="group"
          :aria-label="m.filterPanelUnder(row.value.label)"
          :class="CHILDREN_BASE"
        >
          <Checkbox
            v-for="child in row.children"
            :key="child.value"
            :model-value="selected(child)"
            :disabled="disabled(child)"
            :aria-label="nameOf(child, row.value)"
            :data-value="child.value"
            :classes="{
              root: rowClass(child),
              label: rowLabelClass(child),
              box: checkboxClass,
            }"
            @change="emit('toggle', child.value, $event)"
          >
            <span class="min-w-0">{{ child.label }}</span>
            <span data-part="count" :class="countClass">{{ child.count }}</span>
          </Checkbox>
        </div>
      </template>
    </div>

    <!-- Spec → Accessibility: the "No matches" line is `role="status"`, so a shopper who has
         filtered a list down to nothing is told rather than left looking at an empty box.

         The region is **always rendered**, empty, rather than appearing with its text: a live
         region inserted at the same moment as its content is one assistive technology was never
         watching, and the announcement is lost. Empty, it is an inline span with no text and
         therefore no box of its own. -->
    <span data-part="noMatches" role="status" :class="noMatchesClass">
      <template v-if="noMatches">{{ m.noMatchesFor(query.trim()) }}</template>
    </span>

    <!-- Spec → Behaviour: "**Show all N** reveals the remaining values and changes to **Show
         fewer**; focus stays on the button." Focus stays because nothing moves it. -->
    <Button
      v-if="hasHidden || expanded"
      variant="link"
      size="sm"
      type="button"
      data-part="showAll"
      :classes="{ container: showAllClass }"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-controls="listId"
      @click="expanded = !expanded"
    >
      {{ expanded ? m.filterPanelShowFewer : m.filterPanelShowAll(total) }}
      <template #trailingIcon>
        <svg
          class="duration-base size-4 transition-[rotate] ease-out motion-reduce:transition-none"
          :class="expanded ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </template>
    </Button>
  </div>
</template>
