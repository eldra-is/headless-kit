import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORG_ID } from './mockGateway';
import { startStaticServer, type StaticServer } from './staticServer';

/**
 * The content and the servers of the preview parity harness (`test/previewParity.browser.spec.ts`,
 * WS-1358): one set of pages, served by a stand-in gateway in the two shapes Core serves them —
 * the public read a build prerenders and the draft read a preview session makes — and a stand-in
 * for the preview router that serves a pinned build the way it serves a session.
 *
 * Everything the content gateway does not own (the catalog, carts, the organisation, the site
 * profile) is forwarded to the starter's own mock gateway (`./mockGateway.ts`), so commerce reads
 * are exactly what every other generated-site test sees.
 */

const blocksDir = fileURLToPath(new URL('../../blocks', import.meta.url));

/** Every block type the starter ships, in name order. */
export const STARTER_BLOCK_TYPES: string[] = readdirSync(blocksDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(blocksDir, entry.name, 'block.json')))
  .map((entry) => entry.name)
  .sort();

/** A block's content as Studio's stories render it: what an insert seeds, plus the demo media. */
function sampleData(apiId: string): Record<string, unknown> {
  const read = (file: string): Record<string, unknown> => {
    const path = join(blocksDir, apiId, file);
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
      : {};
  };
  return { ...read('mock.json'), ...read('preview.json') };
}

