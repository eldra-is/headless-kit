/**
 * `sitemap.xml` and `robots.txt` for a static build. Framework-free and pure: the theme-nuxt
 * module feeds it the prerendered route list, a test reads every byte without a Nuxt app.
 *
 * Why the input is already fanned out per locale: which paths exist under which locale prefix is
 * the module's routing (`localePathFor`), not this file's. A page is one entry holding one
 * `variant` per locale it is served in, and every variant lists its siblings as
 * `xhtml:link rel="alternate" hreflang` (plus `x-default`), which is what tells a search engine
 * the URLs are one page in several languages.
 */

/** One URL of a page: the page as it is spelled under one locale. */
export interface SitemapVariant {
  /** The locale tag written as `hreflang`; `null` on a site with no locales. */
  locale: string | null;
  /** The served path, with its locale prefix (`/en-US/about`). */
  path: string;
  /** The page's own canonical URL for this variant, when it has one. */
  canonical?: string | null;
  /** The variant served at `/`: what `x-default` points at. */
  isDefault?: boolean;
}

export interface SitemapPage {
  variants: readonly SitemapVariant[];
  /** When the content last changed: an ISO string or a `Date`. Anything unparsable is omitted. */
  lastmod?: string | Date | null;
  /** A `noindex` page is left out of the sitemap altogether. */
  noindex?: boolean;
}

export interface SitemapLimits {
  /** sitemaps.org: 50,000 URLs per file. */
  maxUrls?: number;
  /** sitemaps.org: 50 MiB uncompressed per file. */
  maxBytes?: number;
}

export interface SitemapFile {
  /** The file name inside the site root: `sitemap.xml`, `sitemap-1.xml`, ... */
  name: string;
  xml: string;
}

export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 52_428_800;

const URLSET_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
const URLSET_CLOSE = '</urlset>\n';

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

