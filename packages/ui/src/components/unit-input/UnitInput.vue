<script setup lang="ts">
/**
 * A unit field: a number on one side, and an `Intl`-formatted string in the field at all times.
 *
 * **A port, not a design.** This component and `CurrencyInput` are one-to-one ports of Eldra's
 * private component library, kept behaviour-for-behaviour so a store that knows those fields knows
 * these. They are **additions beyond design spec 1**, which has no editable numeric field at all —
 * recorded in the README's "Additions beyond the spec", where the handful of deliberate departures
 * from the private behaviour are listed too.
 *
 * **The field is always formatted.** There is no editing mode and no focus-dependent text: focused
 * or not, the field shows `$1,234.5`, `1.234 kr.` or `1,234 km`, reformatted on every keystroke
 * with the caret mapped through the new text by *numeric content* (`mapCursorByNumericContent`) —
 * count the digits before the caret, then walk the reformatted string until as many have gone by.
 * That is what lets a group separator appear to the left of the caret without the caret moving.
 *
 * It is an `Input` in every respect a customer can see: the same box, sizes, paddings, focus ring
 * and error boundary, imported from `../input/classes.ts` rather than copied.
 *
 * **Typing is not filtered, it is stripped.** Unlike `QuantityStepper`, a non-numeric keystroke is
 * not refused at `beforeinput`; it lands, and the reformat that follows removes it. That is the
 * private behaviour, and it is the one that can survive a field whose own text is full of
 * non-numeric characters (a symbol, a group separator, a unit) — a filter that judged the
 * *resulting value* would have to understand the formatted string it is judging.
 *
 * **`preserveEmptyUntilBlur`.** Clearing the text while editing leaves the field empty and emits
 * nothing, so a customer can retype an amount from scratch; leaving the field falls back to the
 * formatted `clamp(0)` — `min` — and emits that.
 */
import {
  computed,
  getCurrentInstance,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  useSlots,
  watch,
} from 'vue';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import { createNumberFormat } from '../../utils/number-format';
import { FIELD_KEY } from '../field-wrapper/context';
import Icon from '../icon/Icon.vue';
import {
  FIELD_ACTION_PAIR_SIZE,
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
  FIELD_TRAILING_PAD_PAIR,
} from '../input/classes';
import type { UnitInputProps } from './types';
import { useUndoRedo } from './undo-redo';

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
  narrowSymbol: true,
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
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const controlRef = ref<HTMLInputElement | null>(null);
const dragHandleRef = ref<HTMLButtonElement | null>(null);

/** The text in the field, and the same text with everything but digits and a `.` taken out. */
const localValue = ref('');
const localUnformattedValue = ref('');
/** Set while an emptied field is being retyped: the field stays empty and emits nothing. */
const preserveEmptyUntilBlur = ref(false);

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

const formattedValue = computed<string>({
  get: () => localValue.value,
  set: (value: string) => updateLocalFormattedValue(value),
});
const { onKeydown: onUndoRedoKeydown } = useUndoRedo(formattedValue);

const resolvedLocale = computed(() => props.locale ?? ambientLocale.value);

/** Whether this field may be edited at all — a read-only field plays none of the caret games. */
const isEditable = computed(() => !props.readonly && !props.disabled);

// --- formatting ----------------------------------------------------------------------------------

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

/** What the placeholder shows: the same format at zero, with both fraction digits spelled out. */
const emptyValuePlaceholder = computed(() => numberFormat(2, 2).format(0));

/**
 * The shape of the formatted string, read from `Intl` rather than assumed: which characters group
 * and separate the decimal, and whether the symbol leads (`$1,234`) or trails (`1,234 km`) — with
 * the literal that goes with it counted into its length, because the caret has to clear both.
 */
type NumberParts = {
  symbolBefore: boolean;
  symbolAfter: boolean;
  symbolLength: number;
} & Record<Intl.NumberFormatPartTypes, string>;

