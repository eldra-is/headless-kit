import { describe, expect, it } from 'vitest';
import { resolvePagePath, type PageLike } from '../pagePath';
import { encodeStega } from '../stega';

const p = (id: string, slug: string, parent?: string | { id: string }): PageLike => ({
  id,
  data: parent === undefined ? { slug } : { slug, parent },
});

describe('resolvePagePath (contracts §6)', () => {
  it('"home" with no parent maps to "/"', () => {
    const home = p('h', 'home');
    expect(resolvePagePath(home, [home])).toBe('/');
  });
  it('root page: /about', () => {
    const about = p('a', 'about');
    expect(resolvePagePath(about, [about])).toBe('/about');
  });
  it('ancestor chain parent-first: /about/team/leads', () => {
    const about = p('a', 'about');
    const team = p('t', 'team', 'a');
    const leads = p('l', 'leads', { id: 't' }); // resolved-object parent form
    expect(resolvePagePath(leads, [about, team, leads])).toBe('/about/team/leads');
  });
  it('children of root "home" elide the home segment: /pricing', () => {
    const home = p('h', 'home');
    const pricing = p('p', 'pricing', 'h');
    expect(resolvePagePath(pricing, [home, pricing])).toBe('/pricing');
  });
  it('strips stega from slugs before building the path', () => {
    const page: PageLike = {
      id: 'x',
      data: { slug: encodeStega('contact', { entryId: 'x', fieldPath: 'slug', locale: null }) },
    };
    expect(resolvePagePath(page, [page])).toBe('/contact');
  });
  it('throws on parent cycles', () => {
    const a = p('a', 'a', 'b');
    const b = p('b', 'b', 'a');
    expect(() => resolvePagePath(a, [a, b])).toThrow(/cycle/);
  });
});
