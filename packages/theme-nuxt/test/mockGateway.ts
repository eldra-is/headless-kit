import { createServer, type Server } from 'node:http';

const HOME = {
  id: 'p-home',
  data: {
    slug: 'home',
    title: 'Home',
    layout: {
      version: 1,
      root: {
        id: 'page-grid',
        type: 'grid',
        layout: {
          columns: { normal: 2, tablet: 2, mobile: 1 },
          columnGap: { normal: '32px', tablet: '24px', mobile: '12px' },
          rowGap: { normal: '24px', tablet: '16px', mobile: '8px' },
          alignItems: { normal: 'stretch', mobile: 'start' },
        },
        style: {
          container: { normal: 'content', mobile: 'full' },
          padding: {
            normal: { top: '32px', right: '32px', bottom: '32px', left: '32px' },
            tablet: { top: '24px', right: '24px', bottom: '24px', left: '24px' },
            mobile: { top: '16px', right: '16px', bottom: '16px', left: '16px' },
          },
        },
        children: [
          {
            id: 'primary-hero',
            type: 'block',
            entryId: '11111111-1111-4111-8111-111111111111',
            style: { width: { normal: '100%', tablet: '75%', mobile: '100%' } },
          },
          {
            id: 'shared-footer',
            type: 'flex',
            layout: { direction: { normal: 'column' }, gap: { normal: '8px' } },
            children: [
              {
                id: 'rdcb157147ad5c4b71b017eaf32801eef2696eed042516381381305e6a8bc0b09',
                type: 'block',
                entryId: '33333333-3333-4333-8333-333333333333',
              },
            ],
          },
          {
            id: 'nested-flex',
            type: 'flex',
            layout: {
              direction: { normal: 'row', tablet: 'row', mobile: 'column' },
              wrap: { normal: 'nowrap', tablet: 'wrap' },
              gap: { normal: '16px', tablet: '12px', mobile: '8px' },
              justify: { normal: 'space-between', mobile: 'start' },
              align: { normal: 'stretch', tablet: 'center', mobile: 'start' },
            },
            children: [
              {
                id: 'secondary-hero',
                type: 'block',
                entryId: '22222222-2222-4222-8222-222222222222',
                style: { visible: { normal: true, tablet: false, mobile: true } },
              },
            ],
          },
        ],
      },
    },
    blocks: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        schemaApiId: 'hero',
        data: { heading: 'Generated heading', subheading: 'From mock gateway' },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        schemaApiId: 'hero',
        data: {
          heading: { en: 'Shared footer', is: 'Sameiginlegur fótur' },
          subheading: { en: 'Published reusable revision 4', is: 'Útgefin endurnýtanleg útgáfa 4' },
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        schemaApiId: 'hero',
        data: { heading: 'Nested heading', subheading: 'Nested responsive flex' },
      },
    ],
  },
};
const ABOUT = {
  id: 'p-about',
  data: {
    slug: 'about',
    title: 'About',
    layout: {
      version: 1,
      root: {
        id: 'about-root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'shared-footer-about',
            type: 'flex',
            layout: { direction: { normal: 'column' }, gap: { normal: '8px' } },
            children: [
              {
                id: 'r0aacbc1a699a0bad444ff10e3d7496b8acba80f9cbdc9ecb0c2f4acd38d33ce5',
                type: 'block',
                entryId: '33333333-3333-4333-8333-333333333333',
              },
            ],
          },
        ],
      },
    },
    blocks: [HOME.data.blocks[1]],
  },
};

// Layout v3 slotted page: the hero host declares an `actions` slot (allowlisted
// to `cta` in the fixture manifest) with one cta child. The cta entry must be
// served alongside the host so the layout validator can resolve its apiId.
const SLOTTED_HOST = {
  id: '55555555-5555-4555-8555-555555555555',
  schemaApiId: 'hero',
  data: { heading: 'Slotted hero heading', subheading: 'With a CTA in actions' },
};
const SLOTTED_CTA = {
  id: '66666666-6666-4666-8666-666666666666',
  schemaApiId: 'cta',
  data: { label: 'Shop now' },
};
const SLOTTED = {
  id: 'p-slotted',
  data: {
    slug: 'slotted',
    title: 'Slotted',
    layout: {
      version: 3,
      root: {
        id: 'slotted-grid',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'slotted-hero',
            type: 'block',
            entryId: SLOTTED_HOST.id,
            slots: {
              actions: [{ id: 'slotted-cta', type: 'block', entryId: SLOTTED_CTA.id }],
            },
          },
        ],
      },
    },
    blocks: [SLOTTED_HOST, SLOTTED_CTA],
  },
};

// Control page: the same hero host with an explicitly empty `actions` slot, so
// the block's own fallback markup must render instead of a slot wrapper.
const CONTROL = {
  id: 'p-control',
  data: {
    slug: 'control',
    title: 'Control',
    layout: {
      version: 3,
      root: {
        id: 'control-grid',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'control-hero',
            type: 'block',
            entryId: SLOTTED_HOST.id,
            slots: { actions: [] },
          },
        ],
      },
    },
    blocks: [SLOTTED_HOST],
  },
};

