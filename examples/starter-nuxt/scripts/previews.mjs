#!/usr/bin/env node
// Regenerates every block's `blocks/<id>/preview.png` (a screenshot of its
// generated `Default` story) and `.eldra/previews.json` (a content hash per
// block, so previewsFresh.spec.ts can tell a stale preview from a current
// one). Builds Storybook first — a preview then reflects exactly what
// `build-storybook` renders, not a dev-server-only state.
//
// Usage: `pnpm --filter starter-nuxt previews` (or `pnpm previews` from this
// package's own directory).
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
// A devDependency of this package (also a root devDependency — see repo
// CLAUDE.md's Chromium browser-test note); run `pnpm exec playwright install
// chromium` once locally before the first `pnpm previews`.
import { chromium } from '@playwright/test';
import { hashBlock, listBlockIds } from './previewHash.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const blocksDir = join(rootDir, 'blocks');
const staticDir = join(rootDir, 'storybook-static');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function buildStorybook() {
  console.log('[eldra] building Storybook…');
  await execa('storybook', ['build', '--quiet', '-o', 'storybook-static'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
}

function serveStatic(dir) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const filePath = join(dir, pathname);
      if (!filePath.startsWith(dir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function screenshotBlock(page, baseUrl, id) {
  const url = `${baseUrl}/iframe.html?id=blocks-${id}--default&viewMode=story`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    () => (document.getElementById('storybook-root')?.childElementCount ?? 0) > 0
  );
  await page.evaluate(() => document.fonts.ready);
  // A lazy image inside a closed panel (a mega-menu, a drawer) never loads while it is off
  // screen, so only eager images gate the screenshot.
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => img.complete || img.loading === 'lazy')
  );

  // An entrance animation must finish before the frame is captured — the `cart` drawer slides in
  // from the right, and a screenshot taken mid-slide shows the panel hanging off the edge. Capped,
  // and failure is ignored on purpose: a deliberately endless animation (a spinner) must not stop a
  // preview from being written.
  await page
    .waitForFunction(
      () => document.getAnimations().every((animation) => animation.playState !== 'running'),
      undefined,
      { timeout: 2000 }
    )
    .catch(() => {});

  const root = page.locator('#storybook-root');
  const box = await root.boundingBox();
  if (box === null) throw new Error(`[eldra] blocks/${id}: #storybook-root has no layout box`);

  // A block whose only output is a top-layer modal (`cart`'s drawer variant is a `<dialog>`) leaves
  // `#storybook-root` itself zero-height, because the dialog paints outside the normal flow — and a
  // zero-sized clip is not a screenshot Playwright can take. Fall back to the viewport, which is
  // where such a block actually renders.
  const clip =
    box.width > 0 && box.height > 0
      ? { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 900) }
      : undefined;

  await page.screenshot({ path: join(blocksDir, id, 'preview.png'), clip });
}

async function main() {
  const ids = listBlockIds(rootDir);
  if (ids.length === 0) {
    console.log('[eldra] no blocks found; nothing to do');
    return;
  }

  await buildStorybook();

  const server = await serveStatic(staticDir);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const id of ids) {
      await screenshotBlock(page, baseUrl, id);
      console.log(`[eldra] wrote blocks/${id}/preview.png`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const previews = Object.fromEntries(ids.map((id) => [id, hashBlock(rootDir, id)]));
  writeFileSync(join(rootDir, '.eldra', 'previews.json'), `${JSON.stringify(previews, null, 2)}\n`);
  console.log('[eldra] wrote .eldra/previews.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
