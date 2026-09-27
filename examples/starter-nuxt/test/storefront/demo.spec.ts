import { nextTick, ref } from 'vue';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createDemoStorefront, demoCollectionId, PRODUCTS } from '../../app/storefront/demo';
import type {
  StorefrontCollectionInfo,
  StorefrontCollectionSelector,
  StorefrontOrder,
  StorefrontProduct,
  StorefrontProductListItem,
  StorefrontSearchResponse,
} from '../../app/storefront/types';

// Two ticks: the internal `StorefrontResult` resolves its own `await nextTick()` (registered
// during the synchronous, `immediate: true` watcher this file's call already triggered), and the
// second tick is slack for that microtask to have actually run before the assertion.
async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('createDemoStorefront', () => {
  it('the catalogue satisfies StorefrontProductListItem — real under pnpm typecheck', () => {
    expectTypeOf(PRODUCTS).toEqualTypeOf<StorefrontProductListItem[]>();
    expect(PRODUCTS).toHaveLength(12);
  });

  it('contains the spec Northwind products with their prices, in minor units', () => {
    const byTitle = new Map(PRODUCTS.map((product) => [product.title, product]));

    expect(byTitle.get('Merino crew sweater')?.price).toEqual({ amount: 9600, compareAt: 12800 });
    expect(byTitle.get('Fisherman rib cardigan')?.price.amount).toBe(16400);
    expect(byTitle.get('Lambswool throw blanket')?.price.amount).toBe(14800);
    expect(byTitle.get('Ribbed lambswool beanie')?.price.amount).toBe(3800);
    expect(byTitle.get('Linen tea towels, pair')?.price.amount).toBe(2400);
    expect(byTitle.get('Speckled latte mug')?.price.amount).toBe(2800);
    expect(byTitle.get('Stoneware dinner plates, set of 4')?.price.amount).toBe(7200);
    expect(byTitle.get('Walnut serving board')?.price.amount).toBe(5800);
    expect(byTitle.get('Hand-thrown serving bowl')?.price.amount).toBe(6400);
    expect(byTitle.get('Glazed milk jug')?.price.amount).toBe(3400);
    expect(byTitle.get('Linen napkins, set of 4')?.price.amount).toBe(4000);
    expect(byTitle.get('Stonewashed linen throw')?.price.amount).toBe(11800);
  });

  it('"Linen tea towels, pair" is sold out; everything else defaults to in stock', () => {
    const byTitle = new Map(PRODUCTS.map((product) => [product.title, product]));
    const soldOut = byTitle.get('Linen tea towels, pair')!;
    expect(soldOut.stock).toBe('out');
    expect(soldOut.available).toBe(false);

    const inStock = byTitle.get('Merino crew sweater')!;
    expect(inStock.stock).toBe('in');
    expect(inStock.available).toBe(true);
  });

  it("the merino crew sweater's full product record has Colour and Size options", async () => {
    const storefront = createDemoStorefront();
    const handle = ref<string | null>('merino-crew-sweater');
    const result = storefront.catalog.product(handle);
    expectTypeOf(result.data.value).toEqualTypeOf<StorefrontProduct | null>();
    await settle();

    const product = result.data.value;
    expect(product).not.toBeNull();
    const colour = product!.options.find((option) => option.label === 'Colour');
    expect(colour?.values.map((value) => value.label)).toEqual(['Oat', 'Charcoal', 'Clay', 'Moss']);
    expect(colour?.values.find((value) => value.label === 'Moss')?.available).toBe(false);
    expect(colour?.values.filter((value) => value.available)).toHaveLength(3);

    const size = product!.options.find((option) => option.label === 'Size');
    expect(size?.values.map((value) => value.label)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(size?.values.find((value) => value.label === 'XL')?.available).toBe(false);
    expect(size?.values.filter((value) => value.available)).toHaveLength(4);
  });

  it('has the "Winter knitwear" collection with 48 products', async () => {
    const storefront = createDemoStorefront();
    const handle = ref<string | null>('winter-knitwear');
    const result = storefront.catalog.collection(handle);
    expectTypeOf(result.data.value).toEqualTypeOf<StorefrontCollectionInfo | null>();
    await settle();
    expect(result.data.value).toMatchObject({ title: 'Winter knitwear', productCount: 48 });
  });

  it('has "The winter edit" collection with 48 products', async () => {
    const storefront = createDemoStorefront();
    const handle = ref<string | null>('the-winter-edit');
    const result = storefront.catalog.collection(handle);
    await settle();
    expect(result.data.value).toMatchObject({ title: 'The winter edit', productCount: 48 });
  });

  it('order NW-10482 (shipped) matches the spec default content', async () => {
    const storefront = createDemoStorefront();
    const token = ref<string | null>('demo-order-token');
    const result = storefront.orders.current(token);
    expectTypeOf(result.data.value).toEqualTypeOf<StorefrontOrder | null>();
    await settle();

    const order = result.data.value;
    expect(order).not.toBeNull();
    expect(order!.number).toBe('NW-10482');
    expect(order!.status).toBe('shipped');
    expect(order!.placedAt).toBe('2026-09-18');
    expect(order!.itemCount).toBe(4);
    expect(order!.carrier).toBe('UPS Standard');
    expect(order!.eta).toBe('Thursday 26 September');
    expect(order!.trackingNumber).toBe('1Z 999 AA1 01 2345 6784');
    expect(order!.totals).toEqual({
      subtotal: 24400,
      discount: null,
      shipping: 0,
      tax: 1952,
      total: 26352,
    });
    expect(order!.shippingAddress).toEqual([
      'Maren Holt',
      '214 Linden Street, Apt 3B',
      'Portland, OR 97209',
      'United States',
    ]);
    expect(order!.payment).toEqual({ brand: 'Visa', last4: '4242' });
  });

  it('createDemoStorefront({ orderStatus }) switches the order fixture', async () => {
    const storefront = createDemoStorefront({ orderStatus: 'cancelled' });
    const token = ref<string | null>('demo-order-token');
    const result = storefront.orders.current(token);
    await settle();
    expect(result.data.value?.status).toBe('cancelled');
    expect(result.data.value?.cancelNote).toContain('Cancelled at your request on 19 September');
  });

  it('the "linen" search response matches only the products, journal articles and pages that mention it', async () => {
    const storefront = createDemoStorefront();
    const query = ref('linen');
    const result = storefront.search.run(query);
    expectTypeOf(result.data.value).toEqualTypeOf<StorefrontSearchResponse | null>();
    await settle();

    const response = result.data.value;
    expect(response).not.toBeNull();
    expect(response!.query).toBe('linen');
    // Linen tea towels, pair · Linen napkins, set of 4 · Stonewashed linen throw.
    expect(response!.products.map((p) => p.title)).toEqual([
      'Linen tea towels, pair',
      'Linen napkins, set of 4',
      'Stonewashed linen throw',
    ]);
    // "A visit to the Kortrijk flax mill" mentions neither "linen" nor its own category.
    expect(response!.articles).toHaveLength(2);
    // Both pages mention linen, one in its title and one only in its snippet.
    expect(response!.pages).toHaveLength(2);
    expect(response!.total).toBe(
      response!.products.length + response!.articles.length + response!.pages.length
    );
    expect(response!.suggestion).toBeNull();
  });

  it('matches case-insensitively on a product title', async () => {
    const storefront = createDemoStorefront();
    const query = ref('MERINO');
    const result = storefront.search.run(query);
    await settle();
    const response = result.data.value!;
    expect(response.products.map((p) => p.handle)).toEqual(['merino-crew-sweater']);
    expect(response.articles).toHaveLength(0);
    expect(response.pages).toHaveLength(0);
    expect(response.total).toBe(1);
  });

  it('an empty query returns an empty response', async () => {
    const storefront = createDemoStorefront();
    const query = ref('');
    const result = storefront.search.run(query);
    await settle();
    expect(result.data.value).toEqual({
      query: '',
      total: 0,
      products: [],
      articles: [],
      pages: [],
      suggestion: null,
    });
  });

  it('a near-miss query with no results gets a "did you mean" suggestion', async () => {
    const storefront = createDemoStorefront();
    const query = ref('linnen napkns');
    const result = storefront.search.run(query);
    await settle();
    const response = result.data.value!;
    expect(response.total).toBe(0);
    expect(response.suggestion).toBe('linen napkins');
  });

  it('a query that matches nothing at all in the catalogue gets no suggestion', async () => {
    const storefront = createDemoStorefront();
    const query = ref('xyzxyzxyz');
    const result = storefront.search.run(query);
    await settle();
    const response = result.data.value!;
    expect(response.total).toBe(0);
    expect(response.suggestion).toBeNull();
  });

  it('the "best-sellers" collection satisfies catalog.collectionProducts, leading with the spec\'s named products', async () => {
    const storefront = createDemoStorefront();
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'best-sellers' });
    const opts = ref({ page: 1, pageSize: 4 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();
    const response = result.data.value;
    expect(response).not.toBeNull();
    expect(response!.total).toBeGreaterThanOrEqual(4);
    expect(response!.items.length).toBe(4);
    expect(response!.items.map((item) => item.title).slice(0, 2)).toEqual([
      'Merino crew sweater',
      'Speckled latte mug',
    ]);
  });

  /** A `reference` field stores the collection's id, so the demo fixture has to
   *  answer an id the same way the gateway does — otherwise every builder preview
   *  of a picked collection would render empty. */
  it('resolves a collection id from its own fixture, like the gateway does', async () => {
    const storefront = createDemoStorefront();
    const id = demoCollectionId('best-sellers');
    expect(id).not.toBeNull();
    const collection = ref<StorefrontCollectionSelector | null>({ id: id! });
    const opts = ref({ page: 1, pageSize: 2 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();
    expect(result.data.value!.items.map((item) => item.title)).toEqual([
      'Merino crew sweater',
      'Speckled latte mug',
    ]);
  });

  it('resolves nothing for a collection id it does not know — never an error', async () => {
    const storefront = createDemoStorefront();
    const collection = ref<StorefrontCollectionSelector | null>({
      id: '00000000-0000-4000-8000-000000000000',
    });
    const opts = ref({ page: 1, pageSize: 2 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();
    expect(result.data.value).toBeNull();
    expect(result.error.value).toBeNull();
  });

  /**
   * D1 made `search.run(query)` honour the query text; `collectionProducts` was left behind and
   * destructured only `{ page, pageSize }`, so in the scaffolded site and the collection sample page
   * — both demo-backed — a filter or a sort changed the URL, the chips and the active-filter row
   * while the grid and the `total` stayed exactly as they were, and the filter drawer's
   * "Show N products" button always quoted the unfiltered count. These are the assertions for it,
   * in the same shape as the `search.run` ones above: drive the real request, read the real answer.
   */
  describe('collectionProducts honours sort and filters', () => {
    async function collection(opts: {
      page?: number;
      pageSize?: number;
      sort?: string;
      filters?: Record<string, string[]>;
    }) {
      const storefront = createDemoStorefront();
      const selected = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
      const options = ref({ page: 1, pageSize: 48, ...opts });
      const result = storefront.catalog.collectionProducts(selected, options);
      await settle();
      return result.data.value!;
    }

    it('returns the whole 48-item collection unfiltered', async () => {
      const response = await collection({});
      expect(response.items).toHaveLength(48);
      expect(response.total).toBe(48);
    });

    it('narrows both the items and the total for a category filter', async () => {
      // 5 of the 12 products are knitwear, each appearing 4 times in the 48-item collection.
      const response = await collection({ filters: { category: ['knitwear'] } });
      expect(response.items).toHaveLength(20);
      expect(response.total).toBe(20);
    });

    it('ORs values inside one source and ANDs across sources', async () => {
      const knitwear = await collection({ filters: { category: ['knitwear'] } });
      const ceramics = await collection({ filters: { category: ['ceramics'] } });
      const both = await collection({ filters: { category: ['knitwear', 'ceramics'] } });
      expect(both.total).toBe(knitwear.total + ceramics.total);

      const andACross = await collection({
        filters: { category: ['knitwear'], 'option:size': ['m'] },
      });
      // Only the three apparel products are made in M, and all three are knitwear.
      expect(andACross.total).toBe(12);
    });

    it('filters by size, colour and availability', async () => {
      expect((await collection({ filters: { 'option:size': ['m'] } })).total).toBe(12);
      // Oat is only the merino crew sweater's colour, four times over.
      expect((await collection({ filters: { 'option:colour': ['oat'] } })).total).toBe(4);
      // Everything but the sold-out linen tea towels.
      expect((await collection({ filters: { availability: ['in-stock'] } })).total).toBe(44);
    });

    it('filters by a price range in whole dollars, with either end open', async () => {
      const upTo40 = await collection({ filters: { price: ['-40'] } });
      expect(upTo40.items.every((item) => item.price.amount <= 4000)).toBe(true);
      const from100 = await collection({ filters: { price: ['100-'] } });
      expect(from100.items.every((item) => item.price.amount >= 10000)).toBe(true);
      const band = await collection({ filters: { price: ['30-60'] } });
      expect(
        band.items.every((item) => item.price.amount >= 3000 && item.price.amount <= 6000)
      ).toBe(true);
      expect(band.total).toBeGreaterThan(0);
      expect(band.total).toBeLessThan(48);
    });

    it('ignores a filter source it does not know rather than emptying the grid', async () => {
      expect((await collection({ filters: { 'option:fabric': ['linen'] } })).total).toBe(48);
    });

    it('sorts by price ascending and descending', async () => {
      const asc = await collection({ sort: 'price-asc' });
      const desc = await collection({ sort: 'price-desc' });
      expect(asc.items[0]!.price.amount).toBe(2400);
      expect(asc.items.at(-1)!.price.amount).toBe(16400);
      expect(desc.items[0]!.price.amount).toBe(16400);
      expect(asc.items.map((item) => item.price.amount)).toEqual(
        [...desc.items.map((item) => item.price.amount)].reverse()
      );
    });

    it('leaves `featured` in the collection\u2019s own order and reverses it for `newest`', async () => {
      const featured = await collection({ sort: 'featured' });
      const newest = await collection({ sort: 'newest' });
      const unsorted = await collection({});
      expect(featured.items.map((item) => item.handle)).toEqual(
        unsorted.items.map((item) => item.handle)
      );
      expect(newest.items.map((item) => item.handle)).toEqual(
        [...unsorted.items.map((item) => item.handle)].reverse()
      );
    });

    it('leads `best-selling` with the best-seller list, clones included', async () => {
      const response = await collection({ sort: 'best-selling' });
      // The demo's best-seller list names 6 products; each appears 4 times in the 48-item
      // collection, so the first 24 items are exactly those six (identified by title — a clone
      // carries a suffixed handle but the same title), and the merino crew sweater leads.
      expect(response.items[0]!.title).toBe('Merino crew sweater');
      const leading = new Set(response.items.slice(0, 24).map((item) => item.title));
      expect([...leading].sort()).toEqual(
        [
          'Hand-thrown serving bowl',
          'Merino crew sweater',
          'Ribbed lambswool beanie',
          'Speckled latte mug',
          'Stoneware dinner plates, set of 4',
          'Walnut serving board',
        ].sort()
      );
    });

    it('sorts and filters together, and pages the filtered result', async () => {
      const response = await collection({
        page: 2,
        pageSize: 8,
        sort: 'price-asc',
        filters: { category: ['knitwear'] },
      });
      expect(response.total).toBe(20);
      expect(response.items).toHaveLength(8);
      const prices = response.items.map((item) => item.price.amount);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });

    it('counts every facet value over the collection, so the grid never offers an empty filter', async () => {
      const response = await collection({});
      for (const facet of response.facets) {
        for (const value of facet.values) {
          const filtered = await collection({
            filters: {
              [facet.source === 'size'
                ? 'option:size'
                : facet.source === 'colour'
                  ? 'option:colour'
                  : facet.source]: [value.value],
            },
          });
          expect(
            value.count,
            `facet ${facet.source}=${value.value} claims ${value.count} but returns ${filtered.total}`
          ).toBe(filtered.total);
        }
      }
    });
  });

  describe('StorefrontRoute readers', () => {
    it('seeds sort, columns and filters from DemoStorefrontOptions — a shared URL restored', () => {
      const storefront = createDemoStorefront({
        sort: 'price-asc',
        columns: '2',
        filters: { category: ['knitwear'], minPrice: ['20'] },
      });
      expect(storefront.route.sort).toBe('price-asc');
      expect(storefront.route.columns).toBe('2');
      expect(storefront.route.filters).toEqual({ category: ['knitwear'], minPrice: ['20'] });
    });

    it('defaults sort/columns to null and filters to an empty bag, like page defaults to 1', () => {
      const storefront = createDemoStorefront();
      expect(storefront.route.sort).toBeNull();
      expect(storefront.route.columns).toBeNull();
      expect(storefront.route.filters).toEqual({});
      expect(storefront.route.page).toBe(1);
    });

    it('setQuery writes sort/columns/filters back the same generic way it writes q/page', () => {
      const storefront = createDemoStorefront();
      storefront.route.setQuery({
        sort: 'newest',
        columns: '4',
        category: ['knitwear', 'ceramics'],
        minPrice: '10',
      });
      expect(storefront.route.sort).toBe('newest');
      expect(storefront.route.columns).toBe('4');
      expect(storefront.route.filters).toEqual({
        category: ['knitwear', 'ceramics'],
        minPrice: ['10'],
      });

      // `null` clears a key, the same as it does for `q`.
      storefront.route.setQuery({ sort: null, category: null });
      expect(storefront.route.sort).toBeNull();
      expect(storefront.route.filters).toEqual({ minPrice: ['10'] });
    });
  });
});