// Failure-case page: the slot id is not declared by the hero manifest entry, so
// the document must fail closed into the invalid-layout div at render time.
const BAD = {
  id: 'p-bad',
  data: {
    slug: 'bad',
    title: 'Bad',
    layout: {
      version: 3,
      root: {
        id: 'bad-grid',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'bad-hero',
            type: 'block',
            entryId: SLOTTED_HOST.id,
            slots: {
              notdeclared: [{ id: 'bad-child', type: 'block', entryId: SLOTTED_CTA.id }],
            },
          },
        ],
      },
    },
    blocks: [SLOTTED_HOST, SLOTTED_CTA],
  },
};

const PAGES: Record<string, { id: string; data: { slug: string } }> = {
  [HOME.id]: HOME,
  [ABOUT.id]: ABOUT,
  [SLOTTED.id]: SLOTTED,
  [CONTROL.id]: CONTROL,
  [BAD.id]: BAD,
};

const DYNAMIC_HERO = {
  id: '77777777-7777-4777-8777-777777777777',
  schemaApiId: 'hero',
  data: { heading: 'Static dynamic-page heading', subheading: 'Static dynamic-page subheading' },
};

const ROUTE_TEMPLATE = {
  id: 'rt-article',
  data: {
    title: 'Article template',
    routePattern: '/articles/:slug',
    schemaApiId: 'article',
    slugField: 'slug',
    layout: {
      version: 1,
      root: {
        id: 'article-root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'article-hero',
            type: 'template-block',
            apiId: 'hero',
            entryId: DYNAMIC_HERO.id,
            templates: { heading: 'Article: {{ title }}' },
          },
        ],
      },
    },
    blocks: [DYNAMIC_HERO],
  },
};

const ARTICLES = {
  'article-dynamic': {
    id: 'article-dynamic',
    schemaApiId: 'article',
    data: {
      slug: 'hello-dynamic',
      title: 'Dynamic article heading',
      author: { data: { name: 'Ada Author' } },
    },
  },
  'article-code-owned': {
    id: 'article-code-owned',
    schemaApiId: 'article',
    data: {
      slug: 'code-owned',
      title: 'CMS content must not render',
      author: { data: { name: 'CMS Author' } },
    },
  },
};

const listResponse = (data: unknown[]) => ({
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
 * Entry ids served in gateway responses. Block entries are inlined in page
 * documents by design (the depth pipeline resolves them server-side), so this
 * is the gateway-side record of "requested" entries: it proves a depth-3 page
 * resolution delivered the slot-descendant entry, which the layout-driven
 * draft projection (normalizeLayoutDocument().blockEntryIds) then keeps.
 */
export function startMockGateway(options: { missingRouteTemplateSchema?: boolean } = {}): Promise<{
  server: Server;
  url: string;
  requests: string[];
  servedEntryIds: Set<string>;
}> {
  return new Promise((resolve) => {
    const requests: string[] = [];
    const servedEntryIds = new Set<string>();

    function recordServedEntryIds(doc: unknown): void {
      if (typeof doc !== 'object' || doc === null) return;
      const entry = doc as { id?: unknown; data?: { blocks?: unknown } };
      if (typeof entry.id === 'string') servedEntryIds.add(entry.id);
      const blocks = entry.data?.blocks;
      if (!Array.isArray(blocks)) return;
      for (const block of blocks) {
        if (
          typeof block === 'object' &&
          block !== null &&
          typeof (block as { id?: unknown }).id === 'string'
        ) {
          servedEntryIds.add((block as { id: string }).id);
        }
      }
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      requests.push(url.pathname + url.search);
      res.setHeader('content-type', 'application/json');
      if (req.headers['x-org-id'] !== '3fa85f64-5717-4562-b3fc-2c963f66afa6') {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'missing org id' }));
      } else if (url.pathname === '/cms/v1/schema/page/entry') {
        for (const page of Object.values(PAGES)) recordServedEntryIds(page);
        res.end(JSON.stringify(listResponse(Object.values(PAGES))));
      } else if (url.pathname === '/cms/v1/schema/route-template/entry') {
        if (options.missingRouteTemplateSchema === true) {
          res.statusCode = 404;
          res.end('{}');
        } else {
          res.end(JSON.stringify(listResponse([ROUTE_TEMPLATE])));
        }
      } else if (url.pathname === `/cms/v1/schema/route-template/entry/${ROUTE_TEMPLATE.id}`) {
        res.end(JSON.stringify(ROUTE_TEMPLATE));
      } else if (url.pathname === '/cms/v1/schema/article/entry') {
        res.end(JSON.stringify(listResponse(Object.values(ARTICLES))));
      } else if (url.pathname.startsWith('/cms/v1/schema/article/entry/unique/slug/')) {
        const slug = decodeURIComponent(url.pathname.split('/').pop() ?? '');
        const article = Object.values(ARTICLES).find((candidate) => candidate.data.slug === slug);
        if (article === undefined) {
          res.statusCode = 404;
          res.end('{}');
        } else {
          recordServedEntryIds(article);
          res.end(JSON.stringify(article));
        }
      } else if (url.pathname.startsWith('/cms/v1/schema/page/entry/')) {
        const id = url.pathname.split('/').pop() ?? '';
        const page = PAGES[id];
        if (page === undefined) {
          res.statusCode = 404;
          res.end('{}');
        } else {
          recordServedEntryIds(page);
          res.end(JSON.stringify(page));
        }
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        resolve({ server, url: `http://127.0.0.1:${address.port}`, requests, servedEntryIds });
      }
    });
  });
}
