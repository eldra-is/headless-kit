import { chromium, type Browser, type Page } from '@playwright/test';
import { normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import { execa } from 'execa';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import starterTokens from '../tokens.json';
import { ORG_ID, startMockGateway, type MockGateway } from './support/mockGateway';
import {
  startContentGateway,
  startSessionRouter,
  type ContentGateway,
  type SessionRouter,
} from './support/previewParity';
import {
  EDIT_CASES,
  FOCUS_MID_PATH,
  PARITY_PATHS,
  STARTER_BLOCK_TYPES,
  inLocale,
  sampleData,
  type EditCase,
} from './support/previewParityContent';
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
 *    answers its draft reads from the preview perspective (`X-Preview-Session`), so the page
 *    hydrates the older prerender, then renders the new content client-side.
 *
 * Both are given exactly the same content, in Core's two read shapes
 * (`./support/previewParityContent.ts`). After both have hydrated and settled, at 1280 and 390
 * wide, they must be the same: node for node, in the async data and state they hold, in their
 * console errors, and pixel for pixel.
 *
 * **What a session may differ in, and nothing else** (WS-1358): the router's `noindex, nofollow`
 * robots tag, the session marker it adds (`eldra-preview`), and the session's own UI — the veil, the
 * banner and the notices, which all live in the `[data-eldra-preview-session]` host on `<body>`.
 * `normalise()` removes exactly those, from the session's page only; the live page is asserted to
 * have none of them.
 *
 * Besides them, the comparison does not read Nuxt's two hydration-state scripts (`#__NUXT_DATA__`
 * and the `window.__NUXT__` config): they are the build's own state — the pinned build's payload is,
 * by construction, the older content, and each build has its own build id — and are never rendered.
 * What they hydrate into is compared instead (`payload.data`, `payload.state`), and so is every node
 * they produce. Comments are not compared either: Vue's fragment anchors are `<!--[-->` in a server
 * render and empty in a client render, and draw nothing.
 *
 * Known differences are pinned, each in its own test, so a change in either direction is seen:
 * `EDIT_EXPECTATIONS` (structural edits renumber `useId()` ids), `FOCUS_MID_PATH` (focus given late
 * scrolls late), the entry metadata (`DRAFT_METADATA`), and the catalog re-reads
 * (`CATALOG_REREADS`). Saved design tokens and theme texts are skipped until a session can read them.
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
  /** A session's document the moment its veil dropped, normalised the same way. */
  veilDrop?: string[];
  /** Every async data entry and every `useState` the app holds once settled, keys sorted, without
   *  the entry metadata a draft reads differently (`DRAFT_METADATA`). */
  data: string;
  /** The same, with the metadata. */
  dataWithMetadata: string;
  /** Console errors, page errors, anything Vue said about hydration, and failed requests. */
  warnings: string[];
  /** Where the page ended up, and what holds focus. */
  scrollY: number;
  focused: string;
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
  await page.addInitScript(installSerialiser);
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
      // Checked every frame, and the document copied in the frame it first holds: what the
      // merchant sees the moment the veil drops, compared with the settled page below
      // (`VEIL_DROP_DIFFERENCES`), so a change that lands after the veil is caught.
      await page.waitForFunction(
        (additions) => {
          const veil = document
            .querySelector('[data-eldra-preview-session]')
            ?.shadowRoot?.querySelector('.veil');
          const shown =
            veil?.hasAttribute('hidden') === true &&
            !document.getElementById('__nuxt')?.hasAttribute('aria-busy');
          if (shown) {
            const win = window as unknown as {
              __eldraSerialise: (skip: readonly string[]) => unknown;
              __eldraVeilDrop?: unknown;
            };
            win.__eldraVeilDrop = win.__eldraSerialise(additions);
          }
          return shown;
        },
        SESSION_ADDITIONS,
        { timeout: 30_000, polling: 'raf' }
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
  // The storefront's own refresh is over: no busy region, no dimmed or spinning block, no
  // "Updating…" status (the treatment `prerenderRefresh.browser.spec.ts` samples).
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '#__nuxt [aria-busy="true"], .eldra\\:eldra-revalidating, [data-part="spinner"]'
      ).length === 0 &&
      ![...document.querySelectorAll('[role="status"]')].some((node) =>
        /Updating/i.test(node.textContent ?? '')
      ),
    undefined,
    { timeout: 15_000 }
  );
  // The same condition on both pages, whatever the machine's speed: the app has hydrated, no async
  // data entry has a read in flight, and the whole document (head, body, every attribute) has not
  // changed for `QUIET_MS` — measured from the last change, not from a fixed point. A head-only
  // check let a busy machine capture a page whose head manager or header had not yet written
  // (an `og:url` and a header height a beat behind the other page).
  await page.waitForFunction(
    () => {
      const nuxt = (
        document.getElementById('__nuxt') as unknown as {
          __vue_app__?: {
            config: {
              globalProperties: {
                $nuxt?: {
                  isHydrating?: boolean;
                  _asyncDataPromises?: Record<string, Promise<unknown> | undefined>;
                };
              };
            };
          };
        }
      ).__vue_app__?.config.globalProperties.$nuxt;
      return (
        nuxt !== undefined &&
        nuxt.isHydrating !== true &&
        Object.values(nuxt._asyncDataPromises ?? {}).every((promise) => promise === undefined)
      );
    },
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForLoadState('networkidle');
  await page.evaluate(
    (quiet) =>
      new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const done = (): void => {
          observer.disconnect();
          clearTimeout(giveUp);
          resolve();
        };
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, quiet);
        });
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        timer = setTimeout(done, quiet);
        const giveUp = setTimeout(() => {
          observer.disconnect();
          reject(new Error(`the document did not stay unchanged for ${quiet} ms within 30 s`));
        }, 30_000);
      }),
    QUIET_MS
  );
  await page.waitForLoadState('networkidle');
}

