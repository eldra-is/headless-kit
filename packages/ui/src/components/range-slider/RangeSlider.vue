<script setup lang="ts">
/**
 * The design spec's **Range slider**: two thumbs on one track for a span of numbers, with an
 * optional row of typed fields that are the same value by another route.
 *
 * Two shape decisions worth knowing before reading the rest:
 *
 * 1. **Each thumb is a `<div role="slider" tabindex="0">`, not a `<button>`.** `slider` is not one
 *    of the roles ARIA-in-HTML allows on a `<button>` (that list is checkbox, combobox, link,
 *    menuitem*, option, radio, switch, tab), so a `<button role="slider">` is a conformance error
 *    axe reports as `aria-allowed-role`. The WAI-ARIA Authoring Practices' own multi-thumb slider
 *    uses a `div` with `tabindex="0"`, and the keys this control needs (arrows, page, home, end)
 *    are implemented here in full either way — a `<button>` would contribute only `Enter`/`Space`
 *    activation, which a slider has no use for.
 * 2. **Two tab stops, no roving tabindex.** Both ends of the range must be reachable, so the
 *    composite-widget rule ("one tab stop, arrow keys inside") does not apply: there is nothing to
 *    arrow *between*, and a roving tabindex would make one end unreachable by keyboard.
 *
 * Pointer presses are handled on the **rail** rather than on the thumbs. The rail is the band the
 * spec sizes as the touch target, so a press anywhere in it moves the nearer thumb and keeps
 * dragging it — a press is a drag of no distance — and the two thumbs' own (deliberately
 * overlapping, 44px) targets can never argue about which one a press belongs to.
 */
