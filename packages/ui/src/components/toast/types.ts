import type { UiMessages } from '../../composables/useMessages';

/** Spec "Toast" -> Variants: icon, colour and timing all key off this. */
export type ToastVariant = 'success' | 'warning' | 'danger';

/**
 * One action a toast offers (spec "Toast" -> Properties, `action` row): "One action: a link
 * ('View cart (3)') or a button ('Try again')." A discriminated union rather than one interface
 * with two optional fields, matching the brief's own type verbatim — `href` and `onActivate` are
 * mutually exclusive, never both given for the same toast.
 */
export type ToastAction =
  | { label: string; href: string }
  | { label: string; onActivate: () => void };

/** The parts a consumer can restyle through `classes` (spec "Toast" -> Anatomy). */
export type ToastPart = 'root' | 'icon' | 'title' | 'text' | 'action' | 'close';

export interface ToastProps {
  /** Icon, colour and auto-dismiss timing (see `useToast`'s `DEFAULT_DURATION`). Default
   *  `"success"`. */
  variant?: ToastVariant;
  /** The message. The meaning is always in this text — colour and icon are extras (1.4.1). */
  title: string;
  /** One supporting line, below the title. */
  text?: string;
  /** One action: a link or a link-style button. */
  action?: ToastAction;
  /** Message overrides (only `dismissNotification` applies here). See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ToastPart, string>>;
}

/** The parts a consumer can restyle through `classes` (`Toaster`'s own anatomy: the fixed region
 *  and the polite status list inside it — see `Toaster.vue`'s own doc comment for why a danger
 *  toast is not inside `list`). */
export type ToasterPart = 'root' | 'list';

export interface ToasterProps {
  /** Message overrides, passed through to every `Toast` this renders and to the region's own
   *  `aria-label`. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ToasterPart, string>>;
}
