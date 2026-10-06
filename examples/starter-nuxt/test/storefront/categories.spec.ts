import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  buildCategoryIndex,
  categoryHref,
  categoryTrailFor,
  completeCategoryTerms,
  EMPTY_CATEGORY_INDEX,
  type CategoryRow,
} from '../../app/storefront/categories';

/**
 * `app/storefront/categories.ts` — the store's category tree, and the two things a theme does with
 * it: a product's breadcrumb trail and the parent rows the grid's category facet nests under.
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
  });

  it('reads nothing at all as an empty index rather than throwing', () => {
    expect(buildCategoryIndex(null).byId.size).toBe(0);
    expect(buildCategoryIndex(undefined).idBySlug.size).toBe(0);
  });
});

describe('a product’s category trail', () => {
  /** The whole point: root ancestor first, the product's own category last, every level a link. */
  it('walks root to leaf', () => {
    expect(categoryTrailFor(index, 'c-cup')).toEqual([
      { label: 'Tableware', href: '/products?category=tableware' },
      { label: 'Cup', href: '/products?category=cup' },
    ]);
  });

  it('is one level for a category that is its own root', () => {
    expect(categoryTrailFor(index, 'c-blankets')).toEqual([
      { label: 'Blankets & throws', href: '/products?category=blankets-throws' },
    ]);
  });

  /**
   * The three honest absences, all of them `[]`: a product with no category, a category the list does
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
   * A category whose ancestor chain is **broken** keeps the levels it could resolve rather than
   * dropping the lot: the shopper still reads "Cup", which is true, instead of no crumb at all.
   */
  it('stops at the first ancestor the list does not hold', () => {
    const orphaned = buildCategoryIndex([
      { id: 'c-cup', slug: 'cup', title: 'Cup', parentId: 'c-gone' },
    ]);
    expect(categoryTrailFor(orphaned, 'c-cup')).toEqual([
      { label: 'Cup', href: '/products?category=cup' },
    ]);
  });

  /** A `parentId` cycle is data, not an impossibility, and this walk runs inside a `computed` where a
   *  hang is the whole block. */
  it('does not hang on a parentId cycle', () => {
    const looped = buildCategoryIndex([
      { id: 'a', slug: 'a', title: 'A', parentId: 'b' },
      { id: 'b', slug: 'b', title: 'B', parentId: 'a' },
    ]);
    expect(categoryTrailFor(looped, 'a').map((crumb) => crumb.label)).toEqual(['B', 'A']);
  });

  it('does not hang on a category that is its own parent', () => {
    const selfish = buildCategoryIndex([{ id: 'a', slug: 'a', title: 'A', parentId: 'a' }]);
    expect(categoryTrailFor(selfish, 'a')).toEqual([{ label: 'A', href: '/products?category=a' }]);
  });

  /** A slug is content, so it goes into a query value encoded — not pasted into a URL. */
  it('encodes a slug into the catalogue’s own query', () => {
    expect(categoryHref('tea & coffee')).toBe('/products?category=tea%20%26%20coffee');
  });
});

describe('ancestorsOf', () => {
  it('is root first and excludes the category itself', () => {
    expect(ancestorsOf(index, 'c-cup').map((node) => node.slug)).toEqual(['tableware']);
    expect(ancestorsOf(index, 'c-tableware')).toEqual([]);
    expect(ancestorsOf(index, 'c-unknown')).toEqual([]);
  });
});

describe('completing a category facet into a tree', () => {
  /**
   * The platform counts the categories products are **assigned** to, which in a real store are the
   * leaves: a catalogue of cups and bowls answers two terms and never names Tableware. The parent row
   * a shopper wants to tick has to be synthesised, and the only place its slug and title exist is the
   * category list.
   */
  it('places every term and appends the ancestors the facet never named', () => {
    const completed = completeCategoryTerms(
      [
        { id: 'c-cup', slug: 'cup', title: 'Cup', count: 6 },
        { id: 'c-bowl', slug: 'bowl', title: 'Bowl', count: 4 },
      ],
      index
    );
    expect(completed).toEqual([
      { id: 'c-cup', slug: 'cup', title: 'Cup', count: 6, parentId: 'c-tableware' },
      { id: 'c-bowl', slug: 'bowl', title: 'Bowl', count: 4, parentId: 'c-tableware' },
      // Count 0 is not a claim: the panel rolls a parent's number up from its descendants
      // (`nestCategoryTerms`), and until the platform counts ancestors that is the only number there
      // is.
      {
        id: 'c-tableware',
        slug: 'tableware',
        title: 'Tableware',
        count: 0,
        parentId: null,
      },
    ]);
  });

  it('appends one ancestor once, however many of its children are listed', () => {
    const completed = completeCategoryTerms(
      [
        { id: 'c-cup', slug: 'cup', title: 'Cup', count: 6 },
        { id: 'c-bowl', slug: 'bowl', title: 'Bowl', count: 4 },
      ],
      index
    );
    expect(completed.filter((term) => term.id === 'c-tableware')).toHaveLength(1);
  });

  it('leaves an ancestor the facet already counted exactly as it came', () => {
    const completed = completeCategoryTerms(
      [
        { id: 'c-tableware', slug: 'tableware', title: 'Tableware', count: 2 },
        { id: 'c-cup', slug: 'cup', title: 'Cup', count: 6 },
      ],
      index
    );
    expect(completed).toHaveLength(2);
    expect(completed[0]).toMatchObject({ id: 'c-tableware', count: 2, parentId: null });
  });

  /**
   * **The platform's own placement wins.** A term that already carries a `parentId` is never
   * re-parented from a category list that may be a request older — and a response that places its own
   * terms is also one whose counts are rolled up (`CatalogFacets.categoryCounts`), which is why the
   * gateway skips this pass, and the category read with it, as soon as it sees one.
   */
  it('never re-parents a term the source already placed', () => {
    const completed = completeCategoryTerms(
      [{ id: 'c-cup', slug: 'cup', title: 'Cup', count: 6, parentId: null }],
      index
    );
    expect(completed[0]).toMatchObject({ parentId: null });
  });

  it('changes nothing without a tree to complete against', () => {
    const terms = [{ id: 'c-cup', slug: 'cup', title: 'Cup', count: 6 }];
    expect(completeCategoryTerms(terms, EMPTY_CATEGORY_INDEX)).toEqual(terms);
    expect(completeCategoryTerms([], index)).toEqual([]);
  });
});
