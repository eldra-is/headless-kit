<script setup lang="ts">
/**
 * Spec anatomy literally reads `<input type="number" inputmode="numeric" min max ...>`. This
 * component uses `type="text"` with `inputmode="numeric"` and `role="spinbutton"`
 * (`aria-valuenow`/`-valuemin`/`-valuemax`) instead — a deliberate delta, not an oversight:
 *
 * 1. A native number input's DOM value can only ever be the US-style, ungrouped floating-point
 *    grammar (digits and a single `.`). It cannot hold a locale-grouped string like is-IS's
 *    "1.234" (`.` as the group separator) — assigning one is either silently rejected by the
 *    browser's value-sanitisation algorithm or misread as the decimal 1.234. The task explicitly
 *    asks this control to parse a typed value through `parseLocaleNumber`, which only makes sense
 *    for text the browser has not already mangled.
 * 2. `role="spinbutton"` with explicit `aria-value*` is the ARIA APG's own pattern for exactly
 *    this shape of control, and satisfies the spec's 4.1.2 note ("The input exposes its value,
 *    min and max natively") through the accessibility tree rather than through native HTML input
 *    validation, which — see (1) — cannot express this control's value space anyway.
 * 3. It sidesteps native number-input spin-button/arrow-key behaviour entirely, which browsers
 *    implement inconsistently and test environments (this package's happy-dom) do not implement
 *    at all — the ArrowUp/ArrowDown handling below is explicit and deterministic instead.
 *
 * "No native spin buttons" (the anatomy's own item 3) is satisfied for free: a text input has
 * none to hide.
 */
