import { chromium, type Browser } from '@playwright/test';
import { execa } from 'execa';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COLLECTION_HANDLE,
  HOME_PAGE_PATH,
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
  /** Every money amount on the page, in order, once everything has settled. */
  prices: string[];
  /**
   * How many component instances each block got, and how many of them mounted, keyed
   * `<component>|<schemaApiId>|<entry id>` — see `test/support/mountProbe.client.ts`. Every value
   * must be 1: a block created a second time runs its `setup` again, and with it every storefront
   * read in it.
   */
  instances: { created: Record<string, number>; mounted: Record<string, number> };
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
    await page.goto(`${statics.origin}${path}`, { waitUntil: 'domcontentloaded' });
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
      (document.body.innerText.match(/\$\d[\d.,]*/g) ?? []).slice(0, 12)
    );
    const instances = await page.evaluate(() => {
      const probe = window as unknown as {
        __eldraCreated?: Record<string, number>;
        __eldraMounted?: Record<string, number>;
      };
      return { created: probe.__eldraCreated ?? {}, mounted: probe.__eldraMounted ?? {} };
    });
    return {
      requests: gateway.requests.map((request) => decodeURIComponent(request)),
      samples,
      warnings,
      prices,
      instances,
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
    // The mount counter, installed into the generated copy only — the starter ships no such
    // plugin, so nothing a customer builds carries it.
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
    const instances = blockInstances(visited);
    expect(Object.keys(instances.created).length).toBe(9);
    expect(notExactlyOnce(instances.created)).toEqual([]);
    expect(notExactlyOnce(instances.mounted)).toEqual([]);
    expect(visited.warnings).toEqual([]);
  });

  it('builds every block on a route-template page exactly once, served with a trailing slash', async () => {
    const visited = await visit(productPage);
    const instances = blockInstances(visited);
    expect(Object.keys(instances.created).length).toBe(7);
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
      expect(html, path).toContain('$42.00');
      expect(html, path).toContain('Ash glaze mug');
      expect(html, path).not.toContain('eldra-skeleton');
      expect(html, path).not.toContain('eldra-revalidating');
      expect(html, path).not.toContain('aria-busy="true"');
      expect(html, path).not.toContain('Loading…');
    }
    // The carousel's cards are prerendered too, prices and all.
    expect(staticHtml(productPage)).toContain('Cedar serving board');
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
    // its own product (its `variantId` is a variant's, which the products list cannot answer
    // about), and every card on the page — the carousel's six — is one batched `id:in` read.
    // Nothing else: no re-run of a prerendered non-volatile read, and nothing twice.
    expect(visited.requests).toEqual([
      `/catalog/v1/products/${PRODUCT_HANDLE}`,
      '/catalog/v1/products/list?pageSize=6&filter=id:in:prod-cedar-serving-board,' +
        'prod-flax-tea-towel,prod-stoneware-bowl,prod-brass-candle-holder,prod-linen-napkin-set,' +
        'prod-walnut-spoon',
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
    expect(visited.prices).toContain('$42.00');
    expect(visited.prices).toContain('$68.00');
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
});
