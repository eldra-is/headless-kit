import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  buildCategoryIndex,
  categoryTrailFor,
  childrenOf,
  EMPTY_CATEGORY_INDEX,
  isInSubtree,
  pathOf,
  type CategoryRow,
} from '../../app/storefront/categories';
import { categoryHref } from '../../app/utils/links';

/**
 * `app/storefront/categories.ts` — the store's category tree, and what a theme does with it: a
 * product's breadcrumb trail, the category page's own trail and child strip, the canonical path
 * every category link is addressed by, and the slug→id lookup a `category` filter and the demo's own
 * parent expansion both go through.
 *
 * It is pure, so everything here is the real code with no client, no Vue and no mounting: the same
 * walk both storefront sources run.
 *
 * The tree under test is the one a real store has (and the one the live org answers with):
 * `Tableware` over `Cup`/`Bowl`/`Dish`, `Blankets & throws` a root with nothing under it.
 */
const TREE: CategoryRow[] = [
  { id: 'c-tableware', slug: 'tableware', title: 'Tableware', parentId: null },
  { id: 'c-cup', slug: 'cup', title: 'Cup', parentId: 'c-tableware' },
  { id: 'c-bowl', slug: 'bowl', title: 'Bowl', parentId: 'c-tableware' },
  { id: 'c-blankets', slug: 'blankets-throws', title: 'Blankets & throws' },
];

const index = buildCategoryIndex(TREE);

describe('the category index', () => {
  it('indexes every usable row by id and by slug', () => {
    expect(index.byId.size).toBe(4);
    expect(index.idBySlug.get('cup')).toBe('c-cup');
    expect(index.byId.get('c-cup')).toEqual({
      id: 'c-cup',
      slug: 'cup',
      title: 'Cup',
      parentId: 'c-tableware',
    });
  });

  /** An absent `parentId` is a root — which is what a gateway answering a contract with no tree
   *  sends for every row, and what keeps that store's categories a flat list rather than nothing. */
  it('reads a missing parentId as a root', () => {
    expect(index.byId.get('c-blankets')?.parentId).toBeNull();
  });

  /**
   * **The canonical path is the ancestors' slugs, root first, then the category's own** — the one
   * path the category route answers, both ways round so a route can resolve what a link built.
   */
  it('indexes every placeable row by its canonical path, both ways', () => {
    expect(pathOf(index, 'c-cup')).toBe('tableware/cup');
    expect(pathOf(index, 'c-tableware')).toBe('tableware');
    expect(pathOf(index, 'c-blankets')).toBe('blankets-throws');
    expect(index.idByPath.get('tableware/cup')).toBe('c-cup');
    // Not a path at all: a leaf's own slug is only a path for a root.
    expect(index.idByPath.has('cup')).toBe(false);
  });

  it('has no path for a category it cannot place, and none for an unknown id', () => {
    const orphaned = buildCategoryIndex([
      { id: 'c-cup', slug: 'cup', title: 'Cup', parentId: 'c-gone' },
      { id: 'c-real', slug: 'real', title: 'Real', parentId: null },
    ]);
    expect(pathOf(orphaned, 'c-cup')).toBeNull();
    expect(pathOf(orphaned, 'c-real')).toBe('real');
    expect(pathOf(index, 'c-vanished')).toBeNull();
    expect(pathOf(index, null)).toBeNull();
    expect(pathOf(index, '')).toBeNull();
  });

  /** A `parentId` cycle is data, not an impossibility, and these walks run inside a `computed`
   *  where a hang is the whole block. Neither member of the cycle reaches a root, so neither has a
   *  page. */
  it('gives a parentId cycle no path rather than hanging', () => {
    const looped = buildCategoryIndex([
      { id: 'a', slug: 'a', title: 'A', parentId: 'b' },
      { id: 'b', slug: 'b', title: 'B', parentId: 'a' },
      { id: 'c', slug: 'c', title: 'C', parentId: null },
    ]);
    expect([...looped.idByPath.keys()]).toEqual(['c']);
    const selfish = buildCategoryIndex([{ id: 'a', slug: 'a', title: 'A', parentId: 'a' }]);
    expect(pathOf(selfish, 'a')).toBeNull();
  });

  /**
   * A row is only usable with all three of an id, a slug and a title: a trail labelled with a uuid,
   * or a filter spelled with an empty slug, is worse than no row at all.
   */
  it('drops a row missing an id, a slug or a title', () => {
    const sparse = buildCategoryIndex([
      { id: '', slug: 'nameless', title: 'Nameless' },
      { id: 'c-1', slug: '', title: 'No slug' },
      { id: 'c-2', slug: 'no-title', title: '' },
      { slug: 'no-id', title: 'No id' },
      { id: 'c-3', slug: 'real', title: 'Real' },
    ]);
    expect([...sparse.byId.keys()]).toEqual(['c-3']);
    expect([...sparse.idBySlug.keys()]).toEqual(['real']);
  });

  it('keeps the first row of a duplicated slug, as the slug lookup always did', () => {
    const duplicated = buildCategoryIndex([
      { id: 'c-first', slug: 'cup', title: 'Cup' },
      { id: 'c-second', slug: 'cup', title: 'Cup (old)' },
    ]);
    expect(duplicated.idBySlug.get('cup')).toBe('c-first');
    // And the first of a duplicated *path*: two roots spelled the same are one page, and no URL
    // could reach the second whatever this did.
    expect(duplicated.idByPath.get('cup')).toBe('c-first');
  });

  it('reads nothing at all as an empty index rather than throwing', () => {
    expect(buildCategoryIndex(null).byId.size).toBe(0);
    expect(buildCategoryIndex(undefined).idBySlug.size).toBe(0);
    expect(buildCategoryIndex(undefined).idByPath.size).toBe(0);
  });
});

