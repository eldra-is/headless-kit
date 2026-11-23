import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import { ORG_ID } from './mockGateway';
import { coreRead, isCoreRead, type ContentVersion } from './previewParityContent';
import { startStaticServer, type StaticServer } from './staticServer';

/**
 * The servers of the preview parity harness (`test/previewParity.browser.spec.ts`, WS-1358): a
 * stand-in gateway whose CMS reads are Core's two perspectives (`./previewParityContent.ts`), and a
 * stand-in for the preview router that serves a pinned build the way it serves a session.
 *
 * Everything the content gateway does not own (the catalog, carts, the organisation, the site
 * profile) is forwarded to the starter's own mock gateway (`./mockGateway.ts`), so commerce reads
 * are exactly what every other generated-site test sees.
 */

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
    if (!isCoreRead(url.pathname) && url.pathname !== '/site/v1/design-tokens') {
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
    if (url.pathname === '/site/v1/design-tokens') {
      res.statusCode = state.designTokens === null ? 404 : 200;
      res.end(
        JSON.stringify(
          state.designTokens === null ? {} : { revision: 9, resolved: state.designTokens }
        )
      );
      return;
    }
    if (draft) {
      res.setHeader('eldra-preview', 'draft');
      state.draftReads.push(url.pathname + url.search);
    }
    const { status, body } = coreRead(draft ? 'draft' : 'public', state.published, url);
    res.statusCode = status;
    res.end(JSON.stringify(body));
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
    // A page the pinned build does not have (a draft-only page): the host answers the build's own
    // not-found document, and the app resolves the route from the drafts.
    if (upstream.status === 404 && extname(url.pathname) === '') {
      body = readFileSync(join(publicDir, '404.html'));
      out['content-type'] = 'text/html; charset=utf-8';
    }
    if ((out['content-type'] ?? '').startsWith('text/html')) {
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
