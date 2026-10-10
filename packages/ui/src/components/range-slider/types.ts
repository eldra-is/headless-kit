import type { UiMessages } from '../../messages/en-US';

/**
 * The parts a consumer can restyle through `classes`, named as the design spec's "Range slider"
 * anatomy names them. Both thumbs share the `thumb` part and both fields share the `input` part —
 * one class string styles the pair, and each element carries a `data-thumb` / `data-input`
 * attribute of `"min"` or `"max"` for the rare rule that has to tell them apart.
 */
export type RangeSliderPart =
  | 'root'
  | 'label'
  | 'group'
  | 'rail'
  | 'track'
  | 'range'
  | 'thumb'
  | 'inputs'
  | 'input'
  | 'separator';

/** Which end of the range a value, a thumb or a field belongs to. */
export type RangeSliderThumb = 'min' | 'max';

/**
 * Which end of the range a value belongs to: `0` the minimum, `1` the maximum. It is what a
 * slot's `commit` addresses, and what `formatValue` is told when the number it is formatting is a
 * thumb's own (see `RangeSliderProps.formatValue`).
 */
export type RangeSliderEnd = 0 | 1;

/**
 * What the `inputs` slot is handed — everything a replacement field needs to be *this* control's
 * field rather than a second source of truth beside it.
 *
 * The slot exists because the numbers a control like this edits are often not generic numbers. A
 * store filtering by price wants its own currency field — grouping, the symbol, the store's
 * fraction digits, the caret behaviour money fields have — and the built-in fields cannot be that
 * without this package deciding a consumer's money formatting for them. So the row is replaceable
 * and the *value* is not: `commit` applies the same rules the built-in fields do (snap to the step
 * grid, clamp to `[min, max]`, clamp against the other thumb, then emit `change`), so a slotted
 * field and a dragged thumb cannot disagree about what the range is.
 */
export interface RangeSliderInputsSlotProps {
  /** The current span as the control holds it: snapped into the bounds, lowest first. */
  value: RangeSliderValue;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  /**
   * The names the two thumbs already carry (`minLabel`/`maxLabel`, else the `minimum`/`maximum`
   * message joined with `label`) and the word between the fields. A replacement field should name
   * itself with the same string its thumb does, or a screen reader hears two different names for
   * one end of the range.
   */
  labels: { min: string; max: string; separator: string };
  /**
   * **Apply one end of the range**, exactly as a built-in field's blur or `Enter` does: `next` is
   * snapped to the step grid, clamped to the bounds and clamped against the other thumb, the model
   * is updated and `change` is emitted. `null` is an emptied field, which falls back to that end of
   * the range — the gesture that clears half a filter.
   *
   * It returns the number that was actually applied, which is what a controlled field should show:
   * a parent has not applied the write yet when this returns, and an `Enter` commit leaves the
   * field focused, so re-reading `value` would show the old number until the parent's update
   * arrived.
   *
   * Call it on **blur or `Enter`**, never per keystroke (spec "Range slider" → Behaviour & motion):
   * a commit per character would snap and clamp a half-typed number.
   */
  commit: (end: RangeSliderEnd, next: number | null) => number;
}

/** The selected span, lowest first. The two may meet but never cross. */
export type RangeSliderValue = [number, number];

/**
 * What the `track` slot is handed — enough to draw something *over the same span the track
 * covers* without re-deriving it.
 *
 * The slot exists for the one decoration the design spec puts above a range: a price histogram,
 * 24 bars showing where the products sit, which has to line up with the track to the pixel or it
 * says the wrong thing about the range. It renders inside the control's gutter box and above the
 * rail, so its width is exactly the track's width — the gutter that keeps a thumb, its focus ring
 * and its pointer target inside the control (`eldra-range-gutter`) is already applied to that box,
 * and nothing in the slot has to know what that reservation currently is.
 *
 * `percent` is the filled part's own two edges as percentages of the track, which is what a
 * decoration needs to tell "inside the range" from "outside" (a histogram bar is "in" when its
 * bucket centre lies between the thumbs). It is derived from `value` and the bounds, so a slot can
 * ignore it; it is handed over because every consumer of this slot would otherwise write the same
 * two `((v - min) / (max - min)) * 100` lines.
 */
export interface RangeSliderTrackSlotProps {
  /** The current span as the control holds it: snapped into the bounds, lowest first. */
  value: RangeSliderValue;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  /** The filled part's start and end as percentages of the track, `0`–`100`. */
  percent: [number, number];
}

export interface RangeSliderProps {
  /** The selected span (two-way). Unset, the control starts at `[min, max]`. */
  modelValue?: RangeSliderValue;
  /** The lowest value either thumb can reach. Spec default `0`. */
  min?: number;
  /** The highest value either thumb can reach. Spec default `100`. */
  max?: number;
  /**
   * The granularity of every move — an arrow key, a pointer press and a typed value all land on a
   * multiple of it, counted from `min`. A store picks a sensible unit of its currency (ISK 100,
   * USD 1). The two endpoints stay reachable even when they are not on that grid.
   */
  step?: number;
  /** The coarse move, for `Shift` + an arrow and for `PageUp` / `PageDown`. Defaults to `step` × 10. */
  largeStep?: number;
  /** The whole control: both thumbs, the rail and both fields. */
  disabled?: boolean;
  /** The visible group label ("Price"). It names the group and both thumbs. */
  label?: string;
  /**
   * The minimum thumb's and minimum field's name. Defaults to the `minimum` message joined with
   * the visible `label` ("Minimum price"), or to `minimum` alone with no label.
   */
  minLabel?: string;
  /** The maximum thumb's and maximum field's name ("Maximum price"). */
  maxLabel?: string;
  /**
   * Formats every number the control speaks or prints: both `aria-valuetext`s and both fields'
   * resting text. A store passes its currency formatter, so a thumb announces "$1,200" rather
   * than "1200". Unset, the numbers are formatted for the ambient locale with as many fraction
   * digits as `step` has.
   *
   * **`end` is given only for a thumb's own text**, as `0` (the minimum) or `1` (the maximum), so
   * a formatter can say something about one end that is only true of that end — a price filter's
   * maximum thumb sitting at `max` announces "$240 or more", because above the catalogue's highest
   * price there is nothing to exclude. It is deliberately **not** passed for the typed fields: a
   * field holds a number the shopper edits, and "$240 or more" is not one. A one-argument
   * formatter is unaffected either way, which is what keeps this additive.
   */
  formatValue?: (value: number, end?: RangeSliderEnd) => string;
  /**
   * Render the typed min / "to" / max row under the track. The fields are generic number fields;
   * a consumer with its own (a currency field, say) replaces them through the `inputs` slot while
   * this prop still decides whether the row exists at all — see `RangeSliderInputsSlotProps`.
   */
  inputs?: boolean;
  /**
   * Draw the rail, the track, the `track` slot and both thumbs. Default `true`. `false` is for a
   * consumer whose span is better read than dragged — a catalogue whose prices sit in a few tight
   * clusters a track cannot separate — and keeps only the `inputs` row: every clamping, snapping
   * and commit rule is exactly the one the thumbs use, because it is the same `commit` function and
   * the same model either way. Nothing is unmounted twice over: with `inputs` also `false` there is
   * nothing left to render at all, which is this prop's business to allow, not to guard against.
   */
  trackVisible?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RangeSliderPart, string>>;
  /** Overrides for the strings this component renders itself (the thumb names, the word "to"). */
  messages?: Partial<UiMessages>;
}