describe('a product’s category trail', () => {
  /** The whole point: root ancestor first, the product's own category last, every level a link to
   *  that level's own category page. */
  it('walks root to leaf, each level its own canonical path', () => {
    expect(categoryTrailFor(index, 'c-cup')).toEqual([
      { label: 'Tableware', href: '/categories/tableware' },
      { label: 'Cup', href: '/categories/tableware/cup' },
    ]);
  });

  it('is one level for a category that is its own root', () => {
    expect(categoryTrailFor(index, 'c-blankets')).toEqual([
      { label: 'Blankets & throws', href: '/categories/blankets-throws' },
    ]);
  });

  /**
   * The honest absences, all of them `[]`: a product with no category, a category the list does
   * not hold (unpublished since, or a list this read could not reach), and an index that is empty
   * because the read failed. A product page without a category crumb is a page; one with a crumb
   * reading `undefined` is a bug, so there is no fallback label anywhere in this file.
   */
  it('is empty for a product with no category', () => {
    expect(categoryTrailFor(index, null)).toEqual([]);
    expect(categoryTrailFor(index, undefined)).toEqual([]);
    expect(categoryTrailFor(index, '')).toEqual([]);
  });

  it('is empty for a category the store’s list does not hold', () => {
    expect(categoryTrailFor(index, 'c-vanished')).toEqual([]);
  });

  it('is empty when the category read answered nothing', () => {
    expect(categoryTrailFor(EMPTY_CATEGORY_INDEX, 'c-cup')).toEqual([]);
  });

  /**
   * A category whose ancestor chain is **broken** now gets no trail at all, where it used to keep
   * the levels it could resolve. That is the canonical-path route's doing rather than a loss: with
   * the parent gone there is no canonical path for the leaf either, so the one crumb this used to
   * draw would have linked to a page the site answers with its not-found shell.
   */
  it('is empty for a category whose ancestor the list does not hold', () => {
    const orphaned = buildCategoryIndex([
      { id: 'c-cup', slug: 'cup', title: 'Cup', parentId: 'c-gone' },
    ]);
    expect(categoryTrailFor(orphaned, 'c-cup')).toEqual([]);
  });
});

describe('categoryHref', () => {
  /** A slug is content, so every segment is encoded — and the separators survive, because they are
   *  what makes the path nested. */
  it('encodes each segment of a canonical path and keeps the separators', () => {
    expect(categoryHref('tableware/cup')).toBe('/categories/tableware/cup');
    expect(categoryHref('tea & coffee/dark roast')).toBe(
      '/categories/tea%20%26%20coffee/dark%20roast'
    );
    expect(categoryHref('bílinn/bílstólar')).toBe('/categories/b%C3%ADlinn/b%C3%ADlst%C3%B3lar');
  });

  it('never builds a path with an empty segment', () => {
    expect(categoryHref('')).toBe('/categories');
    expect(categoryHref('/tableware/')).toBe('/categories/tableware');
    expect(categoryHref('a//b')).toBe('/categories/a/b');
  });
});

describe('ancestorsOf', () => {
  it('is root first and excludes the category itself', () => {
    expect(ancestorsOf(index, 'c-cup').map((node) => node.slug)).toEqual(['tableware']);
    expect(ancestorsOf(index, 'c-tableware')).toEqual([]);
    expect(ancestorsOf(index, 'c-unknown')).toEqual([]);
  });
});

describe('childrenOf', () => {
  /** One level, in the list's own order: a grandchild belongs on its own parent's page. */
  it('is the direct children only, in list order', () => {
    expect(childrenOf(index, 'c-tableware').map((node) => node.slug)).toEqual(['cup', 'bowl']);
    expect(childrenOf(index, 'c-cup')).toEqual([]);
    expect(childrenOf(index, 'c-unknown')).toEqual([]);
    expect(childrenOf(index, '')).toEqual([]);
  });

  it('leaves out a child that has no page to link to', () => {
    const broken = buildCategoryIndex([
      { id: 'root', slug: 'root', title: 'Root', parentId: 'gone' },
      { id: 'child', slug: 'child', title: 'Child', parentId: 'root' },
    ]);
    expect(childrenOf(broken, 'root')).toEqual([]);
  });
});

describe('isInSubtree', () => {
  /**
   * The test a category page's own scope is held to: the platform's `categoryId` filter matches a
   * whole subtree, so a ticked value outside it would widen the page past its own category rather
   * than narrow it.
   */
  it('is true for the category itself and for a descendant, false otherwise', () => {
    expect(isInSubtree(index, 'c-tableware', 'c-tableware')).toBe(true);
    expect(isInSubtree(index, 'c-cup', 'c-tableware')).toBe(true);
    expect(isInSubtree(index, 'c-tableware', 'c-cup')).toBe(false);
    expect(isInSubtree(index, 'c-blankets', 'c-tableware')).toBe(false);
    expect(isInSubtree(index, 'c-unknown', 'c-tableware')).toBe(false);
    expect(isInSubtree(index, '', 'c-tableware')).toBe(false);
    expect(isInSubtree(index, 'c-cup', '')).toBe(false);
  });
});
