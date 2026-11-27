<script setup lang="ts">
/**
 * A unit field: a number on one side, and an `Intl`-formatted string in the field at all times,
 * formatted as it is typed (`$1,234.5`, `1.234 kr.`, `1,234 km`) with the caret kept where it was.
 *
 * Every `input` event, however the text arrived (a keystroke, a paste into a selection, a drop,
 * autofill, a virtual keyboard, dictation, the end of an IME composition), goes through one
 * function, `createAmountEditor().edit` in `src/utils/amount.ts`: it finds what changed against
 * the text the field showed, reads the result with one parser and formats it back. Keydown never
 * inserts or moves anything. The rules are in the README, under `UnitInput` and `CurrencyInput`.
 *
 * It is an `Input` in every respect a customer can see: the same box, sizes, paddings, focus ring
 * and error boundary, imported from `../input/classes.ts` rather than copied.
 */
import {
  computed,
  getCurrentInstance,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useSlots,
  watch,
} from 'vue';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import { createAmountEditor, type AmountInvalidReason, type AmountText } from '../../utils/amount';
import { joinIds, useUiId } from '../../utils/id';
import { mergeClass } from '../../utils/mergeClass';
import {
  createNumberFormat,
  currencyFractionDigits,
  localeSeparators,
} from '../../utils/number-format';
import { FIELD_KEY } from '../field-wrapper/context';
import { ICON_STROKE_WIDTH } from '../icon/sizes';
import {
  FIELD_ACTION_PAIR_SIZE,
  FIELD_BASE,
  FIELD_CLEAR_BUTTON,
  FIELD_CLEAR_SIZE,
  FIELD_LEADING_ICON,
  FIELD_LEADING_PAD,
  FIELD_SIZE,
  FIELD_SUFFIX_ROW,
  FIELD_SUFFIX_ROW_BASE,
  FIELD_TRAILING_PAD,
  FIELD_TRAILING_PAD_PAIR,
  fieldState,
} from '../input/classes';
import type { UnitInputProps } from './types';
import { useUndoRedo } from './undo-redo';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

/** How far the drag handle travels per `step`, in pixels — the private library's own number. */
const VALUE_DRAG_PIXELS_PER_STEP = 8;

/**
 * `Number.MAX_SAFE_INTEGER`, written out. A property access in a prop default is a member
 * expression the bundler cannot prove pure (a getter may throw), which pins the whole component
 * into every consumer's bundle — importing `Button` alone pulled this file in with it.
 */
const MAX_SAFE_VALUE = 9007199254740991;

const props = withDefaults(defineProps<UnitInputProps>(), {
  modelValue: undefined,
  unit: 'kilometer',
  locale: undefined,
  label: undefined,
  maxFraction: 2,
  max: MAX_SAFE_VALUE,
  min: 0,
  step: 1,
  enableDragAdjust: false,
  clearable: false,
  isCurrency: false,
  currency: 'USD',
  narrowSymbol: false,
  fixedFraction: false,
  nullable: false,
  placeholder: undefined,
  size: 'md',
  id: undefined,
  name: undefined,
  leadingIcon: undefined,
  // Undefined, not false: these fall back to the field wrapper's context, and `false` there would
  // be an answer rather than "no opinion" (see `Input`'s own comment).
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: number | null];
  /** The text in the field, on every local change and on the first formatting. */
  'update:formattedValue': [value: string];
  /** Whether the text can be read, on every change and once on mount. */
  'update:valid': [valid: boolean];
  clear: [];
  blur: [event: FocusEvent];
  focus: [event: FocusEvent];
}>();

const slots = useSlots();
const m = useMessages();
const ambientLocale = useEldraUiLocale();
const instance = getCurrentInstance();

/** See `Input.vue` for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

const controlId = useUiId(
  'unit-input',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
/** Own ids first, then the wrapper's — the one `describedBy` rule (see the README's Fields). */
const describedBy = computed(() => joinIds(props.describedBy, field?.value.describedBy));
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const controlRef = ref<HTMLInputElement | null>(null);
const dragHandleRef = ref<HTMLButtonElement | null>(null);

