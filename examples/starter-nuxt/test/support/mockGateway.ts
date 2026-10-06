import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { seedLayout } from '@eldrajs/vite-plugin-theme';
import { starterPages, starterTemplateRoles, starterTemplates } from '../../app/templates';

/**
 * A mock Eldra gateway for the starter's own `nuxi generate` + static-serve tests — the same
 * shape `packages/theme-nuxt/test/mockGateway.ts` takes, extended with the **catalog** endpoints
 * the storefront reads (`app/storefront/gateway.ts`) and with a settable answer delay, so a
 * browser driving the generated site can observe the post-hydration refresh while it is in
 * flight.
 *
 * Two roles in one server, deliberately: `nuxi generate` reads the CMS route templates and the
 * catalog through it, and the **browser** then reads the catalog through the same origin, so the
 * request list a test collects is the whole conversation a real visitor's page has.
 *
 * The route templates are the starter's own (`app/templates.ts`'s `starterTemplates()`, laid out
 * by `@eldrajs/vite-plugin-theme`'s `seedLayout`), with the `header`/`footer` role nodes resolved
 * to ordinary block nodes carrying `starterTemplateRoles()`'s data — a role resolves to the site's
 * own reusable component, which a mock gateway has no concept of, and the rendered page must still
 * carry the navigation and footer a real one does (`navigation` creates a storefront result of its
 * own, so leaving it out would change the very ordering these tests are about). Everything else —
 * which blocks a product page carries, which fields the catalog seed strips — is exactly what Core
 * seeds a real site with.
 *
 * **Three Core behaviours are encoded by hand here**, because a mock has no Core to ask. Each is a
 * second copy of a rule that really lives in Core, so if Core changes one the generated page
 * renders as `data-eldra-invalid-layout` — silently — and a reader has to rediscover why:
 *
 *  1. a `reusable` role node resolves to the site's own header/footer component
 *     (`routeTemplateEntries`);
 *  2. a seed node carrying `templates`/`bindings` becomes a `template-block` node naming its
 *     `apiId`, its block entry addressed by uuid (`routeTemplateEntries`);
 *  3. a CMS **page** document is a **version-2** layout envelope of ordinary `block` nodes, and a
 *     no-parent page whose slug is `home` is the site root `/` (`pageEntries`);
 *  4. a theme's **page seed** becomes such a page — one per `pageSeeds[]` entry, its blocks in the
 *     seed's own order, each `@header`/`@footer` placement resolved to the site's own role
 *     component and each `required` block's node carrying `locked: true` (`pageEntries`).
 */

const ORG_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

/** A stable v4-shaped uuid per block index — a layout node's `entryId` must be one. */
const blockUuid = (index: number): string =>
  `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`;

/** The home page's block entries start here, so a page block id can never collide with a
 * template block id — the mount counter keys by entry id. */
const PAGE_BLOCK_UUID_OFFSET = 100;

interface MockVariant {
  id: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  status: string;
}

interface MockProduct {
  id: string;
  slug: string;
  title: string;
  status: string;
  categoryId: string;
  minPrice: number;
  maxPrice: number;
  compareAtPrice?: number;
  variants: MockVariant[];
}

const product = (
  slug: string,
  title: string,
  price: number,
  extra: Partial<MockProduct> = {}
): MockProduct => ({
  id: `prod-${slug}`,
  slug,
  title,
  status: 'ACTIVE',
  categoryId: 'cat-cups',
  minPrice: price,
  maxPrice: price,
  variants: [{ id: `var-${slug}`, sku: slug.toUpperCase(), price, status: 'ACTIVE' }],
  ...extra,
});

/** The product every assertion is written about, plus enough siblings for a full carousel. */
export const PRODUCT_HANDLE = 'ash-glaze-mug';
export const COLLECTION_HANDLE = 'the-winter-edit';

export const PRODUCTS: MockProduct[] = [
  product(PRODUCT_HANDLE, 'Ash glaze mug', 42),
  product('cedar-serving-board', 'Cedar serving board', 68),
  product('flax-tea-towel', 'Flax tea towel', 24),
  product('stoneware-bowl', 'Stoneware bowl', 36),
  product('brass-candle-holder', 'Brass candle holder', 52),
  product('linen-napkin-set', 'Linen napkin set', 44),
  product('walnut-spoon', 'Walnut spoon', 18),
];

