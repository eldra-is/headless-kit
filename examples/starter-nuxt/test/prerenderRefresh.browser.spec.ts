import { chromium, type Browser, type Page } from '@playwright/test';
import { execa } from 'execa';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enUS } from '../app/i18n/en-US';
import { formatMoney } from '../app/storefront/money';
import {
  COLLECTION_HANDLE,
  HOME_PAGE_PATH,
  LINKED_HEADER_LABELS,
  PRODUCT_HANDLE,
  startMockGateway,
  type MockGateway,
} from './support/mockGateway';
import { startStaticServer, type StaticServer } from './support/staticServer';

/**
 * The generate-level proof of the prerender/refresh contract, in a real browser.
 *
 * Every other spec for this feature mounts blocks, or server-renders and hydrates them by hand.
 * Neither can see what this one is about: a `nuxi generate` build, served as static files, driving
 * **Nuxt's own** hydration, payload and lazily-imported block components. Four defects lived
 * happily under the mounted suites and were only visible here:
 *
 *  1. A storefront result whose source is not final at setup time re-keys in the browser and
 *     refetches data the page already has — `product-carousel` created a `byHandles` read over
 *     `localStorage` history on every product page, prerendered as `[[]]` and re-run as
 *     `[["<the product being viewed>"]]` the moment `product-detail` recorded the view.
 *  2. Blocks are lazily imported, so the ones whose chunk lands after the app has mounted created
 *     their results after a one-shot volatile refresh had already flushed: the carousel's cards
 *     never refreshed and never drew the refresh treatment, and the page's batched read for them
 *     never happened.
 *  3. And once every burst refreshed, two bursts asked about the same products twice — the deployed
 *     product page issued its detail read and its `id:in` batch twice, 35 ms apart, with identical
 *     ids. Which is why every request assertion below is over the **full** log, duplicates
 *     included, and why `askedMoreThanOnce` exists.
 *  4. …and the reason there were two bursts at all: the deployed host answers
 *     `/products/ash-glaze-mug` with a 308 to the same path plus a trailing slash, while the site
 *     is prerendered at the path without one. Nuxt's hydration re-navigates between the two, and
 *     because the catch-all route's default key differs between them the page — and every block on
 *     it — was destroyed and built again, so every read the page makes was created twice.
 *     `startStaticServer` serves the site the same way the host does, and the mount probe below is
 *     what makes the second build visible: only one of the two instances ever reaches `mounted`, so
 *     a request log or a DOM count sees nothing.
 *
 * The CMS **page** route (`/`) is in here as the control: its prerendered path and its served path
 * are the same string, so it never had the fourth defect, which is exactly how the live
 * discriminator read (home refreshed once, a product page twice).
 *
 * The mock gateway answers the CMS route templates and the catalog for the build, and the catalog
 * again for the browser — with every catalog answer held back (`catalogDelayMs`) while the browser
 * runs, so the refresh is observable while it is in flight rather than over in a millisecond.
 */

const templateDir = fileURLToPath(new URL('..', import.meta.url));
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
const ORG_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
/** Build output and installed dependencies: rebuilt or symlinked in the copy, never copied. */
const SKIPPED_FROM_COPY = new Set(['node_modules', '.nuxt', '.output', '.git']);
/** Long enough that a 200 ms sampler cannot step over the whole refresh. */
const CATALOG_DELAY_MS = 1500;

let gateway: MockGateway;
let statics: StaticServer;
let browser: Browser;
let root: string;
let scratch: string;

const output = (path: string): string => join(root, '.output', 'public', path);
const productPage = `/products/${PRODUCT_HANDLE}`;
const collectionPage = `/collections/${COLLECTION_HANDLE}`;

/** One DOM sample of the refresh treatment the commerce blocks draw. */
interface Treatment {
  busy: number;
  dimmed: number;
  spinners: number;
  announced: number;
}

interface Visit {
  /** `pathname + search` of every gateway request this page load made, decoded. */
  requests: string[];
  samples: Treatment[];
  /** Console errors and anything Vue said about hydration. */
  warnings: string[];
  /**
   * Every money amount on the page, in order, once everything has settled — read off `<Price>`'s own
   * value part rather than scraped out of the body text, so an authored sentence that mentions an
   * amount ("Free delivery over $80") is not mistaken for a price the storefront formatted.
   */
  prices: string[];
  /**
   * How many component instances each block got, and how many of them mounted, keyed
   * `<component>|<schemaApiId>|<entry id>` — see `test/support/mountProbe.client.ts`. Every value
   * must be 1: a block created a second time runs its `setup` again, and with it every storefront
   * read in it.
   */
  instances: {
    created: Record<string, number>;
    mounted: Record<string, number>;
  };
  /** Where the browser ended up — the host's redirect included, which is the point on a page route. */
  url: string;
}

/** Just the block components' counts, which is what "built once" is about. */
function blockInstances(visited: Visit): Visit['instances'] {
  const blocksOnly = (counts: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(counts).filter(([key]) => key.startsWith('Block|')));
  return {
    created: blocksOnly(visited.instances.created),
    mounted: blocksOnly(visited.instances.mounted),
  };
}

/** The entries whose count is anything but one, as `[key, count]` pairs — `[]` when all is well. */
function notExactlyOnce(counts: Record<string, number>): Array<[string, number]> {
  return Object.entries(counts).filter(([, count]) => count !== 1);
}

