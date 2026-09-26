import type { Component } from 'vue';
import type { HeadingLevel } from '../../composables/useHeadingTag';
import type { ImageMedia } from '../image/types';
import type { StockLevel } from '../badge/types';

/**
 * The media ratios `ProductCard` itself offers (spec "Product card" → Properties, `ratio` row):
 * a subset of `Image`'s own `ImageRatio` — the three the spec names for commerce grids, not
 * every preset `Image` supports (a product card is never `16x9` or `3x2`).
 */
export type ProductCardRatio = '4x5' | '1x1' | '3x4';

/**
 * One product, exactly the task brief's own `ProductCardProduct` type. `price` mirrors `Price`'s
 * own minor-units/`compareAt`/`from` inputs verbatim, so it passes straight through; `colours` is
 * the swatch-dot data (`swatch` is a colour string from product data, the one per-item colour the
 * design spec allows — see `VariantPicker`'s own precedent); `badge` is the caller's own sale/new
 * decision (the spec's "derived automatically... when tagged `new`" needs a tag vocabulary this
 * type does not carry, so the card trusts this field instead of re-deriving it — see
 * `ProductCard.vue`'s own comment); `stock`, kept deliberately separate from `available`, is an
 * addition beyond the spec's own 8-part anatomy — see `ProductCard.vue`'s comment on
 * `showStockLine` for why it exists and how it composes `StockBadge`.
 */
export interface ProductCardProduct {
  /** The product's full name — also the link's accessible name in full, even while the visible
   * title is clamped to two lines. */
  title: string;
  /** The product page. Also what `quickAdd` events identify the product by, alongside `title`. */
  url: string;
  /** Shown above the title when `showVendor` is on. */
  vendor?: string;
  /** `null`/omitted renders `Image`'s own live "No image" placeholder at the same ratio. */
  featuredImage?: ImageMedia | null;
  /** `Price`'s own inputs, in minor units. Sale styling and the sale badge's percentage both
   * derive from `compareAt > amount` — see `ProductCard.vue`'s `discountPercent`. */
  price: { amount: number; compareAt?: number | null; from?: boolean };
  /** `null`/omitted hides `Rating` regardless of `showRating` — spec: "Hide when the store has
   * no reviews at all." */
  rating?: { value: number; count: number } | null;
  /** The swatch dots' data. `swatch` is an arbitrary CSS colour from product data — data, not a
   * design token, the same allowance `VariantPicker` has for its own swatches. */
  colours?: Array<{ name: string; swatch: string }>;
  /** The caller's own sale/new decision (spec anatomy part 2). `null`/omitted renders no
   * sale/new badge. Ignored while `available` is `false` — the "Sold out" badge replaces it
   * rather than stacking a third badge (`Badge`'s own acceptance criterion: "a third badge is
   * never rendered"). */
  badge?: { variant: 'sale' | 'new' } | null;
  /** An additional stock status line beyond the spec's own 8-part anatomy — see
   * `ProductCard.vue`'s `showStockLine` comment. Ignored while `available` is `false`. */
  stock?: StockLevel | null;
  /** `false` renders the sold-out state (spec "Product card" → Variants, "Sold out" row):
   * media at 60% opacity, an outline "Sold out" badge, and quick add replaced by a disabled
   * "Sold out" button. Omitted/`true` is the ordinary available state. */
  available?: boolean;
}

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them,
 * plus `stockLine` for the addition beyond it (see `ProductCardProduct.stock`). */
export type ProductCardPart =
  | 'root'
  | 'media'
  | 'badges'
  | 'body'
  | 'vendor'
  | 'title'
  | 'link'
  | 'price'
  | 'rating'
  | 'stockLine'
  | 'swatches'
  | 'swatch'
  | 'swatchOverflow'
  | 'quickAdd'
  | 'skeleton';

export interface ProductCardProps {
  /** The product. See `ProductCardProduct`. */
  product: ProductCardProduct;
  /** Shows the vendor line. Defaults to `false` (spec "Product card" → Properties). */
  showVendor?: boolean;
  /** Shows `Rating`, when the product has one. Defaults to `true` — turn it off store-wide when
   * the shop has no reviews at all. */
  showRating?: boolean;
  /** Shows the colour dots, when the product has any. Defaults to `true`. */
  showSwatches?: boolean;
  /** Shows the quick-add control (the live button when available, the disabled "Sold out"
   * button when not). Defaults to `true`. */
  quickAdd?: boolean;
  /** The media's aspect ratio; one ratio per grid (spec "Product card" → Properties). Defaults
   * to `'4x5'`. */
  ratio?: ProductCardRatio;
  /** The title heading's level; follows the surrounding block. Defaults to `3` (h3 under a
   * block h2, spec "Product card" → Anatomy, part 4). */
  headingLevel?: HeadingLevel;
  /** Renders the loading skeleton (spec "Product card" → Variants, Loading row) instead of the
   * card. */
  loading?: boolean;
  /** `Price`'s own `currency` prop, passed straight through. Defaults to `useEldraUiCurrency()`. */
  currency?: string;
  /** `Price`'s own `locale` prop, passed straight through. Defaults to `useEldraUiLocale()`. */
  locale?: string;
  /**
   * Render the title link as a different component (e.g. a router link), which receives the
   * destination as `to` instead of `href` — the same contract as `Link`/`Rating`'s `as`. Named
   * `linkAs`, not `as`: this card's own root is a fixed `<article>`/`<div>` (loading), so `as`
   * would be ambiguous with `Badge`/`Container`/`Section`'s `as`, which picks the root tag itself —
   * see this package's README "as vs linkAs" note.
   */
  linkAs?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ProductCardPart, string>>;
}
