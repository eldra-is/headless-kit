<script setup lang="ts">
/**
 * A number, money and unit field. **An addition beyond design spec 1**, which has no editable
 * numeric field at all (its `Price` is a display component, in plan 2) — recorded in the README's
 * "Additions beyond the spec".
 *
 * It is an `Input` in every respect a customer can see: the same box, the same three sizes, the
 * same paddings, the same focus ring and the same error boundary, all imported from
 * `../input/classes.ts` rather than copied. What it adds is the one thing a text field cannot do —
 * hold a `number` on one side and a locale-formatted string on the other.
 *
 * **Two texts, one value.** Out of focus the field shows the value formatted for its locale and
 * format (`$1,234.50`, `1.235 kr.`, `2.5 kg`). On focus it switches to a plain editable string —
 * the same digits with the group separators removed and the locale's decimal separator kept, so
 * `1234,5` under `is-IS` — because a caret and a group separator fight over the same keystroke
 * otherwise. On blur (or `Enter`) the text is parsed with `parseLocaleNumber`, clamped, rounded to
 * `precision`, and written back.
 *
 * **`type="text"`, not `type="number"`.** Exactly `QuantityStepper`'s reason (see its own doc
 * comment): a native number input's DOM value can only be the US-style ungrouped grammar, so it
 * cannot hold `is-IS`'s `1.234` at all. `inputmode="decimal"` gives a phone the right keypad, and
 * `dir="ltr"` keeps a number left-to-right inside an RTL page, where digits are written LTR
 * anyway. There is no `role="spinbutton"`: unlike a quantity, this field's value space is
 * open-ended — `min`/`max` are optional — and a spinbutton with no `aria-valuenow` bounds is worse
 * than a plain text field, which is what a screen reader then announces it as.
 *
 * **Typing is filtered.** `filterNumericBeforeInput` (`src/utils/numeric-input.ts`, shared with
 * `QuantityStepper`) cancels a `beforeinput` that would put something non-numeric in the field,
 * and sanitises a paste rather than refusing it: pasting `"12ab3"` inserts `123`.
 *
 * **An unparseable entry commits `null`,** not the previous value. A field that silently put back
 * a number the customer had just deleted would be lying about what it holds, and `null` is the
 * same thing an empty field means. Whether that is an *error* is the caller's to say, through
 * `invalid` and a `FieldWrapper`'s message — this control never invents one.
 */
import { computed, inject, ref, useSlots } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import { filterNumericBeforeInput } from '../../utils/numeric-input';
import {
  currencyFractionDigits,
  formatNumber,
  localeSeparators,
  parseLocaleNumber,
} from '../../utils/number-format';
import { FIELD_KEY } from '../field-wrapper/context';
import Icon from '../icon/Icon.vue';
import {
  FIELD_BASE,
  FIELD_CLEAR_BUTTON,
  FIELD_CLEAR_SIZE,
  FIELD_DISABLED,
  FIELD_INVALID,
  FIELD_LEADING_ICON,
  FIELD_LEADING_PAD,
  FIELD_LIVE,
  FIELD_READONLY,
  FIELD_SIZE,
  FIELD_SUFFIX_ROW,
  FIELD_TRAILING_PAD,
} from '../input/classes';
import type { NumberInputProps } from './types';

defineOptions({ inheritAttrs: false });

/** `QuantityStepper`'s own default, and the one the starter overrides with its content locale. */
const DEFAULT_LOCALE = 'en-US';

