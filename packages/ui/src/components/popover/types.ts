import type { FloatingPlacement } from '../../composables/useFloating';

/**
 * The parts a consumer can restyle through `classes`.
 *
 * `root` is a `display: contents` wrapper around the `trigger` slot's own element and the
 * (conditionally teleported) `panel` — it never draws a box of its own, so it exists only as a
 * `data-part`/`classes` hook and a mount point, never as a layout parent a consumer needs to work
 * around. `trigger` draws nothing here at all: the trigger is the consumer's own element, rendered
 * through the `trigger` slot, and `classes.trigger` reaches it only because the `attrs` slot prop
 * carries a `class` built from it (see `Popover.vue`'s own doc comment) for the consumer to spread.
 */
export type PopoverPart = 'root' | 'trigger' | 'panel';

export interface PopoverProps {
  /** Whether the panel is open (two-way). Self-managing when not bound, like every stateful
   *  component in this package. */
  modelValue?: boolean;
  /**
   * Where the panel opens, in `useFloating`'s own vocabulary: `auto` (default) below, flipping
   * above when there is no room; `above` always above; or an explicit `@floating-ui/dom` placement
   * for a menu that should hang off a corner (`bottom-end`, for a trigger near the inline-end edge).
   * Read once, like every `useFloating` placement — a popover that has to change it at runtime
   * re-keys the component instead.
   */
  placement?: FloatingPlacement;
  /**
   * Tie the panel's width to the trigger's: `true` for a floor (a filter panel that should never
   * be narrower than its control), `'exact'` for a floor *and* a ceiling (a menu that should match
   * the trigger exactly, the way a native `<select>`'s popup does). Unset by default — most menus
   * and filter panels are their own width, sized to their content.
   */
  matchWidth?: boolean | 'exact';
  /**
   * The panel's accessible name (`aria-label`), for a panel with no visible heading of its own.
   * Popover renders no default `role` on the panel — it is a plain region, and a consumer wires
   * whatever semantics its content actually has (`role="menu"` on the panel itself via a plain
   * attribute, `role="menu"`/`"listbox"` on an inner element, or nothing at all for a filter form
   * that is already self-describing) — see `Popover.vue`'s own doc comment for why.
   */
  ariaLabel?: string;
  /**
   * Where the panel is rendered: `true` (default) teleports it to `document.body` — or to the open
   * native `<dialog>` the trigger sits in, which renders in the browser's top layer and would
   * otherwise cover it. `false` keeps the panel inside `root`, positioned `absolute`ly, which is
   * only right when nothing above it clips or stacks over it. Read once, like `placement`.
   *
   * A plain `boolean` rather than `Select`'s `boolean | string` — a custom CSS-selector target is
   * not part of this addition's contract; `usePopover`'s own option still takes one, so a future
   * consumer that needs it is a one-line, non-breaking widening of this type.
   */
  teleport?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<PopoverPart, string>>;
}