/**
 * A cart a browser is already carrying — the shopper state a reload restores before anything on
 * the page has mounted.
 *
 * The id is what `@eldrajs/sdk`'s `createCartSession` keeps in `localStorage` under `eldra.cartId`,
 * so seeding that key and loading a page is exactly a shopper's second visit: the cart store's
 * `init()` reads the id during the storefront plugin's `setup`, asks for this cart, and the answer
 * lands some time after the page has hydrated. Two lines, so the header's count pill reads a number
 * no empty cart could produce.
 */
export const SEEDED_CART_ID = 'aa11bb22-0000-4000-8000-000000000000';
export const SEEDED_CART_QUANTITY = 2;

function seededCart(): Record<string, unknown> {
  const row = PRODUCTS[0]!;
  const unit = row.minPrice;
  return {
    id: SEEDED_CART_ID,
    currency: 'ISK',
    items: [
      {
        id: 'cart-line-1',
        productId: row.id,
        productSlug: row.slug,
        variantId: row.variants[0]!.id,
        title: row.title,
        price: unit,
        quantity: SEEDED_CART_QUANTITY,
      },
    ],
    totals: {
      subtotal: unit * SEEDED_CART_QUANTITY,
      discount: 0,
      taxAmount: 0,
      total: unit * SEEDED_CART_QUANTITY,
    },
  };
}

/**
 * The store's categories — what `GET /catalog/v1/categories` answers, which is how a `?category=`
 * slug becomes the `categoryId` the list takes **and** where a product's breadcrumb trail comes from.
 *
 * Two levels, because one level cannot prove a trail: `Tableware` holds `Cups`, every product sits in
 * `Cups`, and a prerendered product page therefore has to render `Tableware / Cups` from this read
 * alone. The platform's facets here carry no `parentId` (this fixture answers the contract the
 * storefront was written against), so the grid's category tree is the one completed from this list.
 */
interface MockCategory {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
}

const CATEGORIES: MockCategory[] = [
  { id: 'cat-tableware', slug: 'tableware', title: 'Tableware', parentId: null },
  { id: 'cat-cups', slug: 'cups', title: 'Cups', parentId: 'cat-tableware' },
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((row) => [row.id, row]));

/** A product's own category and every ancestor above it, which is what a `categoryId` filter matches
 *  against and what the facet counts a product under. */
function categoryChainOf(row: { categoryId: string }): string[] {
  const chain: string[] = [];
  let id: string | null = row.categoryId;
  while (id !== null && !chain.includes(id)) {
    chain.push(id);
    id = CATEGORY_BY_ID.get(id)?.parentId ?? null;
  }
  return chain;
}

const COLLECTIONS = [
  {
    id: 'col-winter',
    slug: COLLECTION_HANDLE,
    title: 'The winter edit',
    description: 'Warm tableware for the darkest months.',
    productCount: PRODUCTS.length,
  },
];

const detailOf = (row: MockProduct): Record<string, unknown> => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  status: row.status,
  categoryId: row.categoryId,
  // The field the public contract names for the trail's starting point, beside the one `related`
  // already read. Both, with the same value, is what a live response looks like.
  primaryCategoryId: row.categoryId,
  categoryIds: [row.categoryId],
  description: { text: `${row.title} — thrown by hand, glazed in ash.` },
  mediaLinks: [],
  options: [],
  variants: row.variants,
});

const listItemOf = (row: MockProduct): Record<string, unknown> => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  status: row.status,
  minPrice: row.minPrice,
  maxPrice: row.maxPrice,
  ...(row.compareAtPrice === undefined ? {} : { compareAtPrice: row.compareAtPrice }),
  totalVariants: row.variants.length,
});

/**
 * `POST /inventory/v1/stock/availability`'s answer: every variant the request named, in stock.
 *
 * The product page reads it alongside the catalogue response (`app/storefront/gateway.ts`), so
 * without it the generated site would exercise the fail-soft path on every product — a 404 in the
 * browser console and no inventory ever read, which is not what a deployed site does. `stockOf` is
 * what a test changes to make a variant sold out.
 */
const availabilityOf = (body: unknown): Record<string, unknown> => {
  const items = (body as { items?: Array<{ variantId?: unknown }> } | null)?.items ?? [];
  return {
    items: items.flatMap((item) =>
      typeof item.variantId === 'string'
        ? [
            {
              variantId: item.variantId,
              locationId: 'loc-default',
              available: true,
              allowBackorder: false,
              availableQuantity: 24,
            },
          ]
        : []
    ),
  };
};