const props = withDefaults(defineProps<NumberInputProps>(), {
  modelValue: undefined,
  format: 'decimal',
  locale: DEFAULT_LOCALE,
  currency: undefined,
  currencyDisplay: 'symbol',
  unit: undefined,
  unitDisplay: 'short',
  min: undefined,
  max: undefined,
  step: undefined,
  precision: undefined,
  size: 'md',
  id: undefined,
  name: undefined,
  placeholder: undefined,
  leadingIcon: undefined,
  // Undefined, not false: these four fall back to the field wrapper's context, and `false` there
  // would be an answer rather than "no opinion" (see `Input`'s own comment).
  clearable: undefined,
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  /** Fires with the committed number after a blur or `Enter`, never per keystroke. */
  change: [value: number | null];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
  clear: [];
}>();

const slots = useSlots();
const m = useMessages();

/** See `Input.vue` for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

const controlId = useUiId(
  'number-input',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
/** Own ids first, then the wrapper's — the one `describedBy` rule (see the README's Fields). */
const describedBy = computed(() => joinIds(props.describedBy, field?.value.describedBy));
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const controlRef = ref<HTMLInputElement | null>(null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<number | null>(props, emit, () => null);

// --- formatting ---------------------------------------------------------------------------------

/**
 * How many fraction digits a committed value keeps. A currency's default is the currency's own
 * (`ISK` 0, `USD` 2, `KWD` 3), read from ICU rather than assumed — rounding an Icelandic price to
 * two decimals and then showing it with none loses what the customer typed.
 */
const precision = computed(() => {
  if (props.precision !== undefined) return props.precision;
  if (props.format === 'currency')
    return currencyFractionDigits(props.currency ?? 'USD', props.locale);
  return 2;
});

/** `ArrowUp`/`ArrowDown`'s step: one minor unit for a currency, `1` otherwise. */
const step = computed(
  () => props.step ?? (props.format === 'currency' ? 10 ** -precision.value : 1)
);

const separators = computed(() => localeSeparators(props.locale));

/** The formatted text — what the field shows while it is not being edited. */
function formatDisplay(value: number): string {
  return formatNumber(value, {
    locale: props.locale,
    style: props.format,
    currency: props.currency,
    unit: props.unit,
    currencyDisplay: props.format === 'currency' ? props.currencyDisplay : undefined,
    unitDisplay: props.format === 'unit' ? props.unitDisplay : undefined,
    maxFraction: precision.value,
  });
}

/**
 * The editable text: the same number with the group separators taken out and the locale's decimal
 * separator kept, and with neither symbol nor unit — those belong to the display, not to something
 * a person has to type around. `1234,5` under `is-IS`, `1234.5` under `en-US`.
 */
function formatEditing(value: number): string {
  const plain = formatNumber(value, { locale: props.locale, maxFraction: precision.value });
  const { group } = separators.value;
  return group === '' ? plain : plain.split(group).join('');
}

// --- the two texts ------------------------------------------------------------------------------

const isEditing = ref(false);
const editingText = ref('');

const displayValue = computed(() => {
  if (isEditing.value) return editingText.value;
  return model.value === null ? '' : formatDisplay(model.value);
});

// --- committing ---------------------------------------------------------------------------------

function clamp(value: number): number {
  const withMin = props.min === undefined ? value : Math.max(props.min, value);
  return props.max === undefined ? withMin : Math.min(props.max, withMin);
}

/** Rounds to `precision` **decimal** places without the binary-floating-point drift of `toFixed`
 *  chains: 1.005 at 2 places is 1.01 here, and 0.1 + 0.2 at 2 places is 0.3, not 0.30000000000000004. */
function round(value: number): number {
  const factor = 10 ** precision.value;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Writes a value through, emitting `update:modelValue` and `change` only when it actually moved. */
function commitValue(next: number | null): void {
  if (next === model.value) return;
  model.value = next;
  emit('change', next);
}

/**
 * Parses what is in the field and writes it back. Runs on blur and on `Enter`; does **not** reset
 * `isEditing`, which is `onBlur`'s job — an `Enter` commit leaves the field focused, and snapping
 * the text back to the formatted value under a live caret is what made `QuantityStepper` look like
 * it had eaten a keystroke (see its own comment).
 */
function commit(): void {
  const parsed = parseLocaleNumber(editingText.value, props.locale);
  const next = parsed === null ? null : clamp(round(parsed));
  commitValue(next);
  editingText.value = next === null ? '' : formatEditing(next);
}

/**
 * Whether this field may be edited at all. A read-only field is focusable and selectable — that is
 * the whole point of read-only rather than disabled — but it must keep showing the **formatted**
 * value, never the editable text, and nothing it does may commit.
 *
 * `disabled` is here for completeness only: a disabled `<input>` never fires `focus` in a browser.
 */
const isEditable = computed(() => !props.readonly && !props.disabled);

function onFocus(event: FocusEvent): void {
  if (isEditable.value) {
    isEditing.value = true;
    editingText.value = model.value === null ? '' : formatEditing(model.value);
  }
  emit('focus', event);
}

function onBlur(event: FocusEvent): void {
  // Never commit from a field that cannot be edited. Without this a read-only field committed on
  // every focus-and-leave, which for a value outside `min`/`max` silently clamped it — a control
  // whose whole contract is "the value is readable but fixed" quietly changing that value.
  if (isEditable.value) commit();
  isEditing.value = false;
  emit('blur', event);
}

function onInput(event: Event): void {
  editingText.value = (event.target as HTMLInputElement).value;
}

/** The typing filter. A `-` is only offered when `min` actually allows a negative value. */
function onBeforeInput(event: Event): void {
  filterNumericBeforeInput(event as InputEvent, {
    allowNegative: props.min === undefined || props.min < 0,
    allowDecimal: precision.value > 0,
    locale: props.locale,
  });
}

/**
 * `ArrowUp`/`ArrowDown` step by `step`, ten times that with `Shift`, clamped.
 *
 * From an **empty** field the first press lands on `min` itself when there is one — not on
 * `min + step`: the lowest value the field accepts is the answer a person pressing Up on a blank
 * amount is asking for, and starting a step above it makes the first allowed value unreachable by
 * the keyboard without pressing Down again. With no `min`, the first press lands on the step
 * itself (one step away from nothing).
 */
function stepBy(direction: 1 | -1, multiplier: number): void {
  if (!isEditable.value) return;
  const current = model.value;
  const next =
    current === null
      ? clamp(props.min ?? round(direction * step.value * multiplier))
      : clamp(round(current + direction * step.value * multiplier));
  commitValue(next);
  if (isEditing.value) editingText.value = formatEditing(next);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    stepBy(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
    return;
  }
  if (event.key === 'Enter') {
    // `Enter` commits **and does not submit**: the field is inside a form more often than not, and
    // a keystroke that both corrected the value and sent the form would give nobody a chance to
    // see the correction. The `preventDefault` is what stops the implicit submission; a second
    // `Enter`, on a field that now shows its committed value, submits as usual.
    event.preventDefault();
    if (isEditable.value) commit();
  }
  // Home/End are the caret's, as the spec's own text-field keyboard says: nothing is done here.
}

function onClear(): void {
  commitValue(null);
  editingText.value = '';
  emit('clear');
  controlRef.value?.focus();
}

// --- classes ------------------------------------------------------------------------------------

const clearable = computed(() => props.clearable ?? false);
const showClear = computed(
  () => clearable.value && !props.disabled && !props.readonly && model.value !== null
);
const hasSuffixSlot = computed(() => slots.suffix !== undefined);
const hasTrailing = computed(() => showClear.value || hasSuffixSlot.value);
const hasIcon = computed(() => props.leadingIcon !== undefined || slots.leadingIcon !== undefined);
const hasPrefix = computed(() => slots.prefix !== undefined);
const hasLeading = computed(() => hasIcon.value || hasPrefix.value);

/** The same rule as `Input`'s: a disabled field keeps its dead boundary and drops the danger one. */
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const rootClass = computed(() =>
  partClass(
    cx('relative block w-full', showsInvalid.value && 'eldra-field-invalid'),
    props.classes,
    'root'
  )
);

/**
 * The start padding. One decoration reserves `Input`'s own 2.25rem; an icon *and* a prefix reserve
 * 3.5rem, with the prefix sitting after the icon. Neither is measured — the same rough edge
 * `Input`'s `suffix` row has, and recorded as a deviation: a prefix wider than its reservation
 * needs `classes.control` to say so.
 */
const leadingPad = computed(() => {
  if (hasIcon.value && hasPrefix.value) return 'ps-14';
  return hasLeading.value ? FIELD_LEADING_PAD : false;
});

const controlClass = computed(() =>
  partClass(
    cx(
      FIELD_BASE,
      FIELD_SIZE[props.size],
      leadingPad.value,
      hasTrailing.value && FIELD_TRAILING_PAD[props.size],
      'tabular-nums',
      props.disabled ? FIELD_DISABLED : props.readonly ? FIELD_READONLY : FIELD_LIVE,
      showsInvalid.value && FIELD_INVALID
    ),
    props.classes,
    'control'
  )
);

const leadingIconClass = computed(() =>
  partClass(FIELD_LEADING_ICON, props.classes, 'leadingIcon')
);

/** The start-edge text affix: at the field's own start edge, or just past the icon when there is one. */
const prefixClass = computed(() =>
  partClass(
    cx(
      'absolute inset-y-0 my-auto flex items-center text-muted pointer-events-none',
      hasIcon.value ? 'start-9' : 'start-2.75'
    ),
    props.classes,
    'prefix'
  )
);

const suffixClass = computed(() => partClass(FIELD_SUFFIX_ROW, props.classes, 'suffix'));

const clearButtonClass = computed(() =>
  partClass(cx(FIELD_CLEAR_BUTTON, FIELD_CLEAR_SIZE[props.size]), props.classes, 'clearButton')
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <span v-if="hasIcon" data-part="leadingIcon" :class="leadingIconClass">
      <slot name="leadingIcon">
        <Icon v-if="leadingIcon" :icon="leadingIcon" :classes="{ root: 'size-4.5' }" />
      </slot>
    </span>

    <span v-if="hasPrefix" data-part="prefix" :class="prefixClass"><slot name="prefix" /></span>

    <input
      ref="controlRef"
      v-bind="$attrs"
      data-part="control"
      :class="controlClass"
      :id="controlId"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      dir="ltr"
      :value="displayValue"
      :placeholder="placeholder"
      :required="isRequired || undefined"
      :readonly="readonly || undefined"
      :disabled="disabled || undefined"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @beforeinput="onBeforeInput"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />

    <!-- The form's value is the raw number, never the locale string the customer read: a form
         posting "1.234,5" would be parsed as 1.2345 by almost every server. The visible control
         deliberately carries no `name` of its own, so exactly one value is posted. -->
    <input v-if="name" type="hidden" :name="name" :value="model ?? ''" />

    <span v-if="hasTrailing" data-part="suffix" :class="suffixClass">
      <button
        v-if="showClear"
        data-part="clearButton"
        type="button"
        :class="clearButtonClass"
        :aria-label="m.clear"
        @click="onClear"
      >
        <!-- Tabler's `x`, stroke 1.75, at 1.125rem. Decorative: the button is named by aria-label. -->
        <svg
          class="size-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M18 6l-12 12" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
      <slot name="suffix" />
    </span>
  </div>
</template>