const formParts = computed<NumberParts>(() => {
  const format = numberFormat(2, 2);
  const parts = format.formatToParts(1000).reduce((accumulator, part) => {
    accumulator[part.type] = part.value;
    return accumulator;
  }, {} as NumberParts);

  const formatted = format.format(1000);
  const symbol = parts.unit || parts.currency;
  if (symbol) {
    const symbolIndex = formatted.indexOf(symbol);
    parts.symbolBefore = symbolIndex === 0;
    parts.symbolAfter = symbolIndex > 0;
    parts.symbolLength = symbol.length;
  }
  if (parts.literal) {
    parts.symbolLength = (parts.symbolLength ?? 0) + parts.literal.length;
  }
  return parts;
});

function formatValue(value: number): string {
  return numberFormat(props.maxFraction, 0).format(value);
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

function formatModelValue(value: number | string | null | undefined): string {
  const numberValue = normalizeNumericValue(value);
  return numberValue === null ? '' : formatValue(numberValue);
}

const normalizedStep = computed(() => {
  const next = Number(props.step);
  return Number.isFinite(next) && next > 0 ? next : 1;
});
/** What an emptied field falls back to on blur, and what a step starts from while it is empty. */
const fallbackBlurValue = computed(() => clampValue(0));

function normalizedClampedValue(value: number): number {
  return Number(clampValue(value).toFixed(props.maxFraction));
}

function currentNumericValue(): number {
  if (preserveEmptyUntilBlur.value) return fallbackBlurValue.value;
  return (
    normalizeNumericValue(localUnformattedValue.value) ??
    normalizeNumericValue(props.modelValue) ??
    fallbackBlurValue.value
  );
}

function steppedValue(direction: 1 | -1): number {
  return normalizedClampedValue(currentNumericValue() + normalizedStep.value * direction);
}

/**
 * The formatted text back to a plain number string. Every character the format put there comes
 * out — symbol, group separators, the literal between them — and so does anything else that is
 * not a digit or a decimal point, which is what makes typing a letter a no-op rather than an
 * error.
 */
function unformatValue(value: string): string {
  const parts = formParts.value;
  let next = String(value);
  if (parts.unit) next = next.replaceAll(parts.unit, '');
  if (parts.group) next = next.replaceAll(parts.group, '');
  if (parts.literal) next = next.replaceAll(parts.literal, '');
  if (parts.decimal === ',') next = next.replaceAll(parts.decimal, '.');
  // Everything that is not a digit or a decimal point.
  next = next.replace(/[^0-9.]/g, '');
  // Only the first decimal point survives, and nothing after a second one.
  next = next.replace(/\.(?=.*\.)/g, '');
  next = next.replace(/(\d*\.\d*)\./g, '$1');
  return next;
}

function isEditableNumberCharacter(character: string): boolean {
  return /\d/.test(character) || character === formParts.value.decimal;
}

function editableStartIndex(value: string): number {
  const index = [...value].findIndex((character) => isEditableNumberCharacter(character));
  return index === -1 ? 0 : index;
}

function editableEndIndex(value: string): number {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (isEditableNumberCharacter(value[index] ?? '')) return index + 1;
  }
  return value.length;
}

/**
 * Where the caret goes in the reformatted text: after as many editable characters as there were
 * before it in what the customer typed. Group separators inserted to the left of the caret
 * therefore move the caret with them, and none of it depends on how many characters the format
 * added or removed.
 */
function mapCursorByNumericContent(
  sourceValue: string,
  sourceCursor: number,
  formatted: string
): number {
  const normalizedBeforeCursor = unformatValue(sourceValue.slice(0, sourceCursor));
  if (normalizedBeforeCursor === '') return editableStartIndex(formatted);

  let seen = '';
  for (let index = 0; index < formatted.length; index += 1) {
    const character = formatted[index] ?? '';
    if (!isEditableNumberCharacter(character)) continue;
    seen += character === formParts.value.decimal ? '.' : character;
    if (seen.length >= normalizedBeforeCursor.length) return index + 1;
  }
  return editableEndIndex(formatted);
}

