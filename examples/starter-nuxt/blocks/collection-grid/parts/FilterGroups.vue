<script setup lang="ts">
/**
 * The `collection-grid` block's filter groups — one component rendered twice: in the sticky
 * sidebar (`dense`, from 64rem of the block's own width) and inside the filter drawer at narrower
 * widths. Both get the same values and counts; what differs is only the target sizes the spec asks
 * for in a 15rem sidebar (spec `02-blocks.md` "Collection grid" → Layout, "Filter groups (sidebar
 * and drawer share them)") and *whose* selection they write to: the sidebar applies live, the
 * drawer's copy applies only when "Show N products" is pressed. This component knows neither —
 * it renders the `selection` it is handed and emits the shopper's intent.
 *
 * **Not `Accordion`/`AccordionItem`.** The spec's Accessibility section is explicit that a group
 * trigger is "a `<button>` inside an `h3`, with `aria-expanded` and `aria-controls`", and its
 * Layout section puts a count badge inside that trigger ("the count badge ('1') pushed to the
 * right 0.5rem before a chevron"). The package's `AccordionItem` is a native
 * `<details>`/`<summary>` whose trigger content is a plain `title` string: it exposes no
 * `aria-expanded`/`aria-controls` of its own and has no slot a `Badge` could go in, and neither is
 * reachable through its `classes` overrides. So the disclosure is theme-drawn, exactly as
 * `blocks/navigation/Block.vue`'s mega-menus are, and it buys the spec's keyboard row that
 * `<details>` cannot express either: "Inside an open filter group, `Esc` collapses it and returns
 * focus to its trigger."
 *
 * The three checkbox shapes, and why only one of them is hand-drawn:
 *  - **Category / Availability** are the package `Checkbox` as it comes, with the store's count in
 *    `muted` tabular figures inside the label (so the accessible name reads "Knitwear (18)").
 *  - **Size** is the same package `Checkbox` restyled through its own `classes` parts into a pill:
 *    the drawn `box` becomes the pill itself (`absolute inset-0`, which is where the real
 *    `<input>` already lives, so the whole pill is the target and the package's own proxy focus
 *    ring is drawn around the pill), the tick is hidden and the `label` is centred over it. Nothing
 *    is forked and the input stays a real checkbox with a real `<label>` around it.
 *  - **Colour** cannot go through `Checkbox` at all: the dot's colour arrives as *data* (the
 *    facet's `swatch`), so it has to be an inline `style`, and `Checkbox` forwards `$attrs` —
 *    `style` included — to its `<input>`, where nothing is visible. It is therefore the one
 *    affordance the theme draws itself, which the plan's own constraint list anticipates ("anything
 *    the theme draws itself (a gallery tile, a mega-menu trigger, **a colour-swatch checkbox**)"),
 *    still as a native `<input type="checkbox">` inside a `<label>`, with `focusRingProxy` moving
 *    the package's ring onto the dot. Checked is never colour alone: a 2px `text` ring at a 2px
 *    gap *plus* a bold, underlined name.
 */
import { computed, ref, watch } from 'vue';
import { Badge, Button, Checkbox, FieldWrapper, Input, VisuallyHidden } from '@eldrajs/ui';
import { useT } from '../../../app/composables/useT';
import { focusRingProxy } from '../../../app/utils/classes';
import {
  COLLAPSED_COUNT,
  COLLAPSE_FROM,
  sanitizeAmount,
  type FilterGroup,
  type FilterGroupValue,
  type FilterSelection,
  type FilterSource,
} from './groups';

const props = withDefaults(
  defineProps<{
    groups: FilterGroup[];
    /** The selection these groups render — the block's live one, or the drawer's pending copy. */
    selection: FilterSelection;
    /** The price range's two bounds, as the shopper typed them (digits only, `''` = no bound). */
    min: string;
    max: string;
    /** Namespaces every `id` this component mints, so the sidebar and the drawer never collide. */
    idPrefix: string;
    /** The 15rem sidebar's tighter targets (spec Layout: pills 2.5rem, colour rows 2.25rem). */
    dense?: boolean;
  }>(),
  { dense: false }
);

const emit = defineEmits<{
  toggle: [source: FilterSource, value: string, checked: boolean];
  'update:min': [value: string];
  'update:max': [value: string];
}>();

const t = useT();

const selectedIn = (source: FilterSource): readonly string[] => props.selection[source] ?? [];
const isChecked = (source: FilterSource, value: string): boolean =>
  selectedIn(source).includes(value);
const selectedCount = (group: FilterGroup): number =>
  group.source === 'price'
    ? (props.min === '' ? 0 : 1) + (props.max === '' ? 0 : 1)
    : selectedIn(group.source).length;

/**
 * Open state, per group. Unset until the shopper touches the trigger, so the initial answer stays
 * the field's own (`collapsed`) — overridden by the spec's "A group with an active value always
 * starts open", which is why a group that carries a selection reads open regardless.
 */
const openOverride = ref<Partial<Record<FilterSource, boolean>>>({});
const isOpen = (group: FilterGroup): boolean =>
  openOverride.value[group.source] ?? (!group.collapsed || selectedCount(group) > 0);

