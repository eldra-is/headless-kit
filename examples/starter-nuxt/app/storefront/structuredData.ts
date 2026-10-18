/**
 * The page's schema.org JSON-LD, from data the page already renders: the **same** product, the same
 * variant prices, the same store currency and the same stock states (`variantStock` in
 * `gateway.ts`) the buy box and `<Price>` read, so the markup cannot disagree with the page.
 *
 * Pure — no Vue, no Nuxt, no storefront — so `test/storefront/structuredData.spec.ts` pins every
 * page type without mounting anything. The builders themselves are `@eldrajs/theme-core`'s
 * (framework-free, theme-agnostic); this file is what is specific to this theme: which nodes a
 * page type writes and how a `StorefrontProduct` maps onto them.
 *
 * | Page            | Nodes                                          |
 * | --------------- | ---------------------------------------------- |
 * | home            | `Organization`, `WebSite` (+ `SearchAction`)   |
 * | product         | `BreadcrumbList`, `Product`                    |
 * | category/collection | `BreadcrumbList`, `ItemList` of the products shown |
 * | any other page  | `BreadcrumbList`                               |
 * | not found       | nothing                                        |
 *
 * `Organization` and `WebSite` need an absolute URL, so they are written only when the build knows
 * the site's origin; the others fall back to relative URLs without one (see `docs/theme-seo.md`).
 */
import {
  buildBreadcrumbLd,
  buildItemListLd,
  buildOrganizationLd,
  buildProductLd,
  buildWebSiteLd,
  ldPlainText,
  type LdAvailability,
  type ProductLdVariant,
  type StructuredDataEntry,
} from '@eldrajs/theme-core';
import type { StorefrontProduct } from './types';

export type PageLdKind = 'home' | 'product' | 'category' | 'collection' | 'page' | 'notFound';

export interface PageLdParts {
  kind: PageLdKind;
  /** The current page's name: the last breadcrumb level. */
  title: string;
  /** The current page's own URL (canonical when the build knows one). */
  currentUrl: string;
  /** A site path (`/products/x`) as the URL to write: locale-prefixed, absolute when possible. */
  url: (path: string) => string;
  /** Whether the build knows the site's origin, i.e. `url()` is absolute. */
  absolute: boolean;
  homeLabel: string;
  /** The levels between Home and the current page, root first. */
  trail: ReadonlyArray<{ label: string; path: string }>;
  /** The product, on a product page. */
  product: StorefrontProduct | null;
  /** The store currency (`useMoney().currency`), or `undefined` when the platform published none. */
  currency: string | undefined;
  /** The products a listing page shows, in order. */
  items: ReadonlyArray<{ title: string; url: string }>;
  profile: {
    name: string;
    logoUrl: string | null;
    sameAs: readonly string[];
    contact: { email: string | null; telephone: string | null };
  };
  /** The site's search page path (`/search`, unprefixed: it follows the home URL), or `null` when
   *  the site has none. */
  searchPath: string | null;
}

const AVAILABILITY: Record<StorefrontProduct['stock'], LdAvailability> = {
  in: 'InStock',
  low: 'LimitedAvailability',
  out: 'OutOfStock',
  preorder: 'PreOrder',
};

/** One offer per variant; a source without variants gets one from the product's own price. */
function variantsOf(product: StorefrontProduct, url: string): ProductLdVariant[] {
  if (product.variants !== undefined && product.variants.length > 0) {
    return product.variants.map((variant) => ({
      sku: variant.sku,
      gtin: variant.barcode,
      price: variant.price,
      compareAt: variant.compareAt,
      availability: AVAILABILITY[variant.stock],
      url,
    }));
  }
  return [
    {
      price: product.price.amount,
      compareAt: product.price.compareAt,
      availability: AVAILABILITY[product.stock],
      url,
    },
  ];
}

export function pageStructuredData(parts: PageLdParts): StructuredDataEntry[] {
  if (parts.kind === 'notFound') return [];

  if (parts.kind === 'home') {
    // Both need an absolute URL and say nothing useful without one.
    if (!parts.absolute) return [];
    const origin = parts.url('/');
    return [
      {
        type: 'organization',
        node: buildOrganizationLd({
          name: parts.profile.name,
          url: origin,
          logo: parts.profile.logoUrl,
          sameAs: parts.profile.sameAs,
          contact: parts.profile.contact,
        }),
      },
      {
        type: 'website',
        node: buildWebSiteLd({
          name: parts.profile.name,
          url: origin,
          searchPath: parts.searchPath,
        }),
      },
    ];
  }

  const entries: StructuredDataEntry[] = [
    {
      type: 'breadcrumb',
      node: buildBreadcrumbLd([
        { name: parts.homeLabel, url: parts.url('/') },
        ...parts.trail.map((level) => ({ name: level.label, url: parts.url(level.path) })),
        { name: parts.title, url: parts.currentUrl },
      ]),
    },
  ];

  if (parts.kind === 'product' && parts.product !== null) {
    const product = parts.product;
    entries.push({
      type: 'product',
      node: buildProductLd({
        url: parts.currentUrl,
        name: product.title,
        description: ldPlainText(product.description),
        images: product.images.map((image) => image.src),
        // A product with no brand of its own is sold under the shop's name (the site profile's).
        brand: product.brand ?? parts.profile.name,
        variants: variantsOf(product, parts.currentUrl),
        currency: parts.currency,
        ratings: product.rating,
      }),
    });
  }

  if ((parts.kind === 'category' || parts.kind === 'collection') && parts.items.length > 0) {
    entries.push({
      type: 'itemList',
      node: buildItemListLd(parts.items.map((item) => ({ name: item.title, url: item.url }))),
    });
  }
  return entries;
}