// --- the value -----------------------------------------------------------------------------------

const numericModel = computed(() => normalizeNumericValue(localUnformattedValue.value));

function updateLocalFormattedValue(
  value: string,
  options: { emitModel?: boolean; emitFormatted?: boolean } = {}
): void {
  const { emitModel = true, emitFormatted = true } = options;
  localValue.value = value;
  localUnformattedValue.value = unformatValue(value);
  if (emitModel) emit('update:modelValue', normalizeNumericValue(localUnformattedValue.value));
  if (emitFormatted) emit('update:formattedValue', value);
}

/**
 * After an edit, wait a tick and take the parent's answer. A controlled parent may clamp the value
 * or refuse it outright, and the field has to show what the parent holds rather than what was
 * typed — with the caret put back where the mapping said it goes.
 */
async function reconcileControlledValue(
  target: HTMLInputElement,
  cursor: number,
  inputValue: string
): Promise<void> {
  if (preserveEmptyUntilBlur.value) return;

  let nextValue = inputValue;
  await nextTick();

  if (hasModelValueProp.value) {
    nextValue = formatModelValue(props.modelValue);
    if (
      nextValue !== inputValue ||
      nextValue !== formattedValue.value ||
      target.value !== nextValue
    ) {
      updateLocalFormattedValue(nextValue, { emitModel: false });
      target.value = nextValue;
    }
  }

  if (typeof document !== 'undefined' && document.activeElement === target) {
    const nextCursor = Math.min(cursor, nextValue.length);
    target.setSelectionRange(nextCursor, nextCursor);
  }
}

// --- the caret -----------------------------------------------------------------------------------

/**
 * Put the caret inside the number when it lands on a symbol: before a trailing one, after a
 * leading one. Returns whether it moved, which is what tells the arrow keys they have nothing
 * left to do.
 */
function setCursorToValue(): boolean {
  const target = controlRef.value;
  if (!target) return false;

  const parts = formParts.value;
  const cursorStart = target.selectionStart || 0;
  const cursorEnd = target.selectionEnd || 0;
  if (cursorStart !== cursorEnd) return false;

  const cursorIndex = parts.symbolBefore
    ? formattedValue.value.search(/\d/)
    : formattedValue.value.search(/\d(?=\D*$)/) + 1;
  const valueLength = formattedValue.value.length - parts.symbolLength;
  const isCursorBefore = parts.symbolBefore && cursorStart <= parts.symbolLength;
  const isCursorAfter = parts.symbolAfter && cursorStart > valueLength;
  if (isCursorBefore || isCursorAfter) {
    target.setSelectionRange(cursorIndex, cursorIndex);
    return true;
  }
  return false;
}

/** Select the digits only, never the symbol — what a double-click and Ctrl/Cmd+A both mean here. */
function selectOnlyNumbers(): void {
  const target = controlRef.value;
  if (!target) return;
  const firstIndex = formattedValue.value.search(/\d/);
  const lastIndex = formattedValue.value.search(/\d(?=\D*$)/) + 1;
  target.setSelectionRange(firstIndex, lastIndex);
}

// --- events --------------------------------------------------------------------------------------

async function applyNumericValue(value: number, cursor?: number): Promise<void> {
  const input = controlRef.value;
  if (!input) return;

  const nextFormattedValue = formatValue(normalizedClampedValue(value));
  const nextCursor = Math.min(
    cursor ?? input.selectionStart ?? nextFormattedValue.length,
    nextFormattedValue.length
  );

  preserveEmptyUntilBlur.value = false;
  updateLocalFormattedValue(nextFormattedValue);
  input.value = nextFormattedValue;

  await reconcileControlledValue(input, nextCursor, nextFormattedValue);
}

async function updateSteppedValue(direction: 1 | -1): Promise<void> {
  const input = controlRef.value;
  if (!input) return;
  await applyNumericValue(steppedValue(direction), input.selectionStart ?? input.value.length);
  setCursorToValue();
}