/** How long the document must stay unchanged before a page counts as settled. */
const QUIET_MS = 750;

/**
 * On the session's page, removes exactly the differences a session is allowed; on the live page,
 * asserts there are none of them to remove.
 */
/** What a session adds to the page: its host, and the router's two meta tags. */
const SESSION_ADDITIONS = [
  '[data-eldra-preview-session]',
  'meta[name="eldra-preview"]',
  'meta[name="robots"][content="noindex, nofollow"]',
];

async function normalise(page: Page, session: boolean): Promise<void> {
  const found = await page.evaluate(
    ([remove, selectors]) => {
      const counts = selectors.map((selector) => document.querySelectorAll(selector).length);
      if (remove) {
        for (const selector of selectors) {
          document.querySelectorAll(selector).forEach((node) => node.remove());
        }
      }
      const noindex = [...document.querySelectorAll('meta[name="robots"]')].some((meta) =>
        /noindex/i.test(meta.getAttribute('content') ?? '')
      );
      return { counts, noindex };
    },
    [session, SESSION_ADDITIONS] as const
  );
  if (session) {
    // Exactly one robots tag, the router's `noindex, nofollow`, on every session page: the
    // session's own head entry keeps it once the theme's head manager runs, a page only the draft
    // has (which hydrates the not-found document's `noindex`) included.
    expect(found).toEqual({ counts: [1, 1, 1], noindex: false });
  } else {
    expect(found).toEqual({ counts: [0, 0, 0], noindex: false });
  }
}

/**
 * The document, one node per line: tag and sorted attributes, or text, shadow roots walked;
 * hydration state left out. One function for every capture, installed in the page before it loads
 * (`installSerialiser`), so the settled page and the frame the veil drops are written the same way.
 * `skip` leaves out the elements a session is allowed to add (`SESSION_ADDITIONS`) without removing
 * them, which the veil-drop frame cannot do; the settled capture removes them first (`normalise`).
 */
