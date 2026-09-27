import type { InjectionKey, Ref } from 'vue';
import type { EldraClient } from '@eldrajs/sdk';
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
 * always in **minor units** (cents) — the same convention `@eldrajs/ui`'s `Price` component reads
 * (see `packages/ui/src/components/price/types.ts`), so a value from here passes straight into
 * `Price`/`ProductCard` with no conversion at the point of use.
 */

export interface StorefrontMedia {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface StorefrontPrice {
  /** Minor units (cents). */
  amount: number;
  /** Minor units (cents). Sale styling/badge only apply when this is greater than `amount`. */
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
  variantId: string;
}

export interface StorefrontProductOption {
  name: string;
  label: string;
  type: 'swatches' | 'pills';
  values: Array<{ value: string; label: string; swatch?: string; available: boolean }>;
}

export interface StorefrontProduct extends StorefrontProductListItem {
  images: StorefrontMedia[];
  options: StorefrontProductOption[];
  categoryTrail: Array<{ label: string; href: string }>;
  description: string;
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
  variantId: string;
  title: string;
  url: string;
  variantLabel: string;
  quantity: number;
  /** Minor units (cents). */
  unitPrice: number;
  /** Minor units (cents). */
  lineTotal: number;
  image?: StorefrontMedia | null;
  max: number | null;
}

export interface StorefrontCartTotals {
  /** Minor units (cents). */
  subtotal: number;
  discount?: { code: string; amount: number } | null;
  /** Minor units (cents). `null` renders "Calculated at checkout". */
  shipping: number | null;
  /** Minor units (cents). */
  tax?: number | null;
  /** Minor units (cents). */
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

export interface StorefrontResult<T> {
  data: Ref<T | null>;
  pending: Ref<boolean>;
  error: Ref<string | null>;
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

export interface StorefrontCatalog {
  product(handle: Ref<string | null>): StorefrontResult<StorefrontProduct>;
  collection(handle: Ref<string | null>): StorefrontResult<StorefrontCollectionInfo>;
  collectionProducts(
    handle: Ref<string | null>,
    opts: Ref<{ page: number; pageSize: number; sort?: string; filters?: Record<string, string[]> }>
  ): StorefrontResult<{
    items: StorefrontProductListItem[];
    total: number;
    facets: StorefrontFacet[];
  }>;
  related(handle: Ref<string | null>, limit: number): StorefrontResult<StorefrontProductListItem[]>;
  byHandles(handles: Ref<string[]>): StorefrontResult<StorefrontProductListItem[]>;
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
