import { imageUrl } from '@eldrajs/sdk';
import type { SeoContext, SeoData, SeoEntryValue } from '@eldrajs/theme-core';

/** The shapes this reads are CMS data and catalog projections, so every access is guarded. */
type Doc = { data?: Record<string, unknown> } | null | undefined;

export interface SeoInputParts {
  /** The route is showing the not-found shell. */
  isNotFound: boolean;
  /** The translated not-found title. */
  notFoundTitle: string;
  /** Which catalog object the route shows, or `null` for an ordinary page. */
  catalog: { kind: 'product' | 'collection' | 'category'; slug: string } | null;
  /** The resolved catalog object (a product, collection or category), or the page's own. */
  entry: Doc;
  page: Doc;
  template: Doc;
  /** The request path as served, locale prefix included. */
  path: string;
  /** Every locale the site serves; used to tell `/` from `/is-IS`. */
  locales: readonly string[];
  /**
   * The name of the product's own (deepest) category, for `product.category`. The product
   * projection serves only `categoryIds`; the name comes from the category list the storefront
   * already loads (`categoryTrailFor`), so the caller resolves it.
   */
  productCategory?: string | null;
  /** Formats a major-unit amount in the store's currency and locale. */
  formatPrice: (amount: number) => string;
}

export interface SeoInput {
  context: SeoContext;
  data: SeoData;
  options: {
    entry: SeoEntryValue | null;
    template: SeoEntryValue | null;
    contentImage: string | null;
  };
}

/** The meta description a product's own text may give the `product.shortDescription` variable. */
const SHORT_DESCRIPTION_MAX = 160;

/**
 * Everything `useEldraSeo` needs for one route: the context, the variables that context offers
 * (`page.title`, `product.name`, ... — the platform's registry names them), the route's own `seo`
 * field values and the content's own image.
 *
 * The page's title follows the rule the document title always had: a catalog route is named by
 * the object it shows (the shared route template's own title only names the template), anything
 * else by its own document. The not-found shell names itself and is never indexed.
 */
export function seoInput(parts: SeoInputParts): SeoInput {
  const entryData = parts.entry?.data ?? {};
  const own = parts.template?.data ?? parts.page?.data ?? {};
  const catalogKind = parts.catalog?.kind ?? null;

  const title = text(catalogKind === null ? own.title : entryData.title) ?? text(own.title) ?? '';
  const data: SeoData = {
    'page.title': title,
    'page.slug': text(own.slug) ?? text(entryData.slug) ?? lastSegment(parts.path),
  };
  let contentImage: string | null = null;

  if (catalogKind === 'product') {
    const variants = list(entryData.variants);
    const prices = variants
      .map((variant) => variant.price)
      .filter((price): price is number => typeof price === 'number' && Number.isFinite(price));
    data['product.name'] = title;
    data['product.sku'] = text(variants[0]?.sku) ?? '';
    data['product.price'] = prices.length === 0 ? '' : parts.formatPrice(Math.min(...prices));
    data['product.shortDescription'] = shortDescription(entryData.description);
    data['product.brand'] = text(entryData.brand) ?? '';
    data['product.category'] = text(parts.productCategory) ?? '';
    contentImage = shareImage(list(entryData.images)[0]);
  } else if (catalogKind !== null) {
    data[`${catalogKind}.name`] = title;
    data[`${catalogKind}.description`] = shortDescription(entryData.description);
    data[`${catalogKind}.productCount`] =
      typeof entryData.productCount === 'number' ? entryData.productCount : '';
    if (catalogKind === 'collection') contentImage = shareImage(entryData.image);
  }

  // A catalog object is not an authored document: its own fields are not an `seo` value, only the
  // shared route template's are.
  const entry = catalogKind === null ? seoValue(parts.page?.data?.seo) : null;
  const template = seoValue(parts.template?.data?.seo);

  if (parts.isNotFound) {
    return {
      context: 'page',
      data: { 'page.title': parts.notFoundTitle },
      options: {
        entry: { title: parts.notFoundTitle, noindex: true },
        template: null,
        contentImage: null,
      },
    };
  }

  return {
    context:
      catalogKind !== null
        ? `catalog:${catalogKind}`
        : isHome(parts.path, parts.locales)
          ? 'home'
          : 'page',
    data,
    options: { entry, template, contentImage },
  };
}

function isHome(path: string, locales: readonly string[]): boolean {
  const clean = path.split(/[?#]/)[0]!.replace(/\/+$/, '');
  return clean === '' || locales.some((locale) => clean === `/${locale}`);
}

function lastSegment(path: string): string {
  const segments = path
    .split(/[?#]/)[0]!
    .split('/')
    .filter((part) => part !== '');
  return segments[segments.length - 1] ?? '';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];
}

/** A media item's 1200 px rendering, the width the share card wants. */
function shareImage(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const url = text((value as { url?: unknown }).url);
  return url === null ? null : imageUrl(url, 'lg');
}

function seoValue(value: unknown): SeoEntryValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SeoEntryValue)
    : null;
}

/** A description as one line of plain text: a string as it is, a rich-text document flattened. */
function shortDescription(value: unknown): string {
  const plain = (typeof value === 'string' ? value : flatten(value)).replace(/\s+/g, ' ').trim();
  if (plain.length <= SHORT_DESCRIPTION_MAX) return plain;
  const cut = plain.slice(0, SHORT_DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`;
}

function flatten(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  const {
    type,
    text: own,
    content,
  } = node as { type?: unknown; text?: unknown; content?: unknown };
  if (type === 'text') return typeof own === 'string' ? own : '';
  if (!Array.isArray(content)) return '';
  return content.map(flatten).join(' ');
}
