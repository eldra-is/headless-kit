import type { Component } from 'vue';
import type { UiMessages } from '../../composables/useMessages';

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
export type PaginationPart = 'list' | 'item' | 'page' | 'current' | 'ellipsis' | 'prev' | 'next';

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
   * elements that emit `update:page` instead** — a controller decision recorded under the README's
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
  /**
   * Keep the numbered row the same length on every page. The window of `2 × siblings + 1` pages
   * slides against the ends instead of shrinking near them, the slot next to the first and the last
   * page shows that page or "…", and a "…" always stands for two or more pages. So `siblings: 1`
   * always draws seven items once there are more than seven pages (`1 2 3 [4] 5 … 12`,
   * `1 … 5 [6] 7 … 12`), and the controls do not move under the pointer as the page changes.
   * Defaults to `false`: the window is the current page ± `siblings`, plus the first and last.
   */
  fixedLength?: boolean;
  /**
   * Renders every control inert: pages and previous/next in the disabled previous/next form (a
   * `<span aria-disabled="true">`, `muted` at 60%, no link, not focusable), the current page still
   * marked with `aria-current="page"`. Nothing emits `update:page`. Defaults to `false`.
   */
  disabled?: boolean;
  /**
   * Defaults to `true`: below 48rem of its own width the numbered form gives way to the compact
   * one. `false` keeps the numbered form at every width (it wraps) and never renders the compact
   * row, for a layout where jumping straight to any page matters more than one line. `compact`
   * still wins when set.
   */
  responsive?: boolean;
  /**
   * Render with a single page too: previous and next disabled around page 1, so a paged list keeps
   * its footer while it holds one page. Defaults to `false`: nothing renders below two pages.
   */
  showSinglePage?: boolean;
  /** Message overrides (`pagination`, `previousPage`, `nextPage`, `pageN`, `pageOfTotal`), per
   *  instance; a shorter visible "Previous"/"Next" goes here. See `useMessages`. */
  messages?: Partial<UiMessages>;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the `<nav>`
   * itself with `class`.
   */
  classes?: Partial<Record<PaginationPart, string>>;
}