function installSerialiser(): void {
  (
    window as unknown as {
      __eldraSerialise: (skip: readonly string[]) => {
        lines: string[];
        counts: number[];
        noindex: boolean;
      };
    }
  ).__eldraSerialise = (skip) => {
    const lines: string[] = [];
    const walk = (node: Node, depth: number): void => {
      const indent = '  '.repeat(depth);
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent ?? '') !== '') lines.push(`${indent}"${node.textContent}"`);
        return;
      }
      // A shadow root is a fragment, not an element: its children are walked under its host.
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        for (const child of node.childNodes) walk(child, depth);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (skip.some((selector) => element.matches(selector))) return;
      if (element.id === '__NUXT_DATA__' || element.hasAttribute('data-nuxt-data')) return;
      if (element.tagName === 'SCRIPT' && /window\.__NUXT__/.test(element.textContent ?? ''))
        return;
      // A `style` attribute as the browser holds it (`style.cssText`), not as it was written: a
      // style the server rendered is the attribute text it wrote (`aspect-ratio:auto;`), one Vue
      // set in the browser is the CSSOM's own serialisation (`aspect-ratio: auto;`, numbers to six
      // significant digits), and a declaration list left empty is no style at all. Both sides go
      // through the same CSSOM, so the rounding is the same on both: what is compared is the value
      // the browser applies, which the stored data (a framing's focal point) decides on both.
      const attributes = [...element.attributes]
        .filter((attribute) => attribute.name !== 'style')
        .map((attribute) => `${attribute.name}="${attribute.value}"`);
      const style = (element as HTMLElement).style?.cssText ?? '';
      if (style !== '') attributes.push(`style="${style}"`);
      attributes.sort();
      lines.push(
        `${indent}<${element.tagName.toLowerCase()}${attributes.map((a) => ` ${a}`).join('')}>`
      );
      if (element.shadowRoot) {
        lines.push(`${indent}  #shadow-root`);
        walk(element.shadowRoot, depth + 2);
      }
      const children =
        element instanceof HTMLTemplateElement ? element.content.childNodes : element.childNodes;
      for (const child of children) walk(child, depth + 1);
    };
    walk(document.documentElement, 0);
    const counts = skip.map((selector) => document.querySelectorAll(selector).length);
    const noindex = [...document.querySelectorAll('meta[name="robots"]')]
      .filter((meta) => !skip.some((selector) => meta.matches(selector)))
      .some((meta) => /noindex/i.test(meta.getAttribute('content') ?? ''));
    return { lines, counts, noindex };
  };
}

function serialise(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (
        window as unknown as { __eldraSerialise: (skip: readonly string[]) => { lines: string[] } }
      ).__eldraSerialise([]).lines
  );
}

/**
 * The head's `modulepreload` hints, compared as a set: their order is the order the prerender's
 * async render happened to collect each chunk in, which differs between any two builds of the same
 * content (two Publish builds included), not something a session does. Moved to the end, sorted.
 */
const PRELOADS = '(modulepreload hints, as a set)';
function preloadsAsASet(lines: readonly string[]): string[] {
  const preload = (line: string): boolean => line.includes('rel="modulepreload"');
  return [
    ...lines.filter((line) => !preload(line)),
    PRELOADS,
    ...lines
      .filter(preload)
      .map((line) => line.trim())
      .sort(),
  ];
}

/**
 * **Known difference: entry metadata.** The fields of an entry's envelope a session reads
 * differently: it reads the draft (its own save time, the last publish time or none), the live build
 * read the snapshot Publish made of it (the publish time). They are removed from entry envelopes (an
 * object with `id`, `schemaId` and `data`) before the async data is compared; the spec asserts they
 * did differ, and that the DOM is the same regardless, so nothing the starter renders reads them.
 * An entry's `status` (`CHANGED` or `DRAFT` on a draft read) is not among them: the public read
 * does not carry it and the session's client drops it, so the spec asserts neither page has one.
 */
const DRAFT_METADATA = ['updatedAt', 'publishedAt'];
// Likewise every media item's `linkId` (asset-service's link row, one per owner), wherever it is.

