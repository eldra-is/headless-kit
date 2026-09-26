import type { IconComponent } from '../icon/types';

/**
 * The design spec's three empty/error states (spec "Empty and error states" → Properties,
 * `variant` row). `noResults` sets `role="status"`; `error` sets `role="alert"` and colours the
 * icon `danger`. `plain` (spec's fourth row) is a separate boolean modifier, not a variant — it
 * only changes the boundary, not the content — see `EmptyStateProps.plain`.
 */
export type EmptyStateVariant = 'empty' | 'noResults' | 'error';

/** The parts a consumer can restyle through `classes`, named after the spec's anatomy: the icon
 * circle (1), the title (2), the text (3) and the actions row (4). */
export type EmptyStatePart = 'root' | 'icon' | 'title' | 'text' | 'actions';

export interface EmptyStateProps {
  /** Which state this is (spec "Empty and error states" → Variants). Defaults to `empty`. */
  variant?: EmptyStateVariant;
  /**
   * The icon inside the decorative circle (spec → Properties, `icon` row: "per use", e.g.
   * `shopping-bag`, `search`, `alert-triangle`, `heart`). Without one, a built-in default is drawn
   * per `variant` — see `EmptyState.vue`'s own comment. `error` always colours the icon `danger`,
   * whichever icon is showing (spec → Variants, "Error" row: "icon turns `danger`").
   */
  icon?: IconComponent;
  /** Plain statement ("Your cart is empty"); for `noResults`, echo the search query. Required —
   * the spec gives every empty state exactly one next step, and that starts with a real title. */
  title: string;
  /** One or two sentences with the next step. `null` (the default) renders nothing. */
  text?: string | null;
  /** No border or background; for drawers, lists and cards that already draw their own boundary
   * (spec → Variants, "Plain" row). */
  plain?: boolean;
  /** The title's heading level. `2` for a page-level state, `3` (the default) inside a block. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /**
   * `error` only: the built-in "Try again" button shows its busy state (spinner, `aria-busy`) —
   * only takes effect while there is no `actions` slot, since a caller-supplied button reads this
   * from the slot's own scope instead (see the `actions` slot below).
   */
  retrying?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<EmptyStatePart, string>>;
}

/**
 * The parts a consumer can restyle through `classes`: the icon (optional), the action label
 * (strong) and the guidance text, named after the spec's own editor-hint anatomy.
 */
export type EditorPlaceholderPart = 'root' | 'icon' | 'label' | 'help';

export interface EditorPlaceholderProps {
  /** E.g. `plus`, `photo`. `null` (the default) renders no icon. */
  icon?: IconComponent | null;
  /** The action, e.g. "Add products", "Choose an image", "Add a heading". */
  label: string;
  /** Guidance, e.g. "Pick a collection or up to 12 products to show in this grid." `null` (the
   * default) renders no help line. */
  help?: string | null;
  /** Compact padding, for an empty inline field (e.g. an empty heading). Defaults to `false`. */
  inline?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<EditorPlaceholderPart, string>>;
}