/**
 * Whether the parent actually **binds** `modelValue` — read off the vnode rather than from the
 * resolved prop, because an unbound prop and one bound to `undefined` are the same value and a
 * very different contract. Bound, the field reconciles to whatever the parent writes back (it may
 * clamp, or refuse); unbound, the field keeps what the customer typed.
 */
const hasModelValueProp = computed(() => {
  const vnodeProps = instance?.vnode.props;
  if (!vnodeProps) return false;
  return (
    Object.prototype.hasOwnProperty.call(vnodeProps, 'modelValue') ||
    Object.prototype.hasOwnProperty.call(vnodeProps, 'model-value')
  );
});

const resolvedLocale = computed(() => props.locale ?? ambientLocale.value);

/** Whether this field may be edited at all. */
const isEditable = computed(() => !props.readonly && !props.disabled);

// --- formatting ----------------------------------------------------------------------------------

/** A currency's own decimals (ISK 0, EUR 2); `null` for a unit. */
const currencyDigits = computed(() =>
  props.isCurrency ? currencyFractionDigits(props.currency) : null
);
const fixedDigits = computed(() =>
  props.isCurrency && props.fixedFraction ? currencyDigits.value : null
);
/** How many fraction digits the field takes: none in a currency that has none. */
const fractionDigits = computed(() =>
  currencyDigits.value === 0 ? 0 : (fixedDigits.value ?? props.maxFraction)
);
const restingFraction = computed(() => fixedDigits.value ?? 0);

function numberFormat(maxFraction: number, minFraction: number): Intl.NumberFormat {
  return createNumberFormat({
    locale: resolvedLocale.value,
    style: props.isCurrency ? 'currency' : 'unit',
    currency: props.currency,
    unit: props.unit,
    maxFraction,
    minFraction,
    // Only a currency has a narrow form here: the private library leaves a unit at `Intl`'s own
    // `short` display, which is the `km`/`kg` a customer reads.
    currencyDisplay: props.isCurrency && props.narrowSymbol ? 'narrowSymbol' : undefined,
  });
}

const editor = computed(() =>
  createAmountEditor({
    format: (minFraction) => numberFormat(Math.max(fractionDigits.value, minFraction), minFraction),
    decimal: localeSeparators(resolvedLocale.value).decimal,
    digits: fractionDigits.value,
    max: props.max,
  })
);

/** What the placeholder shows: the same format at zero, with up to two fraction digits spelled out. */
const emptyValuePlaceholder = computed(() => {
  if (props.placeholder !== undefined) return props.placeholder;
  const digits = Math.min(2, fractionDigits.value);
  return numberFormat(digits, digits).format(0);
});

function formatValue(value: number): string {
  return editor.value.fromValue(value, restingFraction.value).text;
}

function clampValue(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
}

function normalizeNumericValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

const normalizedStep = computed(() => {
  const next = Number(props.step);
  return Number.isFinite(next) && next > 0 ? next : 1;
});
/** What an emptied field means when it is not `nullable`, and what a step starts from. */
const fallbackValue = computed(() => clampValue(0));

// --- the text and the value ----------------------------------------------------------------------

const state = shallowRef<AmountText>(editor.value.fromValue(null));
const localValue = computed(() => state.value.text);
const ownValue = ref<number | null>(null);
const focused = ref(false);
const composing = ref(false);
/** Whether the text was edited since focus, so leaving an untouched empty field changes nothing. */
const edited = ref(false);
/** The value the field had when editing began: the model while the text cannot be read. */
const editStart = ref<number | null>(null);

const reading = computed(() => state.value.reading);
const unreadable = computed(
  () => reading.value.kind === 'invalid' || reading.value.kind === 'pending'
);
/** Unreadable text says why at once; a text still being typed only once the field is left. */
const invalidReason = computed<AmountInvalidReason | null>(() => {
  if (reading.value.kind === 'invalid') return reading.value.reason;
  if (reading.value.kind === 'pending' && !focused.value) return 'notANumber';
  return null;
});
const isInvalid = computed(
  () => (props.invalid ?? field?.value.invalid ?? false) || invalidReason.value !== null
);

function currentValue(): number | null {
  return hasModelValueProp.value ? normalizeNumericValue(props.modelValue) : ownValue.value;
}

/** The number the text stands for: what the form posts and what a step starts from. */
const numericModel = computed<number | null>(() => {
  const now = reading.value;
  if (now.kind === 'number') return now.value;
  if (now.kind === 'empty')
    return props.nullable ? null : edited.value ? fallbackValue.value : null;
  return editStart.value;
});