/** The request body of a POST, as JSON — only `availabilityOf` needs one. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

const listResponse = (
  data: unknown[],
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  data,
  meta: {
    hasNext: false,
    hasPrev: false,
    page: 1,
    pageSize: 100,
    rows: data.length,
    total: (extra.total as number | undefined) ?? data.length,
    totalPages: 1,
  },
  ...(extra.facets === undefined ? {} : { facets: extra.facets }),
});

/**
 * The header a **deployed** site holds, rather than the seed a theme ships.
 *
 * The seed ships no links at all — a theme cannot know an organisation's own collections, products
 * or pages, so `pages/*.page.json` leaves the field empty and an author fills it in Studio. These
 * rows are therefore this file's own fixture, not the seed's content, and they are what makes the
 * generate's link resolution observable: a merchant who has authored a header is the only one who
 * has hrefs to bake.
 *
 * What a site stores is a `{_type, id}` target — Core resolves a handle to an id when an author
 * picks a destination — so that is the shape here. Four rows stand for the four answers the
 * resolver can give: a collection this gateway serves, a product it serves, an ordinary URL that
 * needs no catalog at all, and a target it has never heard of, which must render as a label and no
 * anchor.
 *
 * A fifth row carries `children`, which is what makes it a mega-menu trigger rather than a link —
 * the only shape whose geometry can be measured in a real browser. It is last, so the four answers
 * above keep the document order the href assertions read.
 */
export const LINKED_HEADER_LABELS = {
  collection: 'The winter edit',
  product: 'Ash glaze mug',
  url: 'Journal',
  missing: 'Discontinued',
  mega: 'Everything',
  megaChild: 'All of it',
} as const;

/**
 * `overrides` is how a single page gets a header state the others do not have. The collection
 * template takes `transparentOverHero`, because what that state does to the bar — and to an open
 * mega-menu's own ground — is a computed colour, answerable only in a real browser and only on a
 * page whose header actually carries the field.
 */
function linkedHeaderData(
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...data,
    ...overrides,
    links: [
      {
        kind: 'collection',
        target: { _type: 'collection', id: COLLECTIONS[0]!.id },
        label: LINKED_HEADER_LABELS.collection,
      },
      {
        kind: 'product',
        target: { _type: 'product', id: PRODUCTS[0]!.id },
        label: LINKED_HEADER_LABELS.product,
      },
      { kind: 'url', url: '/journal', label: LINKED_HEADER_LABELS.url },
      {
        kind: 'collection',
        target: { _type: 'collection', id: 'col-deleted' },
        label: LINKED_HEADER_LABELS.missing,
      },
      {
        kind: 'collection',
        target: { _type: 'collection', id: COLLECTIONS[0]!.id },
        label: LINKED_HEADER_LABELS.mega,
        children: [
          {
            kind: 'collection',
            target: { _type: 'collection', id: COLLECTIONS[0]!.id },
            group: 'Shop',
            label: LINKED_HEADER_LABELS.megaChild,
          },
        ],
      },
    ],
  };
}

/**
 * The starter's own seeds, as the CMS route-template entries a deployed site holds.
 *
 * Two shapes differ from `seedLayout`'s output, both because a seed is an *input* Core rewrites
 * when it creates the template: a `reusable` role node resolves to the site's own header/footer
 * component, which a mock has none of, and a node carrying `templates`/`bindings` becomes a
 * `template-block` node naming its `apiId` (an ordinary `block` node takes neither key —
 * `@eldrajs/theme-core`'s layout validator refuses it, and the whole page then renders as
 * `data-eldra-invalid-layout`).
 *
 * The collection template also carries one block the seed does not: a `product-carousel` over the
 * same collection its grid shows, which is an ordinary thing for a merchant to put there and the
 * shape that catches a refresh asking about one product twice — the grid and the carousel are
 * different blocks, so they arrive in different lazily-imported chunks and therefore in different
 * refresh bursts, both about exactly the same products.
 */