/** A v4-shaped uuid, stable per name: a layout node's `entryId` must be one. */
function uuidFor(name: string): string {
  const hex = createHash('sha256').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The id Core gives a node inside an expanded placement (`docs/theme-reusable-components.md`). */
function expandedNodeId(placementId: string, nodeId: string): string {
  return `r${createHash('sha256').update(`${placementId}\0${nodeId}`).digest('hex')}`;
}

interface Block {
  id: string;
  schemaApiId: string;
  data: Record<string, unknown>;
}

type LayoutNode = Record<string, unknown> & { id: string; type: string };

interface Component {
  componentId: string;
  revision: number;
  /** The component's own document: a container of block nodes. */
  root: LayoutNode & { children: LayoutNode[] };
  blocks: Block[];
}

/** One page, before it is put in either read shape. */
interface PageSource {
  id: string;
  slug: string;
  title: string;
  /** The page's own nodes, in order; a `reusable` node places a component. */
  children: Array<
    { block: Block; style?: Record<string, unknown> } | { placement: string; component: Component }
  >;
}

export const SITE_ID = 'a1b2c3d4-0000-4000-8000-00000000c0de';

/** The two locales the starter's mock organisation serves (`./mockGateway.ts`). */
const LOCALES = ['en-US', 'is-IS'] as const;

/**
 * Which version of the content: `next` is what the merchant is about to publish (the draft, and
 * what a Publish rebuild bakes in); `pinned` is what was live when the deployment a session pins
 * was built. The two differ on every page — a heading, a block that is gone, a framing that moved,
 * a component revision — so a session that showed any of the pinned build's own content would fail
 * the comparison rather than pass it by accident.
 */
export type ContentVersion = 'next' | 'pinned';

function block(name: string, apiId: string, data: Record<string, unknown>): Block {
  return { id: uuidFor(`${name}:${apiId}`), schemaApiId: apiId, data };
}

function pageSources(version: ContentVersion): PageSource[] {
  const next = version === 'next';

  // Every block type of the starter, on one page, each with its story content.
  const everyBlock: PageSource = {
    id: 'page-every-block',
    slug: 'home',
    title: next ? 'Every block' : 'Every block (pinned)',
    // `search` first, where its results-page variant stands on a real site (`pages/search.page.json`):
    // it focuses its field on mount, and the page scrolls to it — see the parity spec's notes.
    children: ['search', ...STARTER_BLOCK_TYPES.filter((apiId) => apiId !== 'search')].map(
      (apiId) => {
        const data = sampleData(apiId);
        if (apiId === 'hero')
          data.heading = next ? 'Made slowly, used daily' : 'Pinned build heading';
        if (apiId === 'cta' && !next) data.heading = 'Pinned call to action';
        if (apiId === 'faq' && !next) data.heading = 'Pinned questions';
        return { block: block('every', apiId, data) };
      }
    ),
  };

  // A shared header and footer: the site's reusable components, placed on the page.
  const header: Component = {
    componentId: 'c0ffee00-0000-4000-8000-0000000000a1',
    revision: next ? 4 : 3,
    root: {
      id: 'header-root',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children: [{ id: 'header-nav', type: 'block', entryId: '' }],
    },
    blocks: [
      block('shared-header', 'navigation', {
        ...sampleData('navigation'),
        ...(next ? {} : { announcement: 'Pinned announcement' }),
      }),
    ],
  };
  const footer: Component = {
    componentId: 'c0ffee00-0000-4000-8000-0000000000b2',
    revision: 2,
    root: {
      id: 'footer-root',
      type: 'flex',
      layout: { direction: { normal: 'column' }, gap: { normal: '8px' } },
      children: [{ id: 'footer-main', type: 'block', entryId: '' }],
    },
    blocks: [block('shared-footer', 'footer', sampleData('footer'))],
  };
  for (const component of [header, footer]) {
    component.root.children[0]!.entryId = component.blocks[0]!.id;
  }
  const shared: PageSource = {
    id: 'page-shared',
    slug: 'shared',
    title: 'Shared component',
    children: [
      { placement: 'site-header', component: header },
      {
        block: block('shared-body', 'hero', {
          ...sampleData('hero'),
          heading: next ? 'Between the shared header and footer' : 'Pinned shared body',
        }),
      },
      { placement: 'site-footer', component: footer },
    ],
  };

  // A page whose fields are translated: read at `/localized` and at `/is-IS/localized`.
  const localized: PageSource = {
    id: 'page-localized',
    slug: 'localized',
    title: 'Localized',
    children: [
      {
        block: block('localized', 'hero', {
          ...sampleData('hero'),
          eyebrow: { 'en-US': 'New season', 'is-IS': 'Ný árstíð' },
          heading: next
            ? { 'en-US': 'Made slowly', 'is-IS': 'Gert hægt' }
            : { 'en-US': 'Pinned', 'is-IS': 'Fest' },
        }),
      },
      {
        block: block('localized', 'cta', {
          ...sampleData('cta'),
          eyebrow: { 'en-US': 'Visit the studio', 'is-IS': 'Heimsæktu verkstæðið' },
          primaryCtaLabel: { 'en-US': 'Book a session', 'is-IS': 'Bóka tíma' },
        }),
      },
    ],
  };

  // A page-builder framing on an image (focal point and zoom), and on the hero's image.
  const image = sampleData('image').image as Record<string, unknown>;
  const heroImage = sampleData('hero').image as Record<string, unknown>;
  const framing: PageSource = {
    id: 'page-framing',
    slug: 'framing',
    title: 'Framing',
    children: [
      {
        block: block('framing', 'image', {
          ...sampleData('image'),
          image: {
            ...image,
            framing: next ? { x: 0.2, y: 0.6, zoom: 2 } : { x: 0.5, y: 0.5, zoom: 1 },
          },
        }),
      },
      {
        block: block('framing', 'hero', {
          ...sampleData('hero'),
          image: { ...heroImage, framing: next ? { x: 0.05, y: 0.95, zoom: 3.5 } : null },
        }),
        style: { width: { normal: '100%', mobile: '100%' } },
      },
    ],
  };

  // The draft adds a block the pinned build's page does not have, between two it does.
  const restructured: PageSource = {
    id: 'page-restructured',
    slug: 'restructured',
    title: 'Restructured',
    children: [
      { block: block('restructured', 'hero', sampleData('hero')) },
      ...(next ? [{ block: block('restructured', 'quote', sampleData('quote')) }] : []),
      { block: block('restructured', 'tabs', sampleData('tabs')) },
      { block: block('restructured', 'faq', sampleData('faq')) },
    ],
  };

  return [everyBlock, shared, localized, framing, restructured];
}

/**
 * The paths whose pinned and draft versions have the same blocks, with different content: one per
 * page, and the localized page in its second locale.
 */
export const PARITY_PATHS = ['/', '/shared', '/localized', '/is-IS/localized', '/framing'];

/** The page whose draft adds a block the pinned build does not have. */
export const RESTRUCTURED_PATH = '/restructured';

/** A component's root, cloned under its placement: the shape Core's public read expands to. */
function expandComponent(placement: string, component: Component): LayoutNode {
  const clone = (node: LayoutNode, root: boolean): LayoutNode => {
    const id = root ? placement : expandedNodeId(placement, node.id);
    const children = node.children as LayoutNode[] | undefined;
    return children === undefined
      ? { ...node, id }
      : { ...node, id, children: children.map((child) => clone(child, false)) };
  };
  return clone(component.root, true);
}

/**
 * One page in the shape Core answers it.
 *
 * `public` — a build's read: every placement already expanded in place (the component's root takes
 * the placement id, its descendants the `r` + SHA-256 namespace) and no projection anywhere.
 * `draft` — a preview read (`X-Preview-Token`, and a session's `X-Preview-Session`, which reads the
 * same perspective): the `reusable` placement nodes stay, and a `reusableComponentProjection` names
 * the exact component revisions for the runtime to expand — `projectReusableComponentsForWeb` in
 * Core's cms-service.
 */
function pageEntry(source: PageSource, shape: 'public' | 'draft'): Record<string, unknown> {
  const blocks: Block[] = [];
  const children: LayoutNode[] = [];
  const components: Array<{ placement: string; component: Component }> = [];
  for (const child of source.children) {
    if ('block' in child) {
      blocks.push(child.block);
      children.push({
        id: `node-${child.block.id.slice(0, 8)}`,
        type: 'block',
        entryId: child.block.id,
        ...(child.style === undefined ? {} : { style: child.style }),
      });
      continue;
    }
    blocks.push(...child.component.blocks);
    components.push(child);
    children.push(
      shape === 'public'
        ? expandComponent(child.placement, child.component)
        : { id: child.placement, type: 'reusable', componentId: child.component.componentId }
    );
  }
  const entry: Record<string, unknown> = {
    id: source.id,
    data: {
      title: source.title,
      slug: source.slug,
      layout: {
        version: 2,
        root: { id: 'root', type: 'flex', layout: { direction: { normal: 'column' } }, children },
      },
      blocks,
    },
  };
  if (shape === 'draft' && components.length > 0) {
    entry.reusableComponentProjection = {
      bindings: components.map(({ placement, component }) => ({
        placementId: placement,
        componentId: component.componentId,
        siteId: SITE_ID,
        revision: component.revision,
      })),
      revisions: components.map(({ component }) => ({
        componentId: component.componentId,
        siteId: SITE_ID,
        revision: component.revision,
        document: { version: 1, root: component.root },
      })),
    };
  }
  return entry;
}

/** Core answers a top-level localized field in the locale asked for, the default one otherwise. */
function inLocale(value: unknown, locale: string): unknown {
  if (Array.isArray(value)) return value.map((item) => inLocale(item, locale));
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => (LOCALES as readonly string[]).includes(key))) {
    return record[locale] ?? record['en-US'];
  }
  return Object.fromEntries(keys.map((key) => [key, inLocale(record[key], locale)]));
}

