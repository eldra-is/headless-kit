import { execa } from 'execa';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatMoney } from '../app/storefront/money';
import {
  COLLECTION_HANDLE,
  ORG_ID,
  PRODUCT_HANDLE,
  startMockGateway,
  type MockGateway,
} from './support/mockGateway';

/**
 * **A generated page carries its schema.org JSON-LD**, and it is the page's own data.
 *
 * A real `nuxi generate` of the starter, against the mock gateway, as a production build with a
 * known origin (a preview build is `noindex` and writes none): the HTML on disk is what a crawler
 * reads, so this is the only place the tags can be asserted — a unit test of the builders proves
 * the shape, not that the page wired them into the head before the file was written.
 *
 * What is pinned: one `ld+json` script per page; `Organization` and `WebSite` on the home page;
 * `BreadcrumbList` + `Product` on a product page whose price, currency and availability are the
 * ones the page renders; `BreadcrumbList` + `ItemList` on a collection and a category page; and
 * no markup on the not-found shell.
 */

const templateDir = fileURLToPath(new URL('..', import.meta.url));
const nuxi = join(templateDir, 'node_modules', '.bin', 'nuxi');
const SKIPPED_FROM_COPY = new Set(['node_modules', '.nuxt', '.output', '.git']);
const ORIGIN = 'https://shop.example.test';

let gateway: MockGateway;
let scratch: string;
let root: string;

const output = (path: string): string => join(root, '.output', 'public', path);

type Node = Record<string, any>;
const SCRIPT = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;

function nodesOf(path: string): { html: string; nodes: Node[] } {
  const html = readFileSync(output(path), 'utf8');
  const scripts = [...html.matchAll(SCRIPT)];
  expect(scripts.length, `${path}: ld+json scripts`).toBeLessThanOrEqual(1);
  const nodes = scripts.flatMap(([, json]) => {
    const parsed = JSON.parse(json!) as Node | Node[];
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  return { html, nodes };
}

describe('generated pages carry schema.org JSON-LD', () => {
  beforeAll(async () => {
    gateway = await startMockGateway();
    scratch = mkdtempSync(join(tmpdir(), 'eldra-structured-data-'));
    root = join(scratch, 'site');
    cpSync(templateDir, root, {
      recursive: true,
      filter: (source) => {
        const [first] = relative(templateDir, source).split(sep);
        return first === undefined || !SKIPPED_FROM_COPY.has(first);
      },
    });
    symlinkSync(join(templateDir, 'node_modules'), join(root, 'node_modules'), 'dir');
    await execa(nuxi, ['generate'], {
      cwd: root,
      env: {
        ELDRA_GATEWAY_URL: gateway.url,
        ELDRA_ORG_ID: ORG_ID,
        ELDRA_BUILD_TARGET: 'production',
        ELDRA_SITE_URL: ORIGIN,
      },
      timeout: 600_000,
    });
  }, 900_000);

  afterAll(async () => {
    await gateway?.close();
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
  });

  it('writes Organization and WebSite on the home page', () => {
    const { nodes } = nodesOf('index.html');
    expect(nodes.map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
    expect(nodes[0]).toMatchObject({
      name: 'Northwind Goods',
      url: `${ORIGIN}/`,
      sameAs: ['https://social.example.test/northwind'],
      contactPoint: { email: 'hello@northwind.example.test' },
    });
    expect(nodes[1].potentialAction.target.urlTemplate).toBe(
      `${ORIGIN}/search?q={search_term_string}`
    );
  });

  it('writes BreadcrumbList and a Product the page renders on a product page', () => {
    const { html, nodes } = nodesOf(join('products', PRODUCT_HANDLE, 'index.html'));
    expect(nodes.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'Product']);

    expect(nodes[0].itemListElement.map((item: Node) => item.name)).toEqual([
      'Home',
      'Tableware',
      'Cups',
      'Ash glaze mug',
    ]);
    expect(nodes[0].itemListElement.at(-1).item).toBe(`${ORIGIN}/products/${PRODUCT_HANDLE}`);

    const product = nodes[1];
    expect(product).toMatchObject({
      name: 'Ash glaze mug',
      url: `${ORIGIN}/products/${PRODUCT_HANDLE}`,
      brand: { name: 'Northwind Ceramics' },
      sku: PRODUCT_HANDLE.toUpperCase(),
      gtin: '4006381333931',
      offers: {
        '@type': 'Offer',
        // The store's currency, and the amount the visible price is made from.
        price: 42,
        priceCurrency: 'ISK',
        availability: 'https://schema.org/InStock',
      },
    });
    // The visible price is `formatMoney(42, 'ISK')`: same amount, same currency.
    expect(html).toContain(
      formatMoney(product.offers.price, product.offers.priceCurrency, 'en-US')
    );
  });

  it('writes BreadcrumbList and an ItemList of the products shown on a collection page', () => {
    const { nodes } = nodesOf(join('collections', COLLECTION_HANDLE, 'index.html'));
    expect(nodes.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'ItemList']);
    const items = nodes[1].itemListElement as Node[];
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({
      position: 1,
      name: 'Ash glaze mug',
      url: `${ORIGIN}/products/${PRODUCT_HANDLE}`,
    });
  });

  it('writes BreadcrumbList and an ItemList on a category page', () => {
    const path = join('categories', 'tableware', 'cups', 'index.html');
    expect(existsSync(output(path)), 'category page generated').toBe(true);
    const { nodes } = nodesOf(path);
    expect(nodes.map((node) => node['@type'])).toEqual(['BreadcrumbList', 'ItemList']);
    expect(nodes[0].itemListElement.map((item: Node) => item.name)).toEqual([
      'Home',
      'Tableware',
      'Cups',
    ]);
  });

  it('writes none on the not-found shell, which is noindex', () => {
    expect(nodesOf(join('404', 'index.html')).nodes).toEqual([]);
  });
});
