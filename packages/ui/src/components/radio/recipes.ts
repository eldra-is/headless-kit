import { cx } from '../../utils/kitClass';
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
  'eldra:group eldra:grid eldra:w-fit eldra:max-w-full eldra:grid-cols-[auto_1fr] eldra:items-start eldra:gap-x-2.5 eldra:gap-y-0.5 eldra:target-min';

/** The cursor a row (or card) shows: the whole option is the label, so it is the target. */
export function optionCursor(disabled: boolean | undefined): string {
  return disabled ? 'eldra:cursor-not-allowed' : 'eldra:cursor-pointer';
}

/**
 * The drawn radio (spec "Radio group" → Anatomy: "a native `<input type="radio">` with custom
 * appearance, always visible"). Reuses `Checkbox`'s exact proxy-focus shape — the input is
 * `opacity-0` and stretched *over* this element, which is what makes `eldra-focus-proxy`
 * (`:has(:focus-visible)`) draw the one focus ring around the shape a keyboard user can see, in
 * every layout (spec's Focus-visible row: "standard focus ring around the radio", not the card).
 */
const RADIO =
  'eldra:relative eldra:inline-flex eldra:shrink-0 eldra:items-center eldra:justify-center ' +
  'eldra:rounded-full eldra:eldra-focus eldra:eldra-focus-proxy';

/**
 * Spec "Radio group" → Sizes: "1.125rem circle (1.5rem at lg) … nudged 0.1875rem down at md" —
 * the exact same numbers as the Checkbox box, so the same two class strings apply.
 */
const RADIO_SIZE: Record<RadioGroupSize, string> = {
  md: 'eldra:size-4.5 eldra:mt-0.75',
  lg: 'eldra:size-6',
};

/**
 * States (spec "Radio group" → States). The checkbox's own `eldra-checkbox-border` /
 * `-invalid` utilities are reused unchanged: the spec gives the radio circle the identical 1.5px /
 * 2px numbers, so a second pair of utilities for the same numbers would only drift from them.
 */
const UNSELECTED =
  'eldra:bg-background eldra:border-border-strong eldra:group-hover:border-text eldra:eldra-checkbox-border';
const SELECTED = 'eldra:bg-primary eldra:border-primary eldra:eldra-checkbox-border';
const INVALID =
  'eldra:bg-background eldra:border-danger eldra:group-hover:border-danger eldra:eldra-checkbox-border-invalid';
/** Keeps its `primary` fill under an error exactly as `Checkbox`'s invalid-checked box does: the
 * dot is `primary-contrast`, so a `background` fill would draw it in the page's own colour. */
const INVALID_SELECTED = 'eldra:bg-primary eldra:border-danger eldra:eldra-checkbox-border-invalid';
const DISABLED =
  'eldra:bg-surface-strong eldra:border-border eldra:border-dashed eldra:eldra-checkbox-border';
const DISABLED_SELECTED = 'eldra:bg-muted eldra:border-muted eldra:eldra-checkbox-border';

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
    'eldra:pointer-events-none eldra:size-2 eldra:rounded-full eldra:bg-primary-contrast eldra:transition-transform ' +
      'eldra:duration-fast eldra:ease-out',
    selected ? 'eldra:scale-100' : 'eldra:scale-0'
  );
}

/** The native radio: invisible but hit-testable, stretched over the drawn circle. */
export const INPUT =
  'eldra:absolute eldra:inset-0 eldra:m-0 eldra:size-full eldra:cursor-pointer eldra:appearance-none eldra:opacity-0 eldra:disabled:cursor-not-allowed';

/**
 * Spec "Radio group" → Sizes: "Plain row … 0.9375rem / 1.5rem text" for plain layouts, "Card title
 * … 1rem 600 (line-height 1.4)" for cards — the same two type utilities `Checkbox`'s label and the
 * `text-card-title` utility (see `tailwind.css`) already give those numbers.
 */
export function labelRecipe(card: boolean, disabled: boolean | undefined): string {
  return cx(
    card ? 'eldra:text-card-title' : 'eldra:text-control',
    'eldra:min-w-0',
    disabled ? 'eldra:text-muted' : 'eldra:text-text'
  );
}

/** Spec "Radio group" → Sizes: the hint is `muted` in every layout, under the label's column. */
export const HINT = 'eldra:text-body-sm eldra:text-muted eldra:col-start-2 eldra:min-w-0';