import { computed, ref, watch, watchEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { formatNumber, localeSeparators, parseLocaleNumber } from '../../utils/number-format';
import { filterNumericBeforeInput } from '../../utils/numeric-input';
import { FIELD_BASE, FIELD_DISABLED, FIELD_LIVE, FIELD_SIZE } from '../input/classes';
import type {
  RangeSliderEnd,
  RangeSliderInputsSlotProps,
  RangeSliderProps,
  RangeSliderThumb,
  RangeSliderValue,
} from './types';
import {
  clampRangeThumb,
  nearestRangeThumb,
  normalizeRangeValue,
  rangeKeyTransition,
  rangePositionToValue,
  rangeStepDigits,
  rangeThumbLimits,
  rangeValueToPercent,
  type RangeSliderMath,
} from './useRangeSlider';

/** Spec "Range slider" → Properties. */
const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
/** Spec "Range slider" → Properties, `largeStep`: "Defaults to `step` × 10." */
const LARGE_STEP_FACTOR = 10;

const props = withDefaults(defineProps<RangeSliderProps>(), {
  modelValue: undefined,
  min: DEFAULT_MIN,
  max: DEFAULT_MAX,
  step: DEFAULT_STEP,
  largeStep: undefined,
  disabled: false,
  label: undefined,
  minLabel: undefined,
  maxLabel: undefined,
  formatValue: undefined,
  inputs: false,
  classes: undefined,
  messages: undefined,
});

const emit = defineEmits<{
  /** Every move while it happens: each arrow key, each step of a drag, each committed field. */
  'update:modelValue': [value: RangeSliderValue];
  /**
   * Spec "Range slider" → Events: "fires once the move is over — on pointer release, on the key
   * release that ends an arrow-key run, and on a typed value committing." The event anything
   * expensive should listen to.
   */
  change: [value: RangeSliderValue];
}>();

const m = useMessages(() => props.messages);
/**
 * The ambient locale (`provideEldraUiLocale`, `en-US` with nothing provided) formats and parses
 * the fields. There is no `locale` prop, unlike `QuantityStepper`/`UnitInput`: `formatValue` is
 * this control's own formatting hook — a store passes the same currency formatter its prices use —
 * and the locale is only needed for the plain fallback text and for reading a typed number.
 */
const locale = useEldraUiLocale();

const labelId = useUiId('range-slider-label');

/**
 * The bounds and the two step sizes, as every rule in `useRangeSlider.ts` wants them.
 *
 * `max` is floored at `min`, which is what makes inverted bounds coherent rather than nonsense: a
 * `min` above `max` used to pass straight through, and each thumb then reported an `aria-valuenow`
 * below its own `aria-valuemin` and an `aria-valuemin` above its own `aria-valuemax`. Flooring
 * collapses the control to an empty range at `min` — a real state the component already handles
 * (both thumbs on one value, nothing movable) — and the pair is announced consistently.
 * `normalizeRangeValue` has always defended the *value* the same way; this is the same defence for
 * the bounds.
 */
const math = computed<RangeSliderMath>(() => ({
  min: props.min,
  max: Math.max(props.min, props.max),
  step: props.step,
  // `withDefaults` cannot express "ten times another prop", so the default is resolved here.
  largeStep: props.largeStep ?? props.step * LARGE_STEP_FACTOR,
}));

/**
 * Inverted bounds are always a mistake at the call site (a facet response read the wrong way
 * round, two props swapped), and the collapse above hides the symptom — so the mistake is named
 * once in dev, where it can be fixed, and costs a production bundle nothing. The same shape
 * `Section`'s own nesting warning uses.
 */
if (import.meta.env?.DEV) {
  let warned = false;
  watchEffect(() => {
    if (warned || props.max >= props.min) return;
    warned = true;
    console.warn(
      `[@eldrajs/ui] <RangeSlider> has max (${props.max}) below min (${props.min}). The control ` +
        'is drawn as an empty range at min until the two are the right way round.'
    );
  });
}

/** How many fraction digits the step grid can land on — the fields' own formatting precision. */
const digits = computed(() => rangeStepDigits(math.value));

/**
 * Controlled when the parent binds `modelValue`, self-managing when it does not. Unbound it starts
 * at the full span (spec "Range slider" → Properties, `value`: default `[min, max]`).
 */
const model = useControllableModel<RangeSliderValue>(props, emit, () => [props.min, props.max]);

/**
 * The value as this control treats it: both ends snapped into the bounds, lowest first. Every read
 * — the thumbs' positions, the `aria-value*`s, the fields' text — goes through here rather than
 * through `model`, so a consumer passing `[4800, 1200]` or a pair from before the bounds moved
 * still gets a coherent control (see `normalizeRangeValue`).
 */
const value = computed<RangeSliderValue>(() => normalizeRangeValue(model.value, math.value));

function valueOf(thumb: RangeSliderThumb): number {
  return thumb === 'min' ? value.value[0] : value.value[1];
}

/**
 * Whether anything has moved this control yet. `false` until the first move that actually changes
 * the value, by key, by pointer or by a committed field.
 */
const touched = ref(false);

/**
 * An **unbound** slider follows its bounds until something moves it.
 *
 * `useControllableModel`'s uncontrolled fallback is called once, so a slider mounted before its
 * bounds arrive — `<RangeSlider :min="facets.price.min" :max="facets.price.max" inputs />`, the
 * price filter's own shape, since the facets come from the backend after the first render — kept
 * the `[0, 100]` pair it started with, and `normalizeRangeValue` then snapped that into the new
 * bounds: a filter collapsed at the cheapest product instead of spanning the catalogue. Re-seeding
 * is what the Properties table's "`value` defaults to `[min, max]`" means for a slider whose
 * bounds load late.
 *
 * It stops at the first real move, so a late facet refresh can never overwrite a shopper's own
 * choice, and it never touches a slider the parent controls — there, the pair is the parent's to
 * re-seed.
 */
watch(
  () => [props.min, props.max] as const,
  ([min, max]) => {
    if (props.modelValue !== undefined || touched.value) return;
    model.value = [min, Math.max(min, max)];
  }
);

/** Spec → Properties, `formatValue`: used for every number the control speaks or prints. */
function formatDisplay(amount: number): string {
  if (props.formatValue) return props.formatValue(amount);
  return formatNumber(amount, {
    locale: locale.value,
    maxFraction: digits.value,
    minFraction: 0,
  });
}

/**
 * The text a field shows *while it is being edited*: the same number with the locale's group
 * separator taken out, so four figures read `1200` rather than `1,200`. `QuantityStepper`'s own
 * `formatEditing` carries the full reasoning — in short, a caret and a group separator fight over
 * the same keystroke, and the `beforeinput` filter refuses a separator the field itself inserted.
 */
function formatEditing(amount: number): string {
  const { group } = localeSeparators(locale.value);
  const plain = formatNumber(amount, {
    locale: locale.value,
    maxFraction: digits.value,
    minFraction: 0,
  });
  return group === '' ? plain : plain.split(group).join('');
}

/**
 * Each thumb's name (spec → Accessibility): built from the visible label, so a price filter reads
 * "Minimum price" and "Maximum price", and from the bare `minimum`/`maximum` message with no label
 * to join. An explicit `minLabel`/`maxLabel` wins over both.
 */
const minName = computed(
  () => props.minLabel ?? (props.label ? m.value.minimumOf(props.label) : m.value.minimum)
);
const maxName = computed(
  () => props.maxLabel ?? (props.label ? m.value.maximumOf(props.label) : m.value.maximum)
);

interface ThumbView {
  thumb: RangeSliderThumb;
  name: string;
  value: number;
  text: string;
  limits: { lo: number; hi: number };
  percent: number;
}

/**
 * The two thumbs, in value order, each with everything its element needs. Rendered with `v-for`
 * rather than written twice: the minimum and the maximum differ in their name, their limits and
 * their position, and in nothing else.
 */
const thumbs = computed<ThumbView[]>(() =>
  (['min', 'max'] as const).map((thumb) => {
    const amount = valueOf(thumb);
    return {
      thumb,
      name: thumb === 'min' ? minName.value : maxName.value,
      value: amount,
      text: formatDisplay(amount),
      limits: rangeThumbLimits(thumb, value.value, math.value),
      percent: rangeValueToPercent(amount, math.value),
    };
  })
);

/** The filled part between the thumbs (spec → Anatomy item 4). */
const rangeStyle = computed(() => {
  const start = rangeValueToPercent(value.value[0], math.value);
  const end = rangeValueToPercent(value.value[1], math.value);
  return { left: `${start}%`, width: `${end - start}%` };
});

/* ------------------------------------------------------------------ writing the value */

const railEl = ref<HTMLElement | null>(null);
const dragging = ref<RangeSliderThumb | null>(null);
/**
 * The pair a move has written that `change` has not reported yet, or `null` with nothing in
 * flight. One holder for every route: an arrow-key run reports on key release, a drag on pointer
 * release, a field on its own commit — `change` fires once per finished move, not once per step.
 *
 * The *written* pair rather than a re-read of `value`: a controlled parent applies the write on
 * its own next render, so reading `value` back here reported the value the move started from
 * whenever the parent had not re-rendered yet (every field commit, which emits both events in one
 * turn). What `change` carries is now always the last `update:modelValue` payload.
 */
const pendingChange = ref<RangeSliderValue | null>(null);

/**
 * Moves one thumb, clamped to the bounds and to the other thumb, and returns the value it ends up
 * with (which is the value it already had when the move was refused).
 *
 * Only a real change writes the model, so a thumb pressed against its neighbour emits nothing at
 * all — neither `update:modelValue` nor, later, `change`.
 */
function setThumb(thumb: RangeSliderThumb, next: number): number {
  const current = value.value;
  const clamped = clampRangeThumb(next, thumb, current, math.value);
  const was = thumb === 'min' ? current[0] : current[1];
  if (clamped !== was) {
    touched.value = true;
    const pair: RangeSliderValue = thumb === 'min' ? [clamped, current[1]] : [current[0], clamped];
    model.value = pair;
    pendingChange.value = pair;
  }
  return clamped;
}

function commitChange(): void {
  const pair = pendingChange.value;
  if (pair === null) return;
  pendingChange.value = null;
  emit('change', pair);
}

/* ------------------------------------------------------------------ pointer */

function focusThumb(thumb: RangeSliderThumb): void {
  railEl.value?.querySelector<HTMLElement>(`[data-thumb="${thumb}"]`)?.focus();
}

function railRect(): { left: number; width: number } | null {
  const rail = railEl.value;
  return rail ? rail.getBoundingClientRect() : null;
}

function onPointerDown(event: PointerEvent): void {
  // `button` is 0 for the primary button and for every touch and pen contact; a secondary or
  // middle press is not a drag.
  if (props.disabled || (event.button !== undefined && event.button !== 0)) return;
  // A drag already in flight owns the control: a second contact (the other finger of a pinch over
  // the control, a mouse press during a touch drag) must not hand the thumb over mid-gesture.
  // Written against the state this component owns rather than against `event.isPrimary`, whose
  // `PointerEventInit` default is `false` — a guard on that rejects every synthetic press, in this
  // package's own tests and in a consumer's.
  if (dragging.value !== null) return;
  const rect = railRect();
  if (rect === null) return;
  const target = rangePositionToValue(event.clientX, rect, math.value);
  const thumb = nearestRangeThumb(target, value.value);
  dragging.value = thumb;
  // No text selection, no native image drag, and (with the rail's own `touch-none`) no scroll.
  event.preventDefault();
  focusThumb(thumb);
  capturePointer(event);
  setThumb(thumb, target);
}

/**
 * Pointer capture is what lets a drag leave the rail — above it, below it, past either end — and
 * keep delivering `pointermove`/`pointerup` to the rail itself, so no window-level listeners are
 * needed and none can be left behind. Guarded rather than called outright: a synthetic event
 * dispatched by a test carries no live pointer, and the capture then throws `NotFoundError`.
 */
function capturePointer(event: PointerEvent): void {
  const rail = railEl.value;
  if (!rail || typeof rail.setPointerCapture !== 'function') return;
  try {
    rail.setPointerCapture(event.pointerId);
  } catch {
    // Nothing to capture (a synthetic event). The drag still works inside the rail.
  }
}

function onPointerMove(event: PointerEvent): void {
  const thumb = dragging.value;
  if (thumb === null) return;
  const rect = railRect();
  if (rect === null) return;
  event.preventDefault();
  setThumb(thumb, rangePositionToValue(event.clientX, rect, math.value));
}

/**
 * The end of a drag, however it ends: `pointerup`, `pointercancel`, and `lostpointercapture`.
 *
 * The last one is not redundant. Capture can be revoked with no pointer event following it at all —
 * another element calling `setPointerCapture` for the same pointer, an OS or browser gesture (an
 * edge swipe), the captured element being removed — and without it `dragging` would stay set, so the
 * next bare `pointermove` across the rail would drag a thumb with no button held. (It also fires
 * right after an ordinary `pointerup`, which this already handles: `dragging` is `null` by then.)
 */
function onPointerUp(): void {
  if (dragging.value === null) return;
  dragging.value = null;
  commitChange();
}

/* ------------------------------------------------------------------ keyboard */

function onThumbKeydown(event: KeyboardEvent, thumb: RangeSliderThumb): void {
  if (props.disabled) return;
  const next = rangeKeyTransition(event.key, event.shiftKey, thumb, value.value, math.value);
  // `null` is a key this control does not own — `Tab` above all, which must keep moving focus.
  if (next === null) return;
  event.preventDefault();
  setThumb(thumb, next);
}

/**
 * Spec → Events: `change` fires on "the key release that ends an arrow-key run". A held arrow key
 * repeats `keydown` and fires one `keyup`, so this is one `change` for the whole run. `blur`
 * flushes the same flag, for focus leaving the thumb while a key is still down.
 */
function onThumbKeyup(): void {
  commitChange();
}

function onThumbBlur(): void {
  commitChange();
}

/* ------------------------------------------------------------------ the typed fields */

/**
 * While a field has focus it shows exactly what was typed; the rest of the time it shows
 * `formatDisplay`'s text, derived from the value. Per field, because the two are edited
 * independently and a blur on one must not reformat the other mid-edit.
 */
const editing = ref<Record<RangeSliderThumb, boolean>>({ min: false, max: false });
const typed = ref<Record<RangeSliderThumb, string>>({ min: '', max: '' });

function inputText(thumb: RangeSliderThumb): string {
  return editing.value[thumb] ? typed.value[thumb] : formatDisplay(valueOf(thumb));
}

function onInputFocus(thumb: RangeSliderThumb): void {
  typed.value[thumb] = formatEditing(valueOf(thumb));
  editing.value[thumb] = true;
}

function onInput(event: Event, thumb: RangeSliderThumb): void {
  typed.value[thumb] = (event.target as HTMLInputElement).value;
}

/**
 * The typing filter (`src/utils/numeric-input.ts`, the same one `QuantityStepper` uses): a
 * `type="text"` field comes with none of the browser's own numeric filtering, and these fields
 * cannot be `type="number"` because a native number input's DOM value can only hold the US-style
 * ungrouped grammar — see `QuantityStepper.vue`'s own doc comment for the full argument.
 *
 * A decimal point is offered only when the step grid actually has fraction digits, and a minus
 * sign only when `min` is negative.
 */
function onBeforeInput(event: Event): void {
  filterNumericBeforeInput(event as InputEvent, {
    allowNegative: props.min < 0,
    allowDecimal: digits.value > 0,
    locale: locale.value,
  });
}

/**
 * Spec → Behaviour & motion: "A typed value commits on **blur** or **`Enter`**, never on a
 * keystroke." On commit it is snapped, clamped to `[min, max]` and clamped against the other
 * thumb; an emptied field falls back to that end of the range (which is how half the filter is
 * cleared); text that is not a number at all reverts to the value the thumb already had.
 */
function commitInput(thumb: RangeSliderThumb): void {
  const text = typed.value[thumb];
  const parsed = parseLocaleNumber(text, locale.value);
  const emptyFallback = thumb === 'min' ? props.min : props.max;
  const next = parsed ?? (text.trim() === '' ? emptyFallback : valueOf(thumb));
  // The clamped number `setThumb` returns, not a re-read of `value`: a controlled parent has not
  // applied the write yet, and an `Enter` commit leaves the field editing, so re-reading would
  // show the old number until the parent's update arrived.
  typed.value[thumb] = formatEditing(setThumb(thumb, next));
  commitChange();
}

function onInputEnter(thumb: RangeSliderThumb): void {
  commitInput(thumb);
}

/* -------------------------------------------------------------- the inputs slot */

/**
 * **What a replacement field applies one end of the range through** — `commitInput`'s own rules
 * without its text handling, since a consumer's field owns its own text.
 *
 * It is the same two calls the built-in field's blur makes (`setThumb`, then `commitChange`), so a
 * slotted currency field and a dragged thumb cannot end up disagreeing about what the range is, and
 * `change` fires once per commit either way. The clamped number is returned for the same reason
 * `commitInput` reads it rather than re-reading `value`: a controlled parent has not applied the
 * write yet, and an `Enter` commit leaves the field focused.
 */
function commitEnd(end: RangeSliderEnd, next: number | null): number {
  const thumb: RangeSliderThumb = end === 0 ? 'min' : 'max';
  // `null` is an emptied field, which falls back to that end of the range — the gesture that clears
  // half a filter, and the same fallback `commitInput` gives an emptied built-in field.
  const fallback = thumb === 'min' ? props.min : props.max;
  const applied = setThumb(thumb, next ?? fallback);
  commitChange();
  return applied;
}

defineSlots<{
  /**
   * The typed row under the track, for a consumer whose numbers are not generic numbers (a store's
   * own currency field). Omitted, the built-in min / "to" / max fields render — they are this slot's
   * default content, not a separate code path. Only drawn at all when `inputs` is set.
   */
  inputs?: (props: RangeSliderInputsSlotProps) => unknown;
}>();

const inputsSlotProps = computed<RangeSliderInputsSlotProps>(() => ({
  value: value.value,
  min: props.min,
  max: props.max,
  step: props.step,
  disabled: props.disabled,
  labels: { min: minName.value, max: maxName.value, separator: m.value.to },
  commit: commitEnd,
}));

/**
 * `editing` turns off here, not in `commitInput`: an `Enter` commit leaves the field focused, and
 * resetting it there would let the reactive `:value` binding overwrite the next keystroke (the
 * defect `QuantityStepper`'s own `onBlur` comment records). Blur is where editing really ends.
 */
function onInputBlur(thumb: RangeSliderThumb): void {
  commitInput(thumb);
  editing.value[thumb] = false;
}

/* ------------------------------------------------------------------ classes */

/**
 * The root is a width container (`@container`), which is what the rail's and the thumbs' own
 * touch-size rules measure against — the spec's breakpoint rule is the width of the block a
 * control sits in, not the viewport.
 */
const ROOT_BASE = '@container flex w-full flex-col';
/** Spec → Sizes, Label row: "0.875rem, weight 500, `text`; 0.5rem above the rail." */
const LABEL_BASE = 'mb-2 block text-label text-text';
/** Spec → Anatomy item 2: the gutter keeps a thumb's outer half inside the control's own box. */
const GROUP_BASE = 'eldra-range-gutter relative w-full';
/**
 * The rail (spec → Anatomy item 2, Sizes, Rail row). `touch-none` is what stops a touch drag from
 * scrolling the page instead of moving the thumb; `select-none` stops a mouse drag selecting the
 * label text beside it.
 */
const RAIL_BASE = 'eldra-range-rail relative flex w-full touch-none select-none items-center';
const RAIL_ENABLED = 'cursor-pointer';
const RAIL_DISABLED = 'cursor-not-allowed';
/** Spec → Anatomy item 3 and States, Track column. */
const TRACK_BASE =
  'eldra-range-track relative w-full overflow-hidden rounded-full bg-surface-strong';
/** Spec → Anatomy item 4 and States, Range column (`border` while disabled). */
const RANGE_BASE = 'absolute inset-y-0 bg-primary';
const RANGE_DISABLED = 'bg-border';
/**
 * A thumb (spec → Anatomy item 5, States, Thumb column). The circle's size, its 1.5px edge, the
 * hover/drag halo and the pointer target live in the `eldra-range-thumb` utility; what is here is
 * the position, the colours and the ring.
 *
 * No `transition-*`/`duration-*` beside `eldra-focus`: the ring owns this element's transition
 * list (`src/__tests__/focus-transition.spec.ts`), which is also why a thumb's position is never
 * animated — see the spec's own Behaviour & motion note.
 */
const THUMB_BASE =
  'eldra-range-thumb absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ' +
  'border-border-strong bg-background shadow-sm eldra-focus';
/**
 * Spec → States, "Thumb hover" row: "a 0.25rem halo of `text` at 8%, edge `text`". The halo is the
 * `eldra-range-thumb` utility's `::before`; the edge is this colour change. A plain
 * `hover:border-*` with no `transition-*`/`duration-*` beside it, so `eldra-focus` keeps owning the
 * element's transition list (`src/__tests__/focus-transition.spec.ts`) and the border colour
 * changes over the `border-color` entry that list already carries.
 *
 * On `THUMB_ENABLED` rather than `THUMB_BASE`: `THUMB_DISABLED` replaces the rest colour
 * (`border-border-strong` → `border-border`), but `hover:border-text` is a different
 * `tailwind-merge` group, so on the base it would survive into the disabled state and a dead thumb
 * would still light up under the pointer.
 */
const THUMB_ENABLED = 'cursor-grab hover:border-text';
const THUMB_DISABLED = 'cursor-not-allowed border-border bg-surface-strong shadow-none';
/** Spec → Anatomy item 6: `1fr | auto | 1fr`, 0.5rem gaps, bottom-aligned, 0.75rem below the rail. */
const INPUTS_BASE = 'mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2';
/** Spec → Anatomy item 6: the word "to", 0.875rem `muted`. */
const SEPARATOR_BASE = 'self-center text-center text-body-sm text-muted';
/**
 * The fields are the spec's own Input box at `md` (`components/input/classes.ts` — the shared
 * recipe `Input`, `SearchBar` and `UnitInput` draw from, never a second copy of it), centred and
 * with tabular figures so the two columns of digits line up. Those two utilities are the whole
 * delta; everything else about the box, its **states included**, comes from the recipes.
 *
 * The state recipe is not optional. `FIELD_BASE` carries `eldra-field-border`, which sets a border
 * *width* and no colour at all — the colour lives in `FIELD_LIVE`/`FIELD_INVALID`/`FIELD_DISABLED`/
 * `FIELD_READONLY`, exactly as `Input.vue` and `UnitInput.vue` compose it. A field that draws the
 * base without one of them falls through to Tailwind's preflight `border: 0 solid`, whose colour is
 * `currentcolor`: these two fields rendered a near-black `text` boundary at rest (heavier than
 * every other field beside them in a filter panel), never took `FIELD_LIVE`'s hover/focus
 * `border-text` change because they were already at it, and lost the kit's dashed `border-border`
 * disabled signal. `src/__tests__/fieldStateRecipes.spec.ts` is the gate that stops the next
 * partial copy.
 */
const INPUT_BASE = `${FIELD_BASE} ${FIELD_SIZE.md} text-center tabular-nums`;

const rootClass = computed(() => partClass(ROOT_BASE, props.classes, 'root'));
const labelClass = computed(() => partClass(LABEL_BASE, props.classes, 'label'));
const groupClass = computed(() => partClass(GROUP_BASE, props.classes, 'group'));
const railClass = computed(() =>
  partClass(cx(RAIL_BASE, props.disabled ? RAIL_DISABLED : RAIL_ENABLED), props.classes, 'rail')
);
const trackClass = computed(() => partClass(TRACK_BASE, props.classes, 'track'));
const rangeClass = computed(() =>
  partClass(cx(RANGE_BASE, props.disabled && RANGE_DISABLED), props.classes, 'range')
);
const thumbClass = computed(() =>
  partClass(cx(THUMB_BASE, props.disabled ? THUMB_DISABLED : THUMB_ENABLED), props.classes, 'thumb')
);
const inputsClass = computed(() => partClass(INPUTS_BASE, props.classes, 'inputs'));
const separatorClass = computed(() => partClass(SEPARATOR_BASE, props.classes, 'separator'));
const inputClass = computed(() =>
  partClass(cx(INPUT_BASE, props.disabled ? FIELD_DISABLED : FIELD_LIVE), props.classes, 'input')
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <span v-if="label" :id="labelId" data-part="label" :class="labelClass">{{ label }}</span>

    <!-- The pair is one control, announced before either end is read (spec → Accessibility). -->
    <div
      role="group"
      data-part="group"
      :class="groupClass"
      :aria-labelledby="label ? labelId : undefined"
    >
      <div
        ref="railEl"
        data-part="rail"
        :class="railClass"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @lostpointercapture="onPointerUp"
      >
        <div data-part="track" :class="trackClass">
          <div data-part="range" :class="rangeClass" :style="rangeStyle" />
        </div>

        <!-- `role="slider"` on a `div`, not a `button`: see this file's own doc comment. -->
        <div
          v-for="thumb in thumbs"
          :key="thumb.thumb"
          role="slider"
          tabindex="0"
          data-part="thumb"
          :data-thumb="thumb.thumb"
          :data-dragging="dragging === thumb.thumb ? 'true' : undefined"
          :class="thumbClass"
          :style="{ left: `${thumb.percent}%` }"
          :aria-label="thumb.name"
          :aria-valuenow="thumb.value"
          :aria-valuemin="thumb.limits.lo"
          :aria-valuemax="thumb.limits.hi"
          :aria-valuetext="thumb.text"
          :aria-disabled="disabled ? 'true' : undefined"
          @keydown="onThumbKeydown($event, thumb.thumb)"
          @keyup="onThumbKeyup"
          @blur="onThumbBlur"
        />
      </div>
    </div>

    <!-- The typed row (spec → Anatomy item 6). Each field takes the name of the thumb it mirrors;
         the word between them is punctuation, so it is hidden from assistive technology. -->
    <div v-if="inputs" data-part="inputs" :class="inputsClass">
      <slot name="inputs" v-bind="inputsSlotProps">
        <template v-for="(thumb, index) in thumbs" :key="thumb.thumb">
          <span v-if="index === 1" data-part="separator" :class="separatorClass" aria-hidden="true">
            {{ m.to }}
          </span>
          <input
            data-part="input"
            :data-input="thumb.thumb"
            type="text"
            :inputmode="digits > 0 ? 'decimal' : 'numeric'"
            :class="inputClass"
            :value="inputText(thumb.thumb)"
            :aria-label="thumb.name"
            :disabled="disabled || undefined"
            @beforeinput="onBeforeInput"
            @input="onInput($event, thumb.thumb)"
            @focus="onInputFocus(thumb.thumb)"
            @blur="onInputBlur(thumb.thumb)"
            @keydown.enter.prevent="onInputEnter(thumb.thumb)"
          />
        </template>
      </slot>
    </div>
  </div>
</template>
