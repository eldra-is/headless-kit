import type { HeadingLevel } from '../../composables/useHeadingTag';
import type { IconComponent } from '../icon/types';

/**
 * What kind of news the notice is. `info` (the default) is neutral guidance; `success`, `warning`
 * and `danger` each bring their own colour and default icon. The same four names `Toast`'s
 * `variant` takes.
 */
export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

/** The parts a consumer can restyle through `classes`. The root is styled with `class`. */
export type NoticePart = 'icon' | 'content' | 'title' | 'text' | 'actions';

export interface NoticeProps {
  /** Colour, default icon and live-region role. Also on the root as `data-tone`. */
  tone?: NoticeTone;
  /** An optional heading line. The `title` slot overrides it. */
  title?: string;
  /** The message. The default slot overrides it, for a body with links or more than one paragraph. */
  text?: string;
  /**
   * The leading icon, decorative (`aria-hidden`). Left out, the tone's own icon is drawn
   * (`info-circle`, `circle-check`, `alert-triangle`, `alert-circle`); `null` draws none. A
   * `success`, `warning` or `danger` notice should keep one, so colour is never the only signal.
   */
  icon?: IconComponent | null;
  /**
   * Renders the title as a heading of this level instead of a `<p>`, for a notice that opens a
   * part of the page ("Thank you for your order"). Left out, the title is not a heading.
   */
  headingLevel?: HeadingLevel;
  /**
   * Whether the notice is a live region: `role="status"` (polite) for `info`, `success` and
   * `warning`, `role="alert"` (assertive) for `danger`. `true` by default, so a notice that
   * appears after the page has loaded is announced. Set it to `false` for a notice inside an
   * element that is already a live region, or one that is plain page content from the start.
   */
  announce?: boolean;
  /** Per-part classes, appended to the part's own (they win by cascade layer). */
  classes?: Partial<Record<NoticePart, string>>;
}
