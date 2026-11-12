import type { UiMessages } from '../../composables/useMessages';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type DrawerPart =
  | 'panel'
  | 'handle'
  | 'header'
  | 'title'
  | 'count'
  | 'close'
  | 'body'
  | 'footer';

/** The edge the sheet slides in from. `left` is for the mobile menu; everything else (cart,
 *  filters, quick view) is `right`, the default. */
export type DrawerSide = 'right' | 'left';

export interface DrawerProps {
  /** Shows the drawer with `showModal()` when `true`, closes it when `false` (two-way). */
  modelValue?: boolean;
  /** The edge the sheet slides in from. Default `"right"`. */
  side?: DrawerSide;
  /** The visible `<h2>` title, e.g. "Your cart"; the drawer is `aria-labelledby` it. Use either
   *  `title` or `ariaLabel`, never neither. */
  title?: string;
  /** The drawer's accessible name when there is no visible heading that names it well (the menu:
   *  `ariaLabel="Menu"`). Ignored when `title` is set — `title` already names it. */
  ariaLabel?: string;
  /** An optional count shown after the title in `muted`, weight 400: "Your cart (3)". Only
   *  rendered alongside `title`. */
  count?: number;
  /** The panel's own maximum width (a CSS length, e.g. `"26rem"`), always capped at 100% of the
   *  viewport. Default `"28rem"`. Below a 48rem *viewport* the drawer covers the full screen
   *  regardless of this value. */
  width?: string;
  /**
   * Below the 48rem viewport edge, opens as a bottom sheet instead of a full-screen panel: it
   * rises from the bottom, fits its content up to the viewport less `--eldra-drawer-sheet-gap`,
   * and has a grab handle; drag the handle or header down (or the body, once it is scrolled to the
   * top) to close it, the backdrop fading as it goes. Wider than that it is the usual side drawer.
   * Default `false`.
   */
  mobileSheet?: boolean;
  /**
   * Swipe the drawer toward its edge to close it: a side drawer sideways (a finger anywhere on
   * it, a mouse or pen by its header), a `mobileSheet` down. Nothing moves until the pointer has
   * gone `--eldra-drawer-swipe-threshold` (24px) toward the edge. Default `true`.
   */
  swipe?: boolean;
  /** Message overrides (only `close` applies here, unless a name is available — see
   *  `closeDrawer`). See `useMessages`. */
  messages?: Partial<UiMessages>;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the drawer's
   * `<dialog>` itself with `class`.
   */
  classes?: Partial<Record<DrawerPart, string>>;
}