function setState(next: AmountText, emitFormatted = true): void {
  state.value = next;
  if (emitFormatted) emit('update:formattedValue', next.text);
}

function emitModel(value: number | null): void {
  ownValue.value = value;
  emit('update:modelValue', value);
}

/** Whether the text already says `value`, so a parent echoing it never rewrites "12," or "34,0". */
function textAgreesWith(value: number | null): boolean {
  const now = reading.value;
  if (now.kind === 'empty')
    return value === null || (edited.value && !props.nullable && value === fallbackValue.value);
  if (now.kind === 'number') return now.value === value;
  return true;
}

function setCaret(target: HTMLInputElement, caret: number): void {
  if (typeof document === 'undefined' || document.activeElement !== target) return;
  target.setSelectionRange(caret, caret);
}

/** The caret at the end of the amount, before a trailing symbol. */
function endOfAmount(): number {
  return editor.value.textIndex(state.value, state.value.raw.length);
}

/** Shows what a bound parent holds, when it wrote back something other than the text says. */
async function reconcile(target: HTMLInputElement, emitted: number): Promise<void> {
  await nextTick();
  if (!hasModelValueProp.value) return;
  const held = normalizeNumericValue(props.modelValue);
  if (held === emitted || textAgreesWith(held)) return;
  setState(editor.value.fromValue(held, restingFraction.value));
  target.value = state.value.text;
  setCaret(target, endOfAmount());
}

/** One change of the field's text, from an `input` event or an undo. */
function applyText(target: HTMLInputElement, text: string, caret: number, inputType: string): void {
  if (!focused.value && !unreadable.value) editStart.value = currentValue();
  const result = editor.value.edit(state.value, text, caret, inputType);
  if (result.refused) {
    target.value = state.value.text;
    setCaret(target, result.caret);
    return;
  }
  const wasUnreadable = unreadable.value;
  edited.value = true;
  setState(result.next);
  target.value = result.next.text;
  setCaret(target, result.caret);

  const now = result.next.reading;
  if (now.kind === 'number') {
    emitModel(now.value);
    void reconcile(target, now.value);
  } else if (now.kind === 'empty') {
    emitModel(props.nullable ? null : fallbackValue.value);
  } else if (!wasUnreadable) {
    emitModel(editStart.value);
  }
  if (!focused.value) void nextTick(settle);
}

/** The text at rest: grouped, a fixed currency's decimals padded, a bare mark or zero tail gone. */
function settle(): void {
  const now = reading.value;
  if (now.kind === 'number') {
    const next = editor.value.fromValue(now.value, restingFraction.value);
    if (next.text !== state.value.text) setState(next);
  } else if (now.kind === 'empty' && edited.value && !props.nullable) {
    setState(editor.value.fromValue(fallbackValue.value, restingFraction.value));
  }
  const target = controlRef.value;
  if (target && target.value !== state.value.text) target.value = state.value.text;
}

const formattedValue = computed<string>({
  get: () => state.value.text,
  set: (value: string) => {
    const target = controlRef.value;
    if (target) applyText(target, value, value.length, 'historyUndo');
  },
});
const { onKeydown: onUndoRedoKeydown } = useUndoRedo(formattedValue);

// --- the caret -----------------------------------------------------------------------------------

/** Put a collapsed caret inside the amount when it lands on a symbol. */
function setCursorToValue(): void {
  const target = controlRef.value;
  if (!target || state.value.raw === '') return;
  const start = target.selectionStart ?? 0;
  if (start !== (target.selectionEnd ?? 0)) return;
  const first = editor.value.textIndex(state.value, 0);
  const last = endOfAmount();
  if (start < first) target.setSelectionRange(first, first);
  else if (start > last) target.setSelectionRange(last, last);
}

/** Select the amount only, never the symbol — what a double-click and Ctrl/Cmd+A both mean here. */
function selectOnlyNumbers(): void {
  const target = controlRef.value;
  if (!target || state.value.raw === '') return;
  target.setSelectionRange(editor.value.textIndex(state.value, 0), endOfAmount());
}

// --- events --------------------------------------------------------------------------------------