/** Load one generated page in a real browser and watch it refresh. */
async function visit(path: string): Promise<Visit> {
  gateway.reset();
  const page = await browser.newPage();
  const warnings: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
      warnings.push(`${message.type()}: ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 200)}`));
  try {
    await page.goto(`${statics.origin}${path}`, {
      waitUntil: 'domcontentloaded',
    });
    const samples: Treatment[] = [];
    // 4 s covers the whole 1.5 s refresh and the settled state after it.
    for (let elapsed = 0; elapsed < 4000; elapsed += 200) {
      samples.push(
        await page.evaluate(() => ({
          busy: document.querySelectorAll('[aria-busy="true"]').length,
          dimmed: document.querySelectorAll('.eldra-revalidating').length,
          spinners: document.querySelectorAll('[data-part="spinner"]').length,
          announced: [...document.querySelectorAll('[role="status"]')].filter((node) =>
            /Updating/i.test((node as HTMLElement).textContent ?? '')
          ).length,
        }))
      );
      await page.waitForTimeout(200);
    }
    const prices = await page.evaluate(() =>
      [...document.querySelectorAll('[data-part="current"]')]
        .map((node) => (node as HTMLElement).textContent?.trim() ?? '')
        .slice(0, 12)
    );
    const instances = await page.evaluate(() => {
      const probe = window as unknown as {
        __eldraCreated?: Record<string, number>;
        __eldraMounted?: Record<string, number>;
      };
      return {
        created: probe.__eldraCreated ?? {},
        mounted: probe.__eldraMounted ?? {},
      };
    });
    return {
      requests: gateway.requests.map((request) => decodeURIComponent(request)),
      samples,
      warnings,
      prices,
      instances,
      url: page.url(),
    };
  } finally {
    await page.close();
  }
}

/** The `storefront:` async-data keys the prerender wrote into a page's payload. */
function payloadStorefrontKeys(path: string): string[] {
  const raw = readFileSync(output(join(path, '_payload.json')), 'utf8');
  return [...raw.matchAll(/"(storefront:(?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1] ?? ''}"`) as string)
    .sort();
}

/** The page as a visitor with no JavaScript sees it. */
function staticHtml(path: string): string {
  return readFileSync(output(join(path, 'index.html')), 'utf8');
}

/**
 * What the page asked about more than once across its whole refresh — a product id that appears in
 * two `id:in` batches, or a detail read issued twice. This is the assertion the live request log
 * would have failed: four requests, two of them repeats of the other two.
 */
function askedMoreThanOnce(requests: readonly string[]): string[] {
  const times = new Map<string, number>();
  const count = (what: string): void => times.set(what, (times.get(what) ?? 0) + 1);
  for (const request of requests) {
    const url = new URL(request, 'http://localhost');
    const filters = url.searchParams.getAll('filter').filter((token) => token.startsWith('id:in:'));
    if (filters.length === 0) {
      count(url.pathname);
      continue;
    }
    for (const token of filters) {
      for (const id of token.slice('id:in:'.length).split(',')) count(id);
    }
  }
  return [...times]
    .filter(([, seen]) => seen > 1)
    .map(([what]) => what)
    .sort();
}

/** One sample of what a visitor can see while the app moves between two routes. */
interface NavSample {
  /** The whole visible page text — the loading shell's string is in here, or it is not. */
  text: string;
  h1: string;
}

interface Navigation {
  samples: NavSample[];
  /** `pathname + search` of every **gateway** request made from the moment the navigation started. */
  requests: string[];
  url: string;
  warnings: string[];
}

/** The first sample that shows the not-found shell, or -1 — how promptly a 404 was answered. */
function firstSampleShowing(samples: readonly NavSample[], text: string): number {
  return samples.findIndex((sample) => sample.text.includes(text));
}

/**
 * Load `from`, let its own post-hydration refresh finish, then navigate **inside the app** and
 * watch what the visitor sees and what the gateway is asked, from the click onwards.
 *
 * The wait before `gateway.reset()` is what makes the request log mean anything: the departure
 * page's refresh is held back by `catalogDelayMs`, and a navigation started while it is in flight
 * would put its answers in the log this is about.
 */
async function navigateFrom(from: string, go: (page: Page) => Promise<void>): Promise<Navigation> {
  const page = await browser.newPage();
  const warnings: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
      warnings.push(`${message.type()}: ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 200)}`));
  try {
    await page.goto(`${statics.origin}${from}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(CATALOG_DELAY_MS + 1500);
    gateway.reset();
    await go(page);
    const samples: NavSample[] = [];
    // 50 ms, not the 200 ms the hard-load sampler uses: a loading shell that flashes between two
    // prerendered routes is gone in well under a frame budget's worth of coarse sampling.
    for (let elapsed = 0; elapsed < 3000; elapsed += 50) {
      samples.push(
        await page.evaluate(() => ({
          text: document.body.innerText,
          h1: document.querySelector('h1')?.textContent?.trim() ?? '',
        }))
      );
      await page.waitForTimeout(50);
    }
    return {
      samples,
      requests: gateway.requests.map((request) => decodeURIComponent(request)),
      url: page.url(),
      warnings,
    };
  } finally {
    await page.close();
  }
}

/** What the collection grid shows: its card titles, its count line, and its two price inputs. */
interface GridState {
  titles: string[];
  count: string;
  price: string[];
}

const GRID_SECTION = 'section[aria-label="The winter edit products"]';

function readGrid(page: Page): Promise<GridState> {
  return page.evaluate((selector) => {
    const section = document.querySelector(selector);
    // `aria-labelledby`, not any `ul`: that is the grid's own card list. The active-filter chips
    // are a `ul[aria-label]` in the same section, and they only exist once something is filtered.
    const titles = [
      ...(section?.querySelectorAll('ul[aria-labelledby]:not([aria-hidden]) > li') ?? []),
    ].map((card) => (card.querySelector('a')?.textContent ?? '').trim());
    const status = [...(section?.querySelectorAll('p[role="status"]') ?? [])]
      .map((node) => (node as HTMLElement).textContent?.trim() ?? '')
      .filter((text) => text !== '');
    const price = [...(section?.querySelectorAll('aside input[inputmode="numeric"]') ?? [])].map(
      (input) => (input as HTMLInputElement).value
    );
    return { titles, count: status[0] ?? '', price };
  }, GRID_SECTION);
}

/**
 * A hard load, watched long enough for a filtered read to have gone out and answered — the catalog
 * is held back by `catalogDelayMs`, so this is the settled state, not a race.
 */
