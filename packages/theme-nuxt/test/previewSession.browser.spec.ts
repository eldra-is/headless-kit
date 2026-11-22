/**
 * A draft preview session, in a real browser (WS-1303).
 *
 * The artifact is an ordinary `nuxi generate` build against the mock gateway's **published**
 * content. A stand-in for the preview router serves it the way the router serves a session's pinned
 * script — with the session marker it injects into every page — and proxies `/__eldra/gateway/*`
 * to the gateway with the organisation and `X-Preview-Session` it adds itself, the browser holding
 * nothing. So the page's first paint is the published prerender; what it must end up showing is the
 * draft, and after a refusal, never the published page.
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execa } from 'execa';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DRAFT_MARKER, startMockGateway } from './mockGateway';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/basic', import.meta.url));
const nuxi = join(packageDir, 'node_modules', '.bin', 'nuxi');
const moduleUrl = pathToFileURL(join(packageDir, 'dist', 'module.mjs')).href;
const orgId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
/** The published hero heading the prerender carries. */
const PUBLISHED_HEADING = 'Generated heading';
/** What the stand-in router keeps in its "cookie": the session's secret, never the browser's. */
const SESSION_SECRET = 'eldra_prv_test-session-secret';

type Gateway = Awaited<ReturnType<typeof startMockGateway>>;

interface RouterRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
}

interface SessionRouter {
  server: Server;
  origin: string;
  /** Every request the browser made to the router. */
  requests: RouterRequest[];
  /** When set, every draft read is refused the way the router refuses a dead session. */
  refuse: { status: number; errorId: string } | null;
}

let browser: Browser;
let gateway: Gateway;
let root: string;
let publicDir: string;
let context: BrowserContext | undefined;
const servers: Server[] = [];

