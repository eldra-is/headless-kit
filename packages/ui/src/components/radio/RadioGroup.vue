<script setup lang="ts">
import { computed, inject, ref, watchPostEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import FieldError from '../field-wrapper/FieldError.vue';
import type { RadioGroupOption, RadioGroupProps, RadioGroupSize } from './types';

const props = withDefaults(defineProps<RadioGroupProps>(), {
  modelValue: undefined,
  name: undefined,
  layout: 'vertical',
  size: 'md',
  required: false,
  error: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Radio group" → Events: "`change`: fires with the newly selected value." */
  change: [value: string];
}>();

/**
 * A group is a `<fieldset>`, never a control, so — exactly like `CheckboxGroup` — it takes only
 * the field context's `describedBy` (appended after its own error id) and never `id`, `required`
 * or `invalid`: those belong to a labelled control, and this group's own `error` prop is the only
 * thing that puts it in error.
 */
const field = inject(FIELD_KEY, null);

const errorId = useUiId('radio-group-error');

/** The shared native `name` every radio posts under. Generated when the caller gives none. */
const groupName = useUiId('radio', () => props.name);

/**
 * Controlled when the parent binds `modelValue`, self-managing when it does not. `''` is the
 * uncontrolled starting value — no real option is ever named `''` — which is what makes "nothing
 * selected" mean "no radio matches", same shape as `Checkbox`'s `false` fallback.
 */
const model = useControllableModel<string>(props, emit, () => '');

function isSelected(value: string): boolean {
  return model.value === value;
}

/**
 * Spec "Radio group" → Accessibility: "`aria-describedby` from the fieldset to the error text."
 * As everywhere else in this package, the error id comes first, so it is what a screen reader
 * hears first.
 */
const describedBy = computed(() => joinIds(props.error && errorId.value, field?.value.describedBy));

/**
 * The size prop is `(plain layouts)` only (spec "Radio group" → Properties, `size` row): a card's
 * radio is always the `md` circle, whichever size the caller asked for.
 */
const radioSize = computed<RadioGroupSize>(() => (props.layout === 'cards' ? 'md' : props.size));

const radioRefs = ref<(HTMLInputElement | null)[]>([]);

/**
 * Re-asserts `checked` on every radio after render, for the same reason `Checkbox` re-asserts its
 * own: a controlled parent that refuses the change leaves `modelValue` exactly as it was, so
 * Vue's bound `:checked` expression evaluates to the same booleans as before and Vue patches
 * nothing — the browser has already flipped the DOM's `checked` properties on click, and without
 * this the group would stay visibly on the clicked radio against a model that says otherwise.
 */
function syncElements(): void {
  props.options.forEach((option, index) => {
    const el = radioRefs.value[index];
    if (el) el.checked = isSelected(option.value);
  });
}
watchPostEffect(syncElements);

function onChange(option: RadioGroupOption): void {
  model.value = option.value;
  emit('change', option.value);
  syncElements();
}

/**
 * Spec "Field wrapper" → Sizes, the fieldset variant — the same shape `CheckboxGroup` follows, so
 * a radio group looks the same as any other fieldset: "no border, padding or min-width, grid with
 * a 0.75rem (`space-3`) gap, and the legend has a 0.5rem (`space-2`) bottom margin."
 */
const rootClass = computed(() =>
  partClass('grid min-w-0 content-start gap-3 rounded-none border-0 p-0', props.classes, 'root')
);

const legendClass = computed(() =>
  partClass('text-label text-text mb-2 block w-fit p-0', props.classes, 'legend')
);

/**
 * Spec "Radio group" → Sizes, "Group gaps" row: "vertical 0.5rem; row 0.5rem × 1.5rem, wrapping."
 * Cards are "stacked with a 0.5rem (`space-2`) gap" — the same numbers as vertical, so cards share
 * its classes; only the option itself is drawn differently.
 */
const optionsClass = computed(() =>
  partClass(
    cx(
      'flex min-w-0',
      props.layout === 'row' ? 'flex-row flex-wrap gap-x-6 gap-y-2' : 'flex-col gap-2'
    ),
    props.classes,
    'options'
  )
);

/**
 * The row is a three-column grid — radio, text, meta — so a card's price lines up with its title
 * and the hint sits in column 2 of the next row under it, exactly as the anatomy draws it. A plain
 * row never renders `meta`, so it only ever fills the first two columns; see `Checkbox.vue` for
 * the two-column version this is built from.
 */
const PLAIN_OPTION =
  'group grid w-fit max-w-full grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0.5 target-min';

/**
 * Spec "Radio group" → Sizes, Card row: "padding 0.75rem block / 1rem inline, 0.625rem gap, radius
 * `radius-md`, 1px border, about 3.5rem tall with a hint line" — `min-h-14` is that 3.5rem, the
 * spec's own note against the acceptance criteria's touch-target minimum (2.5.8). `eldra-radio-
 * card-border` is a variable-driven 1px width of its own (see `tailwind.css`): the spec gives the
 * card a different number than the radio's 1.5px, so it cannot share the checkbox's utility.
 */
const CARD_OPTION =
  'group relative grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-2.5 gap-y-0.5 ' +
  'min-h-14 rounded-md px-4 py-3 eldra-radio-card-border';

const CARD_UNSELECTED = 'bg-background border-border-strong hover:border-text';
const CARD_SELECTED = 'bg-surface border-primary eldra-radio-card-selected';
const CARD_INVALID = 'bg-background border-danger hover:border-danger';
/**
 * Spec has no dedicated "selected and in error" card row; this follows the same reading `Checkbox`
 * gives an invalid checked box (Decision: it keeps its fill and swaps only the border colour) —
 * `eldra-radio-card-selected`'s inset line reads `--eldra-radio-card-selected-color` for exactly
 * this, so one utility draws both the `primary` and the `danger` version of the same line.
 */
const CARD_INVALID_SELECTED =
  'bg-surface border-danger eldra-radio-card-selected ' +
  '[--eldra-radio-card-selected-color:var(--eldra-color-danger)]';
/** Spec "Radio group" → States, Disabled selected row: "as disabled" — the card draws no special
 * selected look once it is also disabled; only the radio inside it keeps a distinct look. */
const CARD_DISABLED = 'bg-background border-border border-dashed';

function cardState(option: RadioGroupOption): string {
  if (option.disabled) return CARD_DISABLED;
  const selected = isSelected(option.value);
  if (selected) return props.error ? CARD_INVALID_SELECTED : CARD_SELECTED;
  return props.error ? CARD_INVALID : CARD_UNSELECTED;
}

function optionClass(option: RadioGroupOption): string {
  const base = props.layout === 'cards' ? CARD_OPTION : PLAIN_OPTION;
  const state = props.layout === 'cards' ? cardState(option) : '';
  return partClass(
    cx(base, state, option.disabled ? 'cursor-not-allowed' : 'cursor-pointer'),
    props.classes,
    'option'
  );
}

/**
 * The drawn radio (spec "Radio group" → Anatomy: "a native `<input type="radio">` with custom
 * appearance, always visible"). Reuses `Checkbox`'s exact proxy-focus shape — the input is
 * `opacity-0` and stretched *over* this element, which is what makes `eldra-focus-proxy`
 * (`:has(:focus-visible)`) draw the one focus ring around the shape a keyboard user can see, in
 * every layout (spec's Focus-visible row: "standard focus ring around the radio", not the card).
 */
const RADIO =
  'relative inline-flex shrink-0 items-center justify-center ' +
  'rounded-full eldra-focus eldra-focus-proxy';

/**
 * Spec "Radio group" → Sizes: "1.125rem circle (1.5rem at lg) … nudged 0.1875rem down at md" —
 * the exact same numbers as the Checkbox box, so the same two class strings apply.
 */
const RADIO_SIZE: Record<RadioGroupSize, string> = { md: 'size-4.5 mt-0.75', lg: 'size-6' };

/**
 * States (spec "Radio group" → States). The checkbox's own `eldra-checkbox-border` /
 * `-invalid` utilities are reused unchanged: the spec gives the radio circle the identical 1.5px /
 * 2px numbers, so a second pair of utilities for the same numbers would only drift from them.
 */
const UNSELECTED =
  'bg-background border-border-strong group-hover:border-text eldra-checkbox-border';
const SELECTED = 'bg-primary border-primary eldra-checkbox-border';
const INVALID =
  'bg-background border-danger group-hover:border-danger eldra-checkbox-border-invalid';
/** Keeps its `primary` fill under an error exactly as `Checkbox`'s invalid-checked box does: the
 * dot is `primary-contrast`, so a `background` fill would draw it in the page's own colour. */
const INVALID_SELECTED = 'bg-primary border-danger eldra-checkbox-border-invalid';
const DISABLED = 'bg-surface-strong border-border border-dashed eldra-checkbox-border';
const DISABLED_SELECTED = 'bg-muted border-muted eldra-checkbox-border';

function radioState(option: RadioGroupOption): string {
  const selected = isSelected(option.value);
  if (option.disabled) return selected ? DISABLED_SELECTED : DISABLED;
  if (selected) return props.error ? INVALID_SELECTED : SELECTED;
  return props.error ? INVALID : UNSELECTED;
}

function radioClass(option: RadioGroupOption): string {
  return partClass(
    cx(RADIO, RADIO_SIZE[radioSize.value], radioState(option)),
    props.classes,
    'radio'
  );
}

/**
 * The dot (spec "Radio group" → Sizes: "0.5rem dot"). One fixed size regardless of `size`, the
 * same choice `Checkbox` makes for its tick — only the circle around it grows. No `data-part` of
 * its own: the brief's part list has no entry for it, unlike `Checkbox`'s `check`.
 */
function dotClass(option: RadioGroupOption): string {
  return cx(
    'pointer-events-none size-2 rounded-full bg-primary-contrast transition-transform ' +
      'duration-fast ease-out',
    isSelected(option.value) ? 'scale-100' : 'scale-0'
  );
}

/**
 * Spec "Radio group" → Sizes: "Plain row … 0.9375rem / 1.5rem text" for plain layouts, "Card title
 * … 1rem 600 (line-height 1.4)" for cards — the same two type utilities `Checkbox`'s label and the
 * new `text-card-title` (see `tailwind.css`) already give those numbers.
 */
function labelClass(option: RadioGroupOption): string {
  const base = props.layout === 'cards' ? 'text-card-title' : 'text-control';
  return partClass(
    cx(base, 'min-w-0', option.disabled ? 'text-muted' : 'text-text'),
    props.classes,
    'label'
  );
}

/** Spec "Radio group" → Sizes: the hint is `muted` in every layout, under the label's column. */
const hintClass = computed(() =>
  partClass('text-body-sm text-muted col-start-2 min-w-0', props.classes, 'hint')
);

/**
 * Spec "Radio group" → Sizes, Card title / hint / meta row: "1rem 600 tabular, no wrap, pushed to
 * the end" — `tabular-nums` and `whitespace-nowrap` are stock Tailwind utilities, so meta reuses
 * `text-card-title` rather than a near-identical utility of its own, and `justify-self-end` in the
 * grid's third column is what pushes it to the end.
 */
function metaClass(option: RadioGroupOption): string {
  return partClass(
    cx(
      'text-card-title col-start-3 min-w-0 justify-self-end tabular-nums whitespace-nowrap',
      option.disabled ? 'text-muted' : 'text-text'
    ),
    props.classes,
    'meta'
  );
}
</script>

<template>
  <fieldset
    data-part="root"
    :class="rootClass"
    :aria-describedby="describedBy"
    :aria-invalid="error ? 'true' : undefined"
  >
    <legend data-part="legend" :class="legendClass">{{ legend }}</legend>

    <div data-part="options" :class="optionsClass">
      <label
        v-for="(option, index) in options"
        :key="option.value"
        data-part="option"
        :class="optionClass(option)"
      >
        <span data-part="radio" :class="radioClass(option)">
          <!-- Native radio, invisible but focusable, over the drawn circle — the circle is its
               appearance. Arrow keys, wrapping, skipping disabled options and the single tab stop
               are all native <input type="radio"> behaviour: sharing one `name` is the only thing
               this component does to earn it, so there is no key handler anywhere here. -->
          <input
            :ref="(el) => (radioRefs[index] = el as HTMLInputElement | null)"
            class="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
            type="radio"
            :name="groupName"
            :value="option.value"
            :checked="isSelected(option.value)"
            :disabled="option.disabled || undefined"
            :required="required || undefined"
            :aria-invalid="error ? 'true' : undefined"
            @change="onChange(option)"
          />
          <span aria-hidden="true" :class="dotClass(option)" />
        </span>

        <span data-part="label" :class="labelClass(option)">
          <slot name="label" :option="option">{{ option.label }}</slot>
        </span>

        <span v-if="option.hint || $slots.hint" data-part="hint" :class="hintClass">
          <slot name="hint" :option="option">{{ option.hint }}</slot>
        </span>

        <span
          v-if="layout === 'cards' && (option.meta || $slots.meta)"
          data-part="meta"
          :class="metaClass(option)"
        >
          <slot name="meta" :option="option">{{ option.meta }}</slot>
        </span>
      </label>
    </div>

    <!-- The same error row a `FieldWrapper` and `CheckboxGroup` draw (`FieldError`): linked by id,
         never a live region. -->
    <FieldError v-if="error" :id="errorId" :classes="classes">{{ error }}</FieldError>
  </fieldset>
</template>
