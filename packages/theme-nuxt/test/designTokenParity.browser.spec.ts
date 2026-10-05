import {
  chromium,
  type Browser,
  type BrowserContext,
  type Frame,
  type Page,
} from '@playwright/test';
import { execa } from 'execa';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
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
import { pathToFileURL, fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const repoDir = fileURLToPath(new URL('../../..', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/basic', import.meta.url));
const nuxi = join(packageDir, 'node_modules', '.bin', 'nuxi');
const moduleUrl = pathToFileURL(join(packageDir, 'dist', 'module.mjs')).href;
const requireFromVitePlugin = createRequire(
  join(repoDir, 'packages', 'vite-plugin-theme', 'package.json')
);
const tailwindViteUrl = pathToFileURL(requireFromVitePlugin.resolve('@tailwindcss/vite')).href;
const orgId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const themeA = catalog('#112233', '#ffffff', '40rem', '2rem', 'theme-a-only');
const themeB = catalog('#445566', '#eeeeee', '48rem', '3rem', 'theme-b-only');

interface ComputedEvidence {
  backgroundColor: string;
  borderTopColor: string;
  color: string;
  maxWidth: string;
  paddingLeft: string;
  primaryVariable: string;
  removedVariable: string;
  catalogHash: string | null;
  liveRevision: string | null;
}

interface ArtifactServer {
  server: Server;
  origin: string;
}

let browser: Browser;
let studioServer: ArtifactServer;

describe('real-browser design-token preview/static parity', () => {
  beforeAll(async () => {
    browser = await launchChromium();
    studioServer = await startStudioServer();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await closeServer(studioServer?.server);
  });

  it.each([
    { label: 'default non-Tailwind', tailwind: false },
    { label: 'Tailwind v4', tailwind: true },
  ])(
    'matches live-switch and static-generation computed styles: $label',
    async ({ tailwind }) => {
      const gateway = await startGateway();
      const root = createFixture(tailwind, new URL(studioServer.origin).origin);
      let liveServer: ArtifactServer | undefined;
      let staticServer: ArtifactServer | undefined;
      let context: BrowserContext | undefined;
      let testError: unknown;
      try {
        writeTokens(root, themeA);
        await generate(root, gateway.origin, '#112233');
        const liveArtifact = join(root, 'artifact-a');
        cpSync(join(root, '.output', 'public'), liveArtifact, { recursive: true });

        // Build static B cleanly: cache invalidation is covered separately at the
        // Vite HMR boundary, while this test compares two delivery paths only.
        writeTokens(root, themeB);
        rmSync(join(root, '.nuxt'), { recursive: true, force: true });
        rmSync(join(root, '.output'), { recursive: true, force: true });
        await generate(root, gateway.origin, '#445566', 'theme-a-only');
        const regeneratedHtml = readFileSync(join(root, '.output', 'public', 'index.html'), 'utf8');
        expect(regeneratedHtml).toContain('--eldra-color-primary:#445566;');
        expect(regeneratedHtml).not.toContain('--eldra-color-theme-a-only');

        liveServer = await startArtifactServer(liveArtifact);
        staticServer = await startArtifactServer(join(root, '.output', 'public'));
        context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

        const staticPage = await context.newPage();
        await staticPage.goto(staticServer.origin, { waitUntil: 'networkidle' });
        await staticPage.locator('.parity-target').waitFor();
        const staticEvidence = await computedEvidence(staticPage.mainFrame());

        const previewPage = await context.newPage();
        const previewUrl = new URL(studioServer.origin);
        previewUrl.searchParams.set('theme', liveServer.origin);
        await previewPage.goto(previewUrl.href);
        const previewFrame = await waitForThemeFrame(previewPage, liveServer.origin);
        await previewFrame.waitForSelector('.parity-target');
        await previewFrame.waitForFunction(
          () =>
            document.querySelector<HTMLStyleElement>('[data-eldra-live-design-token-styles]')
              ?.dataset.eldraDesignTokenRevision === '2'
        );
        const previewEvidence = await computedEvidence(previewFrame);

        expect({ ...previewEvidence, liveRevision: null }).toEqual(staticEvidence);
        expect(previewEvidence).toMatchObject({
          backgroundColor: 'rgb(68, 85, 102)',
          borderTopColor: 'rgb(68, 85, 102)',
          color: 'rgb(238, 238, 238)',
          maxWidth: '768px',
          paddingLeft: '48px',
          primaryVariable: '#445566',
          removedVariable: '',
        });
        expect(previewEvidence.liveRevision).toBe('2');
        expect(staticEvidence.liveRevision).toBeNull();
        expect(previewEvidence.catalogHash).toBe(staticEvidence.catalogHash);
        expect(previewEvidence.catalogHash).toMatch(/^[0-9a-f]{64}$/);

        await previewPage.evaluate(() => window.startContentPreview?.());
        const editable = previewFrame.locator('.parity-target').first();
        await editable.waitFor();
        await expect.poll(() => editable.getAttribute('contenteditable')).toBe('true');
        await editable.focus();
        const edited = await editable.textContent();
        await editable.dispatchEvent('input');
        // Let the field's own theme:text-edited debounce flush, then answer
        // that post by echoing its value back: inside that window the overlay
        // owns the text, because the editor has not been told about the
        // keystroke — or has not answered yet — and nothing it sends in the
        // meantime can describe it (theme-core's
        // `hasUnacknowledgedTextEdit`). An accepted external draft is only
        // authoritative for text the editor has actually caught up with.
        await previewPage.waitForTimeout(400);
        await previewPage.evaluate((value) => window.postContentDraft?.(value), edited ?? '');
        await previewPage.evaluate(() => window.postContentDraft?.('Accepted browser draft'));
        await expect.poll(() => editable.textContent()).toBe('Accepted browser draft');

        await previewPage.evaluate((catalogValue) => {
          window.postDesignTokens?.(1, catalogValue);
        }, themeA);
        await expect.poll(() => computedEvidence(previewFrame)).toEqual(previewEvidence);
      } catch (error) {
        testError = error;
      }
      const cleanup = await Promise.allSettled([
        context?.close(),
        closeServer(liveServer?.server),
        closeServer(staticServer?.server),
        closeServer(gateway.server),
      ]);
      rmSync(root, { recursive: true, force: true });
      if (testError !== undefined) throw testError;
      const rejected = cleanup.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    },
    180_000
  );
});

declare global {
  interface Window {
    postDesignTokens?: (revision: number, resolved: unknown) => void;
    postContentDraft?: (heading: string) => void;
    startContentPreview?: () => void;
  }
}

function catalog(
  primary: string,
  foreground: string,
  maxWidth: string,
  gutter: string,
  uniqueId: string
) {
  return {
    colors: {
      primary: { label: 'Primary', value: primary, allowSiteOverride: true },
      'on-primary': { label: 'On primary', value: foreground },
      [uniqueId]: { label: uniqueId, value: '#abcdef' },
    },
    containers: {
      narrow: { label: 'Narrow', maxWidth: '32rem', gutter: { normal: '1rem' } },
      content: { label: 'Content', maxWidth, gutter: { normal: gutter }, allowSiteOverride: true },
      wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
      full: { label: 'Full', maxWidth: 'none', gutter: { normal: '0px' } },
    },
  };
}

function createFixture(tailwind: boolean, studioOrigin: string): string {
  const root = mkdtempSync(
    join(tmpdir(), `eldra-token-parity-${tailwind ? 'tailwind' : 'generic'}-`)
  );
  mkdirSync(join(root, 'app', 'pages'), { recursive: true });
  mkdirSync(join(root, 'blocks'), { recursive: true });
  cpSync(join(fixtureDir, 'blocks', 'hero'), join(root, 'blocks', 'hero'), { recursive: true });
  // The hero block allowlists the cta schema in its actions slot, so the
  // scanned manifest requires the cta block in the same theme.
  cpSync(join(fixtureDir, 'blocks', 'cta'), join(root, 'blocks', 'cta'), { recursive: true });
  mkdirSync(join(root, 'node_modules', '@eldrajs'), { recursive: true });
  symlinkSync(join(packageDir, 'node_modules', 'nuxt'), join(root, 'node_modules', 'nuxt'), 'dir');
  symlinkSync(
    join(repoDir, 'packages', 'theme-vue'),
    join(root, 'node_modules', '@eldrajs', 'theme-vue'),
    'dir'
  );
  if (tailwind) {
    symlinkSync(
      join(repoDir, 'packages', 'vite-plugin-theme', 'node_modules', 'tailwindcss'),
      join(root, 'node_modules', 'tailwindcss'),
      'dir'
    );
  }
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: `eldra-token-parity-${tailwind ? 'tailwind' : 'generic'}`,
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
<template><main${tailwind ? ' class="border-primary bg-primary text-on-primary"' : ''}><EldraLayout v-if="page && layout" :layout="layout" :blocks="blocks" nonce="parity-nonce" /></main></template>
`
  );
  writeFileSync(
    join(root, 'blocks', 'hero', 'Block.vue'),
    tailwind
      ? `<script setup lang="ts">const props = defineProps<{ entry: { data: Record<string, unknown> } }>(); const d = computed(() => props.entry.data);</script>
<template><section class="parity-target border-4 border-solid border-primary bg-primary text-on-primary">{{ d.heading }}</section></template>
`
      : `<script setup lang="ts">const props = defineProps<{ entry: { data: Record<string, unknown> } }>(); const d = computed(() => props.entry.data);</script>
<template><section class="parity-target">{{ d.heading }}</section></template>
<style>.parity-target{background-color:var(--eldra-color-primary);border:4px solid var(--eldra-color-primary);color:var(--eldra-color-on-primary)}</style>
`
  );
  writeFileSync(
    join(root, 'nuxt.config.ts'),
    `${tailwind ? `import tailwindcss from ${JSON.stringify(tailwindViteUrl)};\n` : ''}import eldra from ${JSON.stringify(moduleUrl)};
export default defineNuxtConfig({
  modules: [eldra],
  ssr: true,
  devtools: { enabled: false },
  nitro: { prerender: { crawlLinks: false, failOnError: false, routes: ['/'] } },
  ${tailwind ? 'vite: { plugins: [tailwindcss()] },' : ''}
  eldra: {
    gatewayUrl: process.env.ELDRA_GATEWAY_URL,
    orgId: process.env.ELDRA_ORG_ID,
    studioOrigins: [${JSON.stringify(studioOrigin)}],
    tailwind: ${String(tailwind)},
  },
});
`
  );
  return root;
}

function writeTokens(root: string, tokens: ReturnType<typeof catalog>): void {
  writeFileSync(join(root, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
}

async function generate(
  root: string,
  gatewayUrl: string,
  expectedColor: string,
  removedId?: string
): Promise<void> {
  await execa(nuxi, ['generate'], {
    cwd: root,
    env: { ELDRA_GATEWAY_URL: gatewayUrl, ELDRA_ORG_ID: orgId },
    timeout: 120_000,
  });
  const output = join(root, '.output', 'public', 'index.html');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(output)) {
      const html = readFileSync(output, 'utf8');
      if (
        html.includes(`--eldra-color-primary:${expectedColor};`) &&
        (removedId === undefined || !html.includes(`--eldra-color-${removedId}`))
      )
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`generated HTML did not settle on ${expectedColor}`);
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

async function computedEvidence(frame: Frame): Promise<ComputedEvidence> {
  return frame.evaluate(() => {
    const target = document.querySelector<HTMLElement>('.parity-target');
    const container = document.querySelector<HTMLElement>('[data-eldra-layout-node="page-grid"]');
    if (!target || !container) throw new Error('parity fixture did not render');
    const targetStyle = getComputedStyle(target);
    const containerStyle = getComputedStyle(container);
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      backgroundColor: targetStyle.backgroundColor,
      borderTopColor: targetStyle.borderTopColor,
      color: targetStyle.color,
      maxWidth: containerStyle.maxWidth,
      paddingLeft: containerStyle.paddingLeft,
      primaryVariable: rootStyle.getPropertyValue('--eldra-color-primary').trim(),
      removedVariable: rootStyle.getPropertyValue('--eldra-color-theme-a-only').trim(),
      catalogHash:
        document.querySelector<HTMLStyleElement>('[data-eldra-design-token-styles]')?.dataset
          .eldraDesignTokenRevision ?? null,
      liveRevision:
        document.querySelector<HTMLStyleElement>('[data-eldra-live-design-token-styles]')?.dataset
          .eldraDesignTokenRevision ?? null,
    };
  });
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
        version: 1,
        root: {
          id: 'page-grid',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          style: { container: { normal: 'content' } },
          children: [
            {
              id: 'hero-placement',
              type: 'block',
              entryId: '11111111-1111-4111-8111-111111111111',
            },
          ],
        },
      },
      blocks: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          schemaApiId: 'hero',
          data: { heading: 'Computed-style parity' },
        },
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
const envelope = (type, payload) => ({ protocol: 'eldra-bridge', version: 1, id: 'browser-' + (++sequence), type, payload });
const post = (type, payload) => frame.contentWindow.postMessage(envelope(type, payload), targetOrigin);
window.postDesignTokens = (revision, resolved) => post('editor:design-tokens', { revision, resolved });
window.startContentPreview = () => post('editor:init', {
  mode: 'edit', previewToken: 'browser-token', locale: 'en-US', path: '/'
});
window.postContentDraft = (heading) => post('editor:content-update', { entries: [{
  entryId: '11111111-1111-4111-8111-111111111111', schemaApiId: 'hero', draftDoc: { heading }
}] });
const hello = setInterval(() => post('editor:hello', { capabilities: ['content-update', 'select-block', 'inline-text'] }), 100);
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.origin !== targetOrigin || event.data?.type !== 'theme:ready') return;
  clearInterval(hello);
  window.postDesignTokens(2, ${JSON.stringify(themeB)});
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
