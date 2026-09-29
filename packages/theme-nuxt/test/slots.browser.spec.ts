import {
  chromium,
  type Browser,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from '@playwright/test';
import { execa } from 'execa';
import { createServer, type Server } from 'node:http';
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
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/basic', import.meta.url));
const nuxi = join(packageDir, 'node_modules', '.bin', 'nuxi');
const moduleUrl = pathToFileURL(join(packageDir, 'dist', 'module.mjs')).href;
const orgId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const HOST_ID = '55555555-5555-4555-8555-555555555555';
const CTA_ID = '66666666-6666-4666-8666-666666666666';
const HIDDEN_ID = '77777777-7777-4777-8777-777777777777';

interface ArtifactServer {
  server: Server;
  origin: string;
}

let browser: Browser;
let studioServer: ArtifactServer;

describe('real-browser slotted layout static/preview parity', () => {
  beforeAll(async () => {
    browser = await launchChromium();
    studioServer = await startStudioServer();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await closeServer(studioServer?.server);
  });

  it('renders slot children in static DOM, editor markers and a dimmed hidden node under preview negotiation', async () => {
    const gateway = await startGateway();
    const root = createFixture(new URL(studioServer.origin).origin);
    let staticServer: ArtifactServer | undefined;
    let context: BrowserContext | undefined;
    let testError: unknown;
    try {
      await generate(root, gateway.origin);
      const html = readFileSync(join(root, '.output', 'public', 'index.html'), 'utf8');
      expect(html).toContain('data-eldra-slot-id="actions"');
      expect(html).not.toContain('data-eldra-slot-marker');

      staticServer = await startArtifactServer(join(root, '.output', 'public'));
      context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

      // (a) Static DOM: slot children visible with correct nesting.
      const staticPage = await context.newPage();
      await staticPage.goto(staticServer.origin, { waitUntil: 'networkidle' });
      const slotWrapper = staticPage.locator('[data-eldra-slot-id="actions"]');
      await slotWrapper.waitFor({ state: 'attached' });
      await expect.poll(() => slotWrapper.locator('.cta').textContent()).toBe('Shop now');
      expect(await slotWrapper.locator('[data-eldra-schema="cta"]').count()).toBe(1);
      expect(await slotWrapper.locator(`[data-eldra-block="${CTA_ID}"]`).count()).toBe(1);

      // (b) No editor markers in static output.
      expect(await staticPage.locator('[data-eldra-slot-marker]').count()).toBe(0);
      // The slot is populated, so the block's fallback markup must be absent.
      expect(await staticPage.locator('[data-eldra-slot-fallback]').count()).toBe(0);

      // (c) Preview-style page negotiating editor capabilities renders markers.
      const previewPage = await context.newPage();
      const previewUrl = new URL(studioServer.origin);
      previewUrl.searchParams.set('theme', staticServer.origin);
      await previewPage.goto(previewUrl.href);
      const previewFrame = await waitForThemeFrame(previewPage, staticServer.origin);
      await previewFrame.waitForSelector('[data-eldra-slot-id="actions"]');
      await expect.poll(() => previewFrame.locator('[data-eldra-slot-marker]').count()).toBe(1);
      await expect
        .poll(() =>
          previewFrame.locator('[data-eldra-slot-marker]').getAttribute('data-eldra-slot-id')
        )
        .toBe('actions');
      // Markers are inert and editor-only; slot content still renders beneath
      // them. Scoped to the slot: the page also carries a second `cta` block,
      // the breakpoint-hidden one checked below.
      await expect
        .poll(() => previewFrame.locator('[data-eldra-slot-id="actions"] .cta').textContent())
        .toBe('Shop now');

      // (d) A node the layout hides at this breakpoint: `display:none` on the
      // published artifact. Only a real browser evaluates the `@media` block
      // the rule lives in, which is why this assertion is here and not in
      // jsdom. The element is in the DOM either way — it is hidden, not
      // dropped.
      const staticHidden = staticPage.locator('[data-eldra-layout-node="hidden-placement"]');
      await staticHidden.waitFor({ state: 'attached' });
      expect(await staticHidden.getAttribute('data-eldra-hidden')).toBe('normal tablet mobile');
      await expect
        .poll(() => staticHidden.evaluate((node) => getComputedStyle(node).display))
        .toBe('none');
      await expect
        .poll(() =>
          staticPage
            .locator('[data-eldra-slot-id="actions"][data-eldra-layout-node="cta-placement"]')
            .evaluate((node) => getComputedStyle(node).display)
        )
        .toBe('none');
      expect(await staticPage.locator('[data-eldra-edit-mode]').count()).toBe(0);

      // (e) The same node under the bridge in edit mode: the overlay marks it
      // after mount, which defeats the `:not([data-eldra-edit-mode])` gate, so
      // the author can still see and select it — dimmed, never invisible.
      const previewHidden = previewFrame.locator('[data-eldra-layout-node="hidden-placement"]');
      await previewHidden.waitFor();
      await expect
        .poll(() => previewHidden.evaluate((node) => getComputedStyle(node).display))
        .not.toBe('none');
      expect(await previewHidden.getAttribute('data-eldra-edit-mode')).toBe('');
      expect(await previewHidden.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.35');
      await expect
        .poll(() => previewHidden.locator('.cta').textContent())
        .toBe('Hidden on every device');

      // (f) A hidden *slot child*: the binding renders its layout-node class on
      // the slot wrapper and again on the block div inside it, and the overlay
      // marks both (it must — the `display:none` gate is per element). Opacity
      // multiplies through nesting where `display:none` did not, so the dimming
      // rule is scoped to a marked element with no marked ancestor and the
      // composited result is one 35 %, not 0.35 x 0.35 = 0.1225.
      // The editor-only slot *marker* carries `data-eldra-slot-id` too, so the
      // wrapper is addressed by its layout node.
      const slotSelector = '[data-eldra-slot-id="actions"][data-eldra-layout-node="cta-placement"]';
      const slotChild = previewFrame.locator(slotSelector);
      const slotChildInner = previewFrame.locator(`${slotSelector} [data-eldra-schema="cta"]`);
      await slotChild.waitFor();
      expect(await slotChild.getAttribute('data-eldra-edit-mode')).toBe('');
      expect(await slotChildInner.getAttribute('data-eldra-edit-mode')).toBe('');
      expect(await slotChild.evaluate((node) => getComputedStyle(node).opacity)).toBe('0.35');
      expect(await slotChildInner.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
      expect(await effectiveOpacity(slotChildInner)).toBeCloseTo(0.35, 3);
      // …and the nested case reads the same: a hidden node under a hidden node.
      expect(await effectiveOpacity(previewHidden)).toBeCloseTo(0.35, 3);
    } catch (error) {
      testError = error;
    }
    const cleanup = await Promise.allSettled([
      context?.close(),
      closeServer(staticServer?.server),
      closeServer(gateway.server),
    ]);
    rmSync(root, { recursive: true, force: true });
    if (testError !== undefined) throw testError;
    const rejected = cleanup.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  }, 240_000);
});

function createFixture(studioOrigin: string): string {
  const root = mkdtempSync(join(tmpdir(), 'eldra-slots-browser-'));
  mkdirSync(join(root, 'app', 'pages'), { recursive: true });
  mkdirSync(join(root, 'blocks'), { recursive: true });
  cpSync(join(fixtureDir, 'blocks', 'hero'), join(root, 'blocks', 'hero'), { recursive: true });
  cpSync(join(fixtureDir, 'blocks', 'cta'), join(root, 'blocks', 'cta'), { recursive: true });
  // The scanned manifest derives its container catalog from tokens.json; the
  // layout's container:content style fails validation without it.
  cpSync(join(fixtureDir, 'tokens.json'), join(root, 'tokens.json'));
  mkdirSync(join(root, 'node_modules', '@eldrajs'), { recursive: true });
  symlinkSync(join(packageDir, 'node_modules', 'nuxt'), join(root, 'node_modules', 'nuxt'), 'dir');
  symlinkSync(
    join(repoDir, 'packages', 'theme-vue'),
    join(root, 'node_modules', '@eldrajs', 'theme-vue'),
    'dir'
  );
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'eldra-slots-browser-fixture',
      private: true,
      version: '1.0.0',
      type: 'module',
    })
  );
  writeFileSync(join(root, 'app', 'app.vue'), '<template><NuxtPage /></template>\n');
  writeFileSync(
    join(root, 'app', 'pages', '[...slug].vue'),
    `<script setup lang="ts">
import { EldraLayout } from '@eldrajs/theme-vue';
const { page, layout, blocks } = useEldraPage();
</script>
<template><main><EldraLayout v-if="page && layout" :layout="layout" :blocks="blocks" nonce="slots-nonce" /></main></template>
`
  );
  writeFileSync(
    join(root, 'nuxt.config.ts'),
    `import eldra from ${JSON.stringify(moduleUrl)};
export default defineNuxtConfig({
  modules: [eldra],
  ssr: true,
  devtools: { enabled: false },
  nitro: { prerender: { crawlLinks: false, failOnError: false, routes: ['/'] } },
  eldra: {
    gatewayUrl: process.env.ELDRA_GATEWAY_URL,
    orgId: process.env.ELDRA_ORG_ID,
    studioOrigins: [${JSON.stringify(studioOrigin)}],
  },
});
`
  );
  return root;
}

