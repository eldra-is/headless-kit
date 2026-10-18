/**
 * The page-title and SEO-metadata resolver. Framework-free: the theme's `useEldraSeo`
 * (`@eldrajs/theme-nuxt`) feeds it, and Studio's search-result and share-card previews run the
 * very same function, so what the merchant sees is what the build writes.
 *
 * The rules are the platform's contract (`__tests__/fixtures/seo-vectors.json` is shared with
 * Core and Studio):
 *
 * - Precedence, per field: the entry's own `seo` value, then the route template's pattern for this
 *   context, then the site's pattern, then the page's own title.
 * - A pattern is `{{dot.path}}` over scalars (`"syntax": 1`). Substitution is **one pass** over the
 *   pattern: a substituted value is never scanned again, so a product called `{{site.name}}` shows
 *   those characters. An unknown or empty variable becomes `''`, never literal braces (unlike the
 *   email renderer, which keeps unknown paths and swallows nearby whitespace and punctuation).
 * - Titles are tidied afterwards: whitespace collapsed, and a separator (`· | – — -`, standing
 *   alone between spaces) left leading, trailing or doubled by an empty variable is dropped.
 */

/** The contexts a pattern can be written for; they decide which variables exist. */
export type SeoContext =
  | 'page'
  | 'home'
  | 'catalog:product'
  | 'catalog:collection'
  | 'catalog:category';

/** The only pattern syntax version this resolver understands. */
export const SEO_SYNTAX = 1;

/** A string per locale, keyed by the site's locale tags. */
export type SeoLocaleMap = Record<string, string>;

/** `GET /site/v1/seo` exactly as the platform answers it. */
export interface SeoSetting {
  revision: number;
  syntax: number;
  site: {
    /** `null`: use the site's own name (the theme's). */
    name: string | null;
    titlePattern: SeoLocaleMap;
    description: SeoLocaleMap;
    imageAssetId: string | null;
    /** The media worker's 1200x630 rendering, absolute, or `null`. */
    imageUrl: string | null;
    twitterHandle: string | null;
  };
  /** Per-context patterns (`catalog:product`, ...). A context with none inherits the site's. */
  templates: Record<string, { titlePattern?: SeoLocaleMap; descriptionPattern?: SeoLocaleMap }>;
}

/** A page's or template's own `seo` field value. Each string may also be a per-locale map. */
export interface SeoEntryValue {
  title?: string | SeoLocaleMap | null;
  description?: string | SeoLocaleMap | null;
  canonicalUrl?: string | SeoLocaleMap | null;
  /**
   * The share image's media URL. Core stores `imageAssetId` and serves the resolved rendering
   * beside it (as it does for the site's own image); the resolver reads only the URL.
   */
  imageUrl?: string | null;
  noindex?: boolean | null;
}

/** Variables by path: nested (`{ page: { title } }`) or flat (`{ 'page.title': ... }`). */
export type SeoData = Record<string, unknown>;

export interface ResolveSeoInput {
  /** The locale being rendered (`en-US`). */
  locale: string | null;
  /** The locale served at `/`; the last fallback when a map has no entry for `locale`. */
  defaultLocale?: string | null;
  context: SeoContext;
  /** The platform's setting, or `null` (unset, or the read failed). */
  site: SeoSetting | null;
  /** The site's own name, used when the setting names none. */
  siteName?: string | null;
  /** The site's origin (`https://shop.example`); without it no canonical or absolute image exists. */
  siteUrl?: string | null;
  /** The route's path, with its locale prefix, as it is served. */
  path?: string | null;
  /** The page's or template's own `seo` field value. */
  entry?: SeoEntryValue | null;
  /** The route template's `seo` field value, when the route renders through one. */
  template?: SeoEntryValue | null;
  /**
   * The context's variables (`page.title`, `product.name`, ...). `site.*` is filled in here and
   * wins over anything supplied under that name.
   */
  data?: SeoData;
  /** The image the content itself offers (a product's first image); used after the entry's own. */
  contentImage?: string | null;
  /** A preview build: robots is `noindex` whatever the content says. */
  isPreview?: boolean;
}

export interface ResolvedSeo {
  title: string;
  description: string;
  /** Absolute image URL, or `null`. */
  image: string | null;
  /** Absolute canonical URL, or `null` when no site origin is known. */
  canonical: string | null;
  noindex: boolean;
  ogType: 'website' | 'product';
  /** `@handle` form, or `null`. */
  twitterSite: string | null;
}

const PLACEHOLDER = /\{\{([^{}]+)\}\}/g;
const SEPARATORS = new Set(['·', '|', '–', '—', '-']);

/** The title pattern used when neither the context nor the site sets one. */
export const DEFAULT_TITLE_PATTERN = '{{page.title}} · {{site.name}}';
/** The home page's default: the site's name alone. */
export const DEFAULT_HOME_TITLE_PATTERN = '{{site.name}}';

