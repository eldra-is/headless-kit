import { describe, expect, it } from 'vitest';
import {
  buildAlternates,
  buildRobots,
  buildSitemap,
  escapeXml,
  sitemapLastmod,
  type SitemapPage,
} from '../sitemap';

const SITE = 'https://shop.example';

const page = (path: string, extra: Partial<SitemapPage> = {}): SitemapPage => ({
  variants: [
    { locale: 'is', path, isDefault: true },
    { locale: 'en-US', path: path === '/' ? '/en-US' : `/en-US${path}` },
  ],
  ...extra,
});

describe('buildSitemap', () => {
  it('writes one url per locale with hreflang alternates and x-default', () => {
    const [file, ...rest] = buildSitemap({
      pages: [page('/about')],
      siteUrl: SITE,
    });
    expect(rest).toEqual([]);
    expect(file!.name).toBe('sitemap.xml');
    expect(file!.xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(file!.xml).toContain('<loc>https://shop.example/about</loc>');
    expect(file!.xml).toContain('<loc>https://shop.example/en-US/about</loc>');
    // The whole set sits under both urls.
    expect(file!.xml.match(/hreflang="is" href="https:\/\/shop\.example\/about"/g)).toHaveLength(2);
    expect(
      file!.xml.match(/hreflang="en-US" href="https:\/\/shop\.example\/en-US\/about"/g)
    ).toHaveLength(2);
    expect(
      file!.xml.match(/hreflang="x-default" href="https:\/\/shop\.example\/about"/g)
    ).toHaveLength(2);
  });

  it('writes no alternates for a single-locale site', () => {
    const [file] = buildSitemap({
      pages: [{ variants: [{ locale: null, path: '/' }] }],
      siteUrl: `${SITE}/ignored/path`,
    });
    expect(file!.xml).toContain('<loc>https://shop.example/</loc>');
    expect(file!.xml).not.toContain('xhtml:link');
  });

  it('leaves out noindex pages and writes lastmod as a W3C datetime', () => {
    const [file] = buildSitemap({
      pages: [
        page('/secret', { noindex: true }),
        page('/open', { lastmod: '2026-03-04T05:06:07+02:00' }),
        page('/nodate', { lastmod: 'not a date' }),
      ],
      siteUrl: SITE,
    });
    expect(file!.xml).not.toContain('/secret');
    expect(file!.xml).toContain('<lastmod>2026-03-04T03:06:07.000Z</lastmod>');
    expect(file!.xml.match(/<lastmod>/g)).toHaveLength(2);
  });

  it('escapes the characters XML reserves', () => {
    const [file] = buildSitemap({
      pages: [{ variants: [{ locale: null, path: '/a?x=1&y=<2>' }] }],
      siteUrl: SITE,
    });
    expect(file!.xml).toContain('<loc>https://shop.example/a?x=1&amp;y=%3C2%3E</loc>');
    expect(escapeXml(`<a href="b">&'`)).toBe('&lt;a href=&quot;b&quot;&gt;&amp;&apos;');
  });

  it('uses a same-origin canonical as loc and ignores a foreign one', () => {
    const [file] = buildSitemap({
      pages: [
        {
          variants: [
            {
              locale: null,
              path: '/a',
              canonical: 'https://shop.example/canonical-a',
            },
          ],
        },
        {
          variants: [{ locale: null, path: '/b', canonical: 'https://other.example/b' }],
        },
        { variants: [{ locale: null, path: '/c', canonical: '/relative-c' }] },
      ],
      siteUrl: SITE,
    });
    expect(file!.xml).toContain('<loc>https://shop.example/canonical-a</loc>');
    expect(file!.xml).not.toContain('<loc>https://shop.example/a</loc>');
    expect(file!.xml).toContain('<loc>https://shop.example/b</loc>');
    expect(file!.xml).not.toContain('other.example');
    expect(file!.xml).toContain('<loc>https://shop.example/relative-c</loc>');
  });

  it('lists a url once when two pages share a canonical', () => {
    const [file] = buildSitemap({
      pages: [
        { variants: [{ locale: null, path: '/a', canonical: `${SITE}/one` }] },
        { variants: [{ locale: null, path: '/b', canonical: `${SITE}/one` }] },
      ],
      siteUrl: SITE,
    });
    expect(file!.xml.match(/<url>/g)).toHaveLength(1);
  });

  it('writes nothing without an absolute site url or without indexable pages', () => {
    expect(buildSitemap({ pages: [page('/a')], siteUrl: null })).toEqual([]);
    expect(buildSitemap({ pages: [page('/a')], siteUrl: '/relative' })).toEqual([]);
    expect(buildSitemap({ pages: [page('/a')], siteUrl: 'ftp://shop.example' })).toEqual([]);
    expect(buildSitemap({ pages: [page('/a', { noindex: true })], siteUrl: SITE })).toEqual([]);
  });

  it('splits into an index and children past the url limit', () => {
    const pages = ['/a', '/b', '/c', '/d', '/e'].map((path) => ({
      variants: [{ locale: null, path }],
    }));
    const files = buildSitemap({
      pages,
      siteUrl: SITE,
      limits: { maxUrls: 2 },
    });
    expect(files.map((file) => file.name)).toEqual([
      'sitemap.xml',
      'sitemap-1.xml',
      'sitemap-2.xml',
      'sitemap-3.xml',
    ]);
    expect(files[0]!.xml).toContain('<sitemapindex');
    expect(files[0]!.xml).toContain('<loc>https://shop.example/sitemap-3.xml</loc>');
    expect(files[3]!.xml.match(/<url>/g)).toHaveLength(1);
  });

  it('splits on the byte limit too, and never exceeds it', () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({
      variants: [{ locale: null, path: `/page-${i}` }],
    }));
    const maxBytes = 900;
    const files = buildSitemap({ pages, siteUrl: SITE, limits: { maxBytes } });
    expect(files.length).toBeGreaterThan(2);
    for (const file of files.slice(1)) {
      expect(new TextEncoder().encode(file.xml).length).toBeLessThanOrEqual(maxBytes);
    }
  });
});

