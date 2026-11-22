import { chromium, type Browser, type Page } from '@playwright/test';
import { execa } from 'execa';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import starterTokens from '../tokens.json';
import { ORG_ID, startMockGateway, type MockGateway } from './support/mockGateway';
import {
  PARITY_PATHS,
  RESTRUCTURED_PATH,
  STARTER_BLOCK_TYPES,
  startContentGateway,
  startSessionRouter,
  type ContentGateway,
  type SessionRouter,
} from './support/previewParity';
import { startStaticServer, type StaticServer } from './support/staticServer';

/**
 * **A draft preview renders exactly what Publish puts live** (WS-1358, the release gate of draft
 * preview, WS-1293).
 *
 * Two real `nuxi generate` builds of this starter, both production builds:
 *
 *  - **live** — what Publish deploys: a build made after the content was published, prerendered
 *    from the public read, served by a static host and hydrated by Nuxt.
 *  - **pinned** — the deployment a preview session pins: a build made *before* the edit, with the
 *    older content baked in. The stand-in preview router serves it with the session marker and
 *    answers its draft reads from the draft perspective (`X-Preview-Session`), so the page hydrates
 *    the older prerender, then renders the new content client-side.
 *
 * Both are given exactly the same content — the drafts are the pages the live build published —
 * but in Core's two read shapes: the public read has every shared component already expanded, the
 * draft read keeps the placements and a projection the runtime expands. After both have hydrated
 * and settled, the documents must be the same, at 1280 and 390 wide, node for node and pixel for
 * pixel.
 *
 * **What a session may differ in, and nothing else** (WS-1358): the router's
 * `noindex, nofollow` robots tag, the session marker it adds (`eldra-preview`), and the session's
 * own UI — the veil, the banner and the notices, which all live in the `[data-eldra-preview-session]`
 * host on `<body>`. `normalise()` removes exactly those.
 *
 * Besides them, the comparison does not read Nuxt's two hydration-state scripts
 * (`#__NUXT_DATA__` and the `window.__NUXT__` config): they are the build's own state — the pinned
 * build's payload is, by construction, the older content, and each build has its own build id — and
 * are never rendered. What they hydrate into is compared instead (`payload.data`, below), and so is
 * every node they produce. Comments are not compared either: Vue's fragment anchors are `<!--[-->`
 * in a server render and empty in a client render, and draw nothing.
 */

const templateDir = fileURLToPath(new URL('..', import.meta.url));
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
const SKIPPED_FROM_COPY = new Set(['node_modules', '.nuxt', '.output', '.git', 'storybook-static']);
const SITE_URL = 'https://shop.example.test';
const WIDTHS = [1280, 390] as const;

let upstream: MockGateway;
let gateway: ContentGateway;
let scratch: string;
let live: StaticServer;
let router: SessionRouter;
let browser: Browser;

/** A copy of the starter, generated against the content gateway as a production build. */
async function build(name: string, env: Record<string, string> = {}): Promise<string> {
  const root = join(scratch, name);
  cpSync(templateDir, root, {
    recursive: true,
    filter: (source) => {
      const [first] = relative(templateDir, source).split(sep);
      return first === undefined || !SKIPPED_FROM_COPY.has(first);
    },
  });
  symlinkSync(join(templateDir, 'node_modules'), join(root, 'node_modules'), 'dir');
  const generated = await execa(nuxi, ['generate'], {
    cwd: root,
    env: {
      ELDRA_GATEWAY_URL: gateway.url,
      ELDRA_ORG_ID: ORG_ID,
      ELDRA_BUILD_TARGET: 'production',
      ELDRA_SITE_URL: SITE_URL,
      ...env,
    },
    reject: false,
    timeout: 600_000,
  });
  if (generated.exitCode !== 0) {
    throw new Error(`nuxi generate (${name}) failed\n${generated.stdout}\n${generated.stderr}`);
  }
  return join(root, '.output', 'public');
}

interface Capture {
  /** The normalised document, one node per line. */
  dom: string[];
  /** Every async data entry the app holds once settled. */
  data: string;
  /** Console errors, page errors and anything Vue said about hydration. */
  warnings: string[];
}