function onFocus(event: FocusEvent): void {
  // After the browser has placed its own caret, which happens after this event.
  if (isEditable.value) setTimeout(() => setCursorToValue());
  emit('focus', event);
}

function onBlur(event: FocusEvent): void {
  emit('blur', event);
  if (!preserveEmptyUntilBlur.value) return;

  preserveEmptyUntilBlur.value = false;
  if (localUnformattedValue.value !== '') return;

  const fallbackFormatted = formatValue(fallbackBlurValue.value);
  updateLocalFormattedValue(fallbackFormatted);
  const target = controlRef.value;
  if (target) target.value = fallbackFormatted;
}

function onClick(): void {
  if (isEditable.value) setCursorToValue();
}

function onDoubleClick(): void {
  if (isEditable.value) selectOnlyNumbers();
}

function onClear(): void {
  preserveEmptyUntilBlur.value = false;
  updateLocalFormattedValue('');
  const target = controlRef.value;
  if (target) target.value = '';
  emit('clear');
  target?.focus();
}

async function onKeydown(event: KeyboardEvent): Promise<void> {
  if (!isEditable.value) return;

  const input = controlRef.value;
  const key = event.key;
  const isDelete = key === 'Del' || key === 'Delete';
  const isBackspace = key === 'Backspace';
  const isArrowLeft = key === 'ArrowLeft';
  const isArrowRight = key === 'ArrowRight';
  const isArrowUp = key === 'ArrowUp';
  const isArrowDown = key === 'ArrowDown';
  const isCtrlOrCmd = event.ctrlKey || event.metaKey;
  const isCtrlA = isCtrlOrCmd && (key === 'a' || key === 'A');
  const cursorStart = input?.selectionStart || 0;
  const cursorEnd = input?.selectionEnd || 0;
  const part = formParts.value;

  onUndoRedoKeydown(event);

  if (isArrowUp || isArrowDown) {
    event.preventDefault();
    await updateSteppedValue(isArrowUp ? 1 : -1);
    return;
  }

  if (isArrowLeft || isArrowRight) {
    // After the browser has moved the caret: skip whatever non-digit it landed on.
    setTimeout(() => {
      if (setCursorToValue()) return;
      if (isArrowLeft) {
        const previous = formattedValue.value[cursorStart - 2] || '';
        if (!previous.match(/\d/)) input?.setSelectionRange(cursorStart - 2, cursorStart - 2);
      } else {
        const next = formattedValue.value[cursorStart + 1] || '';
        if (!next.match(/\d/)) input?.setSelectionRange(cursorStart + 2, cursorStart + 2);
      }
    });
  } else if (isCtrlA) {
    selectOnlyNumbers();
    event.preventDefault();
    return;
  } else if (isDelete && cursorStart === cursorEnd) {
    const nextChar = formattedValue.value[cursorStart] || '';
    if (!nextChar.match(/\d/)) {
      if (part.symbolAfter && cursorStart === formattedValue.value.length - part.symbolLength) {
        // Nothing but the symbol is left to the right: the symbol is not the customer's to delete.
        input?.setSelectionRange(cursorStart, cursorStart);
        event.preventDefault();
        return;
      }
      input?.setSelectionRange(cursorStart + 1, cursorStart + 1);
      setTimeout(() => input?.setSelectionRange(cursorStart, cursorStart));
    }
  } else if (isBackspace && cursorStart === cursorEnd) {
    const previousChar = formattedValue.value[cursorStart - 1] || '';
    if (!previousChar.match(/\d/)) {
      if (part.symbolBefore && cursorStart === part.symbolLength) {
        input?.setSelectionRange(cursorStart, cursorStart);
        event.preventDefault();
        return;
      }
      input?.setSelectionRange(cursorStart - 1, cursorStart - 1);
    }
  }

  // The decimal separator: whichever of `,` and `.` was pressed inserts the locale's own, and a
  // second one is refused rather than dropped later by the reformat.
  if (part.decimal && formattedValue.value.includes(part.decimal) && (key === ',' || key === '.')) {
    event.preventDefault();
    return;
  }
  if ((key === ',' && part.decimal === '.') || (key === '.' && part.decimal === ',')) {
    const valueBefore = input?.value.slice(0, cursorStart) ?? '';
    const valueAfter = input?.value.slice(cursorStart) ?? '';
    formattedValue.value = valueBefore + part.decimal + valueAfter;
    event.preventDefault();
  }
}

