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
 * Nothing here is exported from the package: a consumer restyles through `class`, `classes`, tokens and
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
export const FIELD_BOX =
  'eldra:block eldra:w-full eldra:min-w-0 eldra:eldra-field-border eldra:placeholder:text-muted ' +
  'eldra:eldra-focus eldra:eldra-focus-always';
/** The box's radius, apart so a field with a radius of its own (`SearchBar`'s pill) takes one. */
export const FIELD_RADIUS = 'eldra:rounded-[var(--eldra-input-radius,var(--eldra-radius-md))]';
export const FIELD_BASE = `${FIELD_BOX} ${FIELD_RADIUS}`;

/**
 * The type style per size (spec "Input" → Sizes). Its own constant because `SearchBar`'s two sizes
 * take exactly these rules while its paddings are its own — the `max-md:text-control-mobile`
 * override in particular, which is a *viewport* rule (so iOS never zooms into a focused field) and
 * is the half that had gone missing from the copy.
 */
export const FIELD_TEXT: Record<InputSize, string> = {
  sm: 'eldra:text-control-sm',
  md: 'eldra:text-control eldra:max-md:text-control-mobile',
  lg: 'eldra:text-control-lg',
};

/**
 * Sizes (spec "Input" → Sizes). `--spacing` is 0.25rem, so `py-0.75`/`px-2.25` are the spec's
 * 0.1875/0.5625rem, `py-1.75`/`px-2.75` its 0.4375/0.6875rem and `py-2.75` its 0.6875rem.
 * The 1.5rem line comes from the `text-control*` utilities, so the value sits on the spec's line
 * inside the spec's box at every size.
 */
export const FIELD_SIZE: Record<InputSize, string> = {
  sm: `eldra:control-h-sm eldra:py-0.75 eldra:px-2.25 ${FIELD_TEXT.sm}`,
  md: `eldra:control-h eldra:py-1.75 eldra:px-2.75 ${FIELD_TEXT.md}`,
  lg: `eldra:control-h-lg eldra:py-2.75 eldra:px-2.75 ${FIELD_TEXT.lg}`,
};

/**
 * Room for the decorations (spec "Input" → Sizes, md row): "With a leading icon, the start padding
 * is 2.25rem. With a trailing action, the end padding is 2.5rem." The leading icon is 1.125rem at
 * every size, so its 2.25rem applies to all three; the trailing action is 2rem square, which does
 * not fit a 2rem sm box, so sm uses a 1.5rem button (still the 2.5.8 target minimum) and 2rem of
 * end padding to match.
 */
export const FIELD_LEADING_PAD = 'eldra:ps-9';
export const FIELD_TRAILING_PAD: Record<InputSize, string> = {
  sm: 'eldra:pe-8',
  md: 'eldra:pe-10',
  lg: 'eldra:pe-10',
};
export const FIELD_CLEAR_SIZE: Record<InputSize, string> = {
  sm: 'eldra:size-6',
  md: 'eldra:size-8',
  lg: 'eldra:size-8',
};

/**
 * Two trailing actions (operator report, 2026-09-25; recorded under Deviations in the README): a
 * `UnitInput`/`CurrencyInput` with `clearable` and a drag handle both on showed `$1,234,567.89   ×
 * ↕` — each action a full 2rem square around a 1.125rem icon, `gap-1` between them, so the two
 * icons ended up roughly 1.1rem apart, far wider than any other icon pair in the library (the
 * private library's own handle sits `px-0` beside the clear button, no gap at all).
 *
 * A single action keeps `FIELD_TRAILING_PAD`/`FIELD_CLEAR_SIZE` unchanged (`Input`'s and
 * `SearchBar`'s only ever have one, and their rendered classes must not change). With two, the row
 * itself carries no gap (`FIELD_SUFFIX_ROW` below), each action shrinks to `w-6` (1.5rem — still
 * the WCAG 2.5.8 24px minimum) at the row's own height, and the control's end padding grows to fit
 * both of them plus the row's own 0.25rem inset from the edge.
 */
export const FIELD_TRAILING_PAD_PAIR: Record<InputSize, string> = {
  sm: 'eldra:pe-14',
  md: 'eldra:pe-14',
  lg: 'eldra:pe-14',
};
export const FIELD_ACTION_PAIR_SIZE: Record<InputSize, string> = {
  sm: 'eldra:w-6 eldra:h-6',
  md: 'eldra:w-6 eldra:h-8',
  lg: 'eldra:w-6 eldra:h-8',
};

/**
 * States (spec "Input" → States). Disabled and read-only replace the live colours outright rather
 * than layering over them, so a `:hover` rule can never win back a live boundary on a dead field.
 * The error row's second 1px line is drawn by the root's `eldra-field-invalid` pseudo-element,
 * because the ring already owns this element's `outline` and `box-shadow`. Each recipe carries the
 * fill, the text colour and the boundary, so a field renders exactly one of each: `fieldState`
 * picks the one recipe a field is in.
 */