/** An element's composited alpha: its own opacity times every ancestor's. */
function effectiveOpacity(locator: Locator): Promise<number> {
  return locator.evaluate((node) => {
    let value = 1;
    for (let element: Element | null = node; element !== null; element = element.parentElement) {
      value *= Number(getComputedStyle(element).opacity);
    }
    return value;
  });
}

async function generate(root: string, gatewayUrl: string): Promise<void> {
  await execa(nuxi, ['generate'], {
    cwd: root,
    env: { ELDRA_GATEWAY_URL: gatewayUrl, ELDRA_ORG_ID: orgId },
    timeout: 150_000,
  });
  const output = join(root, '.output', 'public', 'index.html');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(output) && readFileSync(output, 'utf8').includes('data-eldra-slot-id="actions"'))
      return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('generated HTML did not settle on the slotted layout');
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

async function waitForThemeFrame(page: Page, origin: string): Promise<Frame> {
  await page.waitForFunction(
    (expectedOrigin) =>
      [...document.querySelectorAll('iframe')].some((frame) =>
        frame.src.startsWith(expectedOrigin)
      ),
    origin
  );
  await expect
    .poll(() => page.frames().find((frame) => frame.url().startsWith(origin)))
    .toBeTruthy();
  return page.frames().find((frame) => frame.url().startsWith(origin))!;
}

