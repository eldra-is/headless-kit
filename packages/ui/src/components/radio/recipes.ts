import { cx } from '../../utils/cx';
import type { RadioGroupSize } from './types';

/**
 * The plain-row radio's class recipes, shared by `RadioGroup` and the standalone `Radio` so the two
 * cannot drift apart. Each string's spec rationale is written once, here.
 */

/**
 * The row is a three-column grid — radio, text, meta — so a card's price lines up with its title
 * and the hint sits in column 2 of the next row under it, exactly as the anatomy draws it. A plain
 * row never renders `meta`, so it only ever fills the first two columns; see `Checkbox.vue` for
 * the two-column version this is built from.
 */
export const PLAIN_OPTION =
  'group grid w-fit max-w-full grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0.5 target-min';

/** The cursor a row (or card) shows: the whole option is the label, so it is the target. */
export function optionCursor(disabled: boolean | undefined): string {
  return disabled ? 'cursor-not-allowed' : 'cursor-pointer';
}

/**
 * The drawn radio (spec "Radio group" → Anatomy: "a native `<input type="radio">` with custom
 * appearance, always visible"). Reuses `Checkbox`'s exact proxy-focus shape — the input is
 * `opacity-0` and stretched *over* this element, which is what makes `eldra-focus-proxy`
 * (`:has(:focus-visible)`) draw the one focus ring around the shape a keyboard user can see, in
 * every layout (spec's Focus-visible row: "standard focus ring around the radio", not the card).
 */
const RADIO =
  'relative inline-flex shrink-0 items-center justify-center ' +
  'rounded-full eldra-focus eldra-focus-proxy';

/**
 * Spec "Radio group" → Sizes: "1.125rem circle (1.5rem at lg) … nudged 0.1875rem down at md" —
 * the exact same numbers as the Checkbox box, so the same two class strings apply.
 */
const RADIO_SIZE: Record<RadioGroupSize, string> = { md: 'size-4.5 mt-0.75', lg: 'size-6' };

/**
 * States (spec "Radio group" → States). The checkbox's own `eldra-checkbox-border` /
 * `-invalid` utilities are reused unchanged: the spec gives the radio circle the identical 1.5px /
 * 2px numbers, so a second pair of utilities for the same numbers would only drift from them.
 */
const UNSELECTED =
  'bg-background border-border-strong group-hover:border-text eldra-checkbox-border';
const SELECTED = 'bg-primary border-primary eldra-checkbox-border';
const INVALID =
  'bg-background border-danger group-hover:border-danger eldra-checkbox-border-invalid';
/** Keeps its `primary` fill under an error exactly as `Checkbox`'s invalid-checked box does: the
 * dot is `primary-contrast`, so a `background` fill would draw it in the page's own colour. */
const INVALID_SELECTED = 'bg-primary border-danger eldra-checkbox-border-invalid';
const DISABLED = 'bg-surface-strong border-border border-dashed eldra-checkbox-border';
const DISABLED_SELECTED = 'bg-muted border-muted eldra-checkbox-border';

export interface RadioState {
  selected: boolean;
  disabled?: boolean;
  invalid?: boolean;
}

function radioState({ selected, disabled, invalid }: RadioState): string {
  if (disabled) return selected ? DISABLED_SELECTED : DISABLED;
  if (selected) return invalid ? INVALID_SELECTED : SELECTED;
  return invalid ? INVALID : UNSELECTED;
}

/** The drawn circle, before `classes.radio` is merged in. */
export function radioRecipe(size: RadioGroupSize, state: RadioState): string {
  return cx(RADIO, RADIO_SIZE[size], radioState(state));
}

/**
 * The dot (spec "Radio group" → Sizes: "0.5rem dot"). One fixed size regardless of `size`, the
 * same choice `Checkbox` makes for its tick — only the circle around it grows. No `data-part` of
 * its own: the API contract's part list has no entry for it, unlike `Checkbox`'s `check`.
 */
export function dotRecipe(selected: boolean): string {
  return cx(
    'pointer-events-none size-2 rounded-full bg-primary-contrast transition-transform ' +
      'duration-fast ease-out',
    selected ? 'scale-100' : 'scale-0'
  );
}

/** The native radio: invisible but hit-testable, stretched over the drawn circle. */
export const INPUT =
  'absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed';

/**
 * Spec "Radio group" → Sizes: "Plain row … 0.9375rem / 1.5rem text" for plain layouts, "Card title
 * … 1rem 600 (line-height 1.4)" for cards — the same two type utilities `Checkbox`'s label and the
 * `text-card-title` utility (see `tailwind.css`) already give those numbers.
 */
export function labelRecipe(card: boolean, disabled: boolean | undefined): string {
  return cx(
    card ? 'text-card-title' : 'text-control',
    'min-w-0',
    disabled ? 'text-muted' : 'text-text'
  );
}

/** Spec "Radio group" → Sizes: the hint is `muted` in every layout, under the label's column. */
export const HINT = 'text-body-sm text-muted col-start-2 min-w-0';
