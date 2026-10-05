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

/** The selected span, lowest first. The two may meet but never cross. */
export type RangeSliderValue = [number, number];

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
   */
  formatValue?: (value: number) => string;
  /** Render the typed min / "to" / max row under the track. */
  inputs?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RangeSliderPart, string>>;
  /** Overrides for the strings this component renders itself (the thumb names, the word "to"). */
  messages?: Partial<UiMessages>;
}
