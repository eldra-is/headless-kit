import { afterEach, describe, expect, it } from 'vitest';
import {
  ORG_ID,
  PRODUCT_HANDLE,
  startMockGateway,
  type MockCatalogContract,
  type MockGateway,
} from './support/mockGateway';

/**
 * **The mock gateway's two category shapes are a pair, and this is what keeps them one.**
 *
 * The category facet changed in public contract 3.8.0 in three places at once: the terms gained
 * `parentId`, their counts became roll-ups over each subtree, and `categoryId` began matching the
 * whole subtree. Before it, all three were the other way. A fixture mixing halves — flat facets with
 * an expanding filter, say — models a gateway that has never existed, and the theme's own flat
 * fallback (`blocks/collection-grid/parts/groups.ts`'s `rawValuesFor`, which offers a parent row only
 * on a rolled-up family) is then tested against a gateway that would have honoured it anyway. That
 * is exactly the combination the fixture used to be in.
 *
 * So the fixture answers one contract at a time (`MockCatalogContract`) and this spec pins both,
 * over HTTP, against the server the generate tests use — no browser and no `nuxi generate`, so it
 * costs a second rather than a minute.
 *
 * The fixture's own tree is `Tableware` → `Cups`, with every product assigned to `Cups`.
 */
describe.each<MockCatalogContract>(['3.8.0', '3.7.0'])(
  'the mock gateway on public contract %s',
  (contract) => {
    let gateway: MockGateway | undefined;

    afterEach(async () => {
      await gateway?.close();
      gateway = undefined;
    });

    interface FacetTerm {
      id: string;
      slug: string;
      title: string;
      count: number;
      parentId?: string | null;
    }

    async function list(query = ''): Promise<{ total: number; categories: FacetTerm[] }> {
      gateway ??= await startMockGateway({ catalogContract: contract });
      const response = await fetch(
        `${gateway.url}/catalog/v1/products/list?facets=true&pageSize=100${query}`,
        { headers: { 'X-Org-Id': ORG_ID } }
      );
      const body = (await response.json()) as {
        meta: { total: number };
        facets?: { categories?: FacetTerm[] };
      };
      return { total: body.meta.total, categories: body.facets?.categories ?? [] };
    }

    /** The whole catalogue, so the counts below are the fixture's own product count. */
    it('counts every product under the category it is assigned to', async () => {
      const { total, categories } = await list();
      expect(total).toBeGreaterThan(0);
      const cups = categories.find((term) => term.slug === 'cups');
      expect(cups?.count).toBe(total);
    });

    if (contract === '3.8.0') {
      /**
       * Placed, rolled up and depth-first by title: `Tableware` is named even though nothing is
       * assigned to it directly, carries its whole subtree's count, and `parentId` is **absent** on
       * it because the contract omits the key for a root.
       */
      it('names every ancestor, placed and counted over its subtree', async () => {
        const { total, categories } = await list();
        expect(categories.map((term) => term.slug)).toEqual(['tableware', 'cups']);
        expect(categories[0]).toMatchObject({ slug: 'tableware', count: total });
        expect('parentId' in categories[0]!).toBe(false);
        expect(categories[1]).toMatchObject({ slug: 'cups', parentId: 'cat-tableware' });
      });

      /** The other half of the same change, and the one the panel's parent row depends on. */
      it('matches a parent categoryId over the whole subtree', async () => {
        const unfiltered = await list();
        expect((await list('&categoryId=cat-tableware')).total).toBe(unfiltered.total);
        expect((await list('&categoryId=cat-cups')).total).toBe(unfiltered.total);
      });
    } else {
      /** Flat: only the categories products are assigned to, with no placement at all — so the panel
       *  offers no parent row, which is the only honest answer against this filter. */
      it('names only the assigned categories, unplaced', async () => {
        const { categories } = await list();
        expect(categories.map((term) => term.slug)).toEqual(['cups']);
        expect(categories.every((term) => !('parentId' in term))).toBe(true);
      });

      /** The reason the family has to stay flat: ticking `Tableware` here returns nothing. */
      it('matches a parent categoryId by direct membership only', async () => {
        const unfiltered = await list();
        expect((await list('&categoryId=cat-tableware')).total).toBe(0);
        expect((await list('&categoryId=cat-cups')).total).toBe(unfiltered.total);
      });
    }

    /** The category *list* is the trail's source and is the same under both contracts — it has always
     *  carried `parentId`, which is why a product page's crumb does not depend on the facet shape. */
    it('answers the whole category tree from the category list either way', async () => {
      gateway ??= await startMockGateway({ catalogContract: contract });
      const rows = (await (
        await fetch(`${gateway.url}/catalog/v1/categories`, { headers: { 'X-Org-Id': ORG_ID } })
      ).json()) as Array<{ slug: string; parentId: string | null }>;
      expect(rows.map((row) => [row.slug, row.parentId])).toEqual([
        ['tableware', null],
        ['cups', 'cat-tableware'],
      ]);
      const detail = (await (
        await fetch(`${gateway.url}/catalog/v1/products/${PRODUCT_HANDLE}`, {
          headers: { 'X-Org-Id': ORG_ID },
        })
      ).json()) as { primaryCategoryId?: string };
      expect(detail.primaryCategoryId).toBe('cat-cups');
    });
  }
);