function routeTemplateEntries(): Array<{ id: string; data: Record<string, unknown> }> {
  return starterTemplates()
    .filter((seed) => seed.schemaApiId !== 'home')
    .map((seed) => {
      const layout = seedLayout(seed);
      const roles = starterTemplateRoles();
      const extra =
        seed.schemaApiId === 'catalog:collection'
          ? [
              {
                id: 'collection-more',
                apiId: 'product-carousel',
                data: {
                  heading: 'More from this edit',
                  variant: 'collection',
                  sourceCollection: { _type: 'collection', slug: COLLECTION_HANDLE },
                  limit: '8',
                  showSwatches: true,
                  background: 'none',
                },
              },
            ]
          : [];
      const blocks = [
        {
          id: 'role-header',
          apiId: roles.header.apiId,
          data: linkedHeaderData(roles.header.data, {
            transparentOverHero: seed.schemaApiId === 'catalog:collection',
          }),
        },
        ...seed.blocks,
        ...extra,
        { id: 'role-footer', apiId: roles.footer.apiId, data: roles.footer.data },
      ];
      const apiIdOf = new Map(blocks.map((block) => [block.id, block.apiId]));
      // A layout node addresses its block entry by **uuid** (`@eldrajs/theme-core`'s layout
      // validator), while a seed names its blocks by a readable id; Core mints the entry when it
      // creates the template. One deterministic uuid per seed block id stands in for that.
      const entryIdOf = new Map(blocks.map((block, index) => [block.id, blockUuid(index)]));
      return {
        id: `rt-${seed.schemaApiId.replace('catalog:', '')}`,
        data: {
          title: seed.title,
          routePattern: seed.routePattern,
          schemaApiId: seed.schemaApiId,
          slugField: 'slug',
          layout: {
            ...layout,
            root: {
              ...layout.root,
              children: withExtraNodes(layout.root.children ?? [], extra).map((node) => {
                const entryId = entryIdOf.get(node.id);
                const base = node.type === 'reusable' ? { id: node.id, type: 'block' } : node;
                return 'templates' in base || 'bindings' in base
                  ? { ...base, entryId, type: 'template-block', apiId: apiIdOf.get(node.id) }
                  : { ...base, entryId };
              }),
            },
          },
          blocks: blocks.map((block) => ({
            id: entryIdOf.get(block.id),
            schemaApiId: block.apiId,
            data: block.data,
          })),
        },
      };
    });
}

/** The extra blocks' nodes, placed where Core would place them: after the seed's own, before the
 *  footer role. */
function withExtraNodes<T>(children: readonly T[], extra: ReadonlyArray<{ id: string }>): T[] {
  if (extra.length === 0) return [...children];
  const footerAt = children.findIndex((node) => (node as { id?: unknown }).id === 'role-footer');
  const at = footerAt === -1 ? children.length : footerAt;
  const nodes = extra.map((block) => ({ id: block.id, type: 'block' }) as T);
  return [...children.slice(0, at), ...nodes, ...children.slice(at)];
}

/**
 * The starter's own home seed, as the CMS **page** entry a deployed site holds — the control every
 * route-template assertion is read against.
 *
 * A static route resolves to a `page` and no `template`, so `app/pages/[...slug].vue` hands
 * `EldraLayout` no `templateEntry` and the layout takes its page branch: a v2 page document of
 * ordinary `block` nodes. That is exactly the shape the deployed site's `/` has, down to the
 * `product-carousel` it carries, which is what makes it a fair comparison for a product page's
 * template-block leaves.
 *
 * Core behaviour **3** of the three this file hand-encodes (module header): the `version: 2`
 * envelope and the ordinary `block` children are Core's *page* layout shape, not `seedLayout`'s
 * (which emits `version: 1` and the role nodes a route template takes), and `slug: 'home'` with no
 * parent is what `@eldrajs/theme-core`'s `resolvePagePath` turns into `/`. Get the envelope wrong
 * and the page renders as `data-eldra-invalid-layout`; get the slug wrong and it never prerenders.
 */
export const HOME_PAGE_PATH = '/';

/**
 * **Two locales, deliberately.** `@eldrajs/theme-nuxt` serves the default locale at `/` and every
 * other supported one under a path prefix, so a two-locale organisation is what makes the generated
 * artifact contain both halves of that rule — the unprefixed site *and* a prefixed copy of every
 * content path. A static host answers 404 for a path it has no file for, however well the app
 * would have rendered it, so only a real `nuxi generate` can see that half go missing.
 *
 * `en-US` is the default, so every existing request assertion holds unchanged: an unprefixed read
 * carries no `locale` at all, exactly as it did before locales existed.
 */
