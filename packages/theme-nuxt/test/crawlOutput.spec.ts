import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCrawlFiles, toSitemapPages, type CrawlOutputInput } from '../src/runtime/crawlOutput';
import { resolveLocaleRouting } from '../src/runtime/locales';

const routing = resolveLocaleRouting({ default: 'is', supported: ['is', 'en-US'] });
let publicDir: string;

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), 'eldra-crawl-'));
});
afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true });
});

const input = (extra: Partial<CrawlOutputInput> = {}): CrawlOutputInput => ({
  target: 'production',
  siteUrl: 'https://shop.example',
  robotsExtra: '',
  routes: [{ path: '/' }, { path: '/about', lastmod: '2026-02-03T04:05:06Z' }],
  routing,
  sitemap: undefined,
  themePublicDir: publicDir,
  log: vi.fn(),
  ...extra,
});

const names = (files: { name: string }[]) => files.map((file) => file.name).sort();

describe('toSitemapPages', () => {
  it('fans every path out to every locale and marks the default', () => {
    const [home, about] = toSitemapPages([{ path: '/' }, { path: '/about' }], routing);
    expect(home!.variants.map((v) => [v.locale, v.path, v.isDefault])).toEqual([
      ['is', '/', true],
      ['en-US', '/en-US', false],
    ]);
    expect(about!.variants.map((v) => v.path)).toEqual(['/about', '/en-US/about']);
  });

  it('keeps a code-owned route to its own path', () => {
    const [page] = toSitemapPages([{ path: '/custom', codeOwned: true }], routing);
    expect(page!.variants).toHaveLength(1);
    expect(page!.variants[0]!.path).toBe('/custom');
  });

  it('reads noindex and a per-locale canonical off the seo value', () => {
    const [page] = toSitemapPages(
      [
        {
          path: '/a',
          seo: {
            noindex: true,
            canonicalUrl: { is: 'https://shop.example/canon', 'en-US': '{{page.slug}}' },
          },
        },
      ],
      routing
    );
    expect(page!.noindex).toBe(true);
    expect(page!.variants[0]!.canonical).toBe('https://shop.example/canon');
    // A pattern is resolved per render, not here.
    expect(page!.variants[1]!.canonical).toBeNull();
  });

  it('tolerates a missing or malformed seo value and lastmod', () => {
    const [page] = toSitemapPages([{ path: '/a', seo: 'x', lastmod: 7 }], routing);
    expect(page!.noindex).toBe(false);
    expect(page!.lastmod).toBeNull();
  });
});

describe('buildCrawlFiles', () => {
  it('writes a Disallow-all robots.txt and no sitemap for a preview build', () => {
    const files = buildCrawlFiles(input({ target: 'preview' }));
    expect(names(files)).toEqual(['robots.txt']);
    expect(files[0]!.content).toBe('User-agent: *\nDisallow: /\n');
  });

  it('writes both files for a production build, naming the sitemap in robots.txt', () => {
    const files = buildCrawlFiles(input({ robotsExtra: 'Disallow: /cart' }));
    expect(names(files)).toEqual(['robots.txt', 'sitemap.xml']);
    expect(files.find((f) => f.name === 'robots.txt')!.content).toBe(
      'User-agent: *\nAllow: /\nDisallow: /cart\n\nSitemap: https://shop.example/sitemap.xml\n'
    );
  });

  it('writes nothing and says why once when production has no absolute url', () => {
    const log = vi.fn();
    expect(buildCrawlFiles(input({ siteUrl: '', log }))).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('no absolute site URL');
  });

  it('skips the sitemap with one line when the theme ships its own, and still names it', () => {
    writeFileSync(join(publicDir, 'sitemap.xml'), 'own');
    const log = vi.fn();
    const files = buildCrawlFiles(input({ log }));
    expect(names(files)).toEqual(['robots.txt']);
    expect(files[0]!.content).toContain('Sitemap: https://shop.example/sitemap.xml');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[eldra] sitemap.xml generation skipped: theme ships its own');
  });

  it('skips robots.txt with one line when the theme ships its own', () => {
    writeFileSync(join(publicDir, 'robots.txt'), 'own');
    const log = vi.fn();
    expect(names(buildCrawlFiles(input({ log })))).toEqual(['sitemap.xml']);
    expect(log).toHaveBeenCalledWith('[eldra] robots.txt generation skipped: theme ships its own');
    expect(names(buildCrawlFiles(input({ log, target: 'preview' })))).toEqual([]);
  });

  it('writes no sitemap when it is turned off, and leaves it out of robots.txt', () => {
    const files = buildCrawlFiles(input({ sitemap: false }));
    expect(names(files)).toEqual(['robots.txt']);
    expect(files[0]!.content).not.toContain('Sitemap:');
  });

  it('leaves noindex pages out and writes no sitemap when nothing is indexable', () => {
    const files = buildCrawlFiles(input({ routes: [{ path: '/hidden', seo: { noindex: true } }] }));
    expect(names(files)).toEqual(['robots.txt']);
    expect(files[0]!.content).not.toContain('Sitemap:');
  });

  it('applies the sitemap limits', () => {
    const files = buildCrawlFiles(input({ sitemap: { maxUrls: 2 } }));
    expect(names(files)).toEqual(['robots.txt', 'sitemap-1.xml', 'sitemap-2.xml', 'sitemap.xml']);
  });
});
