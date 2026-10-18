/**
 * schema.org JSON-LD builders, framework-free. A theme's page feeds them plain data it already
 * renders from (the same price, currency and stock the visible `<Price>` and stock line read), and
 * `@eldrajs/theme-nuxt`'s `useStructuredData` writes the result into the head. Nothing here reads
 * a gateway, a route or the DOM.
 *
 * Rules every builder follows, so a theme never has to:
 *
 * - An `undefined`, `null`, empty string, empty array or empty object is **omitted**, never
 *   emitted: a half-empty node is worse than none for a crawler, and Google penalises made-up
 *   values (so there is no rating unless the caller has real ones).
 * - Prices are the amount rounded to the **store currency's own fraction digits** (`ISK` has none,
 *   `USD` two), the same rounding the rendered price uses.
 * - `availability` is a full schema.org URL.
 * - `serializeLd` escapes `<` (and the two line separators) so a product named `</script>` cannot
 *   break out of the tag.
 */

/** One JSON-LD node. */
export type JsonLd = Record<string, unknown>;

/** The kinds of node a theme writes; the opt-out and the extender are keyed by these. */
export type StructuredDataType = 'product' | 'breadcrumb' | 'itemList' | 'organization' | 'website';

export const STRUCTURED_DATA_TYPES: readonly StructuredDataType[] = [
  'product',
  'breadcrumb',
  'itemList',
  'organization',
  'website',
];

export type LdAvailability = 'InStock' | 'OutOfStock' | 'PreOrder' | 'LimitedAvailability';

export interface ProductLdVariant {
  sku?: string | null;
  /** Free text in the catalog; emitted as `gtin` only when it is a valid GTIN-8/12/13/14. */
  gtin?: string | null;
  /** Major units. */
  price: number;
  /** The pre-sale price in major units; written as the offer's list price when above `price`. */
  compareAt?: number | null;
  availability: LdAvailability;
  url?: string | null;
  /** ISO 8601 date; the end of the sale price. */
  priceValidUntil?: string | null;
}

export interface ProductLdInput {
  url: string;
  name: string;
  description?: string | null;
  images?: readonly string[];
  brand?: string | null;
  variants: readonly ProductLdVariant[];
  /** ISO 4217. Without one no offer is written: a price with no currency is not a price. */
  currency?: string | null;
  /** Only real review data; `undefined` writes nothing. */
  ratings?: { value: number; count: number } | null;
}

const SCHEMA = 'https://schema.org';

const AVAILABILITY_URL: Record<LdAvailability, string> = {
  InStock: `${SCHEMA}/InStock`,
  OutOfStock: `${SCHEMA}/OutOfStock`,
  PreOrder: `${SCHEMA}/PreOrder`,
  LimitedAvailability: `${SCHEMA}/LimitedAvailability`,
};

/** Which availability wins when one price covers variants that differ: the most buyable one. */
const AVAILABILITY_RANK: Record<LdAvailability, number> = {
  InStock: 3,
  LimitedAvailability: 2,
  PreOrder: 1,
  OutOfStock: 0,
};

/** Drops every empty value, recursively. Numbers (including `0`) and booleans are kept. */
function clean<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return (value.trim() === '' ? undefined : value) as T | undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => clean(item)).filter((item) => item !== undefined);
    return (items.length === 0 ? undefined : items) as T | undefined;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, clean(item)] as const)
      .filter(([, item]) => item !== undefined);
    return (entries.length === 0 ? undefined : Object.fromEntries(entries)) as T | undefined;
  }
  return value;
}

function node(type: string, fields: Record<string, unknown>): JsonLd {
  return (clean({ '@context': SCHEMA, '@type': type, ...fields }) ?? {}) as JsonLd;
}

/** Fraction digits of a currency; `2` for a code `Intl` does not know. */
function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** The amount as the number written in an offer: rounded to the currency's own digits. */
export function ldPrice(amount: number, currency: string): number {
  return Number(amount.toFixed(fractionDigits(currency)));
}

