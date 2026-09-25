#!/usr/bin/env node
// Visual regression for every story in this package.
//
// Builds Storybook, serves `storybook-static` on 6018, and captures each story
// at 1280 and 360 with Playwright Chromium, comparing the result against the
// committed baseline in `__screenshots__/<story id>--<width>.png`. A story
// whose id ends in `--reduced-motion` or `--forced-colors` is captured with the
// matching emulated media, which is how the design spec's "Reduced motion" and
// "Forced colours" states are covered.
//
// Usage:
//   pnpm --filter @eldrajs/ui screenshots              compare against baselines
//   pnpm --filter @eldrajs/ui screenshots --update     rewrite the baselines
//   pnpm --filter @eldrajs/ui screenshots --no-build   reuse storybook-static
//
// Deliberately NOT part of `pnpm check`: it needs a Chromium download
// (`pnpm exec playwright install chromium`), which CI for this repo does not
// guarantee.
import { spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const staticDir = join(rootDir, 'storybook-static');
const baselineDir = join(rootDir, '__screenshots__');
const diffDir = join(baselineDir, '__diff__');

/** The two widths every story is captured at: desktop and the narrowest phone. */
const WIDTHS = [1280, 360];
/** Per-pixel colour distance before a pixel counts as different. */
const PIXEL_THRESHOLD = 0.1;
/** Share of the image that may differ before the story fails. */
const MAX_DIFF_RATIO = 0.001;
const PORT = 6018;

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

const args = new Set(process.argv.slice(2));
const update = args.has('--update');
const skipBuild = args.has('--no-build');

function buildStorybook() {
  console.log('[eldra] building Storybook…');
  const result = spawnSync('storybook', ['build', '--quiet', '-o', 'storybook-static'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('[eldra] storybook build failed');
}

function serveStatic(dir, port) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const filePath = join(dir, pathname);
      if (!filePath.startsWith(dir) || !existsSync(filePath)) {
        res.writeHead(filePath.startsWith(dir) ? 404 : 403);
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      });
      createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Every story in the built Storybook, in index order. */
function readStoryIds() {
  const indexPath = join(staticDir, 'index.json');
  if (!existsSync(indexPath)) {
    throw new Error(`[eldra] ${indexPath} not found — run without --no-build`);
  }
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  return Object.values(index.entries ?? {})
    .filter((entry) => entry.type === 'story')
    .map((entry) => entry.id);
}

/**
 * The emulated media a story's id asks for. Storybook's `index.json` carries no
 * parameters, so the story name is the channel: a story called `ReducedMotion`
 * has the id `…--reduced-motion`.
 */
function emulationFor(id) {
  if (id.endsWith('--reduced-motion')) return { reducedMotion: 'reduce' };
  if (id.endsWith('--forced-colors')) return { forcedColors: 'active' };
  return {};
}

async function capture(browser, baseUrl, id, width) {
  const context = await browser.newContext({
    viewport: { width, height: 720 },
    deviceScaleFactor: 1,
    ...emulationFor(id),
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseUrl}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`, {
      waitUntil: 'load',
    });
    await page.waitForFunction(
      () => (document.getElementById('storybook-root')?.childElementCount ?? 0) > 0
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));
    return await page.screenshot({ fullPage: true });
  } finally {
    await context.close();
  }
}

function compare(actualBuffer, baselinePath, diffPath) {
  const actual = PNG.sync.read(actualBuffer);
  const expected = PNG.sync.read(readFileSync(baselinePath));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    return {
      ok: false,
      reason: `size changed: ${expected.width}x${expected.height} -> ${actual.width}x${actual.height}`,
    };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changed = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, {
    threshold: PIXEL_THRESHOLD,
  });
  const total = actual.width * actual.height;
  const ratio = changed / total;
  if (ratio <= MAX_DIFF_RATIO) return { ok: true };
  mkdirSync(diffDir, { recursive: true });
  writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    ok: false,
    reason: `${changed} of ${total} pixels differ (${(ratio * 100).toFixed(3)}%, budget ${(MAX_DIFF_RATIO * 100).toFixed(1)}%) — see ${diffPath}`,
  };
}

async function main() {
  if (!skipBuild) buildStorybook();

  const ids = readStoryIds();
  if (ids.length === 0) {
    console.log('[eldra] no stories found; nothing to do');
    return;
  }

  if (update) rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(baselineDir, { recursive: true });

  const server = await serveStatic(staticDir, PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const browser = await chromium.launch();
  const failures = [];

  try {
    for (const id of ids) {
      for (const width of WIDTHS) {
        const name = `${id}--${width}.png`;
        const baselinePath = join(baselineDir, name);
        const actual = await capture(browser, baseUrl, id, width);

        if (update || !existsSync(baselinePath)) {
          if (!update) {
            failures.push(`${name}: no baseline (run with --update)`);
            continue;
          }
          writeFileSync(baselinePath, actual);
          console.log(`[eldra] wrote __screenshots__/${name}`);
          continue;
        }

        const result = compare(actual, baselinePath, join(diffDir, name));
        if (result.ok) {
          console.log(`[eldra] ok   ${name}`);
        } else {
          failures.push(`${name}: ${result.reason}`);
          console.error(`[eldra] FAIL ${name}: ${result.reason}`);
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (failures.length > 0) {
    console.error(`\n[eldra] ${failures.length} screenshot(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[eldra] ${ids.length} stories x ${WIDTHS.length} widths ${update ? 'written' : 'match'}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
