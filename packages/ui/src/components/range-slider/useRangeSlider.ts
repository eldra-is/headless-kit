import type { RangeSliderThumb, RangeSliderValue } from './types';

/**
 * The range slider's arithmetic: value to percent, a pointer position to a value, the step grid,
 * the clamp of each thumb against the other, and the keyboard transitions.
 *
 * Every function here is pure — no reactivity, no DOM beyond the two numbers of a rect — so each
 * rule can be tested on its own (`__tests__/useRangeSlider.spec.ts`) rather than only through a
 * mounted component, which is how the float-accumulation rule below is provable at all. The file
 * is named for the component it belongs to rather than exporting a `useRangeSlider()` composable:
 * the control's state is two numbers the component already owns through `useControllableModel`,
 * so a composable wrapping it would only hand that state back again.
 */

/** The numbers every rule here needs: the bounds and the two step sizes. */
export interface RangeSliderMath {
  min: number;
  max: number;
  step: number;
  largeStep: number;
}

/**
 * How many fraction digits a number is written with, exponent form included (`1e-7` is 7).
 *
 * This is what keeps a fractional step from drifting: `0.1` added twenty times is
 * `1.9999999999999998` in binary floating point, and a slider that reports that as its value
 * reports it to the page, to `aria-valuenow` and to the field beside it. Rounding every result to
 * the number of digits the inputs are written with is the standard answer, and it needs to know
 * how many that is.
 */
export function fractionDigits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(Math.abs(value));
  const exponent = text.indexOf('e');
  if (exponent === -1) {
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
  }
  const mantissa = text.slice(0, exponent);
  const power = Number(text.slice(exponent + 1));
  const dot = mantissa.indexOf('.');
  const mantissaDigits = dot === -1 ? 0 : mantissa.length - dot - 1;
  // `toFixed` accepts 0 to 100; nothing sane needs more than 15 significant decimals anyway.
  return Math.min(100, Math.max(0, mantissaDigits - power));
}

