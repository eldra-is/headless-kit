import { normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import {
  flattenMessages,
  resolveMessageCatalogue,
  type ThemeMessages,
} from '@eldrajs/theme-core/i18n';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join } from 'node:path';
import starterTokens from '../../tokens.json';
import starterEnUs from '../../i18n/en-US.json';
import starterIsIs from '../../i18n/is-IS.json';
import { DEFAULT_LOCALE, ORG_ID, PREFIXED_LOCALE } from './mockGateway';
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
  /**
   * The resolved design-token catalog `/site/v1/design-tokens` answers: what the site has saved.
   * Core answers for every organisation with a site, so this is never a 404: before anything is
   * saved it is the theme's own catalog (`SITE_DESIGN_TOKENS`).
   */
  designTokens: Record<string, unknown>;
  /** What `/site/v1/theme-messages` answers, the same way (`SITE_THEME_MESSAGES`). */
  themeMessages: ThemeMessages;
  /** `pathname + search` of every request answered from the draft perspective. */
  draftReads: string[];
  close(): Promise<void>;
}

/** The site settings the content gateway answers itself, as Core's web-gateway does. */
const SITE_SETTINGS = new Set(['/site/v1/design-tokens', '/site/v1/theme-messages']);

/** What Core answers for the site's design tokens before any is saved: the theme's own catalog. */
export const SITE_DESIGN_TOKENS = normalizeThemeDesignTokens(starterTokens) as unknown as Record<
  string,
  unknown
>;

/**
 * What Core answers for the site's theme texts before any is saved (`GetPublicThemeMessages`): the
 * theme's own catalogue resolved over the organisation's locales, with no overrides.
 */
export const SITE_THEME_MESSAGES: ThemeMessages = resolveMessageCatalogue(
  {
    defaultLocale: DEFAULT_LOCALE,
    locales: {
      [DEFAULT_LOCALE]: flattenMessages(starterEnUs),
      [PREFIXED_LOCALE]: flattenMessages(starterIsIs),
    },
  },
  null,
  [DEFAULT_LOCALE, PREFIXED_LOCALE],
  DEFAULT_LOCALE
);

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
    designTokens: SITE_DESIGN_TOKENS,
    themeMessages: SITE_THEME_MESSAGES,
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
    if (!isCoreRead(url.pathname) && !SITE_SETTINGS.has(url.pathname)) {
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
    // Site settings are not drafts: Core reads the Site row, the same answer in both perspectives,
    // never marked `Eldra-Preview: draft`.
    if (url.pathname === '/site/v1/design-tokens') {
      res.end(JSON.stringify({ revision: 9, resolved: state.designTokens }));
      return;
    }
    if (url.pathname === '/site/v1/theme-messages') {
      res.end(JSON.stringify(state.themeMessages));
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

/**
 * Exactly what the router prepends right after `<head>` in every page it serves for a session
 * (site-deploy-worker `withPreviewHead`, WS-1376): the robots tag, the session marker, and the early
 * hide — a `<style>` whose 12 s animation keeps the body hidden until the kit sets
 * `data-eldra-preview-ready` on `<html>` (after it, the page shows with a notice if the kit never
 * did) and its `<noscript>` twin. Copied byte for byte (788 bytes), CSS escapes included.
 */
const SESSION_HEAD = String.raw`<meta name="robots" content="noindex, nofollow"><meta name="eldra-preview" content="session"><style>html:not([data-eldra-preview-ready]) body{animation:eldra-preview-veil 12s step-end}html:not([data-eldra-preview-ready])::before{content:"Forsko\f0 unin f\f3 r ekki \ed  gang. \de etta er \fa tgefna s\ed \f0 an.\a The preview could not start. This is the published page.";display:block;white-space:pre-line;padding:8px 16px;font:14px/1.4 system-ui,sans-serif;color:#1f2328;background:#fff8c5;border-bottom:1px solid #d4a72c;animation:eldra-preview-veil 12s step-end}@keyframes eldra-preview-veil{from,to{visibility:hidden}}</style><noscript><style>html:not([data-eldra-preview-ready]) body,html:not([data-eldra-preview-ready])::before{visibility:visible;animation:none}</style></noscript>`;

export interface SessionRouter {
  origin: string;
  close(): Promise<void>;
}

/**
 * The preview router, as far as a page can tell (site-deploy-worker `src/preview-router.ts`): the
 * session's pinned deployment, served by the same static host a published site has (so the same
 * trailing-slash redirect), with the theme's own robots tag replaced by `SESSION_HEAD` (the robots
 * tag, the session marker and the early hide) in every HTML document, and the draft read proxy at
 * `/__eldra/gateway/*` adding the organisation and `X-Preview-Session` itself.
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
        // The router drops a ready attribute the page itself carries: only the kit lifts the hide.
        .replace(/(<html\b[^>]*?)\s+data-eldra-preview-ready(?:="[^"]*")?/, '$1')
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
