import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRobots,
  buildSitemap,
  siteOrigin,
  stripStega,
  type SeoEntryValue,
  type SitemapLimits,
  type SitemapPage,
} from '@eldrajs/theme-core';
import { localePathFor, type EldraLocaleRouting } from './locales';

/** One content path the build prerenders, with what the sitemap needs to know about it. */
export interface CrawlRoute {
  /** The unprefixed path (`/about`); locale variants are derived from it. */
  path: string;
  /** The entry's or catalog record's own `updatedAt`, when the read carried one. */
  lastmod?: unknown;
  /** The entry's or route template's own `seo` field value. */
  seo?: unknown;
  /** The route template's `seo` field value, when the route renders through one (merged like `resolveSeo`). */
  templateSeo?: unknown;
  /** A native code route: served at this exact path only, never under a locale prefix. */
  codeOwned?: boolean;
}

export interface CrawlFile {
  name: string;
  content: string;
}

/**
 * Turns the build's prerendered routes into `SitemapPage`s: one variant per locale the site
 * serves (every content path exists in every locale, see `addRoute` in `../module.ts`), with the
 * page's `noindex` and its canonical for each locale taken from its own `seo` value — the same
 * field shape `useEldraSeo` reads.
 *
 * A canonical that is a `{{pattern}}` is skipped: it is resolved per render with the page's
 * variables, which the build does not have here, and a half-resolved URL must not reach the
 * sitemap. `noindex` is a plain boolean, so it needs no such care.
 */
export function toSitemapPages(
  routes: readonly CrawlRoute[],
  routing: EldraLocaleRouting
): SitemapPage[] {
  return routes.map((route) => {
    const seo = asSeo(route.seo);
    const templateSeo = asSeo(route.templateSeo);
    const locales = route.codeOwned === true ? [] : routing.supported;
    const variants =
      locales.length === 0
        ? [
            {
              locale: routing.default ?? null,
              path: route.path,
              isDefault: true,
            },
          ]
        : locales.map((locale) => ({
            locale,
            path: localePathFor(route.path, locale, routing),
            isDefault: locale === routing.default,
            canonical:
              canonicalFor(seo, locale, locales.length) ??
              canonicalFor(templateSeo, locale, locales.length),
          }));
    const lastmod = route.lastmod;
    return {
      variants,
      lastmod: typeof lastmod === 'string' || lastmod instanceof Date ? lastmod : null,
      noindex: seo?.noindex === true || templateSeo?.noindex === true,
    };
  });
}

function asSeo(value: unknown): SeoEntryValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SeoEntryValue)
    : null;
}

/**
 * A canonical counts only when it is the page's own for that exact locale: a key of the locale
 * map, or a plain string on a single-locale site. Anything else would give every locale variant
 * the same `loc` and collapse their hreflang alternates, so the path-derived URL is used instead.
 */
function canonicalFor(
  seo: SeoEntryValue | null,
  locale: string,
  localeCount: number
): string | null {
  const canonical = seo?.canonicalUrl;
  let raw: unknown = null;
  if (typeof canonical === 'string') raw = localeCount === 1 ? canonical : null;
  else if (typeof canonical === 'object' && canonical !== null && Object.hasOwn(canonical, locale))
    raw = canonical[locale];
  if (typeof raw !== 'string') return null;
  const value = stripStega(raw).trim();
  return value === '' || value.includes('{{') ? null : value;
}

export interface CrawlOutputInput {
  target: 'production' | 'preview';
  /** The site's origin: `ELDRA_SITE_URL`, else the platform's production URL. */
  siteUrl: string | null | undefined;
  /** The merchant's own `robots.txt` lines from the platform. */
  robotsExtra: string | null | undefined;
  routes: readonly CrawlRoute[];
  routing: EldraLocaleRouting;
  /** `false` turns `sitemap.xml` off. */
  sitemap: false | SitemapLimits | undefined;
  /** The theme's own `public/` directory: a file it ships there is never replaced. */
  themePublicDir: string;
  log: (message: string) => void;
}

/**
 * The `robots.txt` and `sitemap.xml` (and its children) a build writes into the static output.
 *
 *  * **Preview** (the default; anything but `ELDRA_BUILD_TARGET=production`): `robots.txt` is
 *    `Disallow: /`, and there is no sitemap — a preview host must never be indexed.
 *  * **Production** needs an absolute site URL. Without one nothing is written (a sitemap of
 *    relative URLs is invalid, and a `Sitemap:` line must be absolute) and one line says why.
 *  * A file the theme ships in its own `public/` wins: it is skipped, with one line.
 */
export function buildCrawlFiles(input: CrawlOutputInput): CrawlFile[] {
  const files: CrawlFile[] = [];
  const own = (name: string): boolean => existsSync(join(input.themePublicDir, name));
  const skipOwn = (name: string): boolean => {
    if (!own(name)) return false;
    input.log(`[eldra] ${name} generation skipped: theme ships its own`);
    return true;
  };

  if (input.target !== 'production') {
    if (!skipOwn('robots.txt')) {
      files.push({
        name: 'robots.txt',
        content: buildRobots({ target: 'preview' }),
      });
    }
    return files;
  }

  const origin = siteOrigin(input.siteUrl);
  if (origin === null) {
    input.log(
      '[eldra] robots.txt and sitemap.xml generation skipped: no absolute site URL (set ELDRA_SITE_URL or the production URL in Studio)'
    );
    return files;
  }

  let sitemapListed = false;
  if (input.sitemap !== false && skipOwn('sitemap.xml')) {
    // The theme's own file is what answers `/sitemap.xml`; robots.txt may still point at it.
    sitemapListed = true;
  } else if (input.sitemap !== false) {
    const built = buildSitemap({
      pages: toSitemapPages(input.routes, input.routing),
      siteUrl: origin,
      limits: input.sitemap,
    });
    for (const file of built) files.push({ name: file.name, content: file.xml });
    sitemapListed = built.length > 0;
  }
  if (!skipOwn('robots.txt')) {
    files.push({
      name: 'robots.txt',
      content: buildRobots({
        target: 'production',
        siteUrl: origin,
        extra: input.robotsExtra,
        sitemap: sitemapListed,
      }),
    });
  }
  return files;
}