async function onInput(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement | null;
  if (!target || !isEditable.value) return;

  const value = target.value;
  const inputCursor = target.selectionStart || 0;
  const unformatted = unformatValue(value);

  if (unformatted === '') {
    // An emptied field stays empty until it is left; the model is not told the value is gone.
    preserveEmptyUntilBlur.value = true;
    target.value = '';
    updateLocalFormattedValue('', { emitModel: false });
    return;
  }

  preserveEmptyUntilBlur.value = false;
  if (Number(unformatted) > props.max) {
    // Refused: the field keeps the text it had.
    target.value = formattedValue.value;
    return;
  }

  let formatted = formatValue(Number(unformatted));
  if (unformatted.endsWith('.')) {
    // A decimal separator that has just been typed has no digits after it yet, so `Intl` drops it.
    // It goes back **inside** the number rather than at the end of the string, which is the same
    // place for a leading symbol (`$1,234.`) and the only right one for a trailing one
    // (`1,234. km`, not `1,234 km.`).
    const end = editableEndIndex(formatted);
    formatted = formatted.slice(0, end) + formParts.value.decimal + formatted.slice(end);
  }

  const cursor = mapCursorByNumericContent(value, inputCursor, formatted);
  formattedValue.value = formatted;
  target.value = formatted;
  await reconcileControlledValue(target, cursor, formatted);
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

async function onDragAdjust(direction: 'up' | 'down', steps: number): Promise<void> {
  if (!isEditable.value) return;
  const delta = direction === 'up' ? steps : -steps;
  const input = controlRef.value;
  await applyNumericValue(
    currentNumericValue() + normalizedStep.value * delta,
    input?.selectionStart ?? input?.value.length
  );
  setCursorToValue();
}

function onDragPointerMove(event: PointerEvent): void {
  if (dragPointerId !== null && event.pointerId !== dragPointerId) return;
  const nextDragSteps = Math.trunc((dragStartY - event.clientY) / VALUE_DRAG_PIXELS_PER_STEP);
  const stepDelta = nextDragSteps - dragAppliedSteps;
  if (stepDelta === 0) return;
  dragAppliedSteps = nextDragSteps;
  void onDragAdjust(stepDelta > 0 ? 'up' : 'down', Math.abs(stepDelta));
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
    if (preserveEmptyUntilBlur.value) return;
    const nextFormattedValue = hasModelValueProp.value ? formatModelValue(value) : '';
    if (nextFormattedValue === localValue.value) return;
    updateLocalFormattedValue(nextFormattedValue, {
      emitModel: false,
      emitFormatted: hasModelValueProp.value,
    });
  },
  { immediate: true }
);

watch(
  hasModelValueProp,
  (bound) => {
    if (preserveEmptyUntilBlur.value) return;
    if (!bound) {
      if (localValue.value === '') return;
      updateLocalFormattedValue('', { emitModel: false, emitFormatted: false });
      return;
    }
    const nextFormattedValue = formatModelValue(props.modelValue);
    if (nextFormattedValue === localValue.value) return;
    updateLocalFormattedValue(nextFormattedValue, { emitModel: false });
  },
  { immediate: true }
);

/** The locale, the currency or the unit changing reformats what is in the field. */
watch([resolvedLocale, () => props.currency, () => props.unit, () => props.isCurrency], () => {
  if (preserveEmptyUntilBlur.value) return;
  const numeric = normalizeNumericValue(localUnformattedValue.value);
  if (numeric === null) return;
  updateLocalFormattedValue(formatValue(numeric), { emitModel: false });
});

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

