import type { Component } from 'vue';

/** The spec's two variants: inline in a sentence, or a standalone "Shop all knitwear →" action. */
export type LinkVariant = 'inline' | 'standalone';

/** Default is `text`; `muted` is for footer and meta-line links ("Size guide", "Privacy"). */
export type LinkTone = 'default' | 'muted';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type LinkPart = 'root' | 'label' | 'arrow' | 'externalIcon';

export interface LinkProps {
  /**
   * Destination. With no destination the spec says to "render plain text instead of a link": the
   * component renders a `<span data-part="root">` with no link semantics at all.
   */
  href?: string;
  /** Inline in a sentence, or standalone with weight 600 and an optional arrow. Defaults to `inline`. */
  variant?: LinkVariant;
  /** Standalone only: adds the trailing `arrow-right` icon. */
  arrow?: boolean;
  /** Adds `target="_blank"`, `rel="noopener noreferrer"`, the external icon and hidden "opens in a new tab" text. */
  external?: boolean;
  /** Tertiary links in footers and meta lines. Defaults to `default`. */
  tone?: LinkTone;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<LinkPart, string>>;
  /**
   * Render as a different tag or component instead of a native `<a>` — a router link component,
   * for example `resolveComponent('NuxtLink')`. A string is used as the tag directly and still
   * receives `href`; a component receives the destination as its `to` prop instead, matching
   * Vue Router / NuxtLink's own contract. Ignored when there is no `href`.
   */
  as?: string | Component;
}
