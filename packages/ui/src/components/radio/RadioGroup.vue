<script setup lang="ts">
import { computed, h, inject, ref, watchPostEffect, type FunctionalComponent } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { joinIds, useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import FieldError from '../field-wrapper/FieldError.vue';
import RequiredMark from '../field-wrapper/RequiredMark.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import {
  HINT,
  INPUT,
  PLAIN_COLUMNS,
  PLAIN_OPTION,
  dotRecipe,
  labelRecipe,
  optionCursor,
  radioRecipe,
} from './recipes';
import type { RadioGroupOption, RadioGroupProps, RadioGroupSize } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<RadioGroupProps>(), {
  modelValue: undefined,
  name: undefined,
  layout: 'vertical',
  size: 'md',
  legend: undefined,
  required: false,
  requiredMark: false,
  error: undefined,
  help: undefined,
  invalid: false,
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

const m = useMessages();

const errorId = useUiId('radio-group-error');
const helpId = useUiId('radio-group-help');

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
const describedBy = computed(() =>
  joinIds(props.error && errorId.value, props.help && helpId.value, field?.value.describedBy)
);

/**
 * The size prop is `(plain layouts)` only (spec "Radio group" → Properties, `size` row): a card's
 * radio is always the `md` circle, whichever size the caller asked for.
 */
const radioSize = computed<RadioGroupSize>(() => (props.layout === 'cards' ? 'md' : props.size));

/** In error with a message (`error`) or without one (`invalid`). */
const inError = computed(() => !!props.error || props.invalid);

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
const ROOT =
  'eldra:grid eldra:min-w-0 eldra:content-start eldra:gap-3 eldra:rounded-none eldra:border-0 eldra:p-0';

/** `FieldWrapper`'s help type: 0.8125rem / 1.45, weight 400, `muted`. */
const helpClass = computed(() => [
  'eldra:text-field-note eldra:text-muted eldra:min-w-0 eldra:font-normal',
  props.classes?.help,
]);

const legendClass = computed(() => [
  'eldra:text-label eldra:text-text eldra:mb-2 eldra:block eldra:w-fit eldra:p-0',
  props.classes?.legend,
]);

/**
 * The legend, with `FieldWrapper`'s required mark after the text when `requiredMark` asks for it.
 * A render function so a legend without the mark holds its text and nothing else — no `v-if`
 * placeholder comments. With no native `required` to announce it, the mark brings the visually
 * hidden "Required" with it.
 */
const Legend: FunctionalComponent = () =>
  h('legend', { 'data-part': 'legend', class: legendClass.value }, [
    props.legend,
    ...(props.requiredMark
      ? [
          h(RequiredMark, { classes: props.classes }),
          ...(props.required ? [] : [h(VisuallyHidden, null, () => m.value.required)]),
        ]
      : []),
  ]);

/**
 * Spec "Radio group" → Sizes, "Group gaps" row: "vertical 0.5rem; row 0.5rem × 1.5rem, wrapping."
 * Cards are "stacked with a 0.5rem (`space-2`) gap" — the same numbers as vertical, so cards share
 * its classes; only the option itself is drawn differently.
 */
const optionsClass = computed(() => [
  [
    'eldra:flex eldra:min-w-0',
    props.layout === 'row'
      ? 'eldra:flex-row eldra:flex-wrap eldra:gap-x-6 eldra:gap-y-2'
      : 'eldra:flex-col eldra:gap-2',
  ],
  props.classes?.options,
]);

/**
 * Spec "Radio group" → Sizes, Card row: "padding 0.75rem block / 1rem inline, 0.625rem gap, radius
 * `radius-md`, 1px border, about 3.5rem tall with a hint line" — `min-h-14` is that 3.5rem, the
 * spec's own note against the acceptance criteria's touch-target minimum (2.5.8). `eldra-radio-
 * card-border` is a variable-driven 1px width of its own (see `tailwind.css`): the spec gives the
 * card a different number than the radio's 1.5px, so it cannot share the checkbox's utility.
 */
const CARD_OPTION =
  'eldra:group eldra:relative eldra:grid eldra:w-full eldra:grid-cols-[auto_1fr_auto] eldra:items-start eldra:gap-x-2.5 eldra:gap-y-0.5 ' +
  'eldra:min-h-14 eldra:rounded-md eldra:px-4 eldra:py-3 eldra:eldra-radio-card-border eldra:eldra-transition-colors';

const CARD_UNSELECTED = 'eldra:bg-background eldra:border-border-strong eldra:hover:border-text';
const CARD_SELECTED = 'eldra:bg-surface eldra:border-primary eldra:eldra-radio-card-selected';
const CARD_INVALID = 'eldra:bg-background eldra:border-danger eldra:hover:border-danger';
/**
 * Spec has no dedicated "selected and in error" card row; this follows the same reading `Checkbox`
 * gives an invalid checked box (Decision: it keeps its fill and swaps only the border colour) —
 * `eldra-radio-card-selected`'s inset line reads `--eldra-radio-card-selected-color` for exactly
 * this, so one utility draws both the `primary` and the `danger` version of the same line.
 */
const CARD_INVALID_SELECTED =
  'eldra:bg-surface eldra:border-danger eldra:eldra-radio-card-selected ' +
  'eldra:[--eldra-radio-card-selected-color:var(--eldra-color-danger)]';
/** Spec "Radio group" → States, Disabled selected row: "as disabled" — the card draws no special
 * selected look once it is also disabled; only the radio inside it keeps a distinct look. */
const CARD_DISABLED = 'eldra:bg-background eldra:border-border eldra:border-dashed';

function cardState(option: RadioGroupOption): string {
  if (option.disabled) return CARD_DISABLED;
  const selected = isSelected(option.value);
  if (selected) return inError.value ? CARD_INVALID_SELECTED : CARD_SELECTED;
  return inError.value ? CARD_INVALID : CARD_UNSELECTED;
}

function optionClass(option: RadioGroupOption) {
  const layout =
    props.layout === 'cards' ? [CARD_OPTION, cardState(option)] : [PLAIN_OPTION, PLAIN_COLUMNS];
  return [layout, optionCursor(option.disabled), props.classes?.option];
}

function radioClass(option: RadioGroupOption) {
  return [
    radioRecipe(radioSize.value, {
      selected: isSelected(option.value),
      disabled: option.disabled,
      invalid: inError.value,
    }),
    props.classes?.radio,
  ];
}

function dotClass(option: RadioGroupOption) {
  return [dotRecipe(isSelected(option.value)), props.classes?.dot];
}

const inputClass = computed(() => [INPUT, props.classes?.input]);

function labelClass(option: RadioGroupOption) {
  return [labelRecipe(props.layout === 'cards', option.disabled), props.classes?.label];
}

const hintClass = computed(() => [HINT, props.classes?.hint]);

/**
 * Spec "Radio group" → Sizes, Card title / hint / meta row: "1rem 600 tabular, no wrap, pushed to
 * the end" — `tabular-nums` and `whitespace-nowrap` are stock Tailwind utilities, so meta reuses
 * `text-card-title` rather than a near-identical utility of its own, and `justify-self-end` in the
 * grid's third column is what pushes it to the end.
 */
function metaClass(option: RadioGroupOption) {
  return [
    [
      'eldra:text-card-title eldra:col-start-3 eldra:min-w-0 eldra:justify-self-end eldra:tabular-nums eldra:whitespace-nowrap',
      option.disabled ? 'eldra:text-muted' : 'eldra:text-text',
    ],
    props.classes?.meta,
  ];
}
</script>

<template>
  <fieldset
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="ROOT"
    :aria-describedby="describedBy"
    :aria-invalid="inError ? 'true' : undefined"
  >
    <Legend v-if="legend !== undefined" />

    <div data-part="options" :class="optionsClass">
      <label
        v-for="(option, index) in options"
        :key="option.value"
        v-bind="option.optionAttrs"
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
            v-bind="option.inputAttrs"
            :class="inputClass"
            type="radio"
            :name="groupName"
            :value="option.value"
            :checked="isSelected(option.value)"
            :disabled="option.disabled || undefined"
            :required="required || undefined"
            :aria-invalid="inError ? 'true' : undefined"
            @change="onChange(option)"
          />
          <span aria-hidden="true" :class="dotClass(option)" />
        </span>

        <span
          :data-eldra-slot="eldra.slotHost('label')"
          data-part="label"
          :class="labelClass(option)"
        >
          <slot name="label" :option="option">{{ option.label }}</slot>
        </span>

        <span
          v-if="option.hint || $slots.hint"
          :data-eldra-slot="eldra.slotHost('hint')"
          data-part="hint"
          :class="hintClass"
        >
          <slot name="hint" :option="option">{{ option.hint }}</slot>
        </span>

        <span
          v-if="layout === 'cards' && (option.meta || $slots.meta)"
          :data-eldra-slot="eldra.slotHost('meta')"
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
    <p v-if="help" :id="helpId" data-part="help" :class="helpClass">{{ help }}</p>
  </fieldset>
</template>