/** Opens `path` in a fresh page at `width`, waits for it to settle, and runs `then` on it. */
async function open<T>(
  origin: string,
  path: string,
  width: number,
  session: boolean,
  then: (page: Page, warnings: string[]) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'Atlantic/Reykjavik',
  });
  const page = await context.newPage();
  const warnings: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
      warnings.push(`${message.type()}: ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      warnings.push(`${response.status()}: ${new URL(response.url()).pathname}`);
    }
  });
  try {
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    if (session) {
      // The draft is on screen once the veil is down (`hidden`) and the app is no longer busy.
      await page.waitForFunction(
        () => {
          const veil = document
            .querySelector('[data-eldra-preview-session]')
            ?.shadowRoot?.querySelector('.veil');
          return (
            veil?.hasAttribute('hidden') === true &&
            !document.getElementById('__nuxt')?.hasAttribute('aria-busy')
          );
        },
        undefined,
        { timeout: 30_000 }
      );
    }
    await settle(page);
    return await then(page, warnings);
  } finally {
    await context.close();
  }
}

/**
 * Nothing in flight, every font loaded, and two frames drawn — and with `images`, every image on
 * the page loaded and decoded first. A lazily loaded image below the fold starts loading only when
 * it nears the viewport, which a full-page screenshot makes a race; so for the pixels both pages'
 * images are switched to eager loading, the same change on both sides, before anything is drawn.
 */
async function settle(page: Page, images = false): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async (eager) => {
    if (eager) {
      for (const image of document.images) image.loading = 'eager';
      await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
    }
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, images);
  await page.waitForLoadState('networkidle');
}

/** Removes, in the live page, exactly the differences a session is allowed. */
async function normalise(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('[data-eldra-preview-session]').forEach((host) => host.remove());
    document.querySelectorAll('meta[name="eldra-preview"]').forEach((meta) => meta.remove());
    document
      .querySelectorAll('meta[name="robots"][content="noindex, nofollow"]')
      .forEach((meta) => meta.remove());
  });
}

/** The document, one node per line: tag and sorted attributes, or text; hydration state left out. */
function serialise(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const lines: string[] = [];
    const walk = (node: Node, depth: number): void => {
      const indent = '  '.repeat(depth);
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? '') !== '') lines.push(`${indent}"${node.textContent}"`);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (element.id === '__NUXT_DATA__' || element.hasAttribute('data-nuxt-data')) return;
      if (element.tagName === 'SCRIPT' && /window\.__NUXT__/.test(element.textContent ?? ''))
        return;
      // A `style` attribute as the browser holds it (`style.cssText`), not as it was written: a
      // style the server rendered is the attribute text it wrote (`aspect-ratio:auto;`), one Vue
      // set in the browser is the CSSOM's own serialisation (`aspect-ratio: auto;`, numbers to six
      // significant digits), and a declaration list left empty is no style at all.
      const attributes = [...element.attributes]
        .filter((attribute) => attribute.name !== 'style')
        .map((attribute) => `${attribute.name}="${attribute.value}"`);
      const style = (element as HTMLElement).style?.cssText ?? '';
      if (style !== '') attributes.push(`style="${style}"`);
      attributes.sort();
      lines.push(
        `${indent}<${element.tagName.toLowerCase()}${attributes.map((a) => ` ${a}`).join('')}>`
      );
      if (element.shadowRoot) walk(element.shadowRoot, depth + 1);
      const children =
        element instanceof HTMLTemplateElement ? element.content.childNodes : element.childNodes;
      for (const child of children) walk(child, depth + 1);
    };
    walk(document.documentElement, 0);
    return lines;
  });
}

/** Every async data entry the app holds, in key order — what the hydration state became. */
function asyncData(page: Page): Promise<string> {
  return page.evaluate(() => {
    const app = (
      document.getElementById('__nuxt') as unknown as {
        __vue_app__?: {
          config: { globalProperties: { $nuxt?: { payload: { data: Record<string, unknown> } } } };
        };
      }
    ).__vue_app__;
    const data = app?.config.globalProperties.$nuxt?.payload.data ?? {};
    // Key order is not content: Core's own JSON is a Go map's, sorted, and a mock's is not.
    const sorted = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sorted);
      if (value instanceof Map) return sorted(Object.fromEntries(value));
      if (typeof value !== 'object' || value === null) return value;
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, sorted(record[key])])
      );
    };
    return JSON.stringify(sorted(data), null, 1);
  });
}

function capture(origin: string, path: string, width: number, session: boolean): Promise<Capture> {
  return open(origin, path, width, session, async (page, warnings) => {
    await normalise(page);
    return { dom: await serialise(page), data: await asyncData(page), warnings };
  });
}

/** A full-page screenshot, after the same normalisation as the DOM. */
function screenshot(
  origin: string,
  path: string,
  width: number,
  session: boolean
): Promise<Buffer> {
  return open(origin, path, width, session, async (page) => {
    await normalise(page);
    await settle(page, true);
    return page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
  });
}

/**
 * How many pixels of `a` and `b` differ, decoded and compared by Chromium itself — a canvas reads
 * both PNGs back as RGBA, so no image library is needed. Different sizes count every pixel.
 */
async function differingPixels(a: Buffer, b: Buffer): Promise<{ differing: number; size: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    return await page.evaluate(
      async ([left, right]) => {
        const decode = async (base64: string): Promise<ImageData> => {
          const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
          const bitmap = await createImageBitmap(blob);
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context2d = canvas.getContext('2d')!;
          context2d.drawImage(bitmap, 0, 0);
          return context2d.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [one, two] = await Promise.all([decode(left), decode(right)]);
        const size = `${one.width}x${one.height} vs ${two.width}x${two.height}`;
        if (one.width !== two.width || one.height !== two.height) {
          return { differing: Math.max(one.width * one.height, two.width * two.height), size };
        }
        let differing = 0;
        for (let i = 0; i < one.data.length; i += 4) {
          if (
            one.data[i] !== two.data[i] ||
            one.data[i + 1] !== two.data[i + 1] ||
            one.data[i + 2] !== two.data[i + 2] ||
            one.data[i + 3] !== two.data[i + 3]
          ) {
            differing += 1;
          }
        }
        return { differing, size };
      },
      [a.toString('base64'), b.toString('base64')] as const
    );
  } finally {
    await context.close();
  }
}

/**
 * The same console errors and page errors on both sides. A failed request is the one thing a
 * session may add, and only a catalog read: it re-runs every async data entry the server filled,
 * the storefront's commerce reads among them, so a commerce read the prerender made (and baked in,
 * failure included) is asked again in a session where the live page answers it from the payload
 * (a known difference, WS-1358). A failed CMS read, or anything else, still fails the comparison.
 */
function expectSameWarnings(session: readonly string[], published: readonly string[]): void {
  const failedRequest = (line: string): boolean =>
    /^\d{3}: /.test(line) || line.startsWith('error: Failed to load resource');
  expect(session.filter((line) => !failedRequest(line))).toEqual(
    published.filter((line) => !failedRequest(line))
  );
  const extra = session.filter((line) => /^\d{3}: /.test(line) && !published.includes(line));
  for (const line of extra) expect(line).toMatch(/^\d{3}: \/catalog\/v1\//);
}

/**
 * Each distinct `useId()` value (`v-0-34-0`, Vue's default prefix) replaced by its order of first
 * appearance in the document, so two documents that differ only in how the ids were numbered
 * compare equal. Used for the one known case above, and nowhere else.
 */
function renumberIds(lines: readonly string[]): string[] {
  const seen = new Map<string, string>();
  return lines.map((line) =>
    line.replace(/\bv-\d+(?:-\d+)+/g, (token) => {
      if (!seen.has(token)) seen.set(token, `v#${seen.size}`);
      return seen.get(token)!;
    })
  );
}

