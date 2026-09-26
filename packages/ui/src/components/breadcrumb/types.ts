import type { Component } from 'vue';

/**
 * One level of the trail. Spec "Breadcrumb" → Properties, `items` row: "the last item is the
 * current page and has no `href`" — that is a convention for callers, not something this
 * component trusts: whichever entry is last in the array is always rendered as the current page
 * (a `<span aria-current="page">`, never a link), regardless of whether it happens to carry an
 * `href`. See `Breadcrumb.vue`'s own comment on `endItems`.
 */
export interface BreadcrumbItem {
  /**
   * The visible level name. Spec "Breadcrumb" → Global Constraints / Behaviour & motion: "Product
   * titles are never truncated; the trail wraps" — binding over an earlier draft of this
   * component's contract that would have truncated a long label at a fixed character count. There
   * is deliberately no CSS `truncate`/`line-clamp` anywhere in this component: a long label wraps
   * inside its own `<li>` instead, at every container width including the collapsed one (spec's
   * own acceptance criterion: "At 320px and 200% zoom the trail wraps without horizontal scroll
   * and titles are not truncated").
   */
  label: string;
  /** The level's destination. Omit on the last item — see this interface's own comment. */
  href?: string;
}

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type BreadcrumbPart =
  | 'root'
  | 'list'
  | 'item'
  | 'link'
  | 'current'
  | 'separator'
  | 'ellipsis';

export interface BreadcrumbProps {
  /** The trail, root first. The last entry is always rendered as the current page — see
   *  `BreadcrumbItem`'s own comment. */
  items: BreadcrumbItem[];
  /** Levels kept visible at the start when collapsed (spec "Breadcrumb" → Properties: "Home").
   *  Defaults to `1`. */
  collapseAfter?: number;
  /** Levels kept visible at the end when collapsed (spec "Breadcrumb" → Properties: "the parent
   *  and the current page"). Defaults to `2`. */
  keepLast?: number;
  /**
   * Render every level link as a different tag or component instead of a native `<a>` — a router
   * link component, for example `resolveComponent('NuxtLink')`. Same contract as `Link`'s and
   * `LogoItem`'s own `as`: a string is used as the tag directly and still receives `href`; a
   * component receives the destination as its `to` prop instead. Applies to every link in the
   * trail alike — there is no per-item override, the same way `LogoItem` takes one `as` for its
   * one link rather than one per logo. Named `linkAs`, not `as`: this component's own root is
   * spec-fixed (`<nav>`), so `as` would be ambiguous with `Badge`/`Container`/`Section`'s `as`,
   * which *does* pick the root tag — see this package's README "as vs linkAs" note.
   */
  linkAs?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<BreadcrumbPart, string>>;
}
