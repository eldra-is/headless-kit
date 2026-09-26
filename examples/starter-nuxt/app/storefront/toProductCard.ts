import type { ProductCardProduct } from '@eldrajs/ui';
import type { StorefrontProductListItem } from './types';

/**
 * `StorefrontProductListItem` → `@eldrajs/ui`'s `ProductCardProduct` — the one mapping
 * `collection-grid`, `product-carousel` and `search` all build their cards through, so the three
 * agree pixel for pixel (design doc §"Storefront source": "`ProductCard` is the shared cell ...,
 * always built by `toProductCard()`").
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
 */
export function toProductCard(
  item: StorefrontProductListItem,
  opts?: { ratio?: '4x5' | '1x1' | '3x4' }
): ProductCardProduct {
  void opts;
  const { amount, compareAt, from } = item.price;
  const isSale = compareAt != null && compareAt > amount;
  return {
    title: item.title,
    url: item.url,
    featuredImage: item.featuredImage ?? null,
    price: { amount, compareAt, from },
    rating: item.rating,
    colours: item.colours,
    badge: isSale ? { variant: 'sale' } : null,
    stock: item.stock,
    available: item.available,
  };
}