function listResponse(data: unknown[]): Record<string, unknown> {
  return {
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
  };
}

export interface ContentGateway {
  url: string;
  /** What a public read answers: `pinned` while the session's deployment is built, `next` after. */
  published: ContentVersion;
  /** The resolved design-token catalog `/site/v1/design-tokens` answers, or `null` for a 404. */
  designTokens: Record<string, unknown> | null;
  /** `pathname + search` of every request answered from the draft perspective. */
  draftReads: string[];
  close(): Promise<void>;
}

/**
 * The CMS half of a gateway, in both of Core's perspectives: a request carrying
 * `X-Preview-Session` reads the drafts (always `next`, in the draft shape, marked
 * `Eldra-Preview: draft` as Core marks a session's answers), any other reads the published
 * version. Everything else goes to `upstream`, the starter's own mock gateway.
 */
export function startContentGateway(upstream: string): Promise<ContentGateway> {
  const state: ContentGateway = {
    url: '',
    published: 'pinned',
    designTokens: null,
    draftReads: [],
    close: () => Promise.resolve(),
  };
  const server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: String(error) }));
    });
  });

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const draft = req.headers['x-preview-session'] !== undefined;
    const ownsPath =
      url.pathname.startsWith('/cms/v1/schema/page/entry') ||
      url.pathname.startsWith('/cms/v1/schema/route-template/entry') ||
      url.pathname === '/site/v1/design-tokens';
    if (!ownsPath) {
      await forward(req, res, `${upstream}${url.pathname}${url.search}`);
      return;
    }
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.headers['x-org-id'] !== ORG_ID) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'missing org id' }));
      return;
    }
    if (draft && url.pathname.startsWith('/cms/')) {
      res.setHeader('eldra-preview', 'draft');
      state.draftReads.push(url.pathname + url.search);
    }
    const answer = (body: unknown, status = 200): void => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    if (url.pathname === '/site/v1/design-tokens') {
      if (state.designTokens === null) answer({}, 404);
      else answer({ revision: 9, resolved: state.designTokens });
      return;
    }
    if (url.pathname === '/cms/v1/schema/route-template/entry') {
      // No route templates: the harness is about pages, and a product page's template is the same
      // `EldraLayout` render over the same blocks.
      answer(listResponse([]));
      return;
    }
    if (url.pathname.startsWith('/cms/v1/schema/route-template/entry/')) {
      answer({}, 404);
      return;
    }
    const locale = url.searchParams.get('locale') ?? 'en-US';
    const entries = pageSources(draft ? 'next' : state.published).map((source) =>
      inLocale(pageEntry(source, draft ? 'draft' : 'public'), locale)
    );
    if (url.pathname === '/cms/v1/schema/page/entry') {
      answer(listResponse(entries));
      return;
    }
    const id = url.pathname.split('/').pop();
    const entry = entries.find((candidate) => (candidate as { id: string }).id === id);
    answer(entry ?? {}, entry === undefined ? 404 : 200);
  };

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) return;
      state.url = `http://127.0.0.1:${address.port}`;
      state.close = () => closeServer(server);
      resolve(state);
    });
  });
}

