import type { Component } from 'vue';
import type { ImageMedia } from '../image/types';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them.
 *
 * There is no separate part for the structural `<li>` a linked item wraps its `<a>`/`as` cell in
 * (see `LogoItem.vue`'s own comment) — `root` always names the single visually significant cell,
 * whichever tag actually renders it.
 */
export type LogoItemPart = 'root' | 'image' | 'wordmark' | 'srText';

export interface LogoItemProps {
  /** The company name. Used as the logo image's `alt` (never "logo") and as the wordmark text. */
  name: string;
  /**
   * An SVG or transparent PNG. `null`/omitted (or empty) renders the wordmark fallback instead —
   * a logo cloud never shows an empty cell.
   */
  logo?: ImageMedia | null;
  /** Renders the cell as a link (an `<a>`, or `as` when given). `null`/omitted renders an
   * unlinked, non-focusable cell. */
  href?: string | null;
  /**
   * Visually hidden text appended to the link's accessible name, e.g. "Kiln Street (stockist
   * site)". `null`/omitted falls back to the `stockistSite` message, but only when `href` looks
   * external (an absolute URL) — an on-site stockist page link gets no extra context. Rendered
   * verbatim, so include your own leading space to read naturally after the name.
   */
  linkContext?: string | null;
  /**
   * Render the linked cell as a different tag or component instead of a native `<a>` — a router
   * link component, for example `resolveComponent('NuxtLink')`. Same contract as `Link`'s `as`: a
   * string is used as the tag directly and still receives `href`; a component receives the
   * destination as its `to` prop instead. Ignored when there is no `href`.
   */
  as?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<LogoItemPart, string>>;
}
