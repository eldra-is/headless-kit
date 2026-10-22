import type { Component } from 'vue';
import type { NavMenuItem, NavMenuLink, NavMenuPanelLayout } from './types';

/** How the page the visitor is on is marked, on every kind of link the menu draws. */
export const CURRENT_PAGE =
  'aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-[0.2em]';

/** A run of panel entries under one column heading; `group` is `null` for entries without one. */
export interface NavMenuGroup {
  group: string | null;
  links: NavMenuLink[];
}

/** Whether an entry has visible text to render. */
export function isRenderableLink(link: NavMenuLink): boolean {
  return typeof link.label === 'string' && link.label.trim() !== '';
}

/** The entries a panel draws, without the ones that have nothing to show. */
export function panelLinks(item: NavMenuItem): NavMenuLink[] {
  return (item.children ?? []).filter(isRenderableLink);
}

/** Whether a top-level entry opens a panel rather than being a plain link. */
export function hasPanel(item: NavMenuItem): boolean {
  return panelLinks(item).length > 0;
}

/** Groups entries by their `group`, keeping the order each group first appears in. */
export function groupLinks(links: readonly NavMenuLink[]): NavMenuGroup[] {
  const groups: NavMenuGroup[] = [];
  const byName = new Map<string | null, NavMenuGroup>();
  for (const link of links) {
    const name = typeof link.group === 'string' && link.group.trim() !== '' ? link.group : null;
    let group = byName.get(name);
    if (group === undefined) {
      group = { group: name, links: [] };
      byName.set(name, group);
      groups.push(group);
    }
    group.links.push(link);
  }
  return groups;
}

/** The panel's layout: the item's own, else `mega` when its entries are grouped into columns. */
export function panelLayout(item: NavMenuItem): NavMenuPanelLayout {
  if (item.layout !== undefined) return item.layout;
  return panelLinks(item).some((link) => typeof link.group === 'string' && link.group.trim() !== '')
    ? 'mega'
    : 'dropdown';
}

/** Whether the item, or an entry in its panel, is the page the visitor is on. */
export function containsCurrent(item: NavMenuItem): boolean {
  return item.current === true || panelLinks(item).some((link) => link.current === true);
}

/** Whether an entry goes somewhere; one without a destination renders as plain text. */
export function hasHref(link: NavMenuLink): boolean {
  return typeof link.href === 'string' && link.href !== '';
}

/** The element an entry renders as: `linkAs` (or `a`) with a destination, else `span`. */
export function navLinkTag(link: NavMenuLink, linkAs?: string | Component): string | Component {
  return hasHref(link) ? (linkAs ?? 'a') : 'span';
}

/** An entry's link attributes; a component `linkAs` takes the destination as `to`. */
export function navLinkAttrs(
  link: NavMenuLink,
  linkAs?: string | Component
): Record<string, unknown> {
  if (!hasHref(link)) return {};
  const attrs: Record<string, unknown> =
    linkAs !== undefined && typeof linkAs !== 'string' ? { to: link.href } : { href: link.href };
  if (link.newTab === true) {
    attrs.target = '_blank';
    attrs.rel = 'noopener noreferrer';
  }
  if (link.current === true) attrs['aria-current'] = 'page';
  return attrs;
}
