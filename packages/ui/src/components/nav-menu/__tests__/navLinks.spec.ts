import { describe, expect, expectTypeOf, it } from 'vitest';
import { defineComponent } from 'vue';
import {
  containsCurrent,
  groupLinks,
  hasPanel,
  isRenderableLink,
  navLinkAttrs,
  navLinkTag,
  panelLayout,
  panelLinks,
} from '../navLinks';
import type { NavMenuItem, NavMenuLink } from '../types';

/** `@eldrajs/theme-core`'s `ResolvedLink` (`src/links.ts`), copied: a resolved Studio link tree. */
interface ResolvedLink {
  href: string | null;
  label: string | null;
  newTab: boolean;
  group: string | null;
  children: ResolvedLink[];
}

describe('the data shape', () => {
  it('takes a resolved Studio link tree as it is', () => {
    expectTypeOf<ResolvedLink>().toExtend<NavMenuItem>();
    expectTypeOf<ResolvedLink[]>().toExtend<readonly NavMenuItem[]>();
  });

  it('reads a Studio heading (no href) with grouped children as a mega panel', () => {
    const heading: ResolvedLink = {
      href: null,
      label: 'Shop',
      newTab: false,
      group: null,
      children: [
        { href: '/sweaters', label: 'Sweaters', newTab: false, group: 'Knitwear', children: [] },
        { href: null, label: null, newTab: false, group: 'Knitwear', children: [] },
        { href: '/mugs', label: 'Mugs', newTab: false, group: 'Ceramics', children: [] },
      ],
    };
    expect(hasPanel(heading)).toBe(true);
    expect(panelLayout(heading)).toBe('mega');
    expect(panelLinks(heading).map((link) => link.label)).toEqual(['Sweaters', 'Mugs']);
  });
});

describe('isRenderableLink', () => {
  it('drops entries with no visible label', () => {
    expect(isRenderableLink({ label: 'Shop' })).toBe(true);
    expect(isRenderableLink({ label: null })).toBe(false);
    expect(isRenderableLink({ label: '' })).toBe(false);
    expect(isRenderableLink({ label: '   ' })).toBe(false);
  });
});

describe('groupLinks', () => {
  it('groups by name in first-appearance order, ungrouped entries together', () => {
    const links: NavMenuLink[] = [
      { label: 'A', group: 'One' },
      { label: 'B' },
      { label: 'C', group: 'Two' },
      { label: 'D', group: 'One' },
      { label: 'E', group: '  ' },
    ];
    expect(
      groupLinks(links).map((group) => [group.group, group.links.map((link) => link.label)])
    ).toEqual([
      ['One', ['A', 'D']],
      [null, ['B', 'E']],
      ['Two', ['C']],
    ]);
  });
});

describe('panelLayout', () => {
  it('is a dropdown for plain children, mega for grouped ones, and the item decides first', () => {
    const plain: NavMenuItem = { label: 'Journal', children: [{ label: 'Stories' }] };
    const grouped: NavMenuItem = {
      label: 'Shop',
      children: [{ label: 'Mugs', group: 'Ceramics' }],
    };
    expect(panelLayout(plain)).toBe('dropdown');
    expect(panelLayout(grouped)).toBe('mega');
    expect(panelLayout({ ...plain, layout: 'mega' })).toBe('mega');
    expect(panelLayout({ ...grouped, layout: 'dropdown' })).toBe('dropdown');
  });

  it('opens no panel for children that have nothing to show', () => {
    expect(hasPanel({ label: 'About', href: '/about', children: [{ label: null }] })).toBe(false);
  });
});

describe('containsCurrent', () => {
  it('is true for the current item or any of its entries', () => {
    expect(containsCurrent({ label: 'A', current: true })).toBe(true);
    expect(containsCurrent({ label: 'A', children: [{ label: 'B', current: true }] })).toBe(true);
    expect(containsCurrent({ label: 'A', children: [{ label: 'B' }] })).toBe(false);
    expect(
      containsCurrent({
        label: 'A',
        children: [{ label: 'B', group: 'G' }],
        groups: [{ label: 'G', href: '/g', current: true }],
      })
    ).toBe(true);
  });
});

describe('navLinkTag and navLinkAttrs', () => {
  const RouterLink = defineComponent({ props: { to: String }, setup: () => () => null });

  it('renders text without a destination, never a dead link', () => {
    expect(navLinkTag({ label: 'Soon', href: null })).toBe('span');
    expect(navLinkAttrs({ label: 'Soon', href: null })).toEqual({});
  });

  it('passes a component linkAs the destination as `to`, a tag as `href`', () => {
    expect(navLinkTag({ label: 'A', href: '/a' }, RouterLink)).toBe(RouterLink);
    expect(navLinkAttrs({ label: 'A', href: '/a' }, RouterLink)).toEqual({ to: '/a' });
    expect(navLinkAttrs({ label: 'A', href: '/a' }, 'a')).toEqual({ href: '/a' });
  });

  it('marks a new tab and the current page', () => {
    expect(
      navLinkAttrs({ label: 'A', href: 'https://x.test', newTab: true, current: true })
    ).toEqual({
      href: 'https://x.test',
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-current': 'page',
    });
  });
});