async function startGateway(): Promise<ArtifactServer> {
  const page = {
    id: 'p-home',
    data: {
      slug: 'home',
      title: 'Home',
      layout: {
        version: 3,
        root: {
          id: 'page-grid',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          style: { container: { normal: 'content' } },
          children: [
            {
              id: 'hero-placement',
              type: 'block',
              entryId: HOST_ID,
              slots: {
                // Hidden too, and a *slot child* — the binding renders its
                // class on both the slot wrapper and the block div inside it,
                // which is where an unscoped `opacity` would compound.
                actions: [
                  {
                    id: 'cta-placement',
                    type: 'block',
                    entryId: CTA_ID,
                    style: { visible: { normal: false } },
                  },
                ],
              },
            },
            // Hidden at every breakpoint, so the assertions below do not
            // depend on the browser viewport the context was opened with.
            {
              id: 'hidden-placement',
              type: 'block',
              entryId: HIDDEN_ID,
              style: { visible: { normal: false } },
            },
          ],
        },
      },
      blocks: [
        {
          id: HOST_ID,
          schemaApiId: 'hero',
          data: { heading: 'Slotted hero heading', subheading: 'Browser parity' },
        },
        { id: CTA_ID, schemaApiId: 'cta', data: { label: 'Shop now' } },
        { id: HIDDEN_ID, schemaApiId: 'cta', data: { label: 'Hidden on every device' } },
      ],
    },
  };
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'X-Org-Id, X-Preview-Token');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
    } else if (request.headers['x-org-id'] !== orgId) {
      response.writeHead(400).end('{}');
    } else if (url.pathname === '/cms/v1/schema/page/entry') {
      response.end(
        JSON.stringify({
          data: [page],
          meta: {
            hasNext: false,
            hasPrev: false,
            page: 1,
            pageSize: 100,
            rows: 1,
            total: 1,
            totalPages: 1,
          },
        })
      );
    } else if (url.pathname === '/cms/v1/schema/route-template/entry') {
      response.end(
        JSON.stringify({
          data: [],
          meta: {
            hasNext: false,
            hasPrev: false,
            page: 1,
            pageSize: 100,
            rows: 0,
            total: 0,
            totalPages: 0,
          },
        })
      );
    } else if (url.pathname === '/cms/v1/schema/page/entry/p-home') {
      response.end(JSON.stringify(page));
    } else {
      response.writeHead(404).end('{}');
    }
  });
  return listen(server);
}

async function startArtifactServer(root: string): Promise<ArtifactServer> {
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/, '');
    if (relative.startsWith('..')) {
      response.writeHead(400).end('Invalid path');
      return;
    }
    try {
      const body = readFileSync(join(root, relative));
      response
        .writeHead(200, {
          'content-type': contentTypes[extname(relative)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        })
        .end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  return listen(server);
}

async function startStudioServer(): Promise<ArtifactServer> {
  const server = createServer((request, response) => {
    const theme = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('theme') ?? '';
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><iframe id="theme" src="${escapeHtml(theme)}"></iframe><script>
const frame = document.querySelector('#theme');
const targetOrigin = new URL(frame.src).origin;
let sequence = 0;
const envelope = (type, payload) => ({ protocol: 'eldra-bridge', version: 1, id: 'studio-' + (++sequence), type, payload });
const post = (type, payload) => frame.contentWindow.postMessage(envelope(type, payload), targetOrigin);
// hello keeps re-running: the theme answers theme:ready on every hello, so
// the block-slots capability is observed even if the first hello raced the
// theme's bridge bootstrap. editor:init must follow a hello (the bridge only
// exists after the theme mounted), and is sent once per session.
const hello = setInterval(() => post('editor:hello', {
  capabilities: ['content-update', 'select-block', 'inline-text', 'block-slots']
}), 100);
let inited = false;
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.origin !== targetOrigin) return;
  if (event.data?.type !== 'theme:ready' || inited) return;
  inited = true;
  post('editor:init', { mode: 'edit', previewToken: 'studio-token', locale: 'en-US', path: '/' });
});
</script>`);
  });
  return listen(server);
}

function listen(server: Server): Promise<ArtifactServer> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) throw new Error('server did not bind');
      resolve({ server, origin: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function closeServer(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}