describe('a draft preview renders exactly what Publish puts live', () => {
  beforeAll(async () => {
    upstream = await startMockGateway();
    gateway = await startContentGateway(upstream.url);
    scratch = mkdtempSync(join(tmpdir(), 'eldra-preview-parity-'));
    // The deployment the session pins: built while the older content was live.
    gateway.published = 'pinned';
    const pinned = await build('pinned');
    // Publish: the drafts become the published content, and the site is rebuilt.
    gateway.published = 'next';
    const published = await build('live');
    live = await startStaticServer(published);
    router = await startSessionRouter(pinned, gateway.url);
    browser = await chromium.launch();
  }, 1_500_000);

  afterAll(async () => {
    await browser?.close();
    await router?.close();
    await live?.close();
    await gateway?.close();
    await upstream?.close();
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  });

  it('places every starter block type on the parity page', () => {
    expect(STARTER_BLOCK_TYPES.length).toBeGreaterThanOrEqual(35);
  });

  for (const path of PARITY_PATHS) {
    for (const width of WIDTHS) {
      it(`${path} at ${width}: the session's DOM is the live page's`, async () => {
        const reads = gateway.draftReads.length;
        const published = await capture(live.origin, path, width, false);
        const session = await capture(router.origin, path, width, true);
        // The session really read the drafts, and the live page really rendered something.
        expect(gateway.draftReads.length).toBeGreaterThan(reads);
        expect(published.dom.length).toBeGreaterThan(50);
        expect(published.dom.some((line) => line.includes('data-eldra-invalid-layout'))).toBe(
          false
        );
        expect(session.dom.join('\n')).toBe(published.dom.join('\n'));
        expect(session.data).toBe(published.data);
        expectSameWarnings(session.warnings, published.warnings);
      });

      it(`${path} at ${width}: 0 pixels differ`, async () => {
        const published = await screenshot(live.origin, path, width, false);
        const session = await screenshot(router.origin, path, width, true);
        expect(await differingPixels(session, published)).toMatchObject({ differing: 0 });
      });
    }
  }

  /**
   * **A known mismatch (WS-1358 finding), pinned rather than hidden.** When the draft adds a block
   * the pinned build's page does not have, the session builds that block after hydration, and
   * Vue's `useId()` numbers it — and every block after it — by the order the app created them, not
   * by where they stand: `quote-heading-v-0-34-0` where Publish's prerender writes
   * `quote-heading-v-0-1-0`. Each id still matches its `aria-labelledby` / `aria-controls` on the
   * same page, so nothing is drawn or announced differently; but the DOM is not the live one. The
   * block's chunk also arrives as a `modulepreload` link the session's runtime adds to the head.
   *
   * The first test fails the day the ids match (then make it an ordinary parity case); the second
   * proves those are the **only** differences; the third that no pixel differs.
   */
  for (const width of WIDTHS) {
    it(`${RESTRUCTURED_PATH} at ${width}: a block the draft adds numbers its ids differently (known)`, async () => {
      const published = await capture(live.origin, RESTRUCTURED_PATH, width, false);
      const session = await capture(router.origin, RESTRUCTURED_PATH, width, true);
      expect(session.dom.join('\n')).not.toBe(published.dom.join('\n'));
      // The added block's chunk: the live build lists it with the page's other chunks, the session
      // preloads it when the draft needs it, as an absolute URL at the end of the head.
      const lateChunks = session.dom
        .filter((line) => line.includes('rel="modulepreload"'))
        .map((line) => line.match(new RegExp(`href="${router.origin}(/_nuxt/[^"]+)"`))?.[1])
        .filter((chunk): chunk is string => chunk !== undefined);
      expect(lateChunks.length).toBeGreaterThan(0);
      const isLateChunk = (line: string): boolean =>
        line.includes('rel="modulepreload"') && lateChunks.some((chunk) => line.includes(chunk));
      expect(renumberIds(session.dom.filter((line) => !isLateChunk(line)))).toEqual(
        renumberIds(published.dom.filter((line) => !isLateChunk(line)))
      );
      expect(renumberIds([session.data])).toEqual(renumberIds([published.data]));
      expectSameWarnings(session.warnings, published.warnings);
    });

    it(`${RESTRUCTURED_PATH} at ${width}: 0 pixels differ`, async () => {
      const published = await screenshot(live.origin, RESTRUCTURED_PATH, width, false);
      const session = await screenshot(router.origin, RESTRUCTURED_PATH, width, true);
      expect(await differingPixels(session, published)).toMatchObject({ differing: 0 });
    });
  }

  /**
   * **Open question for the owner (WS-1358): must a session reflect design
   * tokens edited after its pinned deployment was built?** A session renders the pinned build's own
   * build-time design tokens (and its theme-message overrides, locales and currency), and never
   * reads `/site/v1/design-tokens` itself; Publish rebuilds and reads them again. So today an edit
   * to the site's tokens shows on the live site after Publish, and not in a session opened before
   * that rebuild — which is a mismatch under "exactly what Publish puts live".
   *
   * Skipped until that is decided. It asserts **today's** behaviour — the session shows the pinned
   * build's tokens — so the day it is unskipped it says which way the code went: keep it as it is if
   * the answer is "the pinned build's", or turn the last assertion round once a session reads them.
   */
  describe.skip('design tokens edited after the pinned deploy (open question)', () => {
    let republished: StaticServer;

    beforeAll(async () => {
      const tokens = normalizeThemeDesignTokens(starterTokens);
      gateway.designTokens = {
        ...tokens,
        colors: {
          ...tokens.colors,
          primary: { ...tokens.colors.primary!, value: '#0b57d0' },
        },
      } as unknown as Record<string, unknown>;
      try {
        republished = await startStaticServer(await build('retokened'));
      } finally {
        gateway.designTokens = null;
      }
    }, 900_000);

    afterAll(async () => {
      await republished?.close();
    });

    it('a session shows the pinned build\u2019s tokens, not the ones Publish will put live', async () => {
      const primary = (origin: string, session: boolean): Promise<string> =>
        open(origin, '/', 1280, session, (page) =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--eldra-color-primary')
              .trim()
          )
        );
      // The pinned and the live build were both made before the edit, with the theme's own tokens.
      const before = await primary(live.origin, false);
      const after = await primary(republished.origin, false);
      const session = await primary(router.origin, true);
      expect(after).toBe('#0b57d0');
      expect(before).not.toBe(after);
      // Today's behaviour: the pinned build's.
      expect(session).toBe(before);
    });
  });
});