async function visitCollection(path: string): Promise<{
  grid: GridState;
  requests: string[];
  warnings: string[];
  url: string;
}> {
  gateway.reset();
  const page = await browser.newPage();
  const warnings: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
      warnings.push(`${message.type()}: ${text.slice(0, 200)}`);
    }
  });
  page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 200)}`));
  try {
    await page.goto(`${statics.origin}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CATALOG_DELAY_MS + 2500);
    return {
      grid: await readGrid(page),
      requests: gateway.requests.map((request) => decodeURIComponent(request)),
      warnings,
      url: page.url(),
    };
  } finally {
    await page.close();
  }
}

/** The sample with the most of the treatment on screen. */
function peakOf(samples: readonly Treatment[]): Treatment {
  return samples.reduce((most, sample) => (sample.spinners > most.spinners ? sample : most));
}

const NOTHING: Treatment = { busy: 0, dimmed: 0, spinners: 0, announced: 0 };

describe('prerendered commerce data on the generated static site', () => {
  beforeAll(async () => {
    gateway = await startMockGateway();
    scratch = mkdtempSync(join(tmpdir(), 'eldra-prerender-'));
    root = join(scratch, 'site');
    // The starter itself, minus what a build makes: `nuxi generate` writes `.output` into its own
    // working directory, and this suite must not race the one `test/starter.spec.ts` runs.
    cpSync(templateDir, root, {
      recursive: true,
      filter: (source) => {
        const [first] = relative(templateDir, source).split(sep);
        return first === undefined || !SKIPPED_FROM_COPY.has(first);
      },
    });
    symlinkSync(join(templateDir, 'node_modules'), join(root, 'node_modules'), 'dir');
    // The mount counter, installed into the generated copy only. In the starter it sits inert
    // under `test/support/`, where no Nuxt build looks; this is the one place it becomes a plugin.
    cpSync(
      join(templateDir, 'test', 'support', 'mountProbe.client.ts'),
      join(root, 'app', 'plugins', 'zz-mount-probe.client.ts')
    );
    const generated = await execa(nuxi, ['generate'], {
      cwd: root,
      env: { ELDRA_GATEWAY_URL: gateway.url, ELDRA_ORG_ID: ORG_ID },
      reject: false,
      timeout: 600_000,
    });
    expect(generated.exitCode, `${generated.stdout}\n${generated.stderr}`).toBe(0);
    // The build has finished reading the catalog; every answer the browser waits for is held back
    // from here on, so the refresh can be watched rather than inferred.
    gateway.catalogDelayMs = CATALOG_DELAY_MS;
    statics = await startStaticServer(join(root, '.output', 'public'));
    browser = await chromium.launch();
  }, 900_000);

  afterAll(async () => {
    await browser?.close();
    await statics?.close();
    await gateway?.close();
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  });

  it('builds every block on a CMS page route exactly once', async () => {
    const visited = await visit(HOME_PAGE_PATH);
    // The control's premise: `/` is served where it was prerendered, nothing to redirect.
    expect(visited.url).toBe(`${statics.origin}${HOME_PAGE_PATH}`);
    const instances = blockInstances(visited);
    // The page's own nine, plus the `cart` block `app/app.vue` hosts as the site's one drawer — it
    // is a block component like any other, so the probe counts it, and it must be built once too.
    expect(Object.keys(instances.created).length).toBe(10);
    expect(notExactlyOnce(instances.created)).toEqual([]);
    expect(notExactlyOnce(instances.mounted)).toEqual([]);
    expect(visited.warnings).toEqual([]);
  });

  it('builds every block on a route-template page exactly once, served with a trailing slash', async () => {
    const visited = await visit(productPage);
    // The premise first: the host really did redirect, so the browser is hydrating a payload
    // prerendered at a different path from the one it is sitting on. Without this the rest of the
    // case would keep passing while quietly testing nothing.
    expect(visited.url).toBe(`${statics.origin}${productPage}/`);
    const instances = blockInstances(visited);
    // The page's own seven, plus the shell's hosted cart drawer (see the control above).
    expect(Object.keys(instances.created).length).toBe(8);
    // The page is served at `/products/ash-glaze-mug/` and prerendered at
    // `/products/ash-glaze-mug` (`startStaticServer`'s 308 is the deployed host's). Nuxt therefore
    // re-navigates between the two while the page hydrates, and unless the route key and the page
    // composable both read the *canonical* path, that move destroys and rebuilds the page — every
    // block's `setup` runs again, every storefront read in it goes out again, and only one of the
    // two instances ever mounts, so the mount count alone would say nothing is wrong.
    expect(notExactlyOnce(instances.created)).toEqual([]);
    expect(notExactlyOnce(instances.mounted)).toEqual([]);
    expect(visited.warnings).toEqual([]);
  });

  it('writes real prices and stock into the static HTML, with no skeleton and nothing busy', () => {
    for (const path of [productPage, collectionPage]) {
      const html = staticHtml(path);
      // In the store's own currency, which the build read from the platform
      // (`test/support/mockGateway.ts` publishes ISK — and says why it is not dollars). A page that
      // fell back to `@eldrajs/ui`'s ambient default would read `$42.00` here instead.
      expect(html, path).toContain('commerce:{currency:"ISK"');
      expect(html, path).toContain(formatMoney(42, 'ISK'));
      expect(html, path).not.toContain('$42.00');
      expect(html, path).toContain('Ash glaze mug');
      expect(html, path).not.toContain('eldra-skeleton');
      expect(html, path).not.toContain('eldra-revalidating');
      expect(html, path).not.toContain('aria-busy="true"');
      expect(html, path).not.toContain('Loading…');
    }
    // The carousel's cards are prerendered too, prices and all.
    expect(staticHtml(productPage)).toContain('Cedar serving board');
  });

  it("bakes every header link's href into the static HTML, and draws no anchor for a target that is gone", () => {
    // The whole point of the `link` field: the header stores what it points at, and the site
    // derives the path from its own route templates at prerender time. A visitor with no
    // JavaScript gets working links; the browser makes no request to resolve one.
    //
    // The links are `mockGateway`'s own fixture, not the theme's seed: the seed ships none, so a
    // header with destinations only ever exists once an author has made some.
    for (const path of [HOME_PAGE_PATH, productPage, collectionPage]) {
      const html = staticHtml(path);
      const anchor = (label: string): RegExpMatchArray | null =>
        html.match(new RegExp(`<a[^>]*href="([^"]*)"[^>]*>(?:(?!</a>).)*${label}`, 's'));

      expect(anchor(LINKED_HEADER_LABELS.collection)?.[1], path).toBe(
        `/collections/${COLLECTION_HANDLE}`
      );
      expect(anchor(LINKED_HEADER_LABELS.product)?.[1], path).toBe(`/products/${PRODUCT_HANDLE}`);
      expect(anchor(LINKED_HEADER_LABELS.url)?.[1], path).toBe('/journal');

      // The gateway has never heard of this collection — deleted, archived, or unpublished. The
      // label is still worth showing; an anchor to nowhere is not.
      expect(html, path).toContain(LINKED_HEADER_LABELS.missing);
      expect(anchor(LINKED_HEADER_LABELS.missing), path).toBeNull();
    }
  });

  it("opens a mega-menu that spans the header's container, whichever item opened it", async () => {
    // Geometry only a real browser can answer. The panel used to be pinned to the item that
    // opened it at a width of its own, so where it started and stopped depended on which word in
    // the bar the visitor happened to hover. It now spans the bar's own container: its left edge
    // on the brand's, its right edge on the actions', and its top on the bar's bottom edge.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${statics.origin}${HOME_PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
      const trigger = page
        .locator('header nav')
        .getByRole('button', { name: LINKED_HEADER_LABELS.mega });
      await trigger.click();
      const panelId = await trigger.getAttribute('aria-controls');
      expect(panelId).not.toBeNull();
      // Vitest's `expect` here, not Playwright's — the wait is the locator's own.
      await page.locator(`#${panelId ?? ''}`).waitFor({ state: 'visible' });
      // "Visible" is true from the *first* frame of the panel's entrance, and that entrance carries
      // a 4px rise (`-translate-y-1` over 150ms, `panelTransition` in `blocks/navigation/Block.vue`).
      // Measuring there reads the panel 4px above where it settles — which, plus the bar's own 1px
      // border, is exactly the 5px this geometry case used to fail by whenever the machine got to
      // `evaluate` inside 150ms. So wait for the transition itself to finish, not just for the
      // element to exist.
      await page.waitForFunction(
        (id) =>
          (document.getElementById(id)?.getAnimations() ?? []).every(
            (animation) => animation.playState !== 'running'
          ),
        panelId ?? ''
      );

      const edges = await page.evaluate((id) => {
        const box = (
          selector: string
        ): { left: number; right: number; bottom: number; top: number } => {
          const element = document.querySelector(selector);
          if (element === null) throw new Error(`no ${selector}`);
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top };
        };
        const panel = document.getElementById(id)!;
        const rect = panel.getBoundingClientRect();
        // The first column of the grid, and the "View all" anchor — the two pieces of content
        // that decide whether the panel has an inset at all.
        const firstColumn = panel.firstElementChild!.getBoundingClientRect();
        const viewAll = panel.querySelector('[data-eldra-mega-view-all]')!.getBoundingClientRect();
        return {
          panel: { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top },
          firstColumn: { left: firstColumn.left, right: firstColumn.right },
          viewAll: { left: viewAll.left, right: viewAll.right },
          brand: box('header [data-eldra-header-focus]'),
          actions: box('header [data-eldra-header-actions]'),
          bar: box('header'),
          trigger: box(`[aria-controls="${id}"]`),
        };
      }, panelId ?? '');

      expect(Math.round(edges.panel.left)).toBe(Math.round(edges.brand.left));
      expect(Math.round(edges.panel.right)).toBe(Math.round(edges.actions.right));
      // Directly below the bar — within the bar's own 1px bottom border.
      expect(Math.abs(edges.panel.top - edges.bar.bottom)).toBeLessThanOrEqual(2);
      // And the premise: the trigger is nowhere near either edge, so "spans the container" is a
      // real claim rather than a coincidence of where this item sits.
      expect(edges.trigger.left).toBeGreaterThan(edges.panel.left + 1);
      expect(edges.trigger.right).toBeLessThan(edges.panel.right - 1);
      // And the inset the operator asked for: nothing inside the panel sits flush against its
      // edges. 24px is the narrow-container figure; the wide container's own 32px clears it too,
      // so one bound holds at every width this page is measured at.
      expect(edges.firstColumn.left).toBeGreaterThanOrEqual(edges.panel.left + 24);
      expect(edges.viewAll.right).toBeLessThanOrEqual(edges.panel.right - 24);
    } finally {
      await page.close();
    }
  });

  it("paints an open mega-menu in the bar's own colour, and eases it in and out", async () => {
    // Two more things only a real browser can answer. First the colour: both the bar and the panel
    // resolve `--eldra-header-surface` through the theme's token variables, which exist only in a
    // real stylesheet — jsdom sees the class names and no colour at all. Second the leave: a panel
    // that merely stops being `display: block` is indistinguishable, in a mounted test, from one
    // that fades out over 120ms, and the fade is the whole point of the change.
    //
    // Both bar states are measured, because they are the two different grounds the bar can be
    // asked about: the home page's header is solid, and the collection template's carries
    // `transparentOverHero`, so at rest it paints nothing at all. An open panel must match the bar
    // in both — which means the bar must have stopped being transparent by the time one is open.
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'no-preference',
    });
    try {
      for (const [path, transparentAtRest] of [
        [HOME_PAGE_PATH, false],
        [collectionPage, true],
      ] as const) {
        await page.goto(`${statics.origin}${path}`, { waitUntil: 'domcontentloaded' });
        // The header publishes `--eldra-header-height` from its own ResizeObserver, which runs only
        // in the browser: the cheapest proof the bar is hydrated and will answer a click.
        await page.waitForFunction(
          () => document.documentElement.style.getPropertyValue('--eldra-header-height') !== ''
        );

        const barColour = async (): Promise<string> =>
          page.evaluate(() => getComputedStyle(document.querySelector('header')!).backgroundColor);
        const TRANSPARENT = 'rgba(0, 0, 0, 0)';
        expect((await barColour()) === TRANSPARENT, `${path} at rest`).toBe(transparentAtRest);

        const trigger = page
          .locator('header nav')
          .getByRole('button', { name: LINKED_HEADER_LABELS.mega });
        await trigger.click();
        const panelId = (await trigger.getAttribute('aria-controls')) ?? '';
        expect(panelId, path).not.toBe('');
        // The enter half: it finishes at full opacity rather than settling somewhere short of it.
        await page.waitForFunction(
          (id) => getComputedStyle(document.getElementById(id)!).opacity === '1',
          panelId
        );

        const open = await page.evaluate((id) => {
          const bar = document.querySelector('header')!;
          return {
            panel: getComputedStyle(document.getElementById(id)!).backgroundColor,
            bar: getComputedStyle(bar).backgroundColor,
            transparentAttribute: bar.getAttribute('data-eldra-transparent'),
          };
        }, panelId);
        // The whole point of the change: one surface, not two that happen to agree.
        expect(open.panel, path).toBe(open.bar);
        expect(open.panel, path).not.toBe(TRANSPARENT);
        // A panel never floats on a transparent bar, whatever the field says.
        expect(open.transparentAttribute, path).toBeNull();

        // The leave half, sampled frame by frame from the click that closes it: the panel is still
        // painted, part-way through a fade, for a while after `aria-expanded` has already gone back
        // to false — which is exactly what a `<Transition>` buys over a bare `v-show`.
        const leave = await page.evaluate(
          (id) =>
            new Promise<{ faded: boolean; hiddenAfterMs: number }>((resolve) => {
              const panel = document.getElementById(id)!;
              const start = performance.now();
              let faded = false;
              const tick = (): void => {
                const style = getComputedStyle(panel);
                const elapsed = performance.now() - start;
                if (style.display === 'none' || elapsed > 2000) {
                  resolve({ faded, hiddenAfterMs: elapsed });
                  return;
                }
                if (Number(style.opacity) < 1) faded = true;
                requestAnimationFrame(tick);
              };
              (document.querySelector(`[aria-controls="${id}"]`) as HTMLElement).click();
              requestAnimationFrame(tick);
            }),
          panelId
        );
        expect(leave.faded, `${path} fades out`).toBe(true);
        // 120ms of leave: comfortably more than the frame a bare `v-show` would have taken, and
        // nowhere near a panel that never leaves at all.
        expect(leave.hiddenAfterMs, path).toBeGreaterThanOrEqual(60);
        expect(leave.hiddenAfterMs, path).toBeLessThan(1000);
        expect(await trigger.getAttribute('aria-expanded'), path).toBe('false');
      }
    } finally {
      await page.close();
    }
  });

  it('hides the sticky bar on the way down, brings it back on the way up, and pins it while in use', async () => {
    // Where the bar actually is, which only a real browser can answer. The reveal is a class on the
    // bar, and a mounted test can read that class off a bar that is nowhere near the screen: on a
    // generated page the bar sits inside the single-block wrapper the block zone renders around it,
    // a box exactly the bar's own height, and a bar clamped to that box never travels at all — it
    // stays at the top of the *page*, scrolls out of view with it, and "revealed" means a class
    // change on something 900px above the viewport. So every assertion here is a rectangle.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.goto(`${statics.origin}${HOME_PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
      // The bar publishes its height from its own ResizeObserver, which runs only once hydrated.
      await page.waitForFunction(
        () => document.documentElement.style.getPropertyValue('--eldra-header-height') !== ''
      );

      const bar = async (): Promise<{
        top: number;
        bottom: number;
        height: number;
        position: string;
        scrollY: number;
        maxScroll: number;
      }> =>
        page.evaluate(() => {
          const element = document.querySelector('header');
          if (element === null) throw new Error('no header');
          const rect = element.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            position: getComputedStyle(element).position,
            scrollY: window.scrollY,
            maxScroll: document.documentElement.scrollHeight - window.innerHeight,
          };
        });
      /** The hide and the reveal are a transform transition; give it room to land. */
      const settle = async (): Promise<void> => {
        await page.waitForTimeout(600);
      };

      const atTop = await bar();
      expect(atTop.position).toBe('fixed');
      expect(Math.round(atTop.top)).toBe(0);
      // The premise of everything below: this page is tall enough to scroll 1200px.
      expect(atTop.maxScroll).toBeGreaterThan(1200);
      // And the bar reserves in the flow exactly the height it no longer occupies there, so the
      // page below it starts where it always did: the block still takes up the bar's own height.
      const flow = await page.evaluate(() => {
        const element = document.querySelector('header');
        if (element === null) throw new Error('no header');
        const spacer = document.querySelector('[data-eldra-header-spacer]');
        const wrapper = element.closest('[data-eldra-block]');
        return {
          spacer: spacer === null ? null : spacer.getBoundingClientRect().height,
          // The height the spacer's *classes* alone reserve — all the first paint of a prerendered
          // page has, before the bar has been measured at all — against the bar's own box for those
          // same classes. A difference here is a page that jumps on hydration.
          reserved:
            spacer === null ? null : spacer.firstElementChild!.getBoundingClientRect().height,
          nav: element.querySelector('nav')!.getBoundingClientRect().height,
          wrapper: wrapper === null ? null : wrapper.getBoundingClientRect().height,
        };
      });
      expect(flow.spacer).toBe(atTop.height);
      expect(flow.reserved).toBe(flow.nav);
      expect(flow.wrapper).toBe(atTop.height);

      await page.evaluate(() => window.scrollTo(0, 1200));
      await settle();
      const down = await bar();
      expect(down.scrollY).toBe(1200);
      // Off the screen entirely — translated out, not merely left behind.
      expect(down.bottom).toBeLessThanOrEqual(0);

      await page.evaluate(() => window.scrollBy(0, -300));
      await settle();
      const up = await bar();
      expect(up.scrollY).toBe(900);
      expect(Math.round(up.top)).toBe(0);
      expect(up.bottom).toBeGreaterThan(0);
      // Vitest's `expect` here, not Playwright's: the visibility is read, not awaited.
      expect(await page.locator('header').isVisible()).toBe(true);

      // In use: an open mega-menu pins the bar through a scroll-down that would otherwise hide it.
      const trigger = page
        .locator('header nav')
        .getByRole('button', { name: LINKED_HEADER_LABELS.mega });
      await trigger.click();
      const panelId = await trigger.getAttribute('aria-controls');
      await page.locator(`#${panelId ?? ''}`).waitFor({ state: 'visible' });
      await page.evaluate(() => window.scrollBy(0, 400));
      await settle();
      const pinned = await bar();
      expect(pinned.scrollY).toBe(1300);
      expect(Math.round(pinned.top)).toBe(0);
      expect(await trigger.getAttribute('aria-expanded')).toBe('true');
      expect(await page.locator(`#${panelId ?? ''}`).isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('prerenders every storefront read the product page makes, under the key the browser computes', () => {
    // The whole set, not a sample: a key the browser computes differently is a key missing from
    // this list, and `byHandles` is the one that used to be — `[[]]` here, `[["ash-glaze-mug"]]`
    // in the browser. The request assertions below are the other half of the proof: a key the
    // browser does not find in the payload fetches, and nothing here fetches.
    expect(payloadStorefrontKeys(productPage)).toEqual([
      'storefront:catalog.byHandles:[[]]',
      'storefront:catalog.collectionProducts:[null,{"page":1,"pageSize":8}]',
      'storefront:catalog.product:["ash-glaze-mug"]',
      'storefront:catalog.related:["ash-glaze-mug",8]',
      'storefront:search.run:[""]',
    ]);
  });

  it('refreshes the product page with the detail read and one batched read, and nothing else', async () => {
    const visited = await visit(productPage);
    // The **full** log, duplicates included, not a set of unique URLs. `product-detail` re-reads
    // its own product (only that read knows the variant-level inventory the products list cannot
    // answer about), and every card on the page — the carousel's six — is one batched `id:in` read.
    // Nothing else: no re-run of a prerendered non-volatile read, and nothing twice.
    expect(visited.requests).toEqual([
      `/catalog/v1/products/${PRODUCT_HANDLE}`,
      '/catalog/v1/products/list?pageSize=6&filter=id:in:prod-cedar-serving-board,' +
        'prod-flax-tea-towel,prod-stoneware-bowl,prod-brass-candle-holder,prod-linen-napkin-set,' +
        'prod-walnut-spoon',
      // The detail read's second half: the product's own inventory, which the list read has none of.
      '/inventory/v1/stock/availability',
    ]);
    expect(askedMoreThanOnce(visited.requests)).toEqual([]);
    expect(visited.warnings).toEqual([]);
  });

  it('draws the refresh treatment on every value it is re-reading, then clears it', async () => {
    const visited = await visit(productPage);
    const peak = peakOf(visited.samples);
    // Two values on the product itself (price, stock line) and two on each of the six cards.
    expect(peak.spinners).toBe(14);
    expect(peak.dimmed).toBeGreaterThanOrEqual(14);
    expect(peak.busy).toBeGreaterThan(0);
    // Something says so out loud — the carousel's one row-level region, plus the product's own
    // price and stock line, which announce for themselves. How many regions each block owns is
    // that block's spec; what matters here is that the announcement reaches a real page at all.
    expect(peak.announced).toBeGreaterThanOrEqual(1);
    // …and it is gone once the refresh has answered, with the prerendered values still on screen.
    expect(visited.samples[visited.samples.length - 1]).toEqual(NOTHING);
    expect(visited.prices).toContain(formatMoney(42, 'ISK'));
    expect(visited.prices).toContain(formatMoney(68, 'ISK'));
  });

  /**
   * Two blocks over the same collection — the grid and a carousel below it — which is the shape the
   * deployed pages showed the duplicate in: different blocks are different lazily imported chunks,
   * so they register in different bursts, and until this round each burst asked the gateway about
   * the same seven products all over again.
   */
  it('asks about the collection page’s products once, however many blocks show them', async () => {
    const visited = await visit(collectionPage);
    // One request for the whole page, not one per burst — and asserted as the full log.
    expect(visited.requests).toEqual([
      '/catalog/v1/products/list?pageSize=7&filter=id:in:prod-ash-glaze-mug,' +
        'prod-cedar-serving-board,prod-flax-tea-towel,prod-stoneware-bowl,prod-brass-candle-holder,' +
        'prod-linen-napkin-set,prod-walnut-spoon',
    ]);
    expect(askedMoreThanOnce(visited.requests)).toEqual([]);
    expect(visited.warnings).toEqual([]);
    // Both blocks still draw the treatment and both end up showing the refreshed values: the block
    // that arrived second folds in the answer the first one's read had already brought back.
    const peak = peakOf(visited.samples);
    expect(peak.spinners).toBe(28); // seven cards in the grid, seven in the carousel, two each
    expect(peak.busy).toBeGreaterThan(0);
    expect(peak.announced).toBe(2); // one row-level region per block
    expect(visited.samples[visited.samples.length - 1]).toEqual(NOTHING);
  });

  /**
   * Client-side navigation between two **prerendered** routes. Everything the destination needs is
   * in the build: Nuxt's own payload plugin loads `/products/<handle>/_payload.json` in
   * `router.beforeResolve` and writes it into `nuxtApp.static.data` before the page component
   * exists. A route resolution that reaches the gateway anyway is a resolution the build already
   * did — and it is visible, because the page renders its loading shell while it waits.
   *
   * The request log is asserted whole: the only reads a static navigation may make are the
   * destination page's own volatile refresh (the product's detail read, and one batched `id:in`
   * for the carousel's cards). A CMS read, or a read belonging to the collection page being left,
   * is a defect — the first says the route was resolved again, the second says a departing block
   * re-ran on the route change before it unmounted.
   */
  it('shows no loading state and asks nothing about the route when a card is clicked', async () => {
    const visited = await navigateFrom(collectionPage, async (page) => {
      await page.locator('#main a[href^="/products/"]').first().click();
    });
    // The premise: a real client-side navigation happened, to the product this spec is about.
    expect(visited.url).toBe(`${statics.origin}${productPage}`);
    expect(
      visited.samples.map((sample) => sample.text).filter((text) => text.includes(enUS.loading))
    ).toEqual([]);
    expect(visited.samples[visited.samples.length - 1]?.h1).toBe('Ash glaze mug');
    // The **whole** log. One read, and it is the product page's own volatile refresh: the detail
    // read `product-detail` makes for itself, because the id it shows is a *variant's* and the
    // batched `id:in` read cannot answer about it (`app/storefront/refresh.ts`). There is no
    // batched read beside it — the six cards on this page are products the collection page already
    // re-read a moment ago, and the refresher answers for a product once per page load, client
    // navigations included. The product page itself is not one of those answers: a result that
    // reads for itself is never satisfied by a batch (`app/storefront/refresh.ts`), because the
    // batch cannot answer the variant-level inventory this page's stock line is about.
    // Everything else the page shows came out of the payload Nuxt loaded for the route: no `/cms/`
    // read to resolve it, and nothing belonging to the collection page being left.
    expect(visited.requests).toEqual([
      `/catalog/v1/products/${PRODUCT_HANDLE}`,
      '/inventory/v1/stock/availability',
    ]);
    expect(askedMoreThanOnce(visited.requests)).toEqual([]);
    expect(visited.warnings).toEqual([]);
  });

  /**
   * A route the build does not know. The prerendered route list is shipped with the site (Nuxt's
   * app manifest), so "no such route" is an answer the browser already holds: the not-found shell
   * must appear at once, and the gateway must not be asked a single question to reach it.
   */
  it('answers an unknown route as not found at once, with no gateway call at all', async () => {
    const visited = await navigateFrom(collectionPage, async (page) => {
      await page.evaluate(() =>
        (
          window as unknown as {
            __eldraPush: (path: string) => Promise<unknown>;
          }
        ).__eldraPush('/products/does-not-exist')
      );
    });
    expect(visited.requests).toEqual([]);
    expect(
      visited.samples.map((sample) => sample.text).filter((text) => text.includes(enUS.loading))
    ).toEqual([]);
    // Within four samples — 200 ms — rather than after a round of gateway reads.
    const shown = firstSampleShowing(visited.samples, enUS.notFound.title);
    expect(shown).toBeGreaterThanOrEqual(0);
    expect(shown).toBeLessThan(4);
    expect(visited.warnings).toEqual([]);
  });

  /**
   * The header's bag, on a generated site, in a real browser. Two reported defects meet here: "the
   * cart does not seem to work, it just redirects to /cart" (the bag named a path nothing in the
   * theme answered, so the catch-all asked the gateway for a CMS page called "cart", found none, and
   * the shopper got the not-found shell), and then that it redirected at all — a cart belongs in a
   * drawer over the page the shopper is reading.
   *
   * So this is the whole progression a generated page goes through, which only this spec can see:
   * the prerendered HTML carries the bag as a real `<a href="/cart">` and the theme's drawer closed
   * (a visitor with no JavaScript, and a reader who arrives before hydration, still have somewhere to
   * go); once hydrated the drawer is mounted and the bag is a `<button>` that opens it with no
   * navigation at all; and `/cart` is still a prerendered file that renders the cart page when the
   * router is sent there.
   *
   * The generated site's cart is empty — a prerender has no shopper's session — so the drawer shows
   * its empty state, and its filled footer (subtotal, Check out, View cart) is the block spec's
   * ground rather than this one's.
   */
  it('opens the hosted cart drawer from the header bag, with /cart still there behind it', async () => {
    // The file first: `/cart` is prerendered by name (`nuxt.config.ts`), so a static host has
    // something to serve for it. Without this the navigation below would still "work" in the
    // router while the deployed site answered 404.
    const prerendered = staticHtml('/cart');
    expect(prerendered).toContain(enUS.cart.emptyFallbackTitle);
    expect(prerendered).not.toContain('data-eldra-not-found');

    // The home page as a static host serves it: one closed drawer (the `open` attribute, never the
    // `open:flex` utility in its class list), and the bag still a link.
    const home = staticHtml(HOME_PAGE_PATH);
    // Exactly one cart drawer in the markup — its close button names it, where "Your cart" alone
    // would also match the empty state inside it.
    expect(home.match(/aria-label="Close Your cart"/g) ?? []).toHaveLength(1);
    expect(home).not.toMatch(/<dialog[^>]*\sopen[=\s>]/);
    expect(home).toContain('href="/cart"');

    const page = await browser.newPage();
    const warnings: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
        warnings.push(`${message.type()}: ${text.slice(0, 200)}`);
      }
    });
    page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 200)}`));
    try {
      await page.goto(`${statics.origin}${HOME_PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CATALOG_DELAY_MS + 1500);
      gateway.reset();

      // Hydrated: the drawer is mounted, so the bag swapped from a link to a button (`drawerAvailable`
      // in `app/storefront/cart.ts`). The swap happens *after* hydration, which is why `warnings`
      // below must still be empty — a mismatch would mean the server and the first client render
      // disagreed.
      const bag = page.locator('header button[aria-label^="Cart"]');
      await bag.waitFor({ state: 'visible', timeout: 5000 });
      expect(await page.locator('header a[href="/cart"]').count()).toBe(0);

      await bag.click();
      const opened = await page.evaluate(() => {
        const open = [...document.querySelectorAll('dialog[open]')];
        return {
          count: open.length,
          title: open[0]?.querySelector('[data-part="title"]')?.textContent ?? '',
          text: (open[0] as HTMLElement | undefined)?.innerText ?? '',
          path: location.pathname,
        };
      });
      // One drawer, it is the cart, and the shopper is still on the page they were reading.
      expect(opened.count).toBe(1);
      expect(opened.title).toContain(enUS.cart.title);
      expect(opened.text).toContain(enUS.cart.emptyFallbackTitle);
      expect(opened.path).toBe(HOME_PAGE_PATH);
      // Opening the cart asks the gateway nothing: the cart is the shopper's own session state.
      expect(gateway.requests.filter((request) => request.startsWith('/cms/'))).toEqual([]);

      // Esc closes the top dialog and hands focus back to the bag that opened it.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      expect(await page.locator('dialog[open]').count()).toBe(0);
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
      ).toMatch(/^Cart/);

      // And the deep link is still a real route: a client-side navigation to it renders the
      // prerendered cart page, not the not-found shell.
      await page.evaluate(() =>
        (window as unknown as { __eldraPush: (path: string) => Promise<unknown> }).__eldraPush(
          '/cart'
        )
      );
      await page.waitForURL(`${statics.origin}/cart`);
      await page.waitForTimeout(500);
      const settled = await page.evaluate(() => ({
        h1: document.querySelector('main#main h1')?.textContent?.trim() ?? '',
        text: document.body.innerText,
      }));
      expect(settled.h1).toContain(enUS.cart.title);
      expect(settled.text).toContain(enUS.cart.emptyFallbackTitle);
      expect(settled.text).not.toContain(enUS.notFound.title);
      // A code route: the gateway is never asked to resolve it.
      expect(gateway.requests.filter((request) => request.startsWith('/cms/'))).toEqual([]);
      expect(warnings).toEqual([]);
    } finally {
      await page.close();
    }
  });

  /**
   * The facets a visitor arrives with, on a generated page.
   *
   * `app/storefront/facets.ts` filters the gateway's results, and the block reads `minPrice`/
   * `maxPrice` off the storefront route — and none of that reached a deployed site, because on a
   * prerendered page the URL's query is not in the route the block is built under. Nuxt hydrates a
   * prerendered route under the **payload's** path (`hasDeferredRoute` in its own router plugin:
   * the query arrives only after `app:suspense:resolve`), so the block seeded its filter state from
   * an empty query, kept it forever, and the page stayed exactly as the build wrote it: all seven
   * products, "7 products", both price inputs blank, and not one catalog request but the volatile
   * batch.
   *
   * Both halves are asserted here rather than in a mounted spec, because a mounted spec hands the
   * block a route object with the filters already on it — which is precisely the thing that does
   * not happen on a generated page.
   */
  describe('collection facets from the URL', () => {
    /** 42, 52 and 44 of the seven — the prices `test/support/mockGateway.ts` seeds. The range
     *  inputs are major units, so they read the same whatever the store's currency is. */
    const IN_RANGE = ['Ash glaze mug', 'Brass candle holder', 'Linen napkin set'];

    it('renders the filtered set on a hard load, with the range in the inputs', async () => {
      const visited = await visitCollection(`${collectionPage}/?minPrice=40&maxPrice=60`);

      expect(visited.grid.titles).toEqual(IN_RANGE);
      expect(visited.grid.count).toBe(enUS.grid.nProducts.replace('{count}', '3'));
      expect(visited.grid.price).toEqual(['40', '60']);
      // The build's payload holds the *unfiltered* result, so a filtered view has to read live —
      // under a key of its own (the filters are part of it), which is what makes it miss the
      // payload rather than silently reuse it.
      expect(
        visited.requests.some((request) =>
          request.startsWith(`/catalog/v1/collections/${COLLECTION_HANDLE}/products`)
        )
      ).toBe(true);
      // The server rendered the unfiltered page; the client applies the query after mounting, so
      // the first paint is still the server's and Vue has nothing to complain about.
      expect(visited.warnings).toEqual([]);
      expect(visited.url).toBe(`${statics.origin}${collectionPage}/?minPrice=40&maxPrice=60`);
    });

    it('re-reads and re-renders when the query changes under the block', async () => {
      gateway.reset();
      const page = await browser.newPage();
      const warnings: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (/hydrat|mismatch/i.test(text) || message.type() === 'error') {
          warnings.push(`${message.type()}: ${text.slice(0, 200)}`);
        }
      });
      page.on('pageerror', (error) => warnings.push(`pageerror: ${error.message.slice(0, 200)}`));
      try {
        await page.goto(`${statics.origin}${collectionPage}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CATALOG_DELAY_MS + 1500);
        const before = await readGrid(page);
        expect(before.titles).toHaveLength(7);
        expect(before.price).toEqual(['', '']);

        gateway.reset();
        await page.evaluate(
          (to) =>
            (window as unknown as { __eldraPush: (path: string) => Promise<unknown> }).__eldraPush(
              to
            ),
          `${collectionPage}?minPrice=40&maxPrice=60`
        );
        await page.waitForTimeout(CATALOG_DELAY_MS + 2500);

        const after = await readGrid(page);
        expect(after.titles).toEqual(IN_RANGE);
        expect(after.count).toBe(enUS.grid.nProducts.replace('{count}', '3'));
        expect(after.price).toEqual(['40', '60']);
        const requests = gateway.requests.map((request) => decodeURIComponent(request));
        expect(
          requests.some((request) =>
            request.startsWith(`/catalog/v1/collections/${COLLECTION_HANDLE}/products`)
          )
        ).toBe(true);
        expect(page.url()).toBe(`${statics.origin}${collectionPage}?minPrice=40&maxPrice=60`);
        expect(warnings).toEqual([]);
      } finally {
        await page.close();
      }
    });
  });
});
