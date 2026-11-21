import type { Component } from 'vue';
import type { NavMenuItem, NavMenuLink, NavMenuPanelLayout, NavMenuSection } from './types';

/** How the page the visitor is on is marked, on every kind of link the menu draws. */
export const CURRENT_PAGE =
  'eldra:aria-[current=page]:underline eldra:aria-[current=page]:decoration-2 eldra:aria-[current=page]:underline-offset-[0.2em]';

/** A run of panel entries under one column heading; `group` is `null` for entries without one. */
export interface NavMenuLinkRun {
  group: string | null;
  links: NavMenuLink[];
  /** A section's own heading page; unset for a run built from `group`s. */
  headingLink?: NavMenuLink | null;
  /** A section's trailing "see all" entry. */
  seeAll?: NavMenuLink | null;
}

/** Whether an entry has visible text to render. */
export function isRenderableLink(link: NavMenuLink): boolean {
  return typeof link.label === 'string' && link.label.trim() !== '';
}

/** The item's sections when it has any; they are the panel, and `children` is then not read. */
function itemSections(item: NavMenuItem): readonly NavMenuSection[] {
  return item.sections !== undefined && item.sections.length > 0 ? item.sections : [];
}

/** The entries a panel draws, without the ones that have nothing to show. */
export function panelLinks(item: NavMenuItem): NavMenuLink[] {
  const sections = itemSections(item);
  if (sections.length > 0) {
    return sections.flatMap((section) => section.links.filter(isRenderableLink));
  }
  return (item.children ?? []).filter(isRenderableLink);
}

/** Whether a top-level entry opens a panel rather than being a plain link. */
export function hasPanel(item: NavMenuItem): boolean {
  return panelRuns(item).length > 0;
}

/**
 * What a panel draws, column by column: one run per section, in order (two sections with the same
 * heading stay two), or, for an item without sections, its children grouped by `group`. A section
 * with nothing to show, no entries and no "see all", is left out.
 */
export function panelRuns(item: NavMenuItem): NavMenuLinkRun[] {
  const sections = itemSections(item);
  if (sections.length === 0) return groupLinks(panelLinks(item));
  const runs: NavMenuLinkRun[] = [];
  for (const section of sections) {
    const links = section.links.filter(isRenderableLink);
    const seeAll =
      section.seeAll != null && isRenderableLink(section.seeAll) ? section.seeAll : null;
    if (links.length === 0 && seeAll === null) continue;
    const own = typeof section.heading === 'string' && section.heading.trim() !== '';
    const headingLink =
      section.headingLink != null && hasHref(section.headingLink) ? section.headingLink : null;
    // A section with only a heading link is headed by that link's label.
    const named = section.headingLink != null && isRenderableLink(section.headingLink);
    const heading = own ? section.heading! : named ? section.headingLink!.label : null;
    runs.push({ group: heading, links, headingLink, seeAll });
  }
  return runs;
}

/** Groups entries by their `group`, keeping the order each group first appears in. */
export function groupLinks(links: readonly NavMenuLink[]): NavMenuLinkRun[] {
  const groups: NavMenuLinkRun[] = [];
  const byName = new Map<string | null, NavMenuLinkRun>();
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
  if (itemSections(item).length > 0) return 'mega';
  return panelLinks(item).some((link) => typeof link.group === 'string' && link.group.trim() !== '')
    ? 'mega'
    : 'dropdown';
}

/** Whether the item, or an entry in its panel, is the page the visitor is on. */
export function containsCurrent(item: NavMenuItem): boolean {
  return (
    item.current === true ||
    panelLinks(item).some((link) => link.current === true) ||
    itemSections(item).some(
      (section) => section.headingLink?.current === true || section.seeAll?.current === true
    ) ||
    (item.groups ?? []).some((group) => group.current === true)
  );
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