/** Passes a request through to `target`, status, headers and body as they are. */
async function forward(req: IncomingMessage, res: ServerResponse, target: string): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === 'host' || name === 'connection') continue;
    headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    redirect: 'manual',
  });
  const out: Record<string, string> = {};
  upstream.headers.forEach((value, name) => {
    if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) {
      out[name] = value;
    }
  });
  res.writeHead(upstream.status, out).end(Buffer.from(await upstream.arrayBuffer()));
}

/** What the stand-in router keeps for the session: the secret, never the browser's. */
export const SESSION_SECRET = 'eldra_prv_parity-session-secret';

/** The two tags the router puts at the top of every page it serves for a session. */
const SESSION_HEAD =
  '<meta name="robots" content="noindex, nofollow"><meta name="eldra-preview" content="session">';

export interface SessionRouter {
  origin: string;
  close(): Promise<void>;
}

/**
 * The preview router, as far as a page can tell (site-deploy-worker `src/preview-router.ts`): the
 * session's pinned deployment, served by the same static host a published site has (so the same
 * trailing-slash redirect), with the theme's own robots tag replaced by `noindex, nofollow` and the
 * session marker added to every HTML document, and the draft read proxy at `/__eldra/gateway/*`
 * adding the organisation and `X-Preview-Session` itself.
 */
export async function startSessionRouter(
  publicDir: string,
  gatewayUrl: string
): Promise<SessionRouter> {
  const statics: StaticServer = await startStaticServer(publicDir);
  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      res.statusCode = 502;
      res.end(String(error));
    });
  });
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/__eldra/gateway/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const headers: Record<string, string> = {
        accept: 'application/json',
        'x-org-id': ORG_ID,
        'x-preview-session': SESSION_SECRET,
      };
      const language = req.headers['accept-language'];
      if (typeof language === 'string') headers['accept-language'] = language;
      if (req.method === 'POST') headers['content-type'] = 'application/json';
      const rest = url.pathname.slice('/__eldra/gateway'.length);
      const upstream = await fetch(`${gatewayUrl}${rest}${url.search}`, {
        method: req.method,
        headers,
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
      });
      const out: Record<string, string> = { 'cache-control': 'no-store' };
      const type = upstream.headers.get('content-type');
      if (type) out['content-type'] = type;
      const marker = upstream.headers.get('eldra-preview');
      if (marker) out['eldra-preview'] = marker;
      res.writeHead(upstream.status, out).end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const upstream = await fetch(`${statics.origin}${url.pathname}${url.search}`, {
      redirect: 'manual',
    });
    const out: Record<string, string> = {};
    upstream.headers.forEach((value, name) => {
      if (!['content-length', 'transfer-encoding', 'connection'].includes(name)) out[name] = value;
    });
    let body: Buffer | string = Buffer.from(await upstream.arrayBuffer());
    if ((upstream.headers.get('content-type') ?? '').startsWith('text/html')) {
      body = body
        .toString('utf8')
        .replace(/<meta name="robots"[^>]*>/g, '')
        .replace('<head>', `<head>${SESSION_HEAD}`);
    }
    res.writeHead(upstream.status, out).end(body);
  };
  const origin = await new Promise<string>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        resolve(`http://127.0.0.1:${address.port}`);
      }
    });
  });
  return {
    origin,
    close: async () => {
      await closeServer(server);
      await statics.close();
    },
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