const triggers = ref<Record<string, HTMLButtonElement | null>>({});
function setTrigger(source: FilterSource, el: unknown): void {
  triggers.value[source] = (el as HTMLButtonElement | null) ?? null;
}

function toggleGroup(group: FilterGroup): void {
  openOverride.value = { ...openOverride.value, [group.source]: !isOpen(group) };
}

/** Spec Keyboard: "Inside an open filter group, `Esc` collapses it and returns focus to its
 *  trigger." */
function collapseGroup(group: FilterGroup): void {
  openOverride.value = { ...openOverride.value, [group.source]: false };
  triggers.value[group.source]?.focus();
}

/** Spec States → "Many items": 12 or more values show the first 8 behind a "Show all 14" link. */
const expanded = ref<Partial<Record<FilterSource, boolean>>>({});
function visibleValues(group: FilterGroup): FilterGroupValue[] {
  if (group.values.length < COLLAPSE_FROM || expanded.value[group.source] === true) {
    return group.values;
  }
  return group.values.slice(0, COLLAPSED_COUNT);
}
const hasHiddenValues = (group: FilterGroup): boolean =>
  group.values.length >= COLLAPSE_FROM && expanded.value[group.source] !== true;
function showAllValues(group: FilterGroup): void {
  expanded.value = { ...expanded.value, [group.source]: true };
}

/** Local mirrors so a keystroke is sanitised before it leaves the component (and before it can
 *  become a request), while an externally cleared range still reaches the inputs. */
const minValue = ref(props.min);
const maxValue = ref(props.max);
watch(
  () => props.min,
  (value) => {
    minValue.value = value;
  }
);
watch(
  () => props.max,
  (value) => {
    maxValue.value = value;
  }
);
function onMin(raw: string): void {
  minValue.value = sanitizeAmount(raw);
  emit('update:min', minValue.value);
}
function onMax(raw: string): void {
  maxValue.value = sanitizeAmount(raw);
  emit('update:max', maxValue.value);
}

const panelId = (source: FilterSource): string => `${props.idPrefix}-panel-${slug(source)}`;
const triggerId = (source: FilterSource): string => `${props.idPrefix}-trigger-${slug(source)}`;
const fieldId = (source: FilterSource, part: string): string =>
  `${props.idPrefix}-${slug(source)}-${part}`;
const slug = (source: FilterSource): string => source.replace(':', '-');

/** Spec Layout, Filter groups: "The trigger is a full-width button at least 3rem tall, 0.5rem
 *  vertical padding, 1rem text weight 600, left-aligned". `eldra-focus` comes from the package's
 *  own utility layer, the same ring every package control draws. */
const TRIGGER =
  'flex min-h-12 w-full cursor-pointer items-center gap-2 py-2 text-start eldra-focus';

const CHEVRON =
  'size-5 shrink-0 text-text transition-[rotate] duration-base ease-out motion-reduce:transition-none';

/** Spec Layout, Size row: 2.5rem tall, at least 2.75rem wide, 0 0.75rem padding — 2.5rem × 2.5rem
 *  minimum with 0 0.5rem padding in the desktop sidebar. */
const pillRoot = computed(() =>
  [
    'relative grid-cols-1 items-center justify-items-center gap-0 rounded-full h-10',
    props.dense ? 'min-w-10 px-2' : 'min-w-11 px-3',
  ].join(' ')
);
function pillClasses(checked: boolean): Record<string, string> {
  return {
    root: pillRoot.value,
    // The drawn box becomes the pill: `absolute inset-0` over the root, which is where the real
    // `<input>` already sits, so the pill is the hit target and the package's proxy ring wraps it.
    box: [
      'absolute inset-0 m-0 mt-0 size-full rounded-full border',
      checked
        ? 'bg-primary border-primary'
        : 'bg-background border-border-strong group-hover:border-text',
    ].join(' '),
    check: 'hidden',
    // `relative` so the label paints over the absolutely positioned box behind it.
    label: [
      'relative text-base text-center',
      checked ? 'text-primary-contrast font-semibold' : 'text-text',
    ].join(' '),
  };
}

/** Spec Layout, Colour row: "Each row is at least 2.75rem tall (2.25rem in the desktop sidebar)". */
const colourRow = computed(() =>
  ['group flex cursor-pointer items-center gap-2', props.dense ? 'min-h-9' : 'min-h-11'].join(' ')
);

/**
 * The dot's outer shape: a 2px ring at a 2px gap around a 1.5rem dot, so 2rem across in every
 * state — transparent at rest, `text` when checked (spec Accessibility: "The checked state shows as
 * a 2px `text` ring around the dot (2px gap) **plus** a bold, underlined name"), `border-strong` on
 * hover. Never resizes, so the row does not shift when a colour is picked.
 */
function dotWrapClasses(checked: boolean): string {
  return [
    'relative inline-flex size-8 shrink-0 rounded-full border-2 p-0.5',
    focusRingProxy,
    checked ? 'border-text' : 'border-transparent group-hover:border-border-strong',
  ].join(' ');
}
function colourNameClasses(checked: boolean): string {
  return [
    'min-w-0 truncate text-base text-text',
    checked ? 'font-semibold underline underline-offset-[0.2em]' : '',
  ].join(' ');
}