import { computed, inject, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { formatNumber, parseLocaleNumber } from '../../utils/number-format';
import { FIELD_KEY } from '../field-wrapper/context';
import FieldError from '../field-wrapper/FieldError.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type { QuantityStepperProps, QuantityStepperSize } from './types';

defineOptions({ inheritAttrs: false });

/** Spec "Quantity stepper" → Properties. */
const DEFAULT_MIN = 1;
const DEFAULT_MAX = 99;
/** Not part of the design spec's own Properties table — the task brief adds `locale` for display
 * formatting and typed-value parsing. */
const DEFAULT_LOCALE = 'en-US';

const props = withDefaults(defineProps<QuantityStepperProps>(), {
  modelValue: undefined,
  min: DEFAULT_MIN,
  max: DEFAULT_MAX,
  size: 'md',
  itemName: undefined,
  name: undefined,
  disabled: false,
  error: undefined,
  id: undefined,
  locale: DEFAULT_LOCALE,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
  /** Spec "Quantity stepper" → Events: "fires with the clamped number after a button press or a
   * committed typed value (blur or `Enter`), not on every keystroke." */
  change: [value: number];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
}>();

const m = useMessages();

/** See Input.vue for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

/**
 * The id, on the `<input>` — the only labelable native control here (a `<label for>` cannot
 * target the group `<div>` or the buttons). Taken from the field context only when that context
 * labels its control with a `<label for>` (see Input.vue's own `controlId`).
 */
const controlId = useUiId(
  'quantity-stepper',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const errorId = useUiId('quantity-stepper-error');

/**
 * Spec "Quantity stepper" → Accessibility: "The input is named 'Quantity' (or by a visible
 * label)." So the input gets this package's own default name unless a `FieldWrapper`'s `<label
 * for>` already names it — mirroring the "or by a visible label" clause — in which case adding an
 * `aria-label` here would give it a second, conflicting name. Exactly `controlId`'s own condition
 * (an explicit `id` prop means the wrapper's `for` can no longer reach this control, the same
 * shape as Switch's `isNamedByField`), so the two never disagree about who names the field.
 */
const isNamedByField = computed(
  () => props.id === undefined && field?.value.labelsControl === true
);
const inputAriaLabel = computed(() => (isNamedByField.value ? undefined : m.value.quantity));

/**
 * Spec "Quantity stepper" → Accessibility: "Buttons are named by `aria-label` ('Decrease
 * quantity' / 'Increase quantity', plus ', <product name>' in lists)."
 */
const decreaseLabel = computed(
  () => `${m.value.decrease}${props.itemName ? `, ${props.itemName}` : ''}`
);
const increaseLabel = computed(
  () => `${m.value.increase}${props.itemName ? `, ${props.itemName}` : ''}`
);

/** Spec precedent (Checkbox/CheckboxGroup/RadioGroup's Accessibility notes): the error id comes
 * first, so it is what a screen reader hears first. */
const describedBy = computed(() => {
  const ids = [props.error ? errorId.value : undefined, field?.value.describedBy].filter(
    (id): id is string => Boolean(id)
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
});

/**
 * Controlled when the parent binds `modelValue`, self-managing when it does not. Defaults to
 * `min` (spec "Quantity stepper" → Properties, `value`: "Quantity (two-way)... Default min").
 */
const model = useControllableModel<number>(props, emit, () => props.min);

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
}

/** The locale-formatted, whole-number text shown while the field is not being edited — a quantity
 * never carries a fraction (spec gives none for this control). */
function formatDisplay(value: number): string {
  return formatNumber(value, { locale: props.locale, maxFraction: 0, minFraction: 0 });
}

/**
 * True while the field has focus and the user may be mid-edit: the DOM shows exactly what they
 * typed (`editingText`) instead of the reformatted value, so a caret and a locale group separator
 * never fight over the same keystroke. Not focused, it always shows the committed value freshly
 * formatted — `model.value` is the single source of truth then.
 */
const isEditing = ref(false);
const editingText = ref('');

const displayValue = computed(() =>
  isEditing.value ? editingText.value : formatDisplay(model.value)
);

const atMin = computed(() => model.value <= props.min);
const atMax = computed(() => model.value >= props.max);

/**
 * Spec "Quantity stepper" → Behaviour & motion: "Cart updates are announced in a polite live
 * region near the cart total ... once per settled update, never per keypress." The exact sentence
 * the spec gives ("Quantity updated, subtotal $112.00") names a subtotal this single control has
 * no access to — that announcement belongs to the cart drawer that composes this control with a
 * total. What this component owns and announces, once per settled change, is its own value.
 */
const announcement = ref('');
function announce(value: number): void {
  announcement.value = m.value.quantityUpdated(value);
}

/**
 * Spec "Quantity stepper" → Behaviour & motion: "Pressing a button adds or subtracts 1, clamps to
 * [min, max], updates the input, and fires `change`." Also drives the ArrowUp/ArrowDown handling
 * below (spec's Keyboard table: "Step by 1 (native)" — see the component doc comment on why this
 * is implemented in script rather than delegated to the browser). Returns whether the value
 * actually changed, so a press at a limit fires no `change` at all (spec: "ignored at the limit").
 */
function step(delta: number): boolean {
  if (props.disabled) return false;
  const next = clamp(model.value + delta);
  if (next === model.value) return false;
  model.value = next;
  emit('change', next);
  announce(next);
  return true;
}

function onDecrease(): void {
  step(-1);
}
function onIncrease(): void {
  step(1);
}

/**
 * Spec "Quantity stepper" → Behaviour & motion: "A typed value is rounded to a whole number and
 * clamped on change. A non-number becomes `min`. No error is shown for '0' or '99'. It is simply
 * corrected." Runs on blur and on `Enter` (spec's Keyboard table).
 *
 * Mirrors `step()`: `change`/the live-region announcement fire only when the committed value
 * actually differs from `model.value` — focusing and blurring (or pressing `Enter`) with no edit
 * must not fire a spurious `change` or announce a "settled update" that never happened. The
 * reformatted text is written unconditionally either way, since "01" round-tripping to "1" is a
 * display correction independent of whether the *number* changed.
 *
 * Does **not** reset `isEditing` — that is `onBlur`'s job (see its own comment) — so a caller who
 * presses `Enter` and keeps typing without leaving the field is still shown what they type.
 */
function commit(): void {
  const parsed = parseLocaleNumber(editingText.value, props.locale);
  const rounded = parsed === null ? props.min : Math.round(parsed);
  const next = clamp(rounded);
  if (next !== model.value) {
    model.value = next;
    emit('change', next);
    announce(next);
  }
  editingText.value = formatDisplay(next);
}

function onFocus(event: FocusEvent): void {
  isEditing.value = true;
  editingText.value = formatDisplay(model.value);
  emit('focus', event);
}

/**
 * `isEditing` turns off here, not in `commit()`: an `Enter` commit leaves the field focused, and
 * `displayValue` reads `editingText` only while `isEditing` is true. Resetting it inside `commit()`
 * meant that the very next keystroke after `Enter` was overwritten by the reactive `:value`
 * binding snapping back to the freshly committed, formatted number — the field looked like it
 * ignored what was just typed. Blur is the one place editing genuinely ends.
 */
function onBlur(event: FocusEvent): void {
  commit();
  isEditing.value = false;
  emit('blur', event);
}

function onInput(event: Event): void {
  editingText.value = (event.target as HTMLInputElement).value;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    // Not inside a native <form> submit path by default (type="text", no implicit action), but a
    // consumer's own form could still treat Enter as submit; committing here must not also submit.
    event.preventDefault();
    commit();
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const changed = step(event.key === 'ArrowUp' ? 1 : -1);
    if (changed) editingText.value = formatDisplay(model.value);
  }
}

/**
 * The group (spec "Quantity stepper" → Anatomy): "one bordered group, radius-md" — a single
 * perimeter border, not one per part (the ASCII anatomy's internal `┬`/`┴` are diagram notation
 * for the three parts, not a drawn divider; the reference image shows one continuous boundary).
 * `overflow-hidden` is what gives the two outer corners' square first/last children the "inner
 * radius is radius-md minus 1px" look the Sizes table asks for, without a literal px: the group's
 * own rounded corner clips whatever square background a button paints under it (see
 * `select/panelParts.ts`'s own comment for the same technique on the select panel).
 */
const ROOT_BASE =
  'relative inline-flex items-stretch w-fit max-w-full overflow-hidden bg-background ' +
  'rounded-[var(--eldra-stepper-radius,var(--eldra-radius-md))] eldra-field-border border-border-strong';
/** Spec "Quantity stepper" → States, "Disabled (sold out)" row, Group column. */
const ROOT_DISABLED = 'bg-surface-strong border-border border-dashed cursor-not-allowed';

const rootClass = computed(() =>
  partClass(cx(ROOT_BASE, props.disabled && ROOT_DISABLED), props.classes, 'root')
);

/**
 * Buttons (spec "Quantity stepper" → Sizes): 2.5×2.5rem square at `md`, 2×2rem at `sm` — both
 * exact `control-h`/`control-h-sm` squares, the same `aspect-square` shape Button.vue's icon-only
 * variant uses. `eldra-focus-inset`, no `-always`: buttons show the ring on keyboard focus only
 * (spec "Actions and forms" → Focus: "Every other control shows it on keyboard focus only"), and
 * per the Focus ring foundation's "Inset variant" note ("quantity-stepper parts ... would touch a
 * neighbour" → draw the ring just inside the edge).
 */
const BUTTON_BASE =
  'relative inline-flex shrink-0 items-center justify-center border-0 bg-transparent ' +
  'eldra-focus-inset';
const BUTTON_SIZE: Record<QuantityStepperSize, string> = {
  md: 'control-h aspect-square',
  sm: 'control-h-sm aspect-square',
};
/** Spec States, "Button hover" row: "fill `text` at 6%" — the same mix Button.vue's `ghost`
 * variant hover uses. */
const BUTTON_HOVER =
  'text-text hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';
/** Spec States, "At min / at max" row: "icon `muted` at 55% opacity ... no hover fill." */
const BUTTON_AT_LIMIT = 'text-muted opacity-55 cursor-not-allowed';
/** Spec States, "Disabled (sold out)" row, Buttons column: "both disabled." */
const BUTTON_DISABLED = 'text-muted cursor-not-allowed';

function buttonClass(atLimit: boolean): string {
  return cx(
    BUTTON_BASE,
    BUTTON_SIZE[props.size],
    props.disabled ? BUTTON_DISABLED : atLimit ? BUTTON_AT_LIMIT : BUTTON_HOVER
  );
}
const decreaseClass = computed(() =>
  partClass(buttonClass(atMin.value), props.classes, 'decrease')
);
const increaseClass = computed(() =>
  partClass(buttonClass(atMax.value), props.classes, 'increase')
);

const ICON_SIZE: Record<QuantityStepperSize, string> = { md: 'size-5', sm: 'size-4' };
const iconClass = computed(() => ICON_SIZE[props.size]);

/**
 * The field (spec "Quantity stepper" → Anatomy): "centred, weight 600, tabular numerals, no
 * native spin buttons." `type="text"`, not the anatomy's literal `type="number"` — see this
 * file's top-level doc comment for why. `eldra-focus-inset-always`: like Input's own text fields,
 * this shows the ring on *any* focus, pointer included (spec "Focus ring" → "When it shows":
 * "Text fields ... show it on any focus... because a caret alone is easy to miss"), drawn inset
 * per the same "Inset variant" note as the buttons.
 */
const INPUT_BASE =
  'min-w-0 border-0 bg-transparent text-center tabular-nums text-text ' +
  'eldra-focus-inset eldra-focus-inset-always';
const INPUT_SIZE: Record<QuantityStepperSize, string> = {
  md: 'w-11 text-stepper-value',
  sm: 'w-9 text-stepper-value-sm',
};
/** Spec States, "Disabled (sold out)" row, Input column: "muted." */
const INPUT_DISABLED = 'text-muted cursor-not-allowed';

const inputClass = computed(() =>
  partClass(
    cx(INPUT_BASE, INPUT_SIZE[props.size], props.disabled && INPUT_DISABLED),
    props.classes,
    'input'
  )
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <button
      type="button"
      data-part="decrease"
      :class="decreaseClass"
      :aria-label="decreaseLabel"
      :aria-disabled="!disabled && atMin ? 'true' : undefined"
      :disabled="disabled || undefined"
      @click="onDecrease"
    >
      <!-- Tabler's `minus`, stroke 1.75. Decorative: the button is named by aria-label. -->
      <svg
        :class="iconClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 12l14 0" />
      </svg>
    </button>

    <input
      v-bind="$attrs"
      data-part="input"
      type="text"
      inputmode="numeric"
      role="spinbutton"
      :class="inputClass"
      :id="controlId"
      :name="name"
      :value="displayValue"
      :aria-label="inputAriaLabel"
      :aria-describedby="describedBy"
      :aria-invalid="error ? 'true' : undefined"
      :aria-valuenow="model"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuetext="displayValue"
      :disabled="disabled || undefined"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    />

    <button
      type="button"
      data-part="increase"
      :class="increaseClass"
      :aria-label="increaseLabel"
      :aria-disabled="!disabled && atMax ? 'true' : undefined"
      :disabled="disabled || undefined"
      @click="onIncrease"
    >
      <!-- Tabler's `plus`, stroke 1.75. Decorative: the button is named by aria-label. -->
      <svg
        :class="iconClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 5l0 14" />
        <path d="M5 12l14 0" />
      </svg>
    </button>
  </div>

  <!-- Spec "Quantity stepper" → Behaviour & motion: once per settled update, never per keypress. -->
  <VisuallyHidden as="p" role="status" aria-live="polite">{{ announcement }}</VisuallyHidden>

  <!-- The same error row a `FieldWrapper` draws (`FieldError`): linked by id, never a live region.
       The `error` part and its `classes` key are this component's own. -->
  <FieldError v-if="error" :id="errorId" :classes="classes">{{ error }}</FieldError>
</template>
