import type { InjectionKey, Ref } from 'vue';
import type { EldraClient } from '@eldrajs/sdk';
// Type-only, so nothing of the Nuxt module (a build-time entry that reaches for `@nuxt/kit` and
// `node:fs`) can reach an app bundle or a Storybook story through this import.
import type { StoreCommerce } from '@eldrajs/theme-nuxt/commerce';
import type { CartStore } from './cart';

/**
 * The theme's own view types for commerce data. `@eldrajs/sdk`'s
 * response types (`EldraContractResponse<...>`) are contract-derived and resolve to `unknown`
 * without the Vite plugin's generated `contract.ts` augmentation (headless-kit `CLAUDE.md`
 * invariant: "the SDK ships no response types"), so a block never consumes them directly —
 * `gateway.ts` maps a live response into the narrow shapes below, and `demo.ts` builds the same
 * shapes by hand from the Northwind fixtures. Both are checked by `pnpm --filter starter-nuxt
 * typecheck`, which is the only place these types are proven against real usage (a block's own
 * `.spec.ts` proves it renders them; nothing here talks to a network).
 *
 * Money fields (`StorefrontPrice.amount`/`compareAt`, cart line/total amounts, order totals) are
 * always in **major units** — 28 is twenty-eight dollars, not twenty-eight cents — because that is
 * what the gateway sends. `@eldrajs/ui`'s `Price`/`ProductCard` read minor units, so a value from
 * here goes through `toMinorUnits()` (`app/storefront/money.ts`) on its way into one of those, and
 * through `formatMoney()` when it has to appear inside a sentence. Which currency they are in is
 * the store's own, never the content locale's: see `StorefrontCommerce` below.
 */

/**
 * What the store sells in, as the platform publishes it: the organisation's own commerce settings,
 * read once at build by `@eldrajs/theme-nuxt` and handed to the app on
 * `runtimeConfig.public.eldra.commerce`. `null` on a store that has not configured commerce.
 *
 * `{ currency, taxInclusivePricing, defaultTaxRate }`, and **not re-declared here**: the module
 * that writes the key publishes its type, so this is an alias. A theme that hand-copies the record
 * is a theme that stops compiling, or quietly stops reading a field, the first time the platform
 * adds one.
 *
 * `currency` reaches `@eldrajs/ui`'s components through `CURRENCY_KEY`
 * (`app/plugins/eldra-ui-messages.ts`), which is where every `<Price>` and every `useMoney()` call
 * takes it from. The rest is what this type is carried around for: `taxInclusivePricing` tells a
 * block whether the amounts it is showing already contain VAT ("incl. VAT" vs. "excl. VAT", tax
 * "calculated at checkout"), and `defaultTaxRate` is the fraction applied to shipping and to
 * products with no rate of their own.
 */
export type StorefrontCommerce = StoreCommerce;

