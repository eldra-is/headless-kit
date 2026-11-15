/** One step of a `StepIndicator`. */
export interface StepIndicatorStep {
  /** The step's name ("Packed"). */
  label: string;
  /** A secondary line under the label: a date, a place, a short note. */
  description?: string;
}

/** `horizontal` (the default) lays the steps out in equal columns; `vertical` stacks them. */
export type StepIndicatorOrientation = 'horizontal' | 'vertical';

/** Where a step stands against `current`. Also on each step as `data-state`. */
export type StepIndicatorState = 'done' | 'current' | 'upcoming';

/**
 * The parts a consumer can restyle through `classes`. The root (the `<ol>`) is styled with
 * `class`. `status` is the visually hidden "(completed)" / "(not started)" after a label.
 */
export type StepIndicatorPart =
  | 'step'
  | 'marker'
  | 'content'
  | 'label'
  | 'labelIcon'
  | 'status'
  | 'description';

export interface StepIndicatorProps {
  /** The steps, in order. */
  steps: StepIndicatorStep[];
  /**
   * The index of the current step, from 0. Every step before it is done and every step after it
   * is upcoming. `steps.length` (or more) marks every step done, with none current; a negative
   * number marks every step upcoming.
   */
  current: number;
  /** `horizontal` (default) or `vertical`. Also on the root as `data-orientation`. */
  orientation?: StepIndicatorOrientation;
  /** Per-part classes, appended to the part's own (they win by cascade layer). */
  classes?: Partial<Record<StepIndicatorPart, string>>;
}
