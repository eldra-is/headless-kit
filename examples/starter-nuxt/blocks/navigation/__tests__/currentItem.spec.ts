import { describe, expect, it } from 'vitest';
import { markCurrent, type CurrentEntry } from '../parts/currentItem';

const MENU: CurrentEntry[] = [
  {
    href: '/collections',
    menu: ['/categories/home/knitwear', '/categories/home/ceramics', '/categories/home/kitchen'],
  },
  { href: '/categories/home/ceramics', menu: [] },
  { href: '/journal', menu: ['/journal/linen', '/journal/boards'] },
  { href: '/about', menu: [] },
];

const HOME_CERAMICS = ['/categories/home', '/categories/home/ceramics'];

describe('markCurrent', () => {
  it('marks only the entry for the product’s main category, not the menu that contains it', () => {
    const marks = markCurrent(MENU, {
      path: '/products/speckled-latte-mug',
      trail: HOME_CERAMICS,
    });
    expect(marks).toEqual([undefined, 'true', undefined, undefined]);
  });

  it('marks the entry as the page itself on its own category page', () => {
    const marks = markCurrent(MENU, {
      path: '/categories/home/ceramics',
      trail: HOME_CERAMICS,
    });
    expect(marks).toEqual([undefined, 'page', undefined, undefined]);
  });

  it('falls back to a menu that holds a category with no entry of its own', () => {
    const marks = markCurrent(MENU, {
      path: '/categories/home/knitwear',
      trail: ['/categories/home', '/categories/home/knitwear'],
    });
    expect(marks).toEqual(['true', undefined, undefined, undefined]);
  });

  it('marks the Journal for the Journal and for a story in it', () => {
    expect(markCurrent(MENU, { path: '/journal', trail: [] })).toEqual([
      undefined,
      undefined,
      'page',
      undefined,
    ]);
    expect(markCurrent(MENU, { path: '/journal/linen', trail: [] })).toEqual([
      undefined,
      undefined,
      'true',
      undefined,
    ]);
  });

  it('prefers the longest matching path, and an entry’s own link to a menu that merely holds it', () => {
    const nested: CurrentEntry[] = [
      { href: '/shop', menu: [] },
      { href: '/shop/mugs', menu: [] },
    ];
    expect(markCurrent(nested, { path: '/shop/mugs/tall', trail: [] })).toEqual([
      undefined,
      'true',
    ]);
    const held: CurrentEntry[] = [
      { href: '/shop', menu: ['/shop/mugs'] },
      { href: '/shop/mugs', menu: [] },
    ];
    expect(markCurrent(held, { path: '/shop/mugs', trail: [] })).toEqual([undefined, 'page']);
  });

  it('marks nothing when nothing matches, and never the home entry for every page', () => {
    const entries: CurrentEntry[] = [{ href: '/', menu: [] }, ...MENU];
    expect(markCurrent(entries, { path: '/nowhere', trail: [] })).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(markCurrent(entries, { path: '/', trail: [] })[0]).toBe('page');
  });

  it('never marks two entries', () => {
    for (const path of ['/journal/linen', '/categories/home/ceramics', '/about', '/x']) {
      const marks = markCurrent(MENU, { path, trail: HOME_CERAMICS });
      expect(marks.filter((mark) => mark !== undefined).length).toBeLessThanOrEqual(1);
    }
  });
});