const FIELD_LIVE_FILL = 'eldra:bg-background eldra:text-text';
const FIELD_READONLY_FILL = 'eldra:bg-surface eldra:text-text';
export const FIELD_LIVE = `${FIELD_LIVE_FILL} eldra:border-border-strong eldra:hover:border-text eldra:focus:border-text`;
/** The error boundary alone; `fieldState` pairs it with the live or the read-only fill. */
export const FIELD_INVALID =
  'eldra:border-danger eldra:hover:border-danger eldra:focus:border-danger';
export const FIELD_DISABLED =
  'eldra:bg-surface-strong eldra:border-border eldra:border-dashed eldra:text-muted eldra:cursor-not-allowed';
export const FIELD_READONLY = `${FIELD_READONLY_FILL} eldra:border-border`;

/** The one state recipe a field box is in. `invalid` is the shown error, never set while disabled. */
export function fieldState(state: {
  disabled: boolean;
  readonly: boolean;
  invalid: boolean;
}): string {
  if (state.disabled) return FIELD_DISABLED;
  if (state.readonly)
    return state.invalid ? `${FIELD_READONLY_FILL} ${FIELD_INVALID}` : FIELD_READONLY;
  return state.invalid ? `${FIELD_LIVE_FILL} ${FIELD_INVALID}` : FIELD_LIVE;
}

/** Spec "Input" → Variants, `search`: "The browser's own clear button is hidden." */
export const FIELD_SEARCH_APPEARANCE =
  'eldra:[&::-webkit-search-cancel-button]:appearance-none ' +
  'eldra:[&::-webkit-search-decoration]:appearance-none';

/**
 * A ghost icon button at the field's end edge (spec "Input" → Anatomy): square, `muted`, the ring.
 * `cursor-pointer` (operator report, 2026-09-25; recorded under Deviations in the README): Tailwind
 * v4's preflight sets `button { cursor: default }`, so without it every clear button in the
 * package — `Input`'s, `SearchBar`'s and `UnitInput`'s (`CurrencyInput` wraps the last) — showed
 * the default arrow rather than a pointer.
 */
export const FIELD_CLEAR_BUTTON_BOX =
  'eldra:shrink-0 eldra:items-center eldra:justify-center ' +
  'eldra:text-muted eldra:hover:text-text eldra:cursor-pointer ' +
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
  'eldra:eldra-focus';
/** The whole button. A field that shows or rounds it its own way takes `FIELD_CLEAR_BUTTON_BOX`. */
export const FIELD_CLEAR_BUTTON = `eldra:inline-flex ${FIELD_CLEAR_BUTTON_BOX} eldra:rounded-[var(--eldra-radius-sm)]`;

/** 1.125rem, `muted`, 0.6875rem from the start edge, and out of the pointer's way. */
export const FIELD_LEADING_ICON =
  'eldra:absolute eldra:start-2.75 eldra:inset-y-0 eldra:my-auto eldra:flex eldra:h-4.5 eldra:w-4.5 eldra:items-center eldra:justify-center ' +
  'eldra:text-muted eldra:pointer-events-none';

/**
 * The end-edge area, 0.25rem from the edge (spec "Input" → Anatomy, "Trailing action"). The clear
 * button and the `suffix` slot share it, so a field that has both keeps them on one row in reading
 * order — which is also the tab order the Keyboard table asks for: the input first, the clear
 * button next.
 *
 * `gap-1` is the shared default: `Input`'s own doc comment documents `clearable`/`type="search"`
 * plus a populated `suffix` slot as first-class ("the clear button and the `suffix` slot share it,
 * so a field with both keeps them on one row"), and this constant is `Input`'s and `SearchBar`'s
 * row too — dropping the gap here would silently change `Input`'s rendered output for that
 * combination, which an early review caught. Only `UnitInput`'s two-action pair (see
 * `FIELD_TRAILING_PAD_PAIR` above) wants flush icons, and it builds its row from
 * `FIELD_SUFFIX_ROW_BASE` with `gap-0` rather than changing the shared default.
 */
export const FIELD_SUFFIX_ROW_BASE =
  'eldra:absolute eldra:end-1 eldra:inset-y-0 eldra:my-auto eldra:flex eldra:items-center';
export const FIELD_SUFFIX_ROW = `${FIELD_SUFFIX_ROW_BASE} eldra:gap-1`;

/**
 * The start-edge mirror of `FIELD_SUFFIX_ROW`, for the `prefix` slot: interactive content (a
 * calendar button) 0.25rem from the start edge, so unlike `FIELD_LEADING_ICON` it keeps the pointer.
 */
export const FIELD_PREFIX_ROW =
  'eldra:absolute eldra:start-1 eldra:inset-y-0 eldra:my-auto eldra:flex eldra:items-center eldra:gap-1';

/** The start padding a `prefix` row reserves: the trailing action's room, mirrored. */
export const FIELD_PREFIX_PAD: Record<InputSize, string> = {
  sm: 'eldra:ps-8',
  md: 'eldra:ps-10',
  lg: 'eldra:ps-10',
};

/** `FIELD_TRAILING_PAD`/`FIELD_PREFIX_PAD` in rem, for `useAdornmentRoom`'s comparison. */
export const FIELD_ACTION_ROOM_REM: Record<InputSize, number> = { sm: 2, md: 2.5, lg: 2.5 };