/** How many fraction digits the grid `math` describes can land on. */
export function rangeStepDigits(math: Pick<RangeSliderMath, 'min' | 'step'>): number {
  return Math.max(fractionDigits(math.step), fractionDigits(math.min));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The nearest stop to `value`: a multiple of the step counted from `min`, or either bound.
 *
 * The two bounds are stops in their own right, which matters whenever `max` is not itself on the
 * grid — a price filter's bounds are the catalogue's own lowest and highest price, and those owe
 * the step nothing. With a step of 3 over `[0, 10]` the stops are 0, 3, 6, 9 and 10, so the top of
 * the range can actually be chosen; snapping to the grid alone would make a drag to the far end
 * land on 9 and leave the most expensive product permanently filtered out.
 *
 * A non-positive `step` has no grid at all (a consumer passing `0`), so the value is only clamped.
 */
export function snapToRangeStep(
  value: number,
  math: Pick<RangeSliderMath, 'min' | 'max' | 'step'>
): number {
  const { min, max, step } = math;
  if (!Number.isFinite(value)) return min;
  const target = clamp(value, min, max);
  if (!(step > 0)) return target;
  const steps = Math.round((target - min) / step);
  const digits = rangeStepDigits(math);
  // `toFixed` is what keeps a fractional grid honest: `0 + 3 * 0.1` is 0.30000000000000004.
  const onGrid = clamp(Number((min + steps * step).toFixed(digits)), min, max);
  let nearest = onGrid;
  for (const bound of [min, max]) {
    if (Math.abs(bound - target) < Math.abs(nearest - target)) nearest = bound;
  }
  return nearest;
}

/** Where a value sits along the track, as a percentage of the bounds. */
export function rangeValueToPercent(
  value: number,
  math: Pick<RangeSliderMath, 'min' | 'max'>
): number {
  const span = math.max - math.min;
  // A zero-width (or inverted) range has no position to report; everything sits at the start.
  if (!(span > 0)) return 0;
  return clamp(((value - math.min) / span) * 100, 0, 100);
}

/**
 * The value under a pointer, snapped to the grid.
 *
 * `rect` is the track's own box, so the caller passes `getBoundingClientRect()` and nothing here
 * touches the DOM. A press before the start or past the end resolves to that end rather than to
 * a value outside the bounds, which is what makes a drag that leaves the rail keep working.
 */
export function rangePositionToValue(
  clientX: number,
  rect: { left: number; width: number },
  math: Pick<RangeSliderMath, 'min' | 'max' | 'step'>
): number {
  // A rect with no width is a control that has not been laid out yet (and is every rect in a
  // jsdom/happy-dom test that does not stub one): there is no position to read, so the press
  // resolves to the start rather than to `NaN`.
  if (!(rect.width > 0)) return math.min;
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return snapToRangeStep(math.min + ratio * (math.max - math.min), math);
}

/**
 * How far one thumb may travel: out to the bound on its own side, and up to *the other thumb's
 * current value* on the other. This is the clamp that stops the two crossing, and it is also what
 * `aria-valuemin` / `aria-valuemax` report, so the limit a screen reader announces is the limit
 * the thumb actually has.
 */
export function rangeThumbLimits(
  thumb: RangeSliderThumb,
  value: RangeSliderValue,
  math: Pick<RangeSliderMath, 'min' | 'max'>
): { lo: number; hi: number } {
  return thumb === 'min' ? { lo: math.min, hi: value[1] } : { lo: value[0], hi: math.max };
}

/**
 * A candidate value for one thumb, snapped to the grid and then clamped against both its bound
 * and the other thumb.
 *
 * Clamping after snapping is deliberate: the other thumb's value need not be on the grid (a
 * consumer's starting value, a bound that moved), and the dragged thumb has to be able to park
 * exactly on it rather than on the nearest grid point before it.
 */
export function clampRangeThumb(
  next: number,
  thumb: RangeSliderThumb,
  value: RangeSliderValue,
  math: Pick<RangeSliderMath, 'min' | 'max' | 'step'>
): number {
  const { lo, hi } = rangeThumbLimits(thumb, value, math);
  return clamp(snapToRangeStep(next, math), lo, hi);
}

/**
 * A `modelValue` as this control will treat it: both ends snapped into the bounds, lowest first.
 *
 * A consumer can pass `[4800, 1200]`, a pair outside the bounds, or a pair from before `min`/`max`
 * changed. Rendering that as given would draw a negative range and report a maximum below the
 * minimum, so every read goes through here instead of trusting the prop.
 */
export function normalizeRangeValue(
  value: RangeSliderValue,
  math: Pick<RangeSliderMath, 'min' | 'max' | 'step'>
): RangeSliderValue {
  const first = snapToRangeStep(value[0], math);
  const second = snapToRangeStep(value[1], math);
  return first <= second ? [first, second] : [second, first];
}

/**
 * Which thumb a press at `target` should move: the nearer one.
 *
 * With both thumbs on the same value the distances tie, and the tie is broken by direction — the
 * minimum thumb takes a press below them and the maximum thumb one above — so a collapsed range
 * can always be opened again from either side. (A press exactly halfway between two distinct
 * thumbs is the other tie, and either answer is correct; it goes to the maximum.)
 */
export function nearestRangeThumb(target: number, value: RangeSliderValue): RangeSliderThumb {
  const toMin = Math.abs(target - value[0]);
  const toMax = Math.abs(target - value[1]);
  if (toMin < toMax) return 'min';
  if (toMax < toMin) return 'max';
  return target < value[0] ? 'min' : 'max';
}

/**
 * The value a key press moves a thumb to, or `null` for a key this control does not own (so the
 * caller leaves the event alone rather than swallowing `Tab`).
 *
 * Spec "Range slider" → Keyboard: `ArrowRight`/`ArrowUp` and `ArrowLeft`/`ArrowDown` by `step`,
 * the same four with `Shift` — and `PageUp`/`PageDown` — by `largeStep`, `Home`/`End` to the
 * thumb's own limits. A stepped result is snapped and clamped, and may equal the value it started
 * from (a thumb against its neighbour), which the caller reads as "nothing moved".
 *
 * `Home`/`End` return the limit itself, unsnapped: the limit on the inner side is the other
 * thumb's value, which need not be on the grid, and "go to your own highest value" has to land on
 * it exactly rather than on the nearest grid point before it.
 */
export function rangeKeyTransition(
  key: string,
  shiftKey: boolean,
  thumb: RangeSliderThumb,
  value: RangeSliderValue,
  math: RangeSliderMath
): number | null {
  const current = thumb === 'min' ? value[0] : value[1];
  const delta = shiftKey ? math.largeStep : math.step;
  const limits = rangeThumbLimits(thumb, value, math);
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clampRangeThumb(current + delta, thumb, value, math);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clampRangeThumb(current - delta, thumb, value, math);
    case 'PageUp':
      return clampRangeThumb(current + math.largeStep, thumb, value, math);
    case 'PageDown':
      return clampRangeThumb(current - math.largeStep, thumb, value, math);
    case 'Home':
      return limits.lo;
    case 'End':
      return limits.hi;
    default:
      return null;
  }
}