describe('draft preview session in a real browser', () => {
  beforeAll(async () => {
    gateway = await startMockGateway({ drafts: true, cors: true });
    root = createFixture();
    await generate(root, gateway.url);
    publicDir = join(root, '.output', 'public');
    browser = await launchChromium();
  }, 240_000);

  afterAll(async () => {
    await browser?.close();
    await Promise.allSettled([gateway?.server, ...servers].map((server) => closeServer(server)));
    if (root) rmSync(root, { recursive: true, force: true });
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it('renders draft from proxy', async () => {
    // The control: the same artifact outside a session is the published storefront, untouched.
    const plain = await startRouter({ session: false });
    context = await browser.newContext();
    const storefront = await context.newPage();
    const storefrontConsole = collectConsole(storefront);
    await storefront.goto(plain.origin, { waitUntil: 'networkidle' });
    await expect.poll(() => appText(storefront)).toContain(PUBLISHED_HEADING);
    expect(await storefront.locator('[data-eldra-preview-session]').count()).toBe(0);
    expect(plain.requests.some((request) => request.path.startsWith('/__eldra/'))).toBe(false);

    const router = await startRouter({ session: true });
    const page = await context.newPage();
    const console = collectConsole(page);
    await page.goto(router.origin);
    await expect.poll(() => appText(page), { timeout: 30_000 }).toContain(DRAFT_MARKER);
    expect(await appText(page)).not.toContain(PUBLISHED_HEADING);
    // The veil is down once the draft is on screen, and the app is no longer busy.
    await expect
      .poll(() => page.locator('[data-eldra-preview-session] .veil').getAttribute('hidden'))
      .toBe('');
    expect(await page.locator('#__nuxt').getAttribute('aria-busy')).toBeNull();
    // The exit banner, in the page's own language (the site's default locale is Icelandic).
    const exit = page.locator('[data-eldra-preview-session] .banner a');
    expect(await exit.getAttribute('href')).toBe('/__eldra/preview/exit');
    expect(await exit.textContent()).toBe('Hætta í forskoðun');
    // The drafts arrived through the proxy, carrying the router's session.
    expect(
      router.requests.some((request) => request.path.startsWith('/__eldra/gateway/cms/'))
    ).toBe(true);
    expect(gateway.previewSessions).toContain(SESSION_SECRET);
    // The published DOM was hydrated exactly as the storefront hydrates it — no mismatch of the
    // session's own — before the draft replaced it. (This fixture's storefront reports one of its
    // own, outside a session too, so the comparison is with that rather than with none.)
    const hydration = (lines: string[]) => lines.filter((line) => /hydration/i.test(line));
    expect(hydration(console)).toEqual(hydration(storefrontConsole));
  });

  it('never sends X-Preview-Token in session mode', async () => {
    const router = await startRouter({ session: true });
    context = await browser.newContext();
    const page = await context.newPage();
    const sent: Array<{ url: string; headers: Record<string, string> }> = [];
    page.on('request', (request) => {
      void request.allHeaders().then((headers) => sent.push({ url: request.url(), headers }));
    });
    const gatewayReadsBefore = gateway.previewTokens.length;
    await page.goto(router.origin);
    await expect.poll(() => appText(page), { timeout: 30_000 }).toContain(DRAFT_MARKER);
    await page.waitForLoadState('networkidle');

    expect(sent.length).toBeGreaterThan(0);
    for (const { url, headers } of sent) {
      expect(headers['x-preview-token'], url).toBeUndefined();
      expect(headers['x-preview-session'], url).toBeUndefined();
      expect(headers.authorization, url).toBeUndefined();
      // Every CMS read is same-origin, through the router; none reaches the gateway directly.
      if (new URL(url).pathname.includes('/cms/v1/')) {
        expect(new URL(url).origin, url).toBe(new URL(router.origin).origin);
        expect(headers['x-org-id'], url).toBeUndefined();
      }
    }
    expect(gateway.previewTokens.slice(gatewayReadsBefore).every((token) => token === null)).toBe(
      true
    );
  });

  it('draft-only path renders', async () => {
    const router = await startRouter({ session: true });
    context = await browser.newContext();
    const page = await context.newPage();

    // A client navigation to a page the build has never contained.
    await page.goto(router.origin);
    await expect.poll(() => appText(page), { timeout: 30_000 }).toContain(DRAFT_MARKER);
    await page.getByRole('link', { name: 'Draft only' }).click();
    await expect
      .poll(() => page.locator('h1').first().textContent(), { timeout: 30_000 })
      .toBe(`${DRAFT_MARKER} page`);

    // And opened directly: the host has no file for it and answers its not-found document.
    const direct = await context.newPage();
    await direct.goto(`${router.origin}draft-only`);
    await expect
      .poll(() => direct.locator('h1').first().textContent(), { timeout: 30_000 })
      .toBe(`${DRAFT_MARKER} page`);
    await expect
      .poll(() => direct.locator('[data-eldra-preview-session] .veil').getAttribute('hidden'))
      .toBe('');
  });

  it('401 shows expired notice, never published content', async () => {
    const router = await startRouter({ session: true });
    router.refuse = { status: 401, errorId: 'SITE_PREVIEW_SESSION_EXPIRED' };
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(router.origin);

    const notice = page.locator('[data-eldra-preview-session] .notice');
    await expect.poll(() => notice.getAttribute('hidden'), { timeout: 30_000 }).toBeNull();
    expect(await notice.getAttribute('role')).toBe('alert');
    expect(await notice.locator('h2').textContent()).toBe('Forskoðuninni er lokið');
    expect(await notice.textContent()).toContain('Þessi forskoðunartengill er útrunninn.');
    // The published prerender is gone from the document, not merely covered.
    await expect.poll(() => appText(page)).not.toContain(PUBLISHED_HEADING);
    expect(await appText(page)).not.toContain(DRAFT_MARKER);
    expect(await page.locator('#__nuxt').evaluate((node) => (node as HTMLElement).inert)).toBe(
      true
    );
    // Never once uncovered: the veil or the notice was over the page the whole time.
    expect(await page.locator('[data-eldra-preview-session] .veil').getAttribute('hidden')).toBe(
      ''
    );
  });
});

/** The app's own text, outside the session UI (which lives in its own shadow root). */
function appText(page: Page): Promise<string> {
  return page.locator('#__nuxt').evaluate((node) => node.textContent ?? '');
}

function collectConsole(page: Page): string[] {
  const lines: string[] = [];
  page.on('console', (message) => lines.push(message.text()));
  return lines;
}

/**
 * The preview router, as far as the page can tell: the artifact with the session marker in every
 * HTML document (or, with `session: false`, an ordinary static host), and the draft read proxy.
 */
async function startRouter(options: { session: boolean }): Promise<SessionRouter> {
  const router: SessionRouter = {
    server: undefined as unknown as Server,
    origin: '',
    requests: [],
    refuse: null,
  };
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  router.server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    router.requests.push({
      method: request.method ?? 'GET',
      path: url.pathname,
      headers: request.headers,
    });
    if (options.session && url.pathname.startsWith('/__eldra/gateway/')) {
      void proxy(request, response, url, router);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const relative = normalize(pathname).replace(/^[/\\]+/, '');
    if (relative.startsWith('..')) {
      response.writeHead(400).end();
      return;
    }
    const candidates = relative === '' ? ['index.html'] : [relative, join(relative, 'index.html')];
    const found = candidates.find((candidate) => {
      const file = join(publicDir, candidate);
      return existsSync(file) && !file.endsWith('/') && readable(file);
    });
    const file = found ?? '404.html';
    const status = found === undefined ? 404 : 200;
    let body: Buffer | string = readFileSync(join(publicDir, file));
    const type = contentTypes[extname(file)] ?? 'application/octet-stream';
    if (options.session && extname(file) === '.html') {
      body = body
        .toString('utf8')
        .replace(
          '<head>',
          '<head><meta name="robots" content="noindex, nofollow"><meta name="eldra-preview" content="session">'
        );
    }
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
  });
  const origin = await listen(router.server);
  router.origin = origin;
  servers.push(router.server);
  return router;
}

function readable(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

/** The router's draft read proxy: a fresh header set, its own organisation and session. */
async function proxy(
  request: IncomingMessage,
  response: import('node:http').ServerResponse,
  url: URL,
  router: SessionRouter
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (router.refuse !== null) {
    response
      .writeHead(router.refuse.status, {
        'content-type': 'application/problem+json',
        'cache-control': 'no-store',
      })
      .end(JSON.stringify({ status: router.refuse.status, errorId: router.refuse.errorId }));
    return;
  }
  const rest = url.pathname.slice('/__eldra/gateway'.length);
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-org-id': orgId,
    'x-preview-session': SESSION_SECRET,
  };
  if (request.method === 'POST') headers['content-type'] = 'application/json';
  const upstream = await fetch(`${gateway.url}${rest}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
  });
  const out: Record<string, string> = { 'cache-control': 'no-store' };
  const type = upstream.headers.get('content-type');
  if (type) out['content-type'] = type;
  const marker = upstream.headers.get('eldra-preview');
  if (marker) out['eldra-preview'] = marker;
  response.writeHead(upstream.status, out).end(Buffer.from(await upstream.arrayBuffer()));
}

function createFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eldra-preview-session-'));
  mkdirSync(join(dir, 'app', 'pages'), { recursive: true });
  mkdirSync(join(dir, 'blocks'), { recursive: true });
  cpSync(join(fixtureDir, 'blocks', 'hero'), join(dir, 'blocks', 'hero'), { recursive: true });
  cpSync(join(fixtureDir, 'blocks', 'cta'), join(dir, 'blocks', 'cta'), { recursive: true });
  cpSync(join(fixtureDir, 'tokens.json'), join(dir, 'tokens.json'));
  mkdirSync(join(dir, 'node_modules', '@eldrajs'), { recursive: true });
  symlinkSync(join(packageDir, 'node_modules', 'nuxt'), join(dir, 'node_modules', 'nuxt'), 'dir');
  symlinkSync(
    join(repoDir, 'packages', 'theme-vue'),
    join(dir, 'node_modules', '@eldrajs', 'theme-vue'),
    'dir'
  );
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'eldra-preview-session-fixture',
      private: true,
      version: '1.0.0',
      type: 'module',
      eldra: { themeId: 'session-fixture' },
    })
  );
  writeFileSync(join(dir, 'app', 'app.vue'), '<template><NuxtPage /></template>\n');
  writeFileSync(
    join(dir, 'app', 'pages', '[...slug].vue'),
    `<script setup lang="ts">
import { EldraLayout } from '@eldrajs/theme-vue';
const { page, layout, blocks } = useEldraPage();
</script>
<template>
  <main>
    <h1>{{ page ? page.data.title : 'Not found' }}</h1>
    <EldraLayout v-if="page && layout" :layout="layout" :blocks="blocks" />
    <NuxtLink to="/draft-only">Draft only</NuxtLink>
  </main>
</template>
`
  );
  writeFileSync(
    join(dir, 'nuxt.config.ts'),
    `import eldra from ${JSON.stringify(moduleUrl)};
export default defineNuxtConfig({
  modules: [eldra],
  ssr: true,
  devtools: { enabled: false },
  nitro: { prerender: { crawlLinks: false, failOnError: false, routes: ['/'] } },
  eldra: {
    locale: 'is',
    gatewayUrl: process.env.ELDRA_GATEWAY_URL,
    orgId: process.env.ELDRA_ORG_ID,
    studioOrigins: ['https://studio.example.test'],
  },
});
`
  );
  return dir;
}

async function generate(dir: string, gatewayUrl: string): Promise<void> {
  await execa(nuxi, ['generate'], {
    cwd: dir,
    env: { ELDRA_GATEWAY_URL: gatewayUrl, ELDRA_ORG_ID: orgId, ELDRA_BUILD_TARGET: 'preview' },
    timeout: 200_000,
  });
  const index = join(dir, '.output', 'public', 'index.html');
  if (!existsSync(index) || !readFileSync(index, 'utf8').includes(PUBLISHED_HEADING)) {
    throw new Error('the generated home page does not carry the published heading');
  }
  if (readFileSync(index, 'utf8').includes(DRAFT_MARKER)) {
    throw new Error('the generated home page carries a draft');
  }
}

async function launchChromium(): Promise<Browser> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) return chromium.launch({ executablePath, headless: true });
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    try {
      return await chromium.launch({ channel: 'chrome', headless: true });
    } catch {
      throw error;
    }
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) throw new Error('server did not bind');
      resolve(`http://127.0.0.1:${address.port}/`);
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}