describe('sitemapLastmod', () => {
  it('accepts dates and strings, refuses the rest', () => {
    expect(sitemapLastmod(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02T00:00:00.000Z');
    expect(sitemapLastmod(null)).toBeNull();
    expect(sitemapLastmod('')).toBeNull();
    expect(sitemapLastmod('garbage')).toBeNull();
  });
});

describe('buildRobots', () => {
  it('disallows everything on a preview build and names no sitemap', () => {
    expect(
      buildRobots({
        target: 'preview',
        siteUrl: SITE,
        extra: 'Disallow: /x',
        sitemap: true,
      })
    ).toBe('User-agent: *\nDisallow: /\n');
  });

  it('allows everything on production, adds the merchant lines and the sitemap', () => {
    expect(
      buildRobots({
        target: 'production',
        siteUrl: `${SITE}/`,
        extra: '  Disallow: /cart \r\n\n\u0000Disallow: /search\u0007',
        sitemap: true,
      })
    ).toBe(
      'User-agent: *\nAllow: /\nDisallow: /cart\nDisallow: /search\n\nSitemap: https://shop.example/sitemap.xml\n'
    );
  });

  it('omits the sitemap line when there is no sitemap', () => {
    expect(buildRobots({ target: 'production', siteUrl: SITE })).toBe('User-agent: *\nAllow: /\n');
  });
});

describe('buildAlternates', () => {
  const pathFor = (locale: string | undefined) => (locale === 'en-US' ? '/en-US/a' : '/a');

  it('is empty for fewer than two locales', () => {
    expect(buildAlternates({ locales: ['is'], pathFor })).toEqual([]);
  });

  it('is relative without a site url and absolute with one', () => {
    expect(buildAlternates({ locales: ['is', 'en-US'], pathFor })).toEqual([
      { rel: 'alternate', hreflang: 'is', href: '/a' },
      { rel: 'alternate', hreflang: 'en-US', href: '/en-US/a' },
      { rel: 'alternate', hreflang: 'x-default', href: '/a' },
    ]);
    expect(buildAlternates({ locales: ['is', 'en-US'], pathFor, siteUrl: SITE })[1]).toEqual({
      rel: 'alternate',
      hreflang: 'en-US',
      href: 'https://shop.example/en-US/a',
    });
  });
});
