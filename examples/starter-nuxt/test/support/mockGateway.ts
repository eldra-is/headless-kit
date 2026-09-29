import { createServer, type Server } from 'node:http';
import { seedLayout } from '@eldrajs/vite-plugin-theme';
import { starterTemplateRoles, starterTemplates } from '../../app/templates';

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
  categoryId: 'cat-tableware',
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

const listResponse = (data: unknown[]): Record<string, unknown> => ({
  data,
  meta: {
    hasNext: false,
    hasPrev: false,
    page: 1,
    pageSize: 100,
    rows: data.length,
    total: data.length,
    totalPages: 1,
  },
});

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
                  sourceHandle: COLLECTION_HANDLE,
                  limit: '8',
                  showSwatches: true,
                  background: 'none',
                },
              },
            ]
          : [];
      const blocks = [
        { id: 'role-header', apiId: roles.header.apiId, data: roles.header.data },
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
 */
export const HOME_PAGE_PATH = '/';

function pageEntries(): Array<{ id: string; data: Record<string, unknown> }> {
  const seed = starterTemplates().find((candidate) => candidate.schemaApiId === 'home');
  if (seed === undefined) throw new Error('mockGateway: the starter no longer seeds a home page');
  const roles = starterTemplateRoles();
  const blocks = [
    { id: 'role-header', apiId: roles.header.apiId, data: roles.header.data },
    ...seed.blocks,
    { id: 'role-footer', apiId: roles.footer.apiId, data: roles.footer.data },
  ];
  const entryIdOf = new Map(
    blocks.map((block, index) => [block.id, blockUuid(PAGE_BLOCK_UUID_OFFSET + index)])
  );
  return [
    {
      id: 'page-home',
      data: {
        title: seed.title,
        // No parent and the slug `home` is the site root — see `resolvePagePath`.
        slug: 'home',
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
            })),
          },
        },
        blocks: blocks.map((block) => ({
          id: entryIdOf.get(block.id),
          schemaApiId: block.apiId,
          data: block.data,
        })),
      },
    },
  ];
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
  /** Forget every request recorded so far — call between the generate and the browser run. */
  reset(): void;
  close(): Promise<void>;
}

export function startMockGateway(): Promise<MockGateway> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const state = { catalogDelayMs: 0 };
    const templates = routeTemplateEntries();
    const pages = pageEntries();

    const server = createServer((req, res) => {
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
        if (url.pathname.startsWith('/catalog/v1/') && state.catalogDelayMs > 0) {
          setTimeout(send, state.catalogDelayMs);
          return;
        }
        send();
      };

      if (req.headers['x-org-id'] !== ORG_ID) {
        answer({ error: 'missing org id' }, 400);
        return;
      }

      const filters = url.searchParams.getAll('filter');
      const segments = url.pathname.split('/').filter(Boolean);

      if (url.pathname === '/cms/v1/schema/page/entry') {
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
      } else if (url.pathname === '/catalog/v1/products/list') {
        const pageSize = Number(url.searchParams.get('pageSize') ?? '100');
        const categoryId = url.searchParams.get('categoryId');
        const rows = PRODUCTS.filter(
          (row) =>
            matchesFilters(row, filters) && (categoryId === null || row.categoryId === categoryId)
        ).slice(0, Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 100);
        answer(listResponse(rows.map(listItemOf)));
      } else if (url.pathname === '/catalog/v1/collections') {
        answer(listResponse(COLLECTIONS));
      } else if (
        segments[0] === 'catalog' &&
        segments[2] === 'collections' &&
        segments[4] === 'products'
      ) {
        const collection = COLLECTIONS.find((row) => row.slug === decodeURIComponent(segments[3]));
        if (collection === undefined) answer({}, 404);
        else answer(listResponse(PRODUCTS.map(listItemOf)));
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
    });

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
