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
  panelRuns,
} from '../navLinks';
import type { NavMenuItem, NavMenuLink } from '../types';

/** `@eldrajs/theme-core`'s `ResolvedLink` (`src/links.ts`), copied: a resolved Studio link tree. */
interface ResolvedLink {
  href: string | null;
  label: string | null;
  newTab: boolean;
  group: string | null;
  children: ResolvedLink[];
  display?: 'card' | 'link';
  imageUrl?: string;
  sections?: ResolvedSection[];
}

interface ResolvedSection {
  heading: string | null;
  headingLink: ResolvedLink | null;
  display?: 'card' | 'link';
  links: ResolvedLink[];
  seeAll: ResolvedLink | null;
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

describe('sections', () => {
  const link = (label: string | null, href: string | null = null): ResolvedLink => ({
    href,
    label,
    newTab: false,
    group: null,
    children: [],
  });
  const shop: ResolvedLink = {
    ...link('Shop'),
    sections: [
      {
        heading: 'Knitwear',
        headingLink: link('Knitwear', '/knitwear'),
        links: [link('Sweaters', '/sweaters'), link(null)],
        seeAll: link('See all', '/knitwear'),
      },
      { heading: null, headingLink: null, links: [link('Mugs', '/mugs')], seeAll: null },
      { heading: 'Empty', headingLink: null, links: [link(null)], seeAll: null },
    ],
  };

  it('takes a resolved link with sections as it is', () => {
    expectTypeOf<ResolvedLink>().toExtend<NavMenuItem>();
  });

  it('opens a mega panel from sections, with their links as the panel links', () => {
    expect(hasPanel(shop)).toBe(true);
    expect(panelLayout(shop)).toBe('mega');
    expect(panelLinks(shop).map((entry) => entry.label)).toEqual(['Sweaters', 'Mugs']);
  });

  it('turns each section into a run, in order, without merging two of the same heading', () => {
    const runs = panelRuns({
      ...shop,
      sections: [
        ...(shop.sections ?? []),
        { heading: 'Knitwear', headingLink: null, links: [link('Hats')], seeAll: null },
      ],
    });
    expect(runs.map((run) => [run.group, run.links.map((entry) => entry.label)])).toEqual([
      ['Knitwear', ['Sweaters']],
      [null, ['Mugs']],
      ['Knitwear', ['Hats']],
    ]);
    expect(runs[0]?.headingLink?.href).toBe('/knitwear');
    expect(runs[0]?.seeAll?.label).toBe('See all');
  });

  it('keeps a section whose only content is a see-all link', () => {
    const only: NavMenuItem = {
      label: 'Shop',
      sections: [{ heading: 'A', links: [], seeAll: { label: 'All', href: '/all' } }],
    };
    expect(panelRuns(only)).toHaveLength(1);
    expect(hasPanel(only)).toBe(true);
  });

  it('falls back to grouped children when there are no sections', () => {
    const legacy: NavMenuItem = {
      label: 'Shop',
      children: [{ label: 'Mugs', group: 'Ceramics' }],
    };
    expect(panelRuns(legacy).map((run) => run.group)).toEqual(['Ceramics']);
    expect(panelRuns({ ...legacy, sections: [] }).map((run) => run.group)).toEqual(['Ceramics']);
  });

  it('is the current item when a section link, heading link or see-all link is', () => {
    const current = (patch: Partial<NavMenuLink>): NavMenuItem => ({
      label: 'Shop',
      sections: [
        {
          heading: 'A',
          headingLink: { label: 'A', href: '/a', ...patch },
          links: [{ label: 'B' }],
        },
      ],
    });
    expect(containsCurrent(current({ current: true }))).toBe(true);
    expect(containsCurrent(current({}))).toBe(false);
    expect(
      containsCurrent({ label: 'S', sections: [{ links: [{ label: 'B', current: true }] }] })
    ).toBe(true);
    expect(
      containsCurrent({
        label: 'S',
        sections: [{ links: [], seeAll: { label: 'All', current: true } }],
      })
    ).toBe(true);
  });
});
