import type { InputSize } from './types';

/**
 * The field recipes of the design spec's **Input**, in one place.
 *
 * `Input` is the spec's field box, and two other controls draw the same box: `SearchBar`'s search
 * field ("Search bar" → Sizes says it *is* an input) and `UnitInput` (so `CurrencyInput` too).
 * `SearchBar` used to carry a
 * hand-copied duplicate of these strings, and the copy drifted — the operator's report was that
 * the search field "does not behave like the regular input fields", which was exactly that: the
 * copy had lost the radius variable and the mobile type-size rule, so the field rounded and
 * resized differently from every `Input` beside it.
 *
 * So the recipes live here and the three components import them. What a component may add is its
 * own **delta** — a pill radius, a different padding for an icon it draws itself — never a second
 * copy of the box.
 *
 * Nothing here is exported from the package: a consumer restyles through `classes`, tokens and
 * the per-component CSS variables (see the README's Customisation section), not by importing our
 * class strings, which are not a stable API.
 */

/**
 * The shared box (spec "Input" → Anatomy, Sizes, States). The `<input>` *is* the field box — the
 * anatomy calls it "the native `<input>`, full width" — so the border, the radius and the one
 * focus ring all live on it, and any leading or trailing decoration is absolutely positioned over
 * the padding the sizes reserve for it.
 *
 * `eldra-focus-always` is the text-field rule from the focus-ring foundation: the ring shows on
 * *any* focus, pointer included, "because a caret alone is easy to miss". There is deliberately no
 * `transition-*`/`duration-*` utility beside it — `eldra-focus` owns this element's transition
 * list, including the `duration-fast` border-colour change the spec's Behaviour section asks for.
 * See `src/styles/tailwind.css` and `src/__tests__/focus-transition.spec.ts`.
 */
export const FIELD_BASE =
  'block w-full min-w-0 eldra-field-border bg-background text-text placeholder:text-muted ' +
  'rounded-[var(--eldra-input-radius,var(--eldra-radius-md))] eldra-focus eldra-focus-always';

/**
 * The type style per size (spec "Input" → Sizes). Its own constant because `SearchBar`'s two sizes
 * take exactly these rules while its paddings are its own — the `max-md:text-control-mobile`
 * override in particular, which is a *viewport* rule (so iOS never zooms into a focused field) and
 * is the half that had gone missing from the copy.
 */
export const FIELD_TEXT: Record<InputSize, string> = {
  sm: 'text-control-sm',
  md: 'text-control max-md:text-control-mobile',
  lg: 'text-control-lg',
};

/**
 * Sizes (spec "Input" → Sizes). `--spacing` is 0.25rem, so `py-0.75`/`px-2.25` are the spec's
 * 0.1875/0.5625rem, `py-1.75`/`px-2.75` its 0.4375/0.6875rem and `py-2.75` its 0.6875rem.
 * The 1.5rem line comes from the `text-control*` utilities, so the value sits on the spec's line
 * inside the spec's box at every size.
 */
export const FIELD_SIZE: Record<InputSize, string> = {
  sm: `control-h-sm py-0.75 px-2.25 ${FIELD_TEXT.sm}`,
  md: `control-h py-1.75 px-2.75 ${FIELD_TEXT.md}`,
  lg: `control-h-lg py-2.75 px-2.75 ${FIELD_TEXT.lg}`,
};

/**
 * Room for the decorations (spec "Input" → Sizes, md row): "With a leading icon, the start padding
 * is 2.25rem. With a trailing action, the end padding is 2.5rem." The leading icon is 1.125rem at
 * every size, so its 2.25rem applies to all three; the trailing action is 2rem square, which does
 * not fit a 2rem sm box, so sm uses a 1.5rem button (still the 2.5.8 target minimum) and 2rem of
 * end padding to match.
 */
export const FIELD_LEADING_PAD = 'ps-9';
export const FIELD_TRAILING_PAD: Record<InputSize, string> = {
  sm: 'pe-8',
  md: 'pe-10',
  lg: 'pe-10',
};
export const FIELD_CLEAR_SIZE: Record<InputSize, string> = {
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-8',
};

/**
 * States (spec "Input" → States). Disabled and read-only replace the live colours outright rather
 * than layering over them, so a `:hover` rule can never win back a live boundary on a dead field.
 * The error row's second 1px line is drawn by the root's `eldra-field-invalid` pseudo-element,
 * because the ring already owns this element's `outline` and `box-shadow`.
 */
export const FIELD_LIVE = 'border-border-strong hover:border-text focus:border-text';
export const FIELD_INVALID = 'border-danger hover:border-danger focus:border-danger';
export const FIELD_DISABLED =
  'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
export const FIELD_READONLY = 'bg-surface border-border text-text';

/** Spec "Input" → Variants, `search`: "The browser's own clear button is hidden." */
export const FIELD_SEARCH_APPEARANCE =
  '[&::-webkit-search-cancel-button]:appearance-none ' +
  '[&::-webkit-search-decoration]:appearance-none';

/** A ghost icon button at the field's end edge (spec "Input" → Anatomy): square, `muted`, the ring. */
export const FIELD_CLEAR_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-[var(--eldra-radius-sm)] ' +
  'text-muted hover:text-text ' +
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
  'eldra-focus';

/** 1.125rem, `muted`, 0.6875rem from the start edge, and out of the pointer's way. */
export const FIELD_LEADING_ICON =
  'absolute start-2.75 inset-y-0 my-auto flex h-4.5 w-4.5 items-center justify-center ' +
  'text-muted pointer-events-none';

/**
 * The end-edge area, 0.25rem from the edge (spec "Input" → Anatomy, "Trailing action"). The clear
 * button and the `suffix` slot share it, so a field that has both keeps them on one row in reading
 * order — which is also the tab order the Keyboard table asks for: the input first, the clear
 * button next.
 */
export const FIELD_SUFFIX_ROW = 'absolute end-1 inset-y-0 my-auto flex items-center gap-1';
