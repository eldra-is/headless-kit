import type { UiMessages } from '../../composables/useMessages';

/** Spec "Toast" -> Variants: icon, colour and timing all key off this. */
/** `info` is neutral news: the text colour, polite, timed like `success`. */
export type ToastVariant = 'success' | 'info' | 'warning' | 'danger';

/**
 * One action a toast offers (spec "Toast" -> Properties, `action` row): "One action: a link
 * ('View cart (3)') or a button ('Try again')." A discriminated union rather than one interface
 * with two optional fields, matching the API contract's own type verbatim — `href` and `onActivate` are
 * mutually exclusive, never both given for the same toast.
 */
export type ToastAction =
  | { label: string; href: string }
  | { label: string; onActivate: () => void };

/** The parts a consumer can restyle through `classes` (spec "Toast" -> Anatomy). */
export type ToastPart = 'icon' | 'title' | 'text' | 'action' | 'close';

export interface ToastProps {
  /** Icon, colour and auto-dismiss timing (see `useToast`'s `DEFAULT_DURATION`). Default
   *  `"success"`. Also on the root as `data-variant`, for a consumer's per-variant selector. */
  variant?: ToastVariant;
  /** The message. The meaning is always in this text — colour and icon are extras (1.4.1). */
  title: string;
  /** One supporting line, below the title. */
  text?: string;
  /** One action: a link or a link-style button. */
  action?: ToastAction;
  /**
   * Shows the close button and closes on `Escape`. Default `true`. `false` is for a toast that must
   * stay until its own timer or the app removes it.
   */
  closable?: boolean;
  /** Message overrides (only `dismissNotification` applies here). See `useMessages`. */
  messages?: Partial<UiMessages>;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the toast
   * itself with `class`.
   */
  classes?: Partial<Record<ToastPart, string>>;
}

/** The parts a consumer can restyle through `classes` (`Toaster`'s own anatomy: the fixed region
 *  and the polite status list inside it — see `Toaster.vue`'s own doc comment for why a danger
 *  toast is not inside `list`). */
export type ToasterPart = 'root' | 'list';

/** Where the stack sits in the viewport. */
export type ToasterPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * One toast in an externally owned list (`Toaster`'s `toasts`). `useToast`'s `ToastItem` is one;
 * `variant` defaults to `"success"`, and with no `duration` (or `0`) the toast keeps no timer of
 * the `Toaster`'s own, so the list's owner decides when it leaves.
 */
export interface ToasterToast {
  id: string;
  title: string;
  variant?: ToastVariant;
  text?: string;
  action?: ToastAction;
  closable?: boolean;
  /** Auto-dismiss time in ms, after which `dismiss(id, "timeout")` fires. Ignored for `danger`. */
  duration?: number;
}

export interface ToasterProps {
  /**
   * An externally owned queue to render instead of `useToast`'s. Given, the `Toaster` never touches
   * the `useToast` store: closing a toast (or its timer running out) only emits `dismiss`, and the
   * owner removes it from the list. Default: the `useToast` queue.
   */
  toasts?: ToasterToast[];
  /** Where the stack sits. Default `"bottom-right"`. */
  position?: ToasterPosition;
  /** Renders at most this many toasts, the newest kept. Default: every toast in the queue
   *  (`useToast` itself keeps three). */
  maxVisible?: number;
  /** Draws the newest toast first, at the top of the stack. Default `false`: newest at the bottom. */
  newestOnTop?: boolean;
  /**
   * Where the region is teleported while no modal dialog is open. Default `"body"`. An open
   * `Dialog` still wins, since a toast outside a modal dialog cannot be reached.
   */
  teleportTo?: string | HTMLElement;
  /** Message overrides, passed through to every `Toast` this renders and to the region's own
   *  `aria-label`. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). `root` is a part
   * here: the region is teleported, so a `class` on `Toaster` has no element to land on.
   */
  classes?: Partial<Record<ToasterPart, string>>;
}