/**
 * The GTIN if `value` is a valid GTIN-8/12/13/14 (digits only, GS1 check digit correct), else
 * `null`. A barcode field is free text, so anything else (an internal code, a mistyped digit) is
 * left out rather than sent to a crawler as an identifier.
 */
export function validGtin(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return null;
  let sum = 0;
  // From the digit left of the check digit, weights alternate 3, 1, 3, ...
  for (let i = digits.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]) ? digits : null;
}

function offerOf(variant: ProductLdVariant, currency: string, extra: JsonLd = {}): JsonLd {
  const price = ldPrice(variant.price, currency);
  const listPrice =
    variant.compareAt === null || variant.compareAt === undefined
      ? undefined
      : ldPrice(variant.compareAt, currency);
  return {
    '@type': 'Offer',
    url: variant.url,
    price,
    priceCurrency: currency,
    availability: AVAILABILITY_URL[variant.availability],
    priceValidUntil: variant.priceValidUntil,
    ...(listPrice !== undefined && listPrice > price
      ? {
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            priceType: `${SCHEMA}/ListPrice`,
            price: listPrice,
            priceCurrency: currency,
          },
        }
      : {}),
    ...extra,
  };
}

/**
 * A `Product`. One variant, or several at one price, is an `Offer`; variants at different prices
 * are an `AggregateOffer` (`lowPrice`, `highPrice`, `offerCount`, one `Offer` each). With no
 * currency or no variants the node carries no offers at all.
 */
export function buildProductLd(input: ProductLdInput): JsonLd {
  const currency = (input.currency ?? '').trim();
  const variants = input.variants.filter((variant) => Number.isFinite(variant.price));
  const single = variants.length === 1 ? variants[0] : undefined;
  const identity = (variant: ProductLdVariant): JsonLd => ({
    sku: variant.sku,
    gtin: validGtin(variant.gtin),
  });

  let offers: JsonLd | undefined;
  if (currency !== '' && variants.length > 0) {
    const prices = variants.map((variant) => ldPrice(variant.price, currency));
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    if (low === high) {
      const best = variants.reduce((a, b) =>
        AVAILABILITY_RANK[b.availability] > AVAILABILITY_RANK[a.availability] ? b : a
      );
      offers = offerOf(best, currency, single === undefined ? {} : identity(single));
    } else {
      offers = {
        '@type': 'AggregateOffer',
        lowPrice: low,
        highPrice: high,
        priceCurrency: currency,
        offerCount: variants.length,
        offers: variants.map((variant) => offerOf(variant, currency, identity(variant))),
      };
    }
  }

  const ratings =
    input.ratings !== null &&
    input.ratings !== undefined &&
    input.ratings.count > 0 &&
    Number.isFinite(input.ratings.value)
      ? {
          '@type': 'AggregateRating',
          ratingValue: input.ratings.value,
          reviewCount: input.ratings.count,
        }
      : undefined;

  return node('Product', {
    name: input.name,
    url: input.url,
    description: input.description,
    image: input.images,
    brand: input.brand ? { '@type': 'Brand', name: input.brand } : undefined,
    ...(single === undefined ? {} : identity(single)),
    offers,
    aggregateRating: ratings,
  });
}

/** A `BreadcrumbList`, root first. Every level carries its URL, the last one included. */
export function buildBreadcrumbLd(items: readonly { name: string; url: string }[]): JsonLd {
  const levels = items.filter((item) => item.name.trim() !== '');
  return node('BreadcrumbList', {
    itemListElement: levels.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  });
}

/** An `ItemList` of the things a listing page shows, in the order shown. */
export function buildItemListLd(items: readonly { url: string; name: string }[]): JsonLd {
  return node('ItemList', {
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: item.url,
      name: item.name,
    })),
  });
}