function applyNumericValue(value: number): void {
  const input = controlRef.value;
  if (!input) return;
  const next = Number(clampValue(value).toFixed(fractionDigits.value));
  edited.value = true;
  setState(editor.value.fromValue(next, restingFraction.value));
  input.value = state.value.text;
  emitModel(next);
  setCaret(input, endOfAmount());
  void reconcile(input, next);
}

function steppedFrom(): number {
  return numericModel.value ?? fallbackValue.value;
}

function onFocus(event: FocusEvent): void {
  focused.value = true;
  edited.value = false;
  if (!unreadable.value) editStart.value = currentValue();
  // After the browser has placed its own caret, which happens after this event.
  if (isEditable.value) setTimeout(() => setCursorToValue());
  emit('focus', event);
}

function onBlur(event: FocusEvent): void {
  focused.value = false;
  settle();
  emit('blur', event);
}

function onClick(): void {
  if (isEditable.value) setCursorToValue();
}

function onDoubleClick(): void {
  if (isEditable.value) selectOnlyNumbers();
}

function onClear(): void {
  setState(editor.value.fromValue(null));
  const target = controlRef.value;
  if (target) target.value = '';
  emitModel(null);
  emit('clear');
  target?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (!isEditable.value) return;
  onUndoRedoKeydown(event);
  const key = event.key;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    event.preventDefault();
    if (!unreadable.value)
      applyNumericValue(steppedFrom() + normalizedStep.value * (key === 'ArrowUp' ? 1 : -1));
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (key === 'a' || key === 'A')) {
    selectOnlyNumbers();
    event.preventDefault();
  }
}

const CARET_KEYS = new Set(['Home', 'End', 'ArrowLeft', 'ArrowRight']);

/** After the browser moved the caret: Home and End stop at the amount, never in a symbol. */
function onKeyup(event: KeyboardEvent): void {
  if (isEditable.value && !event.shiftKey && CARET_KEYS.has(event.key)) setCursorToValue();
}

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  if (!isEditable.value) {
    target.value = state.value.text;
    return;
  }
  const inputEvent = event as InputEvent;
  if (composing.value || inputEvent.isComposing) return;
  applyText(
    target,
    target.value,
    target.selectionStart ?? target.value.length,
    inputEvent.inputType ?? ''
  );
}

function onCompositionStart(): void {
  composing.value = true;
}

function onCompositionEnd(): void {
  composing.value = false;
  const target = controlRef.value;
  if (!target || !isEditable.value) return;
  applyText(
    target,
    target.value,
    target.selectionStart ?? target.value.length,
    'insertCompositionText'
  );
}

// --- drag to adjust ------------------------------------------------------------------------------

let dragPointerId: number | null = null;
let dragStartY = 0;
let dragAppliedSteps = 0;

function removeDragListeners(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('pointermove', onDragPointerMove);
  window.removeEventListener('pointerup', onDragPointerEnd);
  window.removeEventListener('pointercancel', onDragPointerEnd);
}

function stopDrag(pointerId?: number): void {
  if (pointerId !== undefined && dragPointerId !== null && pointerId !== dragPointerId) return;
  const activePointerId = dragPointerId;
  dragPointerId = null;
  dragAppliedSteps = 0;
  removeDragListeners();
  if (activePointerId !== null) dragHandleRef.value?.releasePointerCapture?.(activePointerId);
}

function onDragAdjust(direction: 'up' | 'down', steps: number): void {
  if (!isEditable.value || unreadable.value) return;
  const delta = direction === 'up' ? steps : -steps;
  applyNumericValue(steppedFrom() + normalizedStep.value * delta);
}
function onDragPointerMove(event: PointerEvent): void {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
  const nextDragSteps = Math.trunc((dragStartY - event.clientY) / VALUE_DRAG_PIXELS_PER_STEP);
  const stepDelta = nextDragSteps - dragAppliedSteps;
  if (stepDelta === 0) return;
  dragAppliedSteps = nextDragSteps;
  onDragAdjust(stepDelta > 0 ? 'up' : 'down', Math.abs(stepDelta));
}

function onDragPointerEnd(event: PointerEvent): void {
  stopDrag(event.pointerId);
}