/** Every async data entry and `useState` the app holds, in key order. */
function asyncData(page: Page): Promise<{ withMetadata: string; withoutMetadata: string }> {
  return page.evaluate((metadata) => {
    const app = (
      document.getElementById('__nuxt') as unknown as {
        __vue_app__?: {
          config: {
            globalProperties: {
              $nuxt?: {
                payload: { data: Record<string, unknown>; state: Record<string, unknown> };
              };
            };
          };
        };
      }
    ).__vue_app__;
    const payload = app?.config.globalProperties.$nuxt?.payload;
    const value = { data: payload?.data ?? {}, state: payload?.state ?? {} };
    // Key order is not content: Core's own JSON is a Go map's, sorted, and a mock's is not.
    const sorted = (input: unknown, strip: boolean): unknown => {
      if (Array.isArray(input)) return input.map((item) => sorted(item, strip));
      if (input instanceof Map) return sorted(Object.fromEntries(input), strip);
      if (typeof input !== 'object' || input === null) return input;
      const record = input as Record<string, unknown>;
      const isEntry = 'id' in record && 'schemaId' in record && 'data' in record;
      return Object.fromEntries(
        Object.keys(record)
          .filter((key) => !(strip && ((isEntry && metadata.includes(key)) || key === 'linkId')))
          .sort()
          .map((key) => [key, sorted(record[key], strip)])
      );
    };
    return {
      withMetadata: JSON.stringify(sorted(value, false), null, 1),
      withoutMetadata: JSON.stringify(sorted(value, true), null, 1),
    };
  }, DRAFT_METADATA);
}

/**
 * Nothing changes after the veil drops: the session's document the moment the veil is hidden is
 * its settled document. `headerMayHide` allows the one difference pinned on the page with a field
 * focused mid-page: the starter header's `-translate-y-full` (its hide-on-scroll), only there.
 */
function expectNoChangeAfterTheVeil(session: Capture, headerMayHide = false): void {
  expect(session.veilDrop, 'the session was captured when its veil dropped').toBeDefined();
  const atDrop = session.veilDrop ?? [];
  if (!headerMayHide) {
    expect(atDrop.join('\n')).toBe(session.dom.join('\n'));
    return;
  }
  expect(atDrop.length).toBe(session.dom.length);
  const changed = atDrop
    .map((line, index) => [line, session.dom[index]!] as const)
    .filter(([before, after]) => before !== after);
  for (const [before, after] of changed) {
    expect(before).toMatch(/^\s*<header /);
    expect(before.replace(' -translate-y-full', '')).toBe(after.replace(' -translate-y-full', ''));
  }
  expect(changed.length).toBeLessThanOrEqual(1);
}