export const DEFAULT_LOCALE = 'en-US';
export const PREFIXED_LOCALE = 'is-IS';

/** The paths the theme's own page seeds serve, which the generate must emit a file for. */
export const SEEDED_PAGE_PATHS = starterPages().map((seed) => `/${seed.page.slug}`);

/** One page document: a v2 envelope of ordinary `block` nodes over the blocks given. A node with
 *  `locked` is one Core created from a seed's `required` block — stored on the node, and the reason
 *  `@eldrajs/theme-core`'s layout validator has to admit the key. */
function pageEntry(
  id: string,
  title: string,
  slug: string,
  blocks: ReadonlyArray<{
    id: string;
    apiId: string;
    data: Record<string, unknown>;
    locked?: true;
  }>,
  uuidOffset: number
): { id: string; data: Record<string, unknown> } {
  const entryIdOf = new Map(
    blocks.map((block, index) => [block.id, blockUuid(uuidOffset + index)])
  );
  return {
    id,
    data: {
      title,
      slug,
      layout: {
        version: 2,
        root: {
          id: 'root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: blocks.map((block) => ({
            id: block.id,
            type: 'block',
            entryId: entryIdOf.get(block.id),
            ...(block.locked === true ? { locked: true } : {}),
          })),
        },
      },
      blocks: blocks.map((block) => ({
        id: entryIdOf.get(block.id),
        schemaApiId: block.apiId,
        data: block.data,
      })),
    },
  };
}

function pageEntries(): Array<{ id: string; data: Record<string, unknown> }> {
  const seed = starterTemplates().find((candidate) => candidate.schemaApiId === 'home');
  if (seed === undefined) throw new Error('mockGateway: the starter no longer seeds a home page');
  const roles = starterTemplateRoles();
  const home = [
    { id: 'role-header', apiId: roles.header.apiId, data: linkedHeaderData(roles.header.data) },
    ...seed.blocks,
    { id: 'role-footer', apiId: roles.footer.apiId, data: roles.footer.data },
  ];
  return [
    // No parent and the slug `home` is the site root — see `resolvePagePath`.
    pageEntry('page-home', seed.title, 'home', home, PAGE_BLOCK_UUID_OFFSET),
    ...seededPageEntries(roles),
  ];
}

/**
 * The theme's own page seeds as the CMS page entries a deployed site holds — `/cart`, `/wishlist`,
 * `/search` and `/products`. The first three were code routes under `app/pages/` until the theme
 * started seeding them; `/products` never was, and is the one that also proves a static page and a
 * route template can share a path prefix (`/products` beside `/products/:slug`).
 *
 * Core behaviour **4** of the four this file hand-encodes (module header): a `@header`/`@footer`
 * placement resolves to the site's own role component (a mock has none, so the role's block data is
 * inlined where the placement stands, exactly as `routeTemplateEntries` does it), and a `required`
 * block's node is created `locked: true`. Get the first wrong and the generated page carries no
 * header; get the second wrong and nothing fails here — which is the point of writing it down, since
 * the key has to survive `@eldrajs/theme-core`'s layout validator for the page to render at all.
 */
function seededPageEntries(
  roles: ReturnType<typeof starterTemplateRoles>
): Array<{ id: string; data: Record<string, unknown> }> {
  return starterPages().map((seed, seedIndex) => {
    const blocks = seed.blocks.map((entry, index) => {
      if ('role' in entry) {
        const role = roles[entry.role]!;
        return {
          id: `role-${entry.role}`,
          apiId: role.apiId,
          data: entry.role === 'header' ? linkedHeaderData(role.data) : role.data,
        };
      }
      return {
        id: `${seed.page.slug}-${index}`,
        apiId: entry.apiId,
        data: entry.data,
        ...(entry.required === true ? { locked: true as const } : {}),
      };
    });
    return pageEntry(
      `page-${seed.page.slug}`,
      seed.title,
      seed.page.slug,
      blocks,
      // One uuid range per page, after the home page's, so no two pages' block
      // entry ids collide — the mount counter keys by entry id.
      PAGE_BLOCK_UUID_OFFSET + 100 * (seedIndex + 1)
    );
  });
}