export interface StorefrontMedia {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface StorefrontPrice {
  /** Major units. */
  amount: number;
  /** Major units. Sale styling/badge only apply when this is greater than `amount`. */
  compareAt?: number | null;
  /** "From $X" for a product whose variants span more than one price. */
  from?: boolean;
}

export interface StorefrontProductListItem {
  handle: string;
  title: string;
  url: string;
  featuredImage?: StorefrontMedia | null;
  price: StorefrontPrice;
  rating?: { value: number; count: number } | null;
  colours?: Array<{ name: string; swatch: string }>;
  stock: 'in' | 'low' | 'out' | 'preorder';
  available: boolean;
  /**
   * The **catalog product's** id — what a volatile refresh addresses this row by
   * (`app/storefront/volatile.ts`) and what a cart add has to send as its `productId`.
   *
   * A list row deliberately carries no variant id: the products list read answers none, and a
   * product's buyable variants are only in the detail read. So nothing can be put in the cart from
   * a card alone — a quick-add on a card has to read the product first (`catalog.product`) and take
   * the `variantId` off that, which is why no card in this theme offers one.
   */
  productId: string;
}

export interface StorefrontProductOption {
  name: string;
  label: string;
  type: 'swatches' | 'pills';
  values: Array<{ value: string; label: string; swatch?: string; available: boolean }>;
}

export interface StorefrontProduct extends StorefrontProductListItem {
  /**
   * The **variant** the page would add to the cart: the product's first buyable one
   * (`gateway.ts`'s `mapProductDetails`). Distinct from the inherited `productId`, and both halves
   * are sent on an add — the cart service looks the pair up together and refuses a variant that
   * does not belong to the product it was given.
   */
  variantId: string;
  images: StorefrontMedia[];
  options: StorefrontProductOption[];
  categoryTrail: Array<{ label: string; href: string }>;
  description: string;
  /**
   * Real units of the variant this page would sell — `variantId` above — or `null`. `null` covers two
   * different stores and one honest refusal: a store that tracks no units at all, a read that could
   * not reach inventory, and a product whose count cannot be attributed to one variant (a source that
   * knows M has two left but cannot say the shopper is looking at M sends none, because "only 2 left
   * in L" is worse than no line at all). Either way the low-stock line is simply left off.
   */
  inventory: number | null;
  shipsBy?: string | null;
}

export interface StorefrontCollectionInfo {
  handle: string;
  title: string;
  description?: string | null;
  image?: StorefrontMedia | null;
  productCount: number;
}

export interface StorefrontFacet {
  source: string;
  label: string;
  values: Array<{ value: string; label: string; count: number; swatch?: string }>;
}

export interface StorefrontCartLine {
  id: string;
  /** The catalog product this line's variant belongs to — the other half of an add (see
   *  `StorefrontProduct.variantId`), which is what lets Undo re-add a removed line. */
  productId: string;
  variantId: string;
  title: string;
  url: string;
  variantLabel: string;
  quantity: number;
  /** Major units. */
  unitPrice: number;
  /** Major units. */
  lineTotal: number;
  image?: StorefrontMedia | null;
  max: number | null;
}

export interface StorefrontCartTotals {
  /** Major units. */
  subtotal: number;
  /** `amount` in major units. */
  discount?: { code: string; amount: number } | null;
  /** Major units. `null` renders "Calculated at checkout". */
  shipping: number | null;
  /** Major units. */
  tax?: number | null;
  /** Major units. */
  total: number;
}

export type StorefrontOrderStatus =
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'delayed'
  | 'cancelled';

export interface StorefrontOrder {
  number: string;
  placedAt: string;
  itemCount: number;
  status: StorefrontOrderStatus;
  steps: Array<{
    key: 'ordered' | 'packed' | 'shipped' | 'delivered';
    label: string;
    date: string | null;
    state: 'done' | 'current' | 'upcoming' | 'warning';
  }>;
  carrier?: string;
  eta?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  delayNote?: string;
  cancelNote?: string;
  lines: StorefrontCartLine[];
  totals: StorefrontCartTotals;
  shippingAddress: string[];
  payment: { brand: string; last4: string };
}

export interface StorefrontSearchResponse {
  query: string;
  total: number;
  products: StorefrontProductListItem[];
  articles: Array<{
    title: string;
    href: string;
    category: string;
    readingTime: string;
    image?: StorefrontMedia | null;
  }>;
  pages: Array<{ title: string; href: string; path: string; snippet: string }>;
  suggestion?: string | null;
}

export interface StorefrontAck {
  ok: boolean;
  reason?: 'unsupported' | 'invalid' | 'failed';
}

/**
 * The two classes of value that go stale between builds. Everything else on a product — title,
 * images, options, description, category trail — is content, and content changes trigger a
 * rebuild, so the prerendered copy is the truth until the next one.
 */
export type VolatileKey = 'price' | 'stock';

/**
 * One product's volatile values as the backend has them *now*, keyed by the same id the page's
 * own data carries (`StorefrontProductListItem.productId` — what the gateway's product list read
 * fills from the product's `id`). `price` is the whole `StorefrontPrice` this theme already uses,
 * not a second money shape: `amount` and `compareAt` are read off it, `from` is not (the price
 * *spread* is a property of the product's variants, not a value that refreshes).
 *
 * `inventory` is optional and absent means "unknown, keep what the page already shows" — the
 * products list read carries no inventory today (`StorefrontProduct.inventory` is `null` from the
 * gateway), so only a source that genuinely knows sets it.
 */
export interface VolatileSnapshot {
  id: string;
  price: StorefrontPrice;
  available: boolean;
  stock: StorefrontProductListItem['stock'];
  inventory?: number | null;
}

/**
 * **The prerender contract.** `data` is complete from the first paint: a page rendered at build
 * time carries its real title, images, options, description, price and stock line, and hydration
 * paints nothing new. `pending` is therefore the skeleton state and nothing else — a read in
 * flight with nothing to show yet — so a consumer must never show a skeleton for a value it
 * already has, and a read that has answered is not pending even when its answer was `null`
 * ("no such product", "no such collection"): that is a result, not a wait.
 *
 * After mount only the volatile values refresh (`VolatileKey`: money amounts and the stock line).
 * While a refresh is in flight the keys being refreshed appear in `revalidating`, and the
 * prerendered value stays on screen — dimmed, with a small inline spinner beside it — so there is
 * no layout shift and no flash. An empty set means nothing is refreshing, which is the whole of
 * a page's life apart from those few hundred milliseconds. A failed refresh clears the set and
 * keeps the value: a page never regresses to an error state for something it can already show,
 * and `error` stays for the page that has nothing.
 *
 * `loading` is the third flag and the broadest: any read in flight, including the manual
 * `refresh()` and a reload for changed sources. It is what a block shows a spinner from while the
 * value it already has stays on screen.
 *
 * **What a block owes in return: sources that are final at setup time, on both sides.** A result
 * is cached under a key built from its sources' values at creation, and that key is how the
 * browser finds the value the build left for it. A source that resolves to one thing while the
 * page is being generated and to another a moment after hydration — browser-local state, a value
 * some other block settles first — mints a second key, misses the payload and refetches data the
 * page is already showing. So a block gives a result it does not render an *empty* source rather
 * than a live one (`blocks/product-carousel/Block.vue` is the worked example: three results, one
 * variant, two empty sources), and anything genuinely browser-local
 * (`history.recentlyViewed`) is only ever read by the variant that shows it.
 */
export interface StorefrontResult<T> {
  data: Ref<T | null>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
  /**
   * True for the whole of *any* load — the first one, a reload because the sources changed, a
   * manual `refresh()` — and false the rest of the time. The three flags answer three different
   * questions and a block reads all of them: `pending` is "there is nothing to show yet" (draw the
   * skeleton), `loading` is "a read is in flight" (draw a small spinner beside the value that is
   * already on screen — `loading && data !== null`, never a skeleton over it), and `revalidating`
   * is the narrower "only these fields are being refreshed" (below).
   */
  loading: Readonly<Ref<boolean>>;
  /** Empty = nothing refreshing. Written by the storefront implementation, read by a block. */
  revalidating: Readonly<Ref<ReadonlySet<VolatileKey>>>;
  refresh: () => Promise<void>;
}

/** A `reactive()` object: a block reads it, only the app layer writes it. */
export interface StorefrontRoute {
  productHandle: string | null;
  collectionHandle: string | null;
  orderToken: string | null;
  query: string | null;
  page: number;
  /**
   * The current `?sort=` value, or `null` when absent — read back the same generic way `page`
   * already is, so `collection-grid` can seed its own sort choice from a shared URL instead of
   * always starting from its field's default.
   */
  sort: string | null;
  /** The current `?columns=` value, or `null` when absent — `collection-grid`'s column count. */
  columns: string | null;
  /**
   * Every other query key — not `q`, `page`, `token`, `sort` or `columns`, which already have
   * their own typed field above — as flat string arrays, keyed by query key. A block owns its own
   * filter vocabulary (`collection-grid`'s `category`/`size`/`colour`/`availability`/`minPrice`/
   * `maxPrice`), so `StorefrontRoute` only hands back the raw bag rather than declaring every
   * block's filter keys itself; a value is always an array (even a single-valued one like
   * `minPrice`) so a block never has to branch on whether the URL repeated a key.
   */
  filters: Record<string, string[]>;
  /** The one writer a block may call — the plugin routes it through `useRouter()`. */
  setQuery(patch: Record<string, string | string[] | null>): void;
}

/**
 * How a block names the collection it wants products from. `{ slug }` is the
 * storefront handle — a route segment, or a CMS field an author typed. `{ id }`
 * is a catalog collection id, which is what a `reference` field stores: the
 * public read resolves it to an object carrying the `slug` as well, but the
 * depth-0 stub and the page builder's draft overlay carry only the id, and a
 * block must still be able to ask for its products. A storefront implementation
 * that cannot resolve an id answers `null`, like any other unknown collection —
 * never an error.
 */
export type StorefrontCollectionSelector = { slug: string } | { id: string };

export interface StorefrontCatalog {
  product(handle: Ref<string | null>): StorefrontResult<StorefrontProduct>;
  collection(handle: Ref<string | null>): StorefrontResult<StorefrontCollectionInfo>;
  collectionProducts(
    collection: Ref<StorefrontCollectionSelector | null>,
    opts: Ref<{ page: number; pageSize: number; sort?: string; filters?: Record<string, string[]> }>
  ): StorefrontResult<{
    items: StorefrontProductListItem[];
    total: number;
    facets: StorefrontFacet[];
  }>;
  related(handle: Ref<string | null>, limit: number): StorefrontResult<StorefrontProductListItem[]>;
  byHandles(handles: Ref<string[]>): StorefrontResult<StorefrontProductListItem[]>;
  /**
   * The live values for a page's products, in one batched read (chunked past the gateway's own
   * comfortable filter size — see `volatile.ts`'s `chunkIds`). An id nothing matches is simply
   * absent from the answer, never an error; an empty `ids` makes no request at all.
   *
   * Deliberately *not* a `StorefrontResult`: this is a one-shot read a caller folds into data it
   * already has (`applyVolatileSnapshots`), not a piece of page state with its own
   * pending/error/refresh life cycle.
   */
  volatileByIds(ids: string[]): Promise<VolatileSnapshot[]>;
  notifyBackInStock(input: { email: string; variantId: string }): Promise<StorefrontAck>;
}

export interface StorefrontForms {
  subscribe(i: { email: string; list: string }): Promise<StorefrontAck>;
  sendMessage(i: Record<string, string>): Promise<StorefrontAck>;
}

export interface StorefrontSearch {
  run(query: Ref<string>): StorefrontResult<StorefrontSearchResponse>;
}

export interface StorefrontOrders {
  current(token: Ref<string | null>): StorefrontResult<StorefrontOrder>;
}

export interface WishlistStore {
  items: Ref<string[]>;
  has(handle: string): boolean;
  toggle(handle: string): void;
}

export interface HistoryStore {
  recentlyViewed: Ref<string[]>;
  recordView(handle: string): void;
  clearViews(): void;
  isAnnouncementDismissed(message: string): boolean;
  dismissAnnouncement(message: string): void;
}

export interface StorefrontSource {
  ready: Ref<boolean>;
  /** See `StorefrontCommerce`: what the store sells in, or `null` when the platform publishes
   *  nothing. Not reactive — it is a build-time fact about the store, not page state. */
  commerce: StorefrontCommerce | null;
  route: StorefrontRoute;
  catalog: StorefrontCatalog;
  cart: CartStore;
  search: StorefrontSearch;
  orders: StorefrontOrders;
  forms: StorefrontForms;
  wishlist: WishlistStore;
  history: HistoryStore;
}

export const STOREFRONT_KEY: InjectionKey<StorefrontSource> = Symbol.for(
  'eldra.starter.storefront'
);

// Re-exported so a consumer only needs `EldraClient` for `createGatewayStorefront` — `gateway.ts`
// re-exports it too, but importing it from here keeps a caller who only touched `types.ts` honest
// about where the dependency comes from.
export type { EldraClient };