const rootClass = computed(() => partClass('block w-full', props.classes, 'root'));
const labelClass = computed(() =>
  partClass('text-label text-text mb-1 block', props.classes, 'label')
);
const fieldClass = computed(() =>
  partClass(
    cx('relative block w-full', showsInvalid.value && 'eldra-field-invalid'),
    props.classes,
    'field'
  )
);
const controlClass = computed(() =>
  partClass(
    cx(
      FIELD_BASE,
      FIELD_SIZE[props.size],
      hasLeading.value && FIELD_LEADING_PAD,
      hasTrailing.value &&
        (isActionPair.value ? FIELD_TRAILING_PAD_PAIR[props.size] : FIELD_TRAILING_PAD[props.size]),
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
/**
 * `FIELD_SUFFIX_ROW`'s `gap-1` is the shared default (`Input`'s and `SearchBar`'s row too — see its
 * own doc comment). Only the two-action pair wants its icons flush, so that case alone overrides
 * the gap locally rather than changing the shared constant (`gap-*` is a stock tailwind-merge
 * group, so `cx` needs no new merge-group registration for this).
 */
const suffixClass = computed(() =>
  partClass(cx(FIELD_SUFFIX_ROW, isActionPair.value && 'gap-0'), props.classes, 'suffix')
);
const actionSize = computed(() =>
  isActionPair.value ? FIELD_ACTION_PAIR_SIZE[props.size] : FIELD_CLEAR_SIZE[props.size]
);
const clearButtonClass = computed(() =>
  partClass(cx(FIELD_CLEAR_BUTTON, actionSize.value), props.classes, 'clearButton')
);
const dragHandleClass = computed(() =>
  partClass(
    cx(
      'inline-flex shrink-0 cursor-ns-resize touch-none items-center justify-center',
      'text-muted hover:text-text select-none',
      actionSize.value
    ),
    props.classes,
    'dragHandle'
  )
);

/** `formatValue` is the private library's own exposed method: a caller formats one number the
 *  way this field would. */
defineExpose({ formatValue });
</script>

<template>
  <div data-part="root" :class="rootClass">
    <label v-if="showOwnLabel" data-part="label" :for="controlId" :class="labelClass">
      {{ label }}
    </label>

    <span data-part="field" :class="fieldClass">
      <span v-if="hasLeading" data-part="leadingIcon" :class="leadingIconClass">
        <slot name="leadingIcon">
          <Icon v-if="leadingIcon" :icon="leadingIcon" :classes="{ root: 'size-4.5' }" />
        </slot>
      </span>

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
        :value="localValue"
        :placeholder="emptyValuePlaceholder"
        :required="isRequired || undefined"
        :readonly="readonly || undefined"
        :disabled="disabled || undefined"
        :aria-invalid="isInvalid ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
        @keydown="onKeydown"
        @click="onClick"
        @dblclick="onDoubleClick"
        @focus="onFocus"
        @blur="onBlur"
      />

      <!-- The form's value is the raw number, never the locale string the customer read: a form
           posting "1.234,5" would be parsed as 1.2345 by almost every server. The visible control
           deliberately carries no `name` of its own, so exactly one value is posted. -->
      <input v-if="name" type="hidden" :name="name" :value="numericModel ?? ''" />

      <span v-if="hasTrailing" data-part="suffix" :class="suffixClass">
        <button
          v-if="showClear"
          data-part="clearButton"
          type="button"
          :class="clearButtonClass"
          :aria-label="m.clear"
          @mousedown.prevent
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

        <!-- The drag handle is pointer-only and out of the accessible tree on purpose: every value
             it can reach is reachable with ArrowUp/ArrowDown on the field itself, so announcing a
             second control for the same job would only add a stop to the keyboard path. -->
        <button
          v-if="showDragHandle"
          ref="dragHandleRef"
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