function onDragPointerDown(event: PointerEvent): void {
  if (typeof window === 'undefined' || !isEditable.value || !props.enableDragAdjust) return;

  event.preventDefault();
  event.stopPropagation();
  dragPointerId = event.pointerId;
  dragStartY = event.clientY;
  dragAppliedSteps = 0;
  dragHandleRef.value?.setPointerCapture?.(event.pointerId);
  controlRef.value?.focus();

  window.addEventListener('pointermove', onDragPointerMove);
  window.addEventListener('pointerup', onDragPointerEnd);
  window.addEventListener('pointercancel', onDragPointerEnd);
}

onBeforeUnmount(() => stopDrag());

// --- watchers ------------------------------------------------------------------------------------

watch(
  () => props.modelValue,
  (value) => {
    if (!hasModelValueProp.value) return;
    const next = normalizeNumericValue(value);
    if (textAgreesWith(next)) return;
    setState(editor.value.fromValue(next, restingFraction.value));
  },
  { immediate: true }
);

/** The locale, the currency or the unit changing reformats what is in the field. */
watch(editor, () => {
  const now = reading.value;
  if (now.kind !== 'number') return;
  setState(editor.value.fromValue(now.value, restingFraction.value), hasModelValueProp.value);
});

watch(unreadable, (value) => emit('update:valid', !value));
onMounted(() => emit('update:valid', !unreadable.value));

// --- classes -------------------------------------------------------------------------------------

const showOwnLabel = computed(
  () => props.label !== undefined && props.label !== '' && field?.value.labelsControl !== true
);
const showClear = computed(
  () => props.clearable && !props.disabled && !props.readonly && localValue.value.length > 0
);
const showDragHandle = computed(() => props.enableDragAdjust && !props.disabled && !props.readonly);
const hasSuffixSlot = computed(() => slots.suffix !== undefined);
const hasTrailing = computed(() => showClear.value || showDragHandle.value || hasSuffixSlot.value);

/**
 * How many of the field's own trailing actions (the clear button, the drag handle) are showing at
 * once — never the caller's own `suffix` slot, whose width this component does not control. Two of
 * them (operator report, 2026-09-25; see `classes.ts`'s own comment on `FIELD_TRAILING_PAD_PAIR`)
 * switch the field to the tighter pair geometry; one keeps today's, unchanged.
 */
const trailingActionCount = computed(() => Number(showClear.value) + Number(showDragHandle.value));
const isActionPair = computed(() => trailingActionCount.value === 2);
const hasLeading = computed(
  () => props.leadingIcon !== undefined || slots.leadingIcon !== undefined
);

/** The same rule as `Input`'s: a disabled field keeps its dead boundary and drops the danger one. */
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const rootClass = 'eldra:block eldra:w-full';
// RangeFacet's Min / Max labels (through CurrencyInput) override the label.
const labelClass = computed(() =>
  mergeClass('eldra:text-label eldra:text-text eldra:mb-1 eldra:block', props.classes?.label)
);
const fieldClass = computed(() => [
  'eldra:relative eldra:block eldra:w-full',
  props.classes?.field,
]);
const controlClass = computed(() => [
  FIELD_BASE,
  FIELD_SIZE[props.size],
  hasLeading.value && FIELD_LEADING_PAD,
  hasTrailing.value &&
    (isActionPair.value ? FIELD_TRAILING_PAD_PAIR[props.size] : FIELD_TRAILING_PAD[props.size]),
  'eldra:tabular-nums',
  fieldState({ disabled: props.disabled, readonly: props.readonly, invalid: showsInvalid.value }),
  showsInvalid.value && 'eldra:eldra-field-invalid',
  props.classes?.control,
]);
const leadingIconClass = computed(() => [FIELD_LEADING_ICON, props.classes?.leadingIcon]);
/**
 * `FIELD_SUFFIX_ROW`'s `gap-1` is the shared default (`Input`'s and `SearchBar`'s row too — see its
 * own doc comment). Only the two-action pair wants its icons flush, so that case alone builds the
 * row from `FIELD_SUFFIX_ROW_BASE` with `gap-0` rather than changing the shared constant.
 */