/** The count beside a Category/Availability value: `muted`, tabular figures (spec Layout). */
const COUNT = 'text-muted tabular-nums';
</script>

<template>
  <div>
    <div
      v-for="(group, index) in groups"
      :key="group.source"
      class="border-border border-b"
      :class="index === 0 ? 'border-t' : ''"
    >
      <h3 class="m-0">
        <button
          :ref="(el) => setTrigger(group.source, el)"
          type="button"
          :id="triggerId(group.source)"
          :class="TRIGGER"
          :aria-expanded="isOpen(group) ? 'true' : 'false'"
          :aria-controls="panelId(group.source)"
          @click="toggleGroup(group)"
        >
          <span class="min-w-0 flex-1 text-base font-semibold">{{ group.label }}</span>
          <Badge
            v-if="selectedCount(group) > 0"
            tone="primary"
            pill
            :hidden-suffix="t('grid.nSelected', { count: selectedCount(group) })"
          >
            <span aria-hidden="true">{{ selectedCount(group) }}</span>
          </Badge>
          <!-- Tabler's `chevron-down`, decorative; turns 180° over `duration-base` when open. -->
          <svg
            :class="[CHEVRON, isOpen(group) ? 'rotate-180' : '']"
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
        </button>
      </h3>

      <fieldset
        v-show="isOpen(group)"
        :id="panelId(group.source)"
        class="min-w-0 pb-5"
        @keydown.esc.stop="collapseGroup(group)"
      >
        <VisuallyHidden as="legend">{{ group.legend }}</VisuallyHidden>

        <!-- Category and Availability: plain checkboxes with the store's own count. -->
        <div v-if="group.kind === 'checkbox'" class="flex flex-col gap-2">
          <Checkbox
            v-for="value in visibleValues(group)"
            :key="value.value"
            :model-value="isChecked(group.source, value.value)"
            @change="emit('toggle', group.source, value.value, $event)"
          >
            {{ value.label }} <span :class="COUNT">({{ value.count }})</span>
          </Checkbox>
        </div>

        <!-- Size: pill checkboxes in a wrapping row. -->
        <div v-else-if="group.kind === 'size'" class="flex flex-wrap gap-2">
          <Checkbox
            v-for="value in visibleValues(group)"
            :key="value.value"
            :model-value="isChecked(group.source, value.value)"
            :classes="pillClasses(isChecked(group.source, value.value))"
            @change="emit('toggle', group.source, value.value, $event)"
          >
            {{ value.label }}
          </Checkbox>
        </div>

        <!-- Colour: a 2-column grid of dots with a real checkbox over each one. -->
        <div v-else-if="group.kind === 'colour'" class="grid grid-cols-2 gap-x-3 gap-y-1">
          <label v-for="value in visibleValues(group)" :key="value.value" :class="colourRow">
            <span :class="dotWrapClasses(isChecked(group.source, value.value))">
              <span
                class="border-border-strong block size-full rounded-full border"
                :style="{ backgroundColor: value.swatch }"
              />
              <input
                type="checkbox"
                class="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
                :value="value.value"
                :checked="isChecked(group.source, value.value)"
                @change="
                  emit(
                    'toggle',
                    group.source,
                    value.value,
                    ($event.target as HTMLInputElement).checked
                  )
                "
              />
            </span>
            <span :class="colourNameClasses(isChecked(group.source, value.value))">{{
              value.label
            }}</span>
          </label>
        </div>

        <!-- Price: Min, the word "to", Max. -->
        <div v-else class="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <FieldWrapper :id="fieldId(group.source, 'min')" :label="t('grid.minLabel')">
            <!-- The currency prefix is drawn after the control on purpose: `Input`'s own root is
                 positioned, so a prefix written before it would be painted underneath. -->
            <div class="relative">
              <Input
                :model-value="minValue"
                inputmode="numeric"
                autocomplete="off"
                :classes="{ control: 'ps-7' }"
                @update:model-value="onMin"
              />
              <span
                class="text-muted pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
                >{{ t('grid.pricePrefix') }}</span
              >
            </div>
          </FieldWrapper>
          <span class="text-muted text-body-sm pb-2 text-center">{{ t('grid.to') }}</span>
          <FieldWrapper :id="fieldId(group.source, 'max')" :label="t('grid.maxLabel')">
            <div class="relative">
              <Input
                :model-value="maxValue"
                inputmode="numeric"
                autocomplete="off"
                :classes="{ control: 'ps-7' }"
                @update:model-value="onMax"
              />
              <span
                class="text-muted pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
                >{{ t('grid.pricePrefix') }}</span
              >
            </div>
          </FieldWrapper>
        </div>

        <Button
          v-if="hasHiddenValues(group)"
          variant="link"
          size="sm"
          :classes="{ container: 'mt-2' }"
          @click="showAllValues(group)"
        >
          {{ t('grid.showAllValues', { count: group.values.length }) }}
        </Button>
      </fieldset>
    </div>
  </div>
</template>
