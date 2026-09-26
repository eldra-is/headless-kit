import type { Component } from 'vue';

/**
 * The parts a consumer can restyle through `classes`, named as the spec's anatomy names them
 * (spec "Pagination" → Anatomy, numbered 1–4 plus the shared wrapper parts). `item` is the `<li>`
 * that wraps exactly one of `prev`/`page`/`current`/`ellipsis`/`next` — one wrapper name for every
 * row rather than a `pageItem`/`prevItem`/… pair per row, since the wrapper itself carries no
 * visual role of its own beyond spacing. The compact form's own status text ("Page 2 of 12") has
 * no part of its own: it is generated content with no independent styling hook, the same shape
 * `Tooltip`'s hover bridge or `Skeleton`'s shimmer are drawn without one (see the README's
 * Deviations entry).
 */
export type PaginationPart =
  | 'root'
  | 'list'
  | 'item'
  | 'page'
  | 'current'
  | 'ellipsis'
  | 'prev'
  | 'next';

export interface PaginationProps {
  /** Current page, 1-based. */
  page: number;
  /** Total pages. Nothing renders when it's 1 (or fewer). */
  totalPages: number;
  /** Pages shown on each side of the current one. First and last always show; the rest collapse
   *  to "…". Defaults to `1`. */
  siblings?: number;
  /**
   * Builds each link's URL from a page number. Given, every page/previous/next control renders as
   * a real `<a href>` (or the `linkAs` component, receiving the destination as `to` — the same
   * contract `Link`'s own `as` uses). **Without it, the controls render as `<button type="button">`
   * elements that emit `update:page` instead** — a controller ruling recorded under the README's
   * Deviations entry, since a consumer driving pagination from in-memory state has no URL to build.
   */
  hrefForPage?: (page: number) => string;
  /** Forces the compact "Page 2 of 12" form regardless of width. By default the numbered form
   *  shows from 48rem of the pagination's own width (a `@container` query, not the viewport) and
   *  the compact form shows below it — both driven by the same `page`/`totalPages` data. */
  compact?: boolean;
  /**
   * Render the link controls (page/previous/next) as a different tag or component instead of a
   * native `<a>` — a router link component, matching `Link`'s own `as` contract. Named `linkAs`,
   * not `as`: this component's root is spec-fixed (`<nav>`), so `as` — which everywhere else in
   * this package renames the *root* element — would be ambiguous here, the same reason
   * `ContentCard`/`FeatureCard`/`ProductCard` use `linkAs` for their own nested title link instead
   * of `as`. Ignored without `hrefForPage`: without a destination, the controls are `<button>`s,
   * the same rule `Button`/`Link`'s own `as` follows.
   */
  linkAs?: string | Component;
  /**
   * The `<nav>`'s accessible name. Package convention: an accessible-name-only prop is named
   * `ariaLabel`, never `label` — there is no visible text this component could name instead.
   * Defaults to the `pagination` message ("Pagination").
   */
  ariaLabel?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<PaginationPart, string>>;
}
