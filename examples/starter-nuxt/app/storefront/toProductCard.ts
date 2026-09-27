import type { ProductCardProduct } from '@eldrajs/ui';
import { isInternalHref, safeHref } from '../utils/links';
import type { StorefrontProductListItem } from './types';

/**
 * `StorefrontProductListItem` → `@eldrajs/ui`'s `ProductCardProduct` — the one mapping
 * `collection-grid`, `product-carousel` and `search` all build their cards through, so the three
 * agree pixel for pixel — `ProductCard` is the shared cell every commerce block renders a product
 * with, always built by `toProductCard()`.
 *
 * `badge` is never read off the input — `ProductCardProduct.badge` is deliberately the caller's
 * own sale/new *decision*, not something the card re-derives, so this is the one place that
 * decision gets made for every commerce block: `{ variant: 'sale' }` exactly when
 * `compareAt > amount`, matching `Price`'s own sale rule verbatim. A future "New" tag (the spec's
 * `dto_ProductListItem` carries no such flag today) is a decision for whoever adds it, not this
 * function.
 *
 * `opts.ratio` is accepted, not consumed: it exists so a caller building a grid of cards has one
 * place to read the aspect ratio it is about to pass to `<ProductCard ratio="…">` alongside this
 * data (`collection-grid`'s 3/4-column grid vs. `product-carousel`'s single ratio), without that
 * choice needing to live on the card's own data. Nothing in the Northwind fixtures varies by ratio
 * today (one `featuredImage` per product, no per-crop variants).
 *
 * **The trust boundary.** `item.url` is storefront-derived — it comes off a gateway response
 * (`app/storefront/gateway.ts`) or the demo fixture, not out of the CMS — and `ProductCard`'s own
 * `url` is required: the card always renders a link, so there is no "render the card without its
 * link" state to fall back to. So this returns `null` for an item whose `url` is not a `safeHref`,
 * meaning "do not render a card for this item at all", and the sanitised href is what the card
 * carries. That is the same rule every CMS-authored href in the theme already follows
 * (`global-constraints.md`: "every `href` passes `safeHref` and renders nothing when it returns
 * `null`") — storefront data used to be the one class of URL that reached the DOM unchecked.
 *
 * Callers normally go through `toProductCardEntries()` below rather than calling this per item.
 */
export function toProductCard(
  item: StorefrontProductListItem,
  opts?: { ratio?: '4x5' | '1x1' | '3x4' }
): ProductCardProduct | null {
  void opts;
  const url = safeHref(item.url);
  if (url === null) return null;
  const { amount, compareAt, from } = item.price;
  const isSale = compareAt != null && compareAt > amount;
  return {
    title: item.title,
    url,
    featuredImage: item.featuredImage ?? null,
    price: { amount, compareAt, from },
    rating: item.rating,
    colours: item.colours,
    badge: isSale ? { variant: 'sale' } : null,
    stock: item.stock,
    available: item.available,
  };
}

/** One product's card data plus what the block needs to render its link correctly. */
export interface ProductCardEntry {
  /** The storefront item, with `url` replaced by its sanitised (`safeHref`) form. */
  item: StorefrontProductListItem;
  /** Ready for `<ProductCard :product="…">`. */
  product: ProductCardProduct;
  /**
   * `true` when the destination is same-site, i.e. when the card's link should be routed by
   * passing `app/components/EldraRouterLink.vue` as `link-as`. An off-site product URL (a gateway
   * that returns absolute URLs, say) is a document navigation and must stay a plain `<a>` — handing
   * `<NuxtLink>` an absolute URL asks the router to resolve a route that does not exist.
   */
  internal: boolean;
}

/**
 * The list form every commerce block builds its card grid/row from: sanitises each item's `url`,
 * drops the items whose URL is unusable, and says per card whether the link routes.
 *
 * One function rather than a `safeHref` call in each of `collection-grid`, `product-carousel` and
 * `search`: three blocks each deciding this for themselves is exactly the asymmetry that let
 * storefront hrefs reach the DOM unchecked while every CMS-authored href was gated.
 */
export function toProductCardEntries(
  items: readonly StorefrontProductListItem[] | null | undefined,
  opts?: { ratio?: '4x5' | '1x1' | '3x4' }
): ProductCardEntry[] {
  const entries: ProductCardEntry[] = [];
  for (const item of items ?? []) {
    const product = toProductCard(item, opts);
    if (product === null) continue;
    entries.push({
      item: item.url === product.url ? item : { ...item, url: product.url },
      product,
      internal: isInternalHref(product.url),
    });
  }
  return entries;
}