export interface OrganizationLdInput {
  name: string;
  url: string;
  logo?: string | null;
  sameAs?: readonly string[];
  contact?: { email?: string | null; telephone?: string | null } | null;
}

export function buildOrganizationLd(input: OrganizationLdInput): JsonLd {
  const contact = input.contact;
  return node('Organization', {
    name: input.name,
    url: input.url,
    logo: input.logo,
    sameAs: input.sameAs,
    contactPoint:
      contact && (contact.email || contact.telephone)
        ? {
            '@type': 'ContactPoint',
            contactType: 'customer service',
            email: contact.email,
            telephone: contact.telephone,
          }
        : undefined,
  });
}

export interface WebSiteLdInput {
  name: string;
  url: string;
  /** The site's search page path (`/search`), or `null`/absent when there is none. A SearchAction
   *  pointing at a page that does not exist is worse than none. It is queried with `?q=`. */
  searchPath?: string | null;
}

export function buildWebSiteLd(input: WebSiteLdInput): JsonLd {
  const search = (input.searchPath ?? '').trim();
  return node('WebSite', {
    name: input.name,
    url: input.url,
    potentialAction:
      search === ''
        ? undefined
        : {
            '@type': 'SearchAction',
            target: {
              '@type': 'EntryPoint',
              urlTemplate: `${input.url.replace(/\/+$/, '')}${search.startsWith('/') ? '' : '/'}${search}?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
          },
  });
}

/**
 * The text of `<script type="application/ld+json">`. One node is written as itself, several as an
 * array. `<` is written as its JSON escape (so `</script>` and `<!--` cannot occur) and U+2028/U+2029 are
 * escaped; the result is still plain JSON.
 */
export function serializeLd(nodes: readonly JsonLd[]): string {
  const json = JSON.stringify(nodes.length === 1 ? nodes[0] : nodes);
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const LD_DESCRIPTION_MAX = 5000;

/**
 * A description as plain text for `description`: a string with its HTML tags dropped, or a rich-text
 * document (nodes with `text`/`content`) flattened, whitespace collapsed, cut at `max` characters
 * on a word boundary.
 */
export function ldPlainText(value: unknown, max: number = LD_DESCRIPTION_MAX): string {
  const raw = typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ') : flatten(value);
  const plain = raw.replace(/\s+/g, ' ').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.8 ? cut.slice(0, space) : cut).trim();
}

function flatten(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '';
  const { type, text, content } = value as { type?: unknown; text?: unknown; content?: unknown };
  if (type === 'text') return typeof text === 'string' ? text : '';
  return Array.isArray(content) ? content.map(flatten).join(' ') : '';
}

/** A built node and what kind it is. */
export interface StructuredDataEntry {
  type: StructuredDataType;
  node: JsonLd;
}

/** What a theme can say about the nodes it writes. */
export interface StructuredDataPolicy {
  /** `true` writes none; a list switches those node kinds off. */
  disable?: readonly StructuredDataType[] | boolean;
  /** Edit a node (return the new one) or drop it (return `null`). Runs after `disable`. */
  extend?: (
    type: StructuredDataType,
    node: JsonLd,
    context: StructuredDataContext
  ) => JsonLd | null;
}

export interface StructuredDataContext {
  path: string;
  locale: string | null;
}

/** Applies the theme's opt-out and extender to the nodes a page built. Pure. */
export function applyStructuredDataPolicy(
  entries: readonly StructuredDataEntry[],
  policy: StructuredDataPolicy,
  context: StructuredDataContext
): JsonLd[] {
  const disable = policy.disable;
  if (disable === true) return [];
  const off = new Set(Array.isArray(disable) ? disable : []);
  const out: JsonLd[] = [];
  for (const entry of entries) {
    if (off.has(entry.type) || Object.keys(entry.node).length === 0) continue;
    const next = policy.extend ? policy.extend(entry.type, entry.node, context) : entry.node;
    if (next !== null && Object.keys(next).length > 0) out.push(next);
  }
  return out;
}