const suffixClass = computed(() => [
  isActionPair.value ? `${FIELD_SUFFIX_ROW_BASE} eldra:gap-0` : FIELD_SUFFIX_ROW,
  props.classes?.suffix,
]);
const actionSize = computed(() =>
  isActionPair.value ? FIELD_ACTION_PAIR_SIZE[props.size] : FIELD_CLEAR_SIZE[props.size]
);
const clearButtonClass = computed(() => [
  FIELD_CLEAR_BUTTON,
  actionSize.value,
  props.classes?.clearButton,
]);
const dragHandleClass = computed(() => [
  'eldra:inline-flex eldra:shrink-0 eldra:cursor-ns-resize eldra:touch-none eldra:items-center eldra:justify-center',
  'eldra:text-muted eldra:hover:text-text eldra:select-none',
  actionSize.value,
  props.classes?.dragHandle,
]);

/** `formatValue` formats one number the way this field would at rest; `isValid` is whether the
 *  text can be read, and `invalidReason` why not. */
defineExpose({
  formatValue,
  isValid: computed(() => !unreadable.value),
  invalidReason,
});
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="[rootClass, $attrs.class]"
  >
    <label v-if="showOwnLabel" data-part="label" :for="controlId" :class="labelClass">
      {{ label }}
    </label>

    <span data-part="field" :class="fieldClass">
      <span
        v-if="hasLeading"
        :data-eldra-slot="eldra.slotHost('leadingIcon')"
        data-part="leadingIcon"
        :class="leadingIconClass"
      >
        <slot name="leadingIcon">
          <component
            v-if="leadingIcon"
            :is="leadingIcon"
            class="eldra:size-4.5 eldra:shrink-0"
            :stroke-width="ICON_STROKE_WIDTH"
            aria-hidden="true"
            focusable="false"
          />
        </slot>
      </span>

      <input
        ref="controlRef"
        v-bind="{ ...$attrs, class: undefined }"
        data-part="control"
        :class="controlClass"
        :id="controlId"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        dir="ltr"
        :value="localValue"
        :placeholder="emptyValuePlaceholder"
        :required="isRequired || undefined"
        :readonly="readonly || undefined"
        :disabled="disabled || undefined"
        :aria-invalid="isInvalid ? 'true' : ($attrs['aria-invalid'] as 'false' | undefined)"
        :aria-describedby="describedBy"
        @input="onInput"
        @keydown="onKeydown"
        @keyup="onKeyup"
        @click="onClick"
        @dblclick="onDoubleClick"
        @focus="onFocus"
        @blur="onBlur"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
      />

      <!-- The form's value is the raw number, never the locale string the customer read: a form
           posting "1.234,5" would be parsed as 1.2345 by almost every server. The visible control
           deliberately carries no `name` of its own, so exactly one value is posted. -->
      <input v-if="name" type="hidden" :name="name" :value="numericModel ?? ''" />

      <span
        v-if="hasTrailing"
        :data-eldra-slot="eldra.slotHost('suffix')"
        data-part="suffix"
        :class="suffixClass"
      >
        <button
          v-if="showClear"
          :data-eldra-scope="eldra.scope"
          data-part="clearButton"
          type="button"
          :class="clearButtonClass"
          :aria-label="m.clear"
          @mousedown.prevent
          @click="onClear"
        >
          <!-- Tabler's `x`, stroke 1.75, at 1.125rem. Decorative: the button is named by aria-label. -->
          <svg
            class="eldra:size-4.5"
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

        <!-- The drag handle is pointer-only and out of the accessible tree on purpose: every value
             it can reach is reachable with ArrowUp/ArrowDown on the field itself, so announcing a
             second control for the same job would only add a stop to the keyboard path. -->
        <button
          v-if="showDragHandle"
          ref="dragHandleRef"
          :data-eldra-scope="eldra.scope"
          data-part="dragHandle"
          data-drag-adjust-handle
          type="button"
          tabindex="-1"
          aria-hidden="true"
          :class="dragHandleClass"
          @pointerdown="onDragPointerDown"
          @click.prevent.stop
        >
          <!-- Tabler's `arrows-move-vertical`, stroke 1.75, at 1.125rem. -->
          <svg
            class="eldra:size-4.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M12 3l0 18" />
            <path d="M15 6l-3 -3l-3 3" />
            <path d="M15 18l-3 3l-3 -3" />
          </svg>
        </button>

        <slot name="suffix" />
      </span>
    </span>
  </div>
</template>