/** Looks `path` up in `data`: first as a flat key, then walking nested objects. */
function lookup(data: SeoData, path: string): string {
  let value: unknown = Object.prototype.hasOwnProperty.call(data, path) ? data[path] : undefined;
  if (value === undefined) {
    value = data;
    for (const part of path.split('.')) {
      if (typeof value !== 'object' || value === null || !Object.hasOwn(value, part)) {
        return '';
      }
      value = (value as Record<string, unknown>)[part];
    }
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** One pass of `{{path}}` substitution; unknown and empty values become `''`. No tidying. */
export function substituteSeoPattern(pattern: string, data: SeoData): string {
  return pattern.replace(PLACEHOLDER, (_match, path: string) => lookup(data, path.trim()));
}

/** Collapses whitespace and drops leading, trailing and doubled separators. */
export function tidySeoTitle(value: string): string {
  const tokens = value.split(/\s+/).filter((token) => token !== '');
  const kept: string[] = [];
  for (const token of tokens) {
    const separator = SEPARATORS.has(token);
    if (separator && (kept.length === 0 || SEPARATORS.has(kept[kept.length - 1]!))) continue;
    kept.push(token);
  }
  while (kept.length > 0 && SEPARATORS.has(kept[kept.length - 1]!)) kept.pop();
  return kept.join(' ');
}

/** Substitutes, then tidies: the title rule the shared vectors pin down. */
export function renderSeoTitle(pattern: string, data: SeoData): string {
  return tidySeoTitle(substituteSeoPattern(pattern, data));
}

function renderSeoText(pattern: string, data: SeoData): string {
  return substituteSeoPattern(pattern, data).replace(/\s+/g, ' ').trim();
}

/**
 * One locale's string out of a string or a locale map: the exact tag, the same language, the
 * default locale, then `''`.
 */
export function pickSeoLocale(
  value: string | SeoLocaleMap | null | undefined,
  locale: string | null,
  defaultLocale?: string | null
): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return '';
  const own = (key: string | null | undefined): string => {
    if (key === null || key === undefined || !Object.hasOwn(value, key)) return '';
    const text = value[key];
    return typeof text === 'string' ? text : '';
  };
  const language = locale?.split('-')[0]?.toLowerCase();
  const sameLanguage =
    language === undefined
      ? ''
      : own(Object.keys(value).find((key) => key.split('-')[0]?.toLowerCase() === language));
  return [own(locale), sameLanguage, own(defaultLocale)].find((text) => text.trim() !== '') ?? '';
}

function absolute(url: string | null | undefined, siteUrl: string | null): string | null {
  const value = url?.trim();
  if (value === undefined || value === '') return null;
  try {
    const resolved = siteUrl === null ? new URL(value) : new URL(value, siteUrl);
    return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : null;
  } catch {
    return null;
  }
}

function originOf(siteUrl: string | null | undefined): string | null {
  const value = siteUrl?.trim();
  if (value === undefined || value === '') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Resolves every SEO value one route needs. Pure; never throws on malformed content. */
export function resolveSeo(input: ResolveSeoInput): ResolvedSeo {
  const { locale, context, site } = input;
  const pick = (value: string | SeoLocaleMap | null | undefined): string =>
    pickSeoLocale(value, locale, input.defaultLocale);
  const origin = originOf(input.siteUrl);
  const siteName = site?.site.name?.trim() || input.siteName?.trim() || '';
  const data: SeoData = {
    ...input.data,
    'site.name': siteName,
    'site.url': origin ?? '',
    'site.locale': locale ?? '',
  };
  const entry = input.entry ?? null;
  const template = input.template ?? null;
  const patterns = site?.templates[context];

  const titleOverride = pick(entry?.title) || pick(template?.title);
  let title = '';
  if (titleOverride.trim() !== '') {
    // A full override: variables work, the site's pattern does not wrap it.
    title = renderSeoTitle(titleOverride, data);
  }
  if (title === '') {
    const pattern =
      pick(patterns?.titlePattern) ||
      pick(site?.site.titlePattern) ||
      (context === 'home' ? DEFAULT_HOME_TITLE_PATTERN : DEFAULT_TITLE_PATTERN);
    title = renderSeoTitle(pattern, data);
  }
  if (title === '') title = renderSeoTitle('{{page.title}}', data) || siteName;

  const description = renderSeoText(
    pick(entry?.description) ||
      pick(template?.description) ||
      pick(patterns?.descriptionPattern) ||
      pick(site?.site.description),
    data
  );

  const image =
    absolute(entry?.imageUrl, origin) ??
    absolute(template?.imageUrl, origin) ??
    absolute(input.contentImage, origin) ??
    absolute(site?.site.imageUrl, origin);

  let canonical: string | null = null;
  const canonicalPattern = pick(entry?.canonicalUrl) || pick(template?.canonicalUrl);
  if (canonicalPattern.trim() !== '') {
    canonical = absolute(renderSeoText(canonicalPattern, data), origin);
  } else if (origin !== null && input.path !== undefined && input.path !== null) {
    try {
      const url = new URL(input.path, origin);
      canonical = `${url.origin}${url.pathname}`;
    } catch {
      canonical = null;
    }
  }

  const handle = site?.site.twitterHandle?.trim().replace(/^@+/, '') ?? '';
  return {
    title,
    description,
    image,
    canonical,
    noindex: input.isPreview === true || entry?.noindex === true || template?.noindex === true,
    ogType: context === 'catalog:product' ? 'product' : 'website',
    twitterSite: handle === '' ? null : `@${handle}`,
  };
}