/** The absolute origin of `siteUrl` (`https://shop.example`, no trailing slash), or `null`. */
export function siteOrigin(siteUrl: string | null | undefined): string | null {
  const value = siteUrl?.trim();
  if (value === undefined || value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A W3C datetime (`2026-01-02T03:04:05.000Z`), or `null` for anything that is not a date. */
export function sitemapLastmod(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The URL a variant is listed under: its own canonical when that is on this site's origin, else
 * the path-derived URL. A canonical on another host is not a page of this site and must not put
 * a foreign URL in this site's sitemap.
 */
function locOf(variant: SitemapVariant, origin: string): string | null {
  const canonical = variant.canonical?.trim();
  if (canonical !== undefined && canonical !== '') {
    try {
      const url = new URL(canonical, origin);
      if (url.origin === origin) return `${url.origin}${url.pathname}${url.search}`;
    } catch {
      // Falls through to the path.
    }
  }
  try {
    const url = new URL(variant.path, origin);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** The `<url>` blocks of every indexable page, one per variant, in input order, deduplicated by `loc`. */
function urlBlocks(pages: readonly SitemapPage[], origin: string): string[] {
  const seen = new Set<string>();
  const blocks: string[] = [];
  for (const page of pages) {
    if (page.noindex === true) continue;
    const located = page.variants
      .map((variant) => ({ variant, loc: locOf(variant, origin) }))
      .filter((entry): entry is { variant: SitemapVariant; loc: string } => entry.loc !== null);
    const lastmod = sitemapLastmod(page.lastmod);
    const alternates: string[] = [];
    if (located.length > 1) {
      for (const { variant, loc } of located) {
        if (variant.locale === null) continue;
        alternates.push(linkTag(variant.locale, loc));
      }
      const fallback = located.find((entry) => entry.variant.isDefault === true);
      if (fallback !== undefined) alternates.push(linkTag('x-default', fallback.loc));
    }
    for (const { loc } of located) {
      if (seen.has(loc)) continue;
      seen.add(loc);
      blocks.push(
        `  <url>\n    <loc>${escapeXml(loc)}</loc>\n` +
          (lastmod === null ? '' : `    <lastmod>${lastmod}</lastmod>\n`) +
          alternates.map((tag) => `    ${tag}\n`).join('') +
          '  </url>\n'
      );
    }
  }
  return blocks;
}

function linkTag(hreflang: string, href: string): string {
  return `<xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`;
}

/**
 * The sitemap files for `pages`: one `sitemap.xml` (a `urlset`), or, when the URLs do not fit the
 * limits, a `sitemap.xml` that is a `sitemapindex` over `sitemap-1.xml`, `sitemap-2.xml`, ...
 *
 * Empty when `siteUrl` is not an absolute http(s) URL (a sitemap of relative URLs is invalid) and
 * when no page is indexable.
 */
export function buildSitemap(input: {
  pages: readonly SitemapPage[];
  siteUrl: string | null | undefined;
  limits?: SitemapLimits;
}): SitemapFile[] {
  const origin = siteOrigin(input.siteUrl);
  if (origin === null) return [];
  const blocks = urlBlocks(input.pages, origin);
  if (blocks.length === 0) return [];
  const maxUrls = Math.max(1, input.limits?.maxUrls ?? SITEMAP_MAX_URLS);
  const maxBytes = input.limits?.maxBytes ?? SITEMAP_MAX_BYTES;
  const envelope = byteLength(URLSET_OPEN) + byteLength(URLSET_CLOSE);

  const chunks: string[][] = [];
  let current: string[] = [];
  let size = envelope;
  for (const block of blocks) {
    const blockSize = byteLength(block);
    if (current.length > 0 && (current.length >= maxUrls || size + blockSize > maxBytes)) {
      chunks.push(current);
      current = [];
      size = envelope;
    }
    current.push(block);
    size += blockSize;
  }
  chunks.push(current);

  const urlset = (chunk: readonly string[]): string =>
    `${URLSET_OPEN}${chunk.join('')}${URLSET_CLOSE}`;
  if (chunks.length === 1) return [{ name: 'sitemap.xml', xml: urlset(chunks[0]!) }];

  const files = chunks.map((chunk, index) => ({
    name: `sitemap-${index + 1}.xml`,
    xml: urlset(chunk),
  }));
  const index =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    files
      .map(
        (file) =>
          `  <sitemap>\n    <loc>${escapeXml(`${origin}/${file.name}`)}</loc>\n  </sitemap>\n`
      )
      .join('') +
    '</sitemapindex>\n';
  return [{ name: 'sitemap.xml', xml: index }, ...files];
}

/**
 * The `robots.txt` body.
 *
 * A **preview** build disallows everything and names no sitemap. A production build allows
 * everything, adds the merchant's own lines (`extra`), and names the sitemap when there is one.
 * `extra` is untrusted text: control characters are dropped, every line is trimmed, and a line
 * that opens a second `User-agent` group is kept as the merchant wrote it (that is the point of
 * the field), after the platform's group.
 */
export function buildRobots(input: {
  target: 'production' | 'preview';
  siteUrl?: string | null;
  extra?: string | null;
  /** Name `<origin>/sitemap.xml`; only honoured in production with an absolute `siteUrl`. */
  sitemap?: boolean;
}): string {
  if (input.target !== 'production') return 'User-agent: *\nDisallow: /\n';
  const lines = ['User-agent: *', 'Allow: /'];
  const extra = (input.extra ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  lines.push(...extra);
  const origin = siteOrigin(input.siteUrl);
  if (input.sitemap === true && origin !== null) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

/**
 * The `<link rel="alternate" hreflang>` set for one page, for the head: one per locale plus
 * `x-default`. `pathFor(locale)` spells the page under that locale (`undefined`: the one
 * served at `/`, for `x-default`). Absolute when `siteUrl` is known, otherwise the paths as given. Empty for fewer
 * than two locales: a single-locale site has no alternates.
 */
export function buildAlternates(input: {
  locales: readonly string[];
  pathFor: (locale: string | undefined) => string;
  siteUrl?: string | null;
}): Array<{ rel: 'alternate'; hreflang: string; href: string }> {
  if (input.locales.length < 2) return [];
  const origin = siteOrigin(input.siteUrl);
  const href = (path: string): string => (origin === null ? path : `${origin}${path}`);
  return [
    ...input.locales.map((locale) => ({
      rel: 'alternate' as const,
      hreflang: locale,
      href: href(input.pathFor(locale)),
    })),
    {
      rel: 'alternate' as const,
      hreflang: 'x-default',
      href: href(input.pathFor(undefined)),
    },
  ];
}