/**
 * **The storefront filter parameters, as the catalog list declares them** (contract 3.7.0): the
 * half of the shopper's facets a generated page's grid actually sends. `minPrice`/`maxPrice` are
 * inclusive and in minor units — this store sells in krónur, which have none, so they read as the
 * same numbers the shopper typed — `categoryId`/`collectionId` are repeatable and OR'd, `option` is
 * a repeatable `<key>:<value>`, and `availability` is one of two values read off `availabilityOf`
 * (every variant of every product in this fixture is in stock).
 */
interface ProductQuery {
  minPrice?: number;
  maxPrice?: number;
  categoryIds: string[];
  collectionIds: string[];
  availability?: string;
  options: Array<{ key: string; value: string }>;
}

/** Which filter family a clause belongs to, for the one rule a facet count obeys. */
type FilterFamily = 'price' | 'category' | 'collection' | 'availability' | `option:${string}`;

function parseProductQuery(url: URL): ProductQuery {
  const bound = (name: string): number | undefined => {
    const raw = url.searchParams.get(name);
    if (raw === null) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  return {
    minPrice: bound('minPrice'),
    maxPrice: bound('maxPrice'),
    categoryIds: url.searchParams.getAll('categoryId'),
    collectionIds: url.searchParams.getAll('collectionId'),
    availability: url.searchParams.get('availability') ?? undefined,
    options: url.searchParams.getAll('option').flatMap((token) => {
      const at = token.indexOf(':');
      return at <= 0 ? [] : [{ key: token.slice(0, at), value: token.slice(at + 1) }];
    }),
  };
}

/** Every variant of every product in this fixture is in stock (see `availabilityOf`). */
const inStock = (_row: MockProduct): boolean => true;

/** Which collections a product is in — this fixture has one, holding everything. */
const collectionsOf = (_row: MockProduct): string[] => COLLECTIONS.map((row) => row.id);

/**
 * One product against the query, with one family optionally left out — which is the whole of the
 * "a facet count ignores its own filter" rule the real platform applies.
 */
function matchesProductQuery(
  row: MockProduct,
  query: ProductQuery,
  ignore?: FilterFamily
): boolean {
  if (ignore !== 'price') {
    if (query.minPrice !== undefined && row.maxPrice < query.minPrice) return false;
    if (query.maxPrice !== undefined && row.minPrice > query.maxPrice) return false;
  }
  if (ignore !== 'category' && query.categoryIds.length > 0) {
    // A `categoryId` matches the product's own category **or any ancestor of it**: the filter panel
    // offers parent rows, and the platform expands a parent to its descendants. A fixture that only
    // matched the leaf would answer nothing for a shopper ticking `Tableware`.
    if (!query.categoryIds.some((id) => categoryChainOf(row).includes(id))) return false;
  }
  if (ignore !== 'collection' && query.collectionIds.length > 0) {
    if (!collectionsOf(row).some((id) => query.collectionIds.includes(id))) return false;
  }
  if (ignore !== 'availability' && query.availability !== undefined) {
    if ((query.availability === 'in_stock') !== inStock(row)) return false;
  }
  for (const { key, value } of query.options) {
    if (ignore === `option:${key}`) continue;
    // No product in this fixture declares a variant option, so any option clause matches nothing.
    if (value !== '') return false;
  }
  return true;
}

/**
 * The `facets` object `facets=true` asks for: the scope's price bounds and its category, collection
 * and availability counts, each counted with its own family's filter left out. There are no option
 * axes in this fixture, so `options` is empty rather than invented.
 */
function facetsOf(rows: MockProduct[], query: ProductQuery): Record<string, unknown> {
  const scope = (ignore: FilterFamily): MockProduct[] =>
    rows.filter((row) => matchesProductQuery(row, query, ignore));
  const prices = scope('price').map((row) => row.minPrice);
  const categoryScope = scope('category');
  const collectionScope = scope('collection');
  const availabilityScope = scope('availability');
  const categoryIds = [...new Set(rows.map((row) => row.categoryId))];
  return {
    price: {
      min: prices.length === 0 ? 0 : Math.min(...prices),
      max: prices.length === 0 ? 0 : Math.max(...prices),
    },
    // Counted over the categories products are **assigned** to, which is the leaf: `Tableware` is
    // never named here, and the grid's parent row is the one the storefront completes from the
    // category list. No `parentId`, deliberately — see `CATEGORIES`.
    categories: categoryIds.map((id) => ({
      id,
      slug: CATEGORY_BY_ID.get(id)?.slug ?? id,
      title: CATEGORY_BY_ID.get(id)?.title ?? id,
      count: categoryScope.filter((row) => row.categoryId === id).length,
    })),
    collections: COLLECTIONS.map((collection) => ({
      id: collection.id,
      slug: collection.slug,
      title: collection.title,
      count: collectionScope.filter((row) => collectionsOf(row).includes(collection.id)).length,
    })),
    availability: {
      in_stock: availabilityScope.filter(inStock).length,
      out_of_stock: availabilityScope.filter((row) => !inStock(row)).length,
    },
    options: [],
  };
}

/** `field:op:value` tokens, as much of the grammar as the storefront actually sends. */
function matchesFilters(row: MockProduct, filters: string[]): boolean {
  for (const token of filters) {
    const [field, op, ...rest] = token.split(':');
    const value = rest.join(':');
    const actual = field === 'id' ? row.id : field === 'slug' ? row.slug : row.status;
    if (op === 'eq' && actual !== value) return false;
    if (op === 'in' && !value.split(',').includes(actual)) return false;
  }
  return true;
}

export interface MockGateway {
  server: Server;
  url: string;
  /** `pathname + search` of every request, in order. */
  requests: string[];
  /** Milliseconds every `/catalog/v1/**` answer is held back. Settable between phases. */
  catalogDelayMs: number;
  /**
   * Milliseconds every `/shopping-cart/v1/**` answer is held back. Settable between phases, and
   * the reason it exists: the cart read a restored cart id triggers is issued during the
   * storefront plugin's `setup` and must still be **in flight** while the page hydrates, which is
   * the window any un-gated read of the cart's `pending` flag would render differently in. On a
   * loopback server with no delay that window is a millisecond wide, so a spec about it would pass
   * or fail by timing rather than by behaviour.
   */
  cartDelayMs: number;
  /** Forget every request recorded so far — call between the generate and the browser run. */
  reset(): void;
  close(): Promise<void>;
}

export function startMockGateway(): Promise<MockGateway> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const state = { catalogDelayMs: 0, cartDelayMs: 0 };
    const templates = routeTemplateEntries();
    const pages = pageEntries();

    const server = createServer((req, res) => {
      void handle(req, res);
    });

    const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      // The browser reads this origin cross-origin; the SDK sends `X-Org-Id`, which makes every
      // read a preflighted request.
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-headers', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      requests.push(url.pathname + url.search);
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');

      const answer = (body: unknown, status = 200): void => {
        const send = (): void => {
          res.statusCode = status;
          res.end(JSON.stringify(body));
        };
        const delay = url.pathname.startsWith('/catalog/v1/')
          ? state.catalogDelayMs
          : url.pathname.startsWith('/shopping-cart/v1/')
            ? state.cartDelayMs
            : 0;
        if (delay > 0) {
          setTimeout(send, delay);
          return;
        }
        send();
      };

      // The platform's own config is **not** org-scoped (`orgScoped: false` in the SDK), so it is
      // answered before the org-id guard below — it carries no `X-Org-Id` and a real gateway does
      // not ask for one. `client.checkout.url()` reads it to build the cart hand-off, which is the
      // one thing a restored cart asks for beyond the cart itself; without an answer here that
      // read is a 400 in the browser's console on every page with a cart in it.
      if (url.pathname === '/platform/v1/config') {
        answer({ checkoutUrl: 'https://checkout.example' });
        return;
      }

      if (req.headers['x-org-id'] !== ORG_ID) {
        answer({ error: 'missing org id' }, 400);
        return;
      }

      const filters = url.searchParams.getAll('filter');
      const segments = url.pathname.split('/').filter(Boolean);

      if (url.pathname.startsWith('/organization/v1/')) {
        // What the store sells in. `@eldrajs/theme-nuxt` reads this once per build and puts it on
        // `runtimeConfig.public.eldra.commerce`, which is where every price on a generated page
        // takes its currency from.
        //
        // **ISK, deliberately not USD.** A dollar-priced fixture would render identically whether
        // the platform's answer reached the page or nothing did — the one thing the generated-site
        // tests are here to tell apart. A zero-decimal currency makes it visible twice over: the
        // symbol differs *and* the minor-unit scale does.
        answer({
          id: ORG_ID,
          name: 'Northwind Goods',
          features: [
            { feature: 'CMS', enabled: true },
            { feature: 'ECOMMERCE', enabled: true },
          ],
          commerce: { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 },
          locales: { default: DEFAULT_LOCALE, supported: [DEFAULT_LOCALE, PREFIXED_LOCALE] },
        });
      } else if (url.pathname === '/cms/v1/schema/page/entry') {
        answer(listResponse(pages));
      } else if (url.pathname.startsWith('/cms/v1/schema/page/entry/')) {
        const id = segments[segments.length - 1];
        const page = pages.find((entry) => entry.id === id);
        answer(page ?? {}, page === undefined ? 404 : 200);
      } else if (url.pathname === '/cms/v1/schema/route-template/entry') {
        answer(listResponse(templates));
      } else if (url.pathname.startsWith('/cms/v1/schema/route-template/entry/')) {
        const id = segments[segments.length - 1];
        const template = templates.find((entry) => entry.id === id);
        answer(template ?? {}, template === undefined ? 404 : 200);
      } else if (url.pathname === '/catalog/v1/categories') {
        // The whole list, which is what the endpoint answers, what the storefront resolves a
        // `?category=<slug>` against before it can send a `categoryId`, and the only place a
        // product's ancestors exist.
        answer(CATEGORIES);
      } else if (url.pathname === '/catalog/v1/products/list') {
        const pageSize = Number(url.searchParams.get('pageSize') ?? '100');
        const query = parseProductQuery(url);
        const matching = PRODUCTS.filter(
          (row) => matchesFilters(row, filters) && matchesProductQuery(row, query)
        );
        const rows = matching.slice(0, Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 100);
        answer(
          listResponse(rows.map(listItemOf), {
            total: matching.length,
            ...(url.searchParams.get('facets') === 'true'
              ? { facets: facetsOf(PRODUCTS, query) }
              : {}),
          })
        );
      } else if (url.pathname === '/inventory/v1/stock/availability') {
        answer(availabilityOf(await readJsonBody(req)));
      } else if (segments[0] === 'shopping-cart' && segments[2] === 'cart') {
        // The one cart this mock knows, and only by the id a test seeded. Any other id is a cart
        // the gateway has forgotten — which the store answers by clearing `eldra.cartId` and
        // carrying on with an empty cart, so a stale seed cannot silently look like a live one.
        const id = decodeURIComponent(segments[3] ?? '');
        answer(id === SEEDED_CART_ID ? seededCart() : {}, id === SEEDED_CART_ID ? 200 : 404);
      } else if (url.pathname === '/catalog/v1/collections') {
        answer(listResponse(COLLECTIONS));
      } else if (
        segments[0] === 'catalog' &&
        segments[2] === 'collections' &&
        segments[4] === 'products'
      ) {
        const collection = COLLECTIONS.find((row) => row.slug === decodeURIComponent(segments[3]));
        if (collection === undefined) answer({}, 404);
        else {
          // The shopper's facets are the endpoint's own parameters, so the filtering, the `total`
          // and the `facets` counts all happen here rather than in the theme.
          const query = parseProductQuery(url);
          const matching = PRODUCTS.filter((row) => matchesProductQuery(row, query));
          answer(
            listResponse(matching.map(listItemOf), {
              total: matching.length,
              ...(url.searchParams.get('facets') === 'true'
                ? { facets: facetsOf(PRODUCTS, query) }
                : {}),
            })
          );
        }
      } else if (segments[0] === 'catalog' && segments[2] === 'collections') {
        const collection = COLLECTIONS.find((row) => row.slug === decodeURIComponent(segments[3]));
        answer(collection ?? {}, collection === undefined ? 404 : 200);
      } else if (segments[0] === 'catalog' && segments[2] === 'products') {
        const row = PRODUCTS.find(
          (candidate) => candidate.slug === decodeURIComponent(segments[3])
        );
        answer(row === undefined ? {} : detailOf(row), row === undefined ? 404 : 200);
      } else {
        answer({}, 404);
      }
    };

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) return;
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
        requests,
        get catalogDelayMs() {
          return state.catalogDelayMs;
        },
        set catalogDelayMs(value: number) {
          state.catalogDelayMs = value;
        },
        get cartDelayMs() {
          return state.cartDelayMs;
        },
        set cartDelayMs(value: number) {
          state.cartDelayMs = value;
        },
        reset() {
          requests.length = 0;
        },
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((error) => (error ? fail(error) : done()))
          ),
      });
    });
  });
}
