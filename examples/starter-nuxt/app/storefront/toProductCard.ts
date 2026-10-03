import type { ProductCardProduct } from '@eldrajs/ui';
import { isInternalHref, safeHref } from '../utils/links';
import { toMinorUnits } from './money';
import type { StorefrontProductListItem, StorefrontSearchProduct } from './types';

/**
 * The product shapes a card can be built from: a catalogue list row, which always has a price, or a
 * search result, whose price may be unknown (`StorefrontSearchProduct`).
 */
export type ProductCardSource = StorefrontProductListItem | StorefrontSearchProduct;

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
 * **Units.** Storefront money is major units (`types.ts`) and `ProductCardProduct.price` is minor
 * units, like every other `@eldrajs/ui` money input, so the two prices are converted on the way in.
 * `opts.minorUnits` exists so a block can hand in the conversion already bound to the currency and
 * locale its `<ProductCard>` will resolve (`useMoney().minor`) — which is what every block that
 * renders a card does. The fallback converts with no currency at all, i.e. at ISO 4217's default
 * two digits, the same scale the `<ProductCard>` reading the value falls back to; it is there for a
 * caller outside a component (a mapping test), not for a block.
 *
 * `opts.revalidating` is accepted here and consumed by `toProductCardEntries()` below, the same
 * shape `opts.ratio` has: it is a property of the *page's* refresh, not of one product, so it
 * travels with the card data rather than being remembered separately by each of the three blocks
 * that build cards. `ProductCardProduct` deliberately does not grow a field for it —
 * `@eldrajs/ui` takes it as a prop on the card, beside `loading`, because it is a state the page
 * is in, not a fact about the product.
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
  item: ProductCardSource,
  opts?: ToProductCardOptions
): ProductCardProduct | null {
  const url = safeHref(item.url);
  if (url === null) return null;
  // The second "do not render a card for this item" rule, and it exists for the same reason as the
  // first: `ProductCardProduct.price` is required, because a commerce card without a price is not a
  // product card, so there is no "render the card without its price" state to fall back to. A
  // search result the storefront could not price (`StorefrontSearchProduct`) therefore gets no card
  // — never one reading the store's own "$0.00". The suggestion panel is the other half of that
  // decision: `SearchResultItem.price` *is* optional, so a row there keeps the product.
  if (item.price === null) return null;
  const minor = opts?.minorUnits ?? ((amount: number) => toMinorUnits(amount, undefined));
  const { amount, compareAt, from } = item.price;
  const isSale = compareAt != null && compareAt > amount;
  return {
    title: item.title,
    url,
    featuredImage: item.featuredImage ?? null,
    price: {
      amount: minor(amount),
      compareAt: compareAt == null ? compareAt : minor(compareAt),
      from,
    },
    rating: item.rating,
    colours: item.colours,
    badge: isSale ? { variant: 'sale' } : null,
    stock: item.stock,
    available: item.available,
  };
}

/** What a block can tell the card builder beyond the item itself. */
export interface ToProductCardOptions {
  ratio?: '4x5' | '1x1' | '3x4';
  /** Major → minor units, bound to the block's own currency/locale. Defaults to `toMinorUnits`. */
  minorUnits?: (amount: number) => number;
  /**
   * The card's price and stock line are on screen but fresher ones are on their way — the
   * prerendered page's volatile refresh (`StorefrontResult.revalidating`), or a reload of the list
   * itself over results the visitor can still see. Surfaces as `ProductCardEntry.revalidating`,
   * which the block binds to `<ProductCard :revalidating="…">`. Defaults to `false`.
   */
  revalidating?: boolean;
}

/** One product's card data plus what the block needs to render its link correctly. */
export interface ProductCardEntry {
  /** The storefront item, with `url` replaced by its sanitised (`safeHref`) form. */
  item: ProductCardSource;
  /** Ready for `<ProductCard :product="…">`. */
  product: ProductCardProduct;
  /** `opts.revalidating`, per card — `<ProductCard :revalidating="entry.revalidating">`. */
  revalidating: boolean;
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
 * drops the items a card cannot be built for — an unusable URL, or no price at all — and says per
 * card whether the link routes.
 *
 * One function rather than a `safeHref` call in each of `collection-grid`, `product-carousel` and
 * `search`: three blocks each deciding this for themselves is exactly the asymmetry that let
 * storefront hrefs reach the DOM unchecked while every CMS-authored href was gated.
 */
export function toProductCardEntries(
  items: readonly ProductCardSource[] | null | undefined,
  opts?: ToProductCardOptions
): ProductCardEntry[] {
  const entries: ProductCardEntry[] = [];
  const revalidating = opts?.revalidating === true;
  for (const item of items ?? []) {
    const product = toProductCard(item, opts);
    if (product === null) continue;
    entries.push({
      item: item.url === product.url ? item : { ...item, url: product.url },
      product,
      revalidating,
      internal: isInternalHref(product.url),
    });
  }
  return entries;
}