function capture(origin: string, path: string, width: number, session: boolean): Promise<Capture> {
  return open(origin, path, width, session, async (page, warnings) => {
    let veilDrop: string[] | undefined;
    if (session) {
      const atDrop = await page.evaluate(
        () =>
          (
            window as unknown as {
              __eldraVeilDrop: { lines: string[]; counts: number[]; noindex: boolean };
            }
          ).__eldraVeilDrop
      );
      // The same additions the settled page has, and nothing else that says noindex.
      expect({ counts: atDrop.counts, noindex: atDrop.noindex }).toEqual({
        counts: [1, 1, 1],
        noindex: false,
      });
      veilDrop = preloadsAsASet(atDrop.lines);
    }
    await normalise(page, session);
    const data = await asyncData(page);
    const where = await page.evaluate(() => {
      const active = document.activeElement;
      return {
        scrollY: Math.round(window.scrollY),
        focused:
          active === null || active === document.body
            ? 'body'
            : `${active.tagName.toLowerCase()}[aria-label="${active.getAttribute('aria-label') ?? ''}"]`,
      };
    });
    return {
      dom: preloadsAsASet(await serialise(page)),
      veilDrop,
      data: data.withoutMetadata,
      dataWithMetadata: data.withMetadata,
      warnings,
      ...where,
    };
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
    await normalise(page, session);
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
 * **Known difference: the session re-reads the catalog.** It re-runs every async data entry the
 * server filled, the storefront's commerce reads among them, so a commerce read the prerender made
 * (and baked in, failure included) is asked again in a session, where the live page answers it from
 * its payload. Here: the sample `collection-grid` names a collection the mock catalog does not have.
 * Exactly these extra failed requests, and nothing else, are allowed per path.
 */
const CATALOG_REREADS: Record<string, string[]> = {
  '/': ['404: /catalog/v1/collections/winter-knitwear/products'],
  [FOCUS_MID_PATH]: ['404: /catalog/v1/collections/winter-knitwear/products'],
  // Not a re-read: the pinned build has no file for a page only the draft has, so the host answers
  // the document itself with its not-found page, status 404.
  '/draft-only': ['404: /draft-only/'],
};
const BROWSER_404_LINE =
  'error: Failed to load resource: the server responded with a status of 404 (Not Found)';

function expectSameWarnings(
  path: string,
  session: readonly string[],
  published: readonly string[]
): void {
  const extra = [...session];
  for (const line of published) {
    const at = extra.indexOf(line);
    expect(at, `the session lacks the live page's "${line}"`).not.toBe(-1);
    extra.splice(at, 1);
  }
  const allowed = CATALOG_REREADS[path] ?? [];
  // The browser's console reports each failed request once more, as its own line.
  expect(extra.sort()).toEqual([...allowed, ...allowed.map(() => BROWSER_404_LINE)].sort());
}

/** A `useId()` value: Vue's default prefix, then the numbers. */
const USE_ID = /\bv-\d+(?:-\d+)+/g;

/**
 * Each distinct `useId()` value replaced by its order of first appearance, so two documents that
 * differ only in how the ids were numbered compare equal. Used for the pinned cases only.
 */
function renumberIds(lines: readonly string[]): string[] {
  const seen = new Map<string, string>();
  return lines.map((line) =>
    line.replace(USE_ID, (token) => {
      if (!seen.has(token)) seen.set(token, `v#${seen.size}`);
      return seen.get(token)!;
    })
  );
}

/**
 * Lines aligned one to one (the documents differ only in id numbering): every `useId()` value the
 * session numbered differently, as `live → session`, and the block types whose markup holds them.
 */
function renumbered(
  published: readonly string[],
  session: readonly string[]
): { ids: Record<string, string>; blocks: string[] } {
  const ids: Record<string, string> = {};
  const blocks: string[] = [];
  const indent = (line: string): number => line.length - line.trimStart().length;
  const schemaAt = (index: number): string => {
    let depth = indent(published[index]!);
    for (let i = index; i >= 0; i -= 1) {
      const line = published[i]!;
      if (indent(line) > depth) continue;
      depth = indent(line);
      const schema = /data-eldra-block="/.test(line)
        ? line.match(/data-eldra-schema="([^"]+)"/)?.[1]
        : undefined;
      if (schema !== undefined) return schema;
    }
    return '(none)';
  };
  for (let i = 0; i < published.length; i += 1) {
    const before = published[i]!.match(USE_ID) ?? [];
    const after = session[i]!.match(USE_ID) ?? [];
    before.forEach((token, at) => {
      if (after[at] === token) return;
      ids[token] = after[at]!;
      const schema = schemaAt(i);
      if (!blocks.includes(schema)) blocks.push(schema);
    });
  }
  return { ids, blocks };
}

/** The document without its chunk hints (`preloadsAsASet` put them last). */
function bodyOf(dom: readonly string[]): string[] {
  return dom.slice(0, dom.indexOf(PRELOADS));
}

/**
 * The chunk hints, by path: the session's runtime adds one for a chunk the pinned page never loaded
 * as an absolute URL on its own origin (`late`).
 */
function hintsOf(dom: readonly string[]): { paths: string[]; late: string[] } {
  const late: string[] = [];
  const paths = dom.slice(dom.indexOf(PRELOADS) + 1).map((line) => {
    const href = line.match(/href="([^"]+)"/)?.[1] ?? line;
    if (router !== undefined && href.startsWith(router.origin)) {
      late.push(href.slice(router.origin.length));
      return href.slice(router.origin.length);
    }
    return href;
  });
  return { paths: [...new Set(paths)].sort(), late };
}

/**
 * **Known difference: structural edits renumber `useId()` ids.** The session hydrates the pinned
 * build's page and patches it to the draft. Vue numbers each `useId()` by the order the app created
 * the component, and an instance keeps the number it was hydrated with; a component created after
 * hydration takes the next free number. So an edit that creates components the pinned page did not
 * have — or that moves existing ones relative to where the prerender numbered them — leaves ids that
 * Publish's prerender would number differently. Each id still matches its own `aria-labelledby` /
 * `aria-controls` on the page, and no pixel differs. Pinned per edit: whether it renumbers, which
 * blocks' ids, exactly which ids, and which chunk hints arrive late or stay behind.
 */
const EDIT_EXPECTATIONS: Record<
  EditCase,
  {
    renumbers: boolean;
    blocks: string[];
    ids: Record<string, string>;
    lateChunk: boolean;
    staleChunk: boolean;
    /** The session hydrated the pinned build's not-found document (a page only the draft has). */
    notFoundDocument?: true;
  }
> = {
  // A block added between two: it and every block after it.
  'edit-add': {
    renumbers: true,
    blocks: ['quote', 'tabs', 'faq'],
    ids: { 'v-0-1-0': 'v-0-3-0', 'v-0-2-0': 'v-0-1-0', 'v-0-2-1': 'v-0-1-1', 'v-0-3-0': 'v-0-2-0' },
    lateChunk: true,
    staleChunk: false,
  },
  // A block removed: every block after it.
  'edit-remove': {
    renumbers: true,
    blocks: ['tabs', 'faq'],
    ids: { 'v-0-1-0': 'v-0-2-0', 'v-0-1-1': 'v-0-2-1', 'v-0-2-0': 'v-0-3-0' },
    lateChunk: false,
    staleChunk: true,
  },
  // Two blocks swapped: both.
  'edit-reorder': {
    renumbers: true,
    blocks: ['faq', 'tabs'],
    ids: { 'v-0-1-0': 'v-0-2-0', 'v-0-2-0': 'v-0-1-0', 'v-0-2-1': 'v-0-1-1' },
    lateChunk: false,
    staleChunk: false,
  },
  // A block replaced by one of another type: the new block only.
  'edit-type': {
    renumbers: true,
    blocks: ['cta'],
    ids: { 'v-0-1-0': 'v-0-3-0' },
    lateChunk: true,
    staleChunk: true,
  },
  // An item added inside a list block: its ids are the block's own, numbered by index.
  'edit-faq-item': { renumbers: false, blocks: [], ids: {}, lateChunk: false, staleChunk: false },
  'edit-tab-item': { renumbers: false, blocks: [], ids: {}, lateChunk: false, staleChunk: false },
  // A page only the draft has: the session hydrates the not-found document, then builds the whole
  // page in the browser — in the order a prerender would, so nothing is renumbered.
  'draft-only': {
    renumbers: false,
    blocks: [],
    ids: {},
    lateChunk: true,
    staleChunk: false,
    notFoundDocument: true,
  },
};

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

  it('answers localized fields without changing any block’s own sample data', () => {
    for (const apiId of STARTER_BLOCK_TYPES) {
      for (const locale of ['en-US', 'is-IS']) {
        expect(inLocale(sampleData(apiId), locale), `${apiId} in ${locale}`).toEqual(
          sampleData(apiId)
        );
      }
    }
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
        expect(published.dom.some((line) => line.includes('data-eldra-missing-block'))).toBe(false);
        expect(session.dom.join('\n')).toBe(published.dom.join('\n'));
        expectNoChangeAfterTheVeil(session);
        expect(session.data).toBe(published.data);
        // The metadata does differ — the session read drafts — and reaches nothing above.
        expect(session.dataWithMetadata).not.toBe(published.dataWithMetadata);
        expect(session.dataWithMetadata).toContain('"updatedAt": "2026-11-20T10:00:00Z"');
        expect(session.dataWithMetadata).not.toMatch(/"status": "(CHANGED|DRAFT|PUBLISHED)"/);
        expect(published.dataWithMetadata).not.toMatch(/"status": "(CHANGED|DRAFT|PUBLISHED)"/);
        expect(session.scrollY).toBe(published.scrollY);
        expect(session.focused).toBe(published.focused);
        expectSameWarnings(path, session.warnings, published.warnings);
      });

      it(`${path} at ${width}: 0 pixels differ`, async () => {
        const published = await screenshot(live.origin, path, width, false);
        const session = await screenshot(router.origin, path, width, true);
        expect(await differingPixels(session, published)).toMatchObject({ differing: 0 });
      });
    }
  }

  for (const edit of EDIT_CASES) {
    const path = `/${edit}`;
    const expected = EDIT_EXPECTATIONS[edit];
    for (const width of WIDTHS) {
      it(`${path} at ${width}: ${expected.renumbers ? 'renumbers ids (known)' : 'the session’s DOM is the live page’s'}`, async () => {
        const published = await capture(live.origin, path, width, false);
        const session = await capture(router.origin, path, width, true);
        const liveHints = hintsOf(published.dom);
        const sessionHints = hintsOf(session.dom);
        expectNoChangeAfterTheVeil(session);
        expectSameWarnings(path, session.warnings, published.warnings);
        expect(session.focused).toBe(published.focused);
        expect(session.scrollY).toBe(published.scrollY);
        // Chunk hints: every one the live page has, the session has too. A block type the pinned
        // page never had arrives late (the session preloads its chunk when the draft needs it, as an
        // absolute URL); one the draft no longer has stays behind (stale), from the pinned page.
        expect(liveHints.paths.filter((hint) => !sessionHints.paths.includes(hint))).toEqual([]);
        expect(sessionHints.late.length > 0).toBe(expected.lateChunk);
        const stale = sessionHints.paths.filter((hint) => !liveHints.paths.includes(hint));
        expect(stale.length > 0).toBe(expected.staleChunk);
        let liveBody = bodyOf(published.dom);
        let sessionBody = bodyOf(session.dom);
        let sessionData = session.data;
        if (expected.notFoundDocument) {
          // The session hydrated the pinned build's not-found document: its payload preload is
          // that document's, and the session holds that document's route as well (re-read once,
          // like every route the server filled), beside the draft page's.
          const payloadHint = (line: string): boolean =>
            line.includes('rel="preload"') && line.includes('_payload.json');
          expect(liveBody.filter(payloadHint).join('')).toContain(`href="${path}/_payload.json`);
          expect(sessionBody.filter(payloadHint).join('')).toContain('href="/404/_payload.json');
          liveBody = liveBody.filter((line) => !payloadHint(line));
          sessionBody = sessionBody.filter((line) => !payloadHint(line));
          const parsed = JSON.parse(sessionData) as { data: Record<string, unknown> };
          expect(Object.keys(parsed.data)).toContain('eldra-page:/404');
          delete parsed.data['eldra-page:/404'];
          sessionData = JSON.stringify(parsed, null, 1);
        }
        expect(sessionData).toBe(published.data);
        if (!expected.renumbers) {
          expect(sessionBody.join('\n')).toBe(liveBody.join('\n'));
          return;
        }
        // Unequal as they are; equal once the ids are renumbered; and exactly these ids moved.
        expect(sessionBody.join('\n')).not.toBe(liveBody.join('\n'));
        expect(renumberIds(sessionBody)).toEqual(renumberIds(liveBody));
        const moved = renumbered(liveBody, sessionBody);
        expect(moved.blocks).toEqual(expected.blocks);
        expect(moved.ids).toEqual(expected.ids);
      });

      it(`${path} at ${width}: 0 pixels differ`, async () => {
        const published = await screenshot(live.origin, path, width, false);
        const session = await screenshot(router.origin, path, width, true);
        expect(await differingPixels(session, published)).toMatchObject({ differing: 0 });
      });
    }
  }

  /**
   * **Known difference: focus given late, and scroll-driven state.** A component that focuses on
   * mount (the search results page's field) is hydrated in a session while the app is inert under
   * the veil, so the focus is given only once the draft is shown (`replayCoveredFocus`), seconds
   * later than on the live page. Both end with the field focused and the page scrolled to it; but
   * what reacts to scroll events then runs in a different order against the page's other late work
   * (the storefront's catalog refresh), and the starter header's hide-on-scroll ends hidden on the
   * live page and, in about half the runs, shown in the session. Pinned here with the field
   * mid-page: the focus and the scroll position must match, and the header's `-translate-y-full`
   * is the only thing allowed to differ. On the real `/search` page, where the field stands near
   * the top and the header never hides, the two match exactly (`/` above).
   */
  for (const width of [1280] as const) {
    it(`${FOCUS_MID_PATH} at ${width}: a field focused mid-page is focused and scrolled to, the header may differ (known)`, async () => {
      const published = await capture(live.origin, FOCUS_MID_PATH, width, false);
      const session = await capture(router.origin, FOCUS_MID_PATH, width, true);
      expect(published.focused).toBe('input[aria-label="Search the shop"]');
      expect(session.focused).toBe(published.focused);
      expect(session.scrollY).toBe(published.scrollY);
      expect(published.scrollY).toBeGreaterThan(900);
      const differing = published.dom
        .map((line, index) => [line, session.dom[index]!] as const)
        .filter(([before, after]) => before !== after);
      expect(session.dom.length).toBe(published.dom.length);
      for (const [before, after] of differing) {
        expect(before).toMatch(/^\s*<header /);
        expect(before.replace(' -translate-y-full', '')).toBe(
          after.replace(' -translate-y-full', '')
        );
      }
      expect(differing.length).toBeLessThanOrEqual(1);
      expectNoChangeAfterTheVeil(session, true);
      expect(session.data).toBe(published.data);
      expectSameWarnings(FOCUS_MID_PATH, session.warnings, published.warnings);
    });
  }

  /**
   * **Design tokens and theme texts saved after the pinned deploy (the owner's decision, 2026-11-23):
   * a preview shows them as soon as they are saved.** Skipped: the kit cannot do that yet. A build
   * reads the site's tokens and theme texts once (`@eldrajs/theme-nuxt`'s module, `readDesignTokens`
   * and `readThemeMessages`) and bakes them in — the tokens into the runtime config the plugin hands
   * `EldraLayout` (its `<style data-eldra-design-token-styles>`), the texts into
   * `virtual:eldra/messages` — and a session reads neither at runtime, so it shows the pinned
   * build's. Unskip it with the runtime change (a session reading the saved tokens and texts through
   * the router, once Core serves them to a session).
   */
  describe.skip('design tokens saved after the pinned deploy show in a session', () => {
    let republished: StaticServer;
    let saved: Record<string, unknown>;

    beforeAll(async () => {
      const tokens = normalizeThemeDesignTokens(starterTokens);
      saved = {
        ...tokens,
        colors: { ...tokens.colors, primary: { ...tokens.colors.primary!, value: '#0b57d0' } },
      } as unknown as Record<string, unknown>;
      // Saved: the platform answers them from now on. What Publish would then put live is a build
      // made with them.
      gateway.designTokens = saved;
      republished = await startStaticServer(await build('retokened'));
    }, 900_000);

    afterAll(async () => {
      gateway.designTokens = null;
      await republished?.close();
    });

    it('a session shows the saved tokens, not the pinned build\u2019s', async () => {
      const primary = (origin: string, session: boolean): Promise<string> =>
        open(origin, '/', 1280, session, (page) =>
          page.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--eldra-color-primary')
              .trim()
          )
        );
      const pinned = await primary(live.origin, false);
      const publishLive = await primary(republished.origin, false);
      const session = await primary(router.origin, true);
      expect(publishLive).toBe('#0b57d0');
      expect(pinned).not.toBe(publishLive);
      expect(session).toBe(publishLive);
    });

    it.todo('a session shows theme texts saved after the pinned deploy');
  });
});
