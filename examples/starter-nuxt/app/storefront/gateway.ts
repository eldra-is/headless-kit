import { onWatcherCleanup, ref, watch, type Ref } from 'vue';
import { createCartSession, EldraHttpError, type EldraClient } from '@eldrajs/sdk';
import { safeHref } from '../utils/links';
import { createCartStore, type CartOps, type CartSnapshot } from './cart';
import { createHistoryStore, createWishlistStore } from './history';
import { fromMinorUnits, roundMoney, toMinorUnits } from './money';
import { chunkIds, collectVolatileTargets } from './volatile';
import { canonicalAvailabilityValues, OPTION_SOURCE_PREFIX } from './facets';
import {
  buildCategoryIndex,
  categoryTrailFor,
  isInSubtree,
  placeCategory,
  type CategoryIndex,
} from './categories';
import type { VolatileRefreshEntry } from './refresh';
import type {
  CatalogFacets,
  StorefrontAck,
  StorefrontCartLine,
  StorefrontCartTotals,
  StorefrontCatalog,
  StorefrontCollectionInfo,
  StorefrontCollectionProducts,
  StorefrontCollectionSelector,
  StorefrontCommerce,
  StorefrontForms,
  StorefrontMedia,
  StorefrontOrder,
  StorefrontOrders,
  StorefrontProduct,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontRoute,
  StorefrontSearch,
  StorefrontSearchProduct,
  StorefrontSearchResponse,
  StorefrontSource,
  VolatileKey,
  VolatileSnapshot,
} from './types';

/**
 * The live implementation: `client.catalog`/`client.search`/`client.cart`/`client.orders`/
 * `client.inventory` map into the view types in `types.ts`. `@eldrajs/sdk`'s own response types
 * are contract-derived (`EldraContractResponse<...>`) and resolve to `unknown` in this project
 * (no generated `contract.ts` — headless-kit `CLAUDE.md`'s "the SDK ships no response types"
 * invariant), so every `Raw*` interface below is this file's own minimal, hand-written shape of
 * the gateway's actual JSON (matching `packages/sdk/src/__tests__/fixtures/contract.ts`, a
 * generated *test* fixture never imported here) — the same thing a real customer theme has to do
 * before its own `eldra()` Vite plugin has generated a contract against their tenant.
 *
 * `forms.subscribe`/`forms.sendMessage`/`catalog.notifyBackInStock` have no gateway endpoint
 * today: this posts to `options.formsEndpoint` when the plugin configured one, and resolves
 * `{ ok: false, reason: 'unsupported' }` otherwise.
 */

// ---------------------------------------------------------------------------------------------
// Raw gateway shapes this file expects (see the file-level comment above)
// ---------------------------------------------------------------------------------------------

interface RawThumbnail {
  assetId: string;
  url: string;
  altText?: string;
}

interface RawProductListItem {
  id: string;
  slug: string;
  title: string;
  status: string;
  minPrice: number;
  maxPrice: number;
  compareAtPrice?: number;
  thumbnail?: RawThumbnail;
  totalVariants: number;
}

/**
 * One row of the whole-store category list — how a category slug becomes a catalog id, and, through
 * `parentId`, the whole tree a product's breadcrumb trail and the grid's nested category facet are
 * walked from (`app/storefront/categories.ts`). `parentId` is absent on a root and on a gateway
 * answering a contract that had no tree, which `buildCategoryIndex` reads the same way: a root.
 */
interface RawCategory {
  id: string;
  slug: string;
  title: string;
  parentId?: string | null;
}

/**
 * The `facets` object `facets=true` adds to a product list (`catalogweb_WebProductFacets`), as
 * loosely as this file reads every other response: every field optional, because a gateway that
 * answers an older contract answers none of them and the panel has to degrade rather than throw.
 *
 * `price` is in **minor** units here — the same units as the `minPrice`/`maxPrice` parameters it is
 * counted over, and deliberately unlike a row's own major-unit `minPrice`. `mapFacets` converts.
 *
 * `availability` is **absent, not zeroed**, when the platform could not read stock, which is a
 * different answer from "nothing is in stock": the panel hides that group rather than offering two
 * zeroes (`CatalogFacets.availability`).
 */
interface RawFacetTerm {
  id?: string;
  slug?: string;
  title?: string;
  count?: number;
  /**
   * The platform's own placement of a `categories` term in the tree (public contract 3.8.0):
   * **absent for a root**, otherwise the nearest *reported* ancestor — an id always present in the
   * same list, never a dangling one. Absent on every term of a pre-3.8.0 response too, which is why
   * the tree is otherwise completed from the category list; a response that places a term is also one
   * whose counts are rolled up, and both halves are then the platform's (see `mapFacets` and
   * `CatalogFacets.categoryCounts`).
   */
  parentId?: string | null;
}

interface RawFacetOptionValue {
  value?: string;
  label?: string;
  swatch?: string;
  count?: number;
}

interface RawFacetOption {
  key?: string;
  name?: string;
  values?: RawFacetOptionValue[] | null;
}

interface RawProductFacets {
  price?: { min?: number; max?: number } | null;
  categories?: RawFacetTerm[] | null;
  collections?: RawFacetTerm[] | null;
  availability?: { in_stock?: number; out_of_stock?: number } | null;
  options?: RawFacetOption[] | null;
}

interface RawMediaItem {
  assetId: string;
  url: string;
  altText?: string;
  sortOrder: number;
}

interface RawProductOptionValue {
  id: string;
  key: string;
  name: string;
}

interface RawProductOption {
  id: string;
  key: string;
  name: string;
  values?: RawProductOptionValue[] | null;
}

interface RawProductVariant {
  id: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  status: string;
  media?: RawMediaItem[] | null;
  optionValues?: Array<{
    id: string;
    name: string;
    optionId: string;
    optionValueId: string;
  }> | null;
}

interface RawProductDetails {
  id: string;
  slug: string;
  title: string;
  status: string;
  /** Optional on purpose: the gateway's product detail response carries it for
   * a product that has a category and omits it otherwise. `related` uses it to
   * find products of the same kind — see `relatedProducts`. */
  categoryId?: string;
  /**
   * **The category the breadcrumb trail is walked up from** — the one of `categoryIds` the merchant
   * marked primary. Preferred over `categoryId` above where both are present (they are the same id
   * on every response seen so far; this one is the field the public contract names), and a product
   * with no category carries neither.
   */
  primaryCategoryId?: string;
  /**
   * Every category this product is in. Read by nothing here yet — the trail is one path, not a set,
   * and a product in Cups and in Gifts has one crumb — but declared so the next reader of this file
   * knows the response carries it rather than inferring the catalogue only ever assigns one.
   */
  categoryIds?: string[] | null;
  description?: Record<string, unknown>;
  mediaLinks?: RawMediaItem[] | null;
  options?: RawProductOption[] | null;
  variants?: RawProductVariant[] | null;
}

/** One row of `POST /inventory/v1/stock/availability`'s answer. */
interface RawStockAvailability {
  variantId: string;
  available: boolean;
  allowBackorder: boolean;
  availableQuantity: number;
}

interface RawCollectionItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  image?: RawThumbnail;
  productCount: number;
}

interface RawPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface RawProductList {
  data: RawProductListItem[] | null;
  meta: RawPageMeta;
  /** Present only when the read asked for it (`facets=true`). */
  facets?: RawProductFacets | null;
}

interface RawSearchResult {
  /** The **search index row's** own id. Unique per row, and not a catalog id: nothing in the
   *  catalogue answers to it. */
  id: string;
  /**
   * The id of the **document the row is about** — for a `PRODUCT` row, the catalog product id.
   * Required by the gateway's own schema (`dto_Result`), optional here only so a response that
   * somehow omits it degrades to an unpriced row rather than asking the catalogue about nothing.
   */
  sourceId?: string;
  kind: 'PRODUCT' | 'CMS_ENTRY' | 'CMS_SCHEMA' | 'CATEGORY';
  title: string;
  targetUrl?: string;
  snippet?: string;
  summary?: string;
  breadcrumb?: string;
  metadata?: Record<string, unknown>;
}

interface RawSearchResponse {
  results: RawSearchResult[] | null;
  total: number;
}

interface RawCartItem {
  id: string;
  productId: string;
  /** The product's public slug, snapshotted by the cart; absent on lines added before it was. */
  productSlug?: string;
  variantId: string;
  title: string;
  price: number;
  quantity: number;
  thumbnail?: { assetId: string; url: string };
  optionSnapshots?: Array<{ optionName?: string; optionValueName?: string }> | null;
}

interface RawCartTotals {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
}

interface RawCart {
  id: string;
  currency: string;
  items?: RawCartItem[] | null;
  totals: RawCartTotals;
  discountCode?: string;
}

interface RawOrderLine {
  id: string;
  productId: string;
  /** The product's public slug as the order snapshotted it; older orders carry none. */
  slug?: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string;
}

interface RawOrder {
  id: string;
  orderNumber: number;
  status: string;
  createdAt: string;
  orderLines?: RawOrderLine[] | null;
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountAmount: number;
  discountCode?: string;
  shipping?: {
    customer: { name: string; address: string; town: string; zipcode: number };
    providerType: string;
  };
}

// ---------------------------------------------------------------------------------------------
// Mapping — raw gateway JSON → this theme's view types (money is major units on both sides, so
// every amount below is a pass-through; see `app/storefront/money.ts`)
// ---------------------------------------------------------------------------------------------

function toMedia(
  item: RawThumbnail | RawMediaItem | undefined,
  fallbackAlt: string
): StorefrontMedia | null {
  if (!item) return null;
  return { src: item.url, alt: item.altText ?? fallbackAlt };
}

function mapProductListItem(raw: RawProductListItem): StorefrontProductListItem {
  return {
    handle: raw.slug,
    title: raw.title,
    url: `/products/${raw.slug}`,
    featuredImage: toMedia(raw.thumbnail, raw.title),
    price: {
      amount: raw.minPrice,
      compareAt: raw.compareAtPrice ?? null,
      from: raw.minPrice !== raw.maxPrice,
    },
    // A card stays on the product's published status, not on inventory: the availability read is
    // per *variant*, and a list row carries no variant at all (see `StorefrontProductListItem`), so
    // answering a grid from inventory would mean one product detail read per card. The product page
    // is where the honest number belongs, and it is the only page whose button spends it.
    stock: raw.status === 'ACTIVE' ? 'in' : 'out',
    available: raw.status === 'ACTIVE',
    productId: raw.id,
  };
}

/**
 * What the inventory service says about each of a product's variants, by variant id.
 *
 * `null` — and a variant missing from a non-null map — both mean "nothing known", which is not the
 * same as "nothing left": the mapping below then falls back to the variant's own `status`, exactly
 * what it used before this read existed. That is the fail-soft rule the whole feature rests on: a
 * store that has not set inventory up, an inventory service that is down, and a product whose
 * variants it has never heard of all keep a working product page instead of a catalogue that reads
 * sold out.
 */
type StockByVariant = ReadonlyMap<string, RawStockAvailability>;

/**
 * The product page's inventory read. The catalogue's own product response carries a variant's
 * `status` — whether it is published — and nothing at all about units, so a published variant with
 * no stock read "In stock, ready to ship" beside an Add to cart the cart service then refused. One
 * bulk call answers for every variant of the product at once.
 *
 * No `locationId` is sent: an item without one resolves the organisation's default location, which
 * is the only location a storefront knows about.
 *
 * It never throws and never reports. A shopper cannot act on "we could not reach inventory", and
 * the page has a usable answer without it (see `StockByVariant`), so a failure is silent by design.
 */
async function readStock(
  client: EldraClient,
  raw: RawProductDetails,
  signal?: AbortSignal
): Promise<StockByVariant | null> {
  const items = (raw.variants ?? [])
    .map((variant) => variant.id)
    .filter((variantId) => variantId !== '')
    .map((variantId) => ({ variantId }));
  if (items.length === 0) return null;
  try {
    const answer = (await client.inventory.availability(
      items,
      signal ? { signal } : {}
    )) as unknown as {
      items?: RawStockAvailability[] | null;
    };
    const byVariant = new Map<string, RawStockAvailability>();
    for (const item of answer.items ?? []) byVariant.set(item.variantId, item);
    return byVariant.size === 0 ? null : byVariant;
  } catch {
    return null;
  }
}

/** Can this variant be bought right now: published, and either in stock or open to back-order. */
function variantBuyable(variant: RawProductVariant, stock: StockByVariant | null): boolean {
  if (variant.status !== 'ACTIVE') return false;
  const known = stock?.get(variant.id);
  return known === undefined || known.available || known.allowBackorder;
}

/** The product-level stock signal `deriveStockLine` reads, for the variant the page shows. */
function variantStock(
  variant: RawProductVariant | undefined,
  stock: StockByVariant | null
): StorefrontProduct['stock'] {
  if (variant === undefined || variant.status !== 'ACTIVE') return 'out';
  const known = stock?.get(variant.id);
  if (known === undefined) return 'in';
  if (known.available) return 'in';
  return known.allowBackorder ? 'preorder' : 'out';
}

function mapProductDetails(
  raw: RawProductDetails,
  stock: StockByVariant | null,
  /**
   * The store's category tree, for the breadcrumb trail. `null` from a read that could not reach the
   * category list, which leaves the trail empty rather than failing the product page: see the
   * `catalog.product` fetcher.
   */
  categories: CategoryIndex | null
): StorefrontProduct {
  const variants = raw.variants ?? [];
  // Spec Do/Don't, "Don't pre-select a sold-out variant": the variant the page opens on is the
  // first one a shopper could actually buy, and only when none can does it fall back to the first
  // published one — which is the variant whose sold-out line the shopper then reads.
  const firstAvailable =
    variants.find((variant) => variantBuyable(variant, stock)) ??
    variants.find((variant) => variant.status === 'ACTIVE') ??
    variants[0];
  /** The variant whose unit count is unambiguously *the* count: there is only one thing to buy. */
  const countableVariant =
    variants.length === 1 || (raw.options ?? []).length === 0 ? firstAvailable : undefined;
  const prices = variants.map((variant) => variant.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const images = (raw.mediaLinks ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((media) => toMedia(media, raw.title))
    .filter((media): media is StorefrontMedia => media !== null);

  return {
    handle: raw.slug,
    title: raw.title,
    url: `/products/${raw.slug}`,
    featuredImage: images[0] ?? null,
    images,
    price: {
      amount: firstAvailable?.price ?? minPrice,
      compareAt: firstAvailable?.compareAtPrice ?? null,
    },
    options: (raw.options ?? []).map((option) => ({
      name: option.key,
      label: option.name,
      type: 'pills' as const,
      values: (option.values ?? []).map((value) => ({
        value: value.key,
        label: value.name,
        available: variants.some(
          (variant) =>
            variantBuyable(variant, stock) &&
            (variant.optionValues ?? []).some((ov) => ov.optionValueId === value.id)
        ),
      })),
    })),
    // Root ancestor down to the product's own category, each level a link into the catalogue
    // filtered by it (`app/storefront/categories.ts`). `[]` for a product with no category, a
    // category the list does not hold, and a category read that failed — three honest absences, one
    // of which used to be the only answer this mapping had: it read `result.breadcrumb`, a field of
    // the *search* response that no product read has ever carried, so every product page shipped
    // with no category crumb at all.
    categoryTrail:
      categories === null
        ? []
        : categoryTrailFor(categories, raw.primaryCategoryId ?? raw.categoryId),
    description: (() => {
      const text = raw.description?.text;
      return typeof text === 'string' ? text : '';
    })(),
    // Real units — but only when they cannot be mis-attributed. `StorefrontProduct.inventory` is
    // *the selected variant's* count (see its own declaration), and the one variant this mapping can
    // speak for is `firstAvailable`: the variant an add sends, which is not necessarily the one the
    // shopper has picked in the buy box. So a product with options and more than one variant reports
    // no count at all rather than labelling M's two units "only 2 left in L" — the same `null` a
    // store that tracks no units sends, which simply leaves the low-stock line off (spec States, Low
    // stock). Reporting per-variant counts means carrying every variant's availability on the product
    // and resolving the shopper's selection against it, which is also what the buy box would need to
    // add the variant it is showing rather than the first buyable one.
    inventory: countableVariant
      ? (stock?.get(countableVariant.id)?.availableQuantity ?? null)
      : null,
    stock: variantStock(firstAvailable, stock),
    available: raw.status === 'ACTIVE',
    productId: raw.id,
    // The variant an add would send, paired with `productId` above: the cart service looks the two
    // up together and refuses a variant that does not belong to the product it was given. A product
    // with no variants at all has nothing buyable, so there is no id to fall back to.
    variantId: firstAvailable?.id ?? '',
  };
}

function mapCollectionItem(raw: RawCollectionItem): StorefrontCollectionInfo {
  return {
    handle: raw.slug,
    title: raw.title,
    description: raw.description ?? null,
    image: toMedia(raw.image, raw.title),
    productCount: raw.productCount,
  };
}

function mapCartLine(raw: RawCartItem): StorefrontCartLine {
  const variantLabel = (raw.optionSnapshots ?? [])
    .map((snapshot) => snapshot.optionValueName)
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  return {
    id: raw.id,
    productId: raw.productId,
    variantId: raw.variantId,
    title: raw.title,
    // The storefront's product route is `/products/<slug>`; the id is only a fallback for a line
    // snapshotted before the cart carried the slug, where nothing better exists.
    url: `/products/${raw.productSlug || raw.productId}`,
    variantLabel,
    quantity: raw.quantity,
    unitPrice: raw.price,
    // The one amount this mapping computes rather than copies, so it is the one that needs
    // rounding back to two decimals (major-unit arithmetic is floating point).
    lineTotal: roundMoney(raw.price * raw.quantity),
    image: raw.thumbnail ? { src: raw.thumbnail.url, alt: raw.title } : null,
    max: null,
  };
}

function mapCartTotals(raw: RawCartTotals, discountCode: string | undefined): StorefrontCartTotals {
  return {
    subtotal: raw.subtotal,
    discount:
      discountCode && raw.discount > 0 ? { code: discountCode, amount: raw.discount } : null,
    shipping: null,
    tax: raw.taxAmount,
    total: raw.total,
  };
}

function mapCart(raw: RawCart): CartSnapshot {
  return {
    lines: (raw.items ?? []).map(mapCartLine),
    totals: mapCartTotals(raw.totals, raw.discountCode),
  };
}

const ORDER_STATUS_MAP: Record<string, StorefrontOrder['status']> = {
  PENDING: 'processing',
  CONFIRMED: 'processing',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  DELAYED: 'delayed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
};

function mapOrder(raw: RawOrder): StorefrontOrder {
  const status = ORDER_STATUS_MAP[raw.status.toUpperCase()] ?? 'processing';
  const lines: StorefrontCartLine[] = (raw.orderLines ?? []).map((line) => ({
    id: line.id,
    productId: line.productId,
    variantId: line.variantId ?? '',
    title: line.productName,
    url: `/products/${line.slug || line.productId}`,
    variantLabel: line.variantName ?? '',
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.totalPrice,
    image: line.imageUrl ? { src: line.imageUrl, alt: line.productName } : null,
    max: null,
  }));
  return {
    number: `NW-${raw.orderNumber}`,
    placedAt: raw.createdAt,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    status,
    steps: [
      { key: 'ordered', label: 'Ordered', date: raw.createdAt, state: 'done' },
      {
        key: 'packed',
        label: 'Packed',
        date: null,
        state: status === 'processing' ? 'current' : 'done',
      },
      {
        key: 'shipped',
        label: 'Shipped',
        date: null,
        state:
          status === 'shipped'
            ? 'current'
            : status === 'delivered' || status === 'delayed'
              ? 'done'
              : 'upcoming',
      },
      {
        key: 'delivered',
        label: 'Delivered',
        date: null,
        state: status === 'delivered' ? 'done' : status === 'delayed' ? 'warning' : 'upcoming',
      },
    ],
    lines,
    totals: {
      subtotal: raw.subtotalAmount,
      discount:
        raw.discountCode && raw.discountAmount > 0
          ? { code: raw.discountCode, amount: raw.discountAmount }
          : null,
      shipping: raw.shippingAmount,
      tax: raw.taxAmount,
      total: raw.totalAmount,
    },
    shippingAddress: raw.shipping
      ? [raw.shipping.customer.name, raw.shipping.customer.address, raw.shipping.customer.town]
      : [],
    payment: { brand: '', last4: '' },
  };
}

/**
 * The authoring surface's own path prefix. A result pointing inside it is an editing URL, not a
 * storefront one: the site serves no file for it, so a shopper who follows the row leaves the shop
 * for a 404.
 */
const AUTHORING_PATH = '/cms';

/**
 * A result's destination, or `null` when the theme cannot route it.
 *
 * Two rules, and both are the theme's own rather than the backend's. `safeHref` is the scheme
 * allowlist every other href in the theme passes through — `javascript:`, `data:`, a
 * protocol-relative `//host` and a missing value all answer `null`. On top of it, a path under
 * `/cms` is dropped: the search index is built over the platform's own documents, and a document
 * that has no public route can only be named by its authoring URL. The backend only returns
 * routable results now; this stays because a result the theme cannot route is worse than a result
 * the shopper never saw, and the theme is the side that knows what it can route.
 */
function routableResultHref(targetUrl: unknown): string | null {
  const href = safeHref(targetUrl);
  if (href === null) return null;
  if (href === AUTHORING_PATH || href.startsWith(`${AUTHORING_PATH}/`)) return null;
  return href;
}

/**
 * Every URL in this response is gateway-supplied, so each one goes through `routableResultHref`
 * here and a result whose `targetUrl` does not survive it is **dropped**, not carried with a
 * placeholder.
 *
 * This used to be `result.targetUrl ?? '#'`, which turned a result with no destination into a card
 * or row linking to nowhere (a link to the current page), and — worse — let any URL the gateway
 * returned reach the DOM unchecked while every CMS-authored href in the theme was gated. This is the
 * one place the search response crosses that trust boundary, so it is the one place that decides:
 * a result without a usable link is not a result the shopper can act on.
 */
function mapSearchResponse(raw: RawSearchResponse, query: string): StorefrontSearchResponse {
  const results = raw.results ?? [];
  const linkedResults = results.flatMap((result) => {
    const href = routableResultHref(result.targetUrl);
    return href === null ? [] : [{ result, href }];
  });
  const products: StorefrontSearchProduct[] = linkedResults
    .filter(({ result }) => result.kind === 'PRODUCT')
    .map(({ result, href }) => ({
      // The index row's id, used as nothing but the row's key: a search result carries no slug, and
      // the destination the shopper follows is `targetUrl`, not a handle this theme builds.
      handle: result.id,
      title: result.title,
      url: href,
      // Neither an image nor a price is in a search result. `enrichedSearchResponse` reads both
      // from the catalogue before the response reaches a block, and a product it could not reach
      // keeps `price: null` all the way out — never a zero, which every consumer would format as the
      // store's own "$0.00" (`StorefrontSearchProduct`).
      featuredImage: null,
      price: null,
      stock: 'in',
      available: true,
      // **`sourceId`, not `id`.** `id` names the index row; `sourceId` names the catalog product,
      // and it is the only one of the two the catalogue has ever heard of. Asking
      // `products/list?filter=id:in:<row id>` answers zero rows every time, which is why every
      // search suggestion and every search result card shipped without a price or a thumbnail.
      productId: result.sourceId ?? '',
    }));
  const articles = linkedResults
    .filter(({ result }) => result.kind === 'CMS_ENTRY')
    .map(({ result, href }) => ({
      title: result.title,
      href,
      category: result.breadcrumb ?? '',
      readingTime: '',
      image: null,
    }));
  const pages = linkedResults
    .filter(({ result }) => result.kind === 'CMS_SCHEMA')
    .map(({ result, href }) => ({
      title: result.title,
      href,
      path: href,
      snippet: result.snippet ?? result.summary ?? '',
    }));
  return { query, total: raw.total, products, articles, pages, suggestion: null };
}

// ---------------------------------------------------------------------------------------------
// StorefrontResult helper — one AbortController per watcher, aborted on re-run/teardown; error
// text comes from `EldraHttpError.message` when the gateway itself rejected the request.
// ---------------------------------------------------------------------------------------------

function errorMessage(caught: unknown): string {
  if (caught instanceof EldraHttpError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return 'Something went wrong.';
}

/**
 * The two abilities the app layer lends this file, because both of them are its framework's and
 * this file has none: a keyed fetch the framework awaits while it renders the page, and the page's
 * one volatile refresh after hydration. `app/plugins/eldra-storefront.ts` implements them over
 * Nuxt's `useAsyncData` and `app:mounted`; a spec implements them in a dozen lines; Storybook and
 * the demo storefront pass none at all and every result behaves exactly as it did before any of
 * this existed.
 */
export interface StorefrontRuntime {
  /**
   * Runs a result's *first* load under `key`, so the value is awaited during SSR/prerender, rides
   * to the browser in the page payload, and is read back out of it during hydration without the
   * gateway being called a second time. `null` means "nothing prerendered behind this one" — a
   * result created after hydration — and the result then loads the ordinary way.
   */
  prerender?<T>(key: string, load: () => Promise<T | null>): StorefrontPrerenderHandle<T> | null;
  /** Takes the result into the page's one batched volatile refresh (`refresh.ts`). */
  register?(entry: VolatileRefreshEntry): void;
}

export interface StorefrontPrerenderHandle<T> {
  /**
   * The framework's **settled answer**, known *synchronously* — the hydration payload's own copy.
   * Hydration must paint the prerendered DOM in its first render, and a value that arrives a
   * microtask later arrives after Vue has already matched the server's HTML against an empty page.
   *
   * It is a box rather than the value itself because `null` is an answer: a payload that carries
   * `null` for this key is a read that ran on the server and found nothing — a discontinued
   * product, a collection reference that no longer resolves — and the server painted its
   * "no longer available" line with nothing pending. `{ data: null }` says that; a bare `null`
   * could not be told apart from "no answer yet", which made the browser's first paint the
   * *loading* line over the server's not-found line.
   *
   * `null` therefore means exactly one thing: the load behind the key is still running (every
   * SSR/prerender render, and a hydrating client whose payload has no value for this key).
   */
  answered: { data: T | null } | null;
  /** Settles when the keyed load has finished; already settled for an answered handle. */
  settled: Promise<{ data: T | null; error: string | null }>;
}

/** How a result refreshes its volatile values after hydration — see `refresh.ts`. */
type VolatileRefresh = 'batch' | ((current: unknown) => Promise<VolatileSnapshot[]>);

interface GatewayResultOptions {
  /** The method half of the async-data key: `catalog.product`, `search.run`, … */
  method: string;
  runtime: StorefrontRuntime | undefined;
  /**
   * The active content locale, which is **part of the key**: `/products/x` and `/is-IS/products/x`
   * are one read of one product in two languages, and they must not share a cache entry. Nuxt's
   * payload plugin writes the destination's keys into `nuxtApp.static.data` on every navigation
   * and `useAsyncData` reuses an existing entry for a key it has already seen, so without the
   * locale a shopper switching language would be served the data of the language they left — and,
   * for the tick both pages are mounted, the two would fight over one entry.
   */
  locale?: () => string | undefined;
  /** Arguments that are not reactive sources but still name a different read (`related`'s limit). */
  keyArgs?: readonly unknown[];
  /** Omitted for a result that is not about products (a collection's own info, an order). */
  volatile?: VolatileRefresh;
}

const NOTHING_REVALIDATING: ReadonlySet<VolatileKey> = new Set<VolatileKey>();

/**
 * `storefront:<method>:<stable JSON of args>` — the key the framework caches a result's first load
 * under, and therefore the key its value travels to the browser in. Object keys are sorted so a
 * grid's `{page, pageSize, sort}` does not mint a second key (and a second prerendered copy of the
 * same read) because two call sites happened to spell it in a different order.
 */
function resultKey(method: string, args: readonly unknown[]): string {
  return `storefront:${method}:${stableJson(args)}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, raw: unknown) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const record = raw as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = record[key];
    return sorted;
  });
}

function createGatewayResult<T>(
  sources: Ref<unknown>[],
  resolve: (signal: AbortSignal) => Promise<T | null>,
  options: GatewayResultOptions
): StorefrontResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const pending = ref(true);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Written by the page's refresh (`refresh.ts`) through the entry registered below, and cleared
  // by every load: a reload supersedes a refresh of the values it is replacing.
  const revalidating = ref<ReadonlySet<VolatileKey>>(NOTHING_REVALIDATING);
  /**
   * Bumped by every load, and the one thing that decides which answer is allowed to write.
   * A watcher-scoped `AbortController` cannot do it alone: `refresh()` is a public method a block
   * calls from an event handler, outside any watcher, so nothing ever aborts its controller — a
   * slow manual refresh and a fast reload for changed sources would both write, last one wins,
   * and "last" is whichever request the network happened to answer second. The refresh
   * (`VolatileRefreshEntry.token`) drops its stale answers on the same counter.
   */
  let generation = 0;
  let prerenderable = true;
  /**
   * The first load ran under the framework's prerender, so what this result shows comes from the
   * build and the volatile refresh below is what makes it current again. False for a result
   * created *after* hydration — a client navigation's, a search as the shopper types — which has
   * just read the live values itself and must not cost a batched request for values it already
   * has. Assigned before the first `await` in `load()`, so it is settled by the time the
   * registration below reads it.
   */
  let ranUnderPrerender = false;

  /** Only the newest load may write; an older one has already been superseded. */
  const isCurrent = (mine: number): boolean => generation === mine;

  async function load(): Promise<void> {
    generation += 1;
    const mine = generation;
    loading.value = true;
    revalidating.value = NOTHING_REVALIDATING;
    // `pending` is the skeleton state and nothing else: a read in flight with nothing to show yet.
    // A page that already shows a prerendered product must not flash a skeleton over it
    // (`types.ts`'s prerender contract), and neither must a manual `refresh()` — and once a read
    // has answered, `pending` is false even when the answer was "nothing", or a product that does
    // not exist would leave the block loading for the life of the page.
    pending.value = data.value === null;
    error.value = null;

    const first = prerenderable;
    prerenderable = false;
    const handle =
      first && options.runtime?.prerender !== undefined
        ? options.runtime.prerender<T>(
            resultKey(options.method, [
              ...sources.map((source) => source.value),
              ...(options.keyArgs ?? []),
              ...(options.locale?.() === undefined ? [] : [options.locale()]),
            ]),
            // The framework owns this read — it is keyed, deduplicated and awaited by the render
            // itself — so it is deliberately given a controller nothing aborts. A watcher-scoped
            // one cannot work here: Vue runs an `immediate` watcher once during SSR and then stops
            // it on the spot (`doWatch`, `watchHandle()` under `isInSSRComponentSetup`), which
            // fires every `onWatcherCleanup` before the load has answered. That abort is exactly
            // how a prerendered page used to end up with the skeleton in its HTML. A newer load
            // supersedes this one through `generation` below instead.
            () => resolve(new AbortController().signal)
          )
        : null;

    if (handle !== null) {
      ranUnderPrerender = true;
      // Hydration: the payload's answer, in this same synchronous turn, so the block's first render
      // is the server's render — including an answer of `null`, which leaves this result settled
      // and empty exactly as the server left it (nothing pending, nothing in flight) rather than
      // loading over a page that already says the product is gone.
      if (handle.answered !== null) {
        data.value = handle.answered.data;
        pending.value = false;
        loading.value = false;
      }
      const outcome = await handle.settled;
      if (!isCurrent(mine)) return;
      if (outcome.error === null) data.value = outcome.data;
      else if (data.value === null) error.value = outcome.error;
      pending.value = false;
      loading.value = false;
      return;
    }

    const controller = new AbortController();
    onWatcherCleanup(() => controller.abort(), true);
    try {
      const result = await resolve(controller.signal);
      if (controller.signal.aborted || !isCurrent(mine)) return;
      data.value = result;
    } catch (caught) {
      if (controller.signal.aborted || !isCurrent(mine)) return;
      error.value = errorMessage(caught);
    } finally {
      if (!controller.signal.aborted && isCurrent(mine)) {
        pending.value = false;
        loading.value = false;
      }
    }
  }

  watch(sources, load, { immediate: true, deep: true });

  const volatile = options.volatile;
  // Only a result whose first load went through the prerender takes part in the volatile refresh.
  // That is not an optimisation: the refresher batches by *burst* rather than once per page (see
  // `refresh.ts`), so without this a result created long after hydration would open a batch of its
  // own to re-read values it has just read live.
  if (volatile !== undefined && ranUnderPrerender && options.runtime?.register !== undefined) {
    const entry: VolatileRefreshEntry = {
      read: () => data.value,
      write: (next) => {
        data.value = next as T | null;
      },
      setRevalidating: (keys) => {
        revalidating.value = keys;
      },
      token: () => generation,
    };
    if (volatile !== 'batch') entry.own = volatile;
    options.runtime.register(entry);
  }

  return { data, pending, loading, error, revalidating, refresh: load };
}

// ---------------------------------------------------------------------------------------------
// Cart — createCartSession() for the remembered cart id, client.cart.* for persistence
// ---------------------------------------------------------------------------------------------

/**
 * Where the cart is handed off is the platform's answer, not the theme's: `client.checkout.url`
 * reads it from the platform's own public config (once per client, cached there) and builds
 * `{checkoutUrl}/checkout/{orgId}/{cartId}`. So it is asynchronous, and it can refuse — a platform
 * that published no checkout URL, a read that did not come back — and neither may touch the cart:
 * the URL lands in `checkoutUrl` when it resolves, which is when Check out appears, and a refusal
 * leaves the ref `null`, the cart's own "nowhere to hand this off to" state that
 * `blocks/cart/parts/Summary.vue` and the drawer's foot already key off. An add that succeeded is
 * never reported as failed because the checkout URL did not resolve, and neither is a cart
 * restored from a remembered id.
 *
 * None of it runs on the server or under a prerender, and nothing needs guarding for that: the
 * cart id is browser state (`createCartSession` reads `localStorage`, which the server has none
 * of), so there is no cart to resolve a URL for until the page is in a browser.
 */
function createGatewayCartOps(client: EldraClient): CartOps {
  const session = createCartSession();
  let cartId = session.read();
  const checkoutUrl = ref<string | null>(null);
  // The cart id this has asked about, resolved or still in flight. Every add calls `remember()`, and
  // the hand-off does not change while the cart id does not, so one ask per cart is enough — and two
  // adds landing before the first answer must not fire two. A refusal clears it, so the next add
  // asks again (the SDK does not cache a failed config read either).
  let askedFor: string | null = null;

  function resolveCheckoutUrl(id: string): void {
    if (id === askedFor) return;
    askedFor = id;
    try {
      void client.checkout
        .url({ cartId: id })
        .then((url) => {
          // Not the cart we are on any more (a different id, or none): leave it alone.
          if (id === cartId) checkoutUrl.value = url;
        })
        .catch(() => {
          if (askedFor === id) askedFor = null;
          if (id === cartId) checkoutUrl.value = null;
        });
    } catch {
      // A `checkout.url` that throws *synchronously* — not the SDK's, which is `async`, but a
      // hand-written stand-in or a customer's own client — must not escape into the add that
      // triggered this.
      askedFor = null;
    }
  }

  if (cartId) resolveCheckoutUrl(cartId);

  function remember(id: string): void {
    // A different cart than the one the current URL points at; it is not this cart's hand-off.
    if (id !== cartId) checkoutUrl.value = null;
    cartId = id;
    session.remember(id);
    resolveCheckoutUrl(id);
  }

  return {
    async init() {
      if (!cartId)
        return {
          lines: [],
          totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
        };
      try {
        const raw = (await client.cart.get(cartId)) as unknown as RawCart;
        return mapCart(raw);
      } catch {
        // A remembered cart id the gateway no longer recognises (expired, cleared server-side).
        session.forget();
        cartId = null;
        askedFor = null;
        checkoutUrl.value = null;
        return {
          lines: [],
          totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
        };
      }
    },
    // `productId` and `variantId` are two different ids and the gateway needs both: its cart
    // service reads the pair together (one lookup of "this variant, of this product") and answers
    // 500 for a pair that does not exist. Sending the variant id as both — which is what this did
    // while a list row's `variantId` was really a product id — made every add fail that way.
    async add({ productId, variantId, quantity }) {
      const raw = (await client.cart.addItem({
        cartId: cartId ?? undefined,
        productId,
        variantId,
        quantity,
      })) as unknown as RawCart;
      remember(raw.id);
      return mapCart(raw);
    },
    async setQuantity(lineId, quantity) {
      if (!cartId) throw new Error('No cart to update yet.');
      const raw = (await client.cart.updateItem(cartId, lineId, {
        quantity,
      })) as unknown as RawCart;
      return mapCart(raw);
    },
    async remove(lineId) {
      if (!cartId) throw new Error('No cart to update yet.');
      const raw = (await client.cart.removeItem(cartId, lineId)) as unknown as RawCart;
      return mapCart(raw);
    },
    async applyDiscount(code) {
      if (!cartId) return { ack: { ok: false, reason: 'invalid' } };
      try {
        const result = await client.cart.applyDiscount(cartId, code);
        const applied = (result as unknown as { applied: boolean }).applied;
        const raw = (result as unknown as { cart: RawCart }).cart;
        if (!applied) return { ack: { ok: false, reason: 'invalid' } };
        return { ack: { ok: true }, snapshot: mapCart(raw) };
      } catch {
        return { ack: { ok: false, reason: 'failed' } };
      }
    },
    async removeDiscount() {
      if (!cartId)
        return {
          lines: [],
          totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
        };
      const raw = (await client.cart.removeDiscount(cartId)) as unknown as RawCart;
      return mapCart(raw);
    },
    checkoutUrl,
  };
}

// ---------------------------------------------------------------------------------------------
// Forms / back-in-stock — no gateway endpoint today; post to the plugin-configured endpoint.
// ---------------------------------------------------------------------------------------------

async function postToEndpoint(
  endpoint: string | undefined,
  body: Record<string, unknown>
): Promise<StorefrontAck> {
  if (!endpoint) return { ok: false, reason: 'unsupported' };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.ok ? { ok: true } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// ---------------------------------------------------------------------------------------------
// Gateway filter and sort tokens
// ---------------------------------------------------------------------------------------------

/**
 * The gateway's list endpoints take repeatable `[groupIndex:]field:op:value`
 * filter tokens: that shape, and the fact that `filter` is repeatable while
 * `sort`/`fields` are comma-separated, is what
 * `packages/sdk/src/__tests__/fixtures/web-gateway.json` documents for the
 * `filter` parameter of `GET /catalog/v1/products/list` and
 * `/catalog/v1/collections`. Tokens sharing a `groupIndex` are OR'd; every
 * other token is AND'd. A token the gateway does not accept is a 400, not an
 * empty list.
 *
 * The fixture does **not** document which fields or operators are accepted.
 * The set below (`id`, `slug`, `status`, `createdAt` on a storefront product
 * list, and the `in` operator) is what the gateway accepted when this was
 * written, verified against the deployed service rather than the contract — so
 * every token this file builds is written here, once, where a 400 can be traced
 * to it, rather than at the call sites that used to hand-roll them.
 */
const STATUS_ACTIVE = 'status:eq:ACTIVE';

/**
 * `field:in:a,b,c` — the one token that asks for several values of the same
 * field. The alternative (one `eq` per value) would need the OR-group prefix,
 * since bare tokens are AND'd and `slug:eq:a` AND `slug:eq:b` matches nothing.
 *
 * A value containing a comma or a colon cannot survive the token grammar, so it
 * is dropped rather than sent as something the gateway would read as a
 * different filter. Product and collection handles are slugs; nothing legal is
 * lost.
 */
function inFilter(field: string, values: readonly string[]): string[] {
  const usable = values.filter(
    (value) => value !== '' && !value.includes(',') && !value.includes(':')
  );
  return usable.length === 0 ? [] : [`${field}:in:${usable.join(',')}`];
}

/**
 * The block's own sort ids mapped to the gateway's sort fields, which are the
 * only ones `GET /catalog/v1/collections/{slug}/products` accepts (an unknown
 * one is a 400, exactly like an unknown filter field). `featured` and
 * `best-selling` map to nothing: `featured` *is* the collection's own sort
 * mode, which is what the endpoint already orders by, and the storefront
 * contract exposes no sales figures to sort by.
 */
const GATEWAY_SORT: Readonly<Record<string, string>> = {
  newest: '-createdAt',
  'price-asc': 'minPrice',
  'price-desc': '-minPrice',
};

/**
 * **The one sort id this gateway can never honour, on either list it reads** (`StorefrontCollectionProducts.unsortable`).
 * `best-selling` is absent from `GATEWAY_SORT` above for the same reason it is declared here: the
 * platform gateway's product list carries no sales figures to order by, on the collection-scoped
 * read and the catalogue-wide one alike — unlike `collection`
 * (`COLLECTION_SCOPE_UNFILTERABLE` below), which only one of the two scopes cannot honour. `featured`
 * maps to nothing in `GATEWAY_SORT` too, but it is not unsortable: it *is* the collection's own
 * default order, which the endpoint already answers in.
 */
const GATEWAY_UNSORTABLE: readonly string[] = ['best-selling'];

// ---------------------------------------------------------------------------------------------
// The shopper's facets as the catalog list's own query parameters
// ---------------------------------------------------------------------------------------------

/**
 * **The shopper's filters, as `GET /catalog/v1/collections/{slug}/products` takes them** (contract
 * 3.7.0; the same parameters are on `GET /catalog/v1/products/list`, plus a `collectionId` the
 * collection-scoped read has no use for). One request, filtered and counted by the platform, for
 * the whole collection rather than the page this read happened to fetch.
 *
 * Three conversions are the whole of it, and each is a bug if it is skipped:
 *
 * - **`price` is major units in the URL and minor units in the parameters.** The block's
 *   `"<min>-<max>"` is whole units of the store currency, which is what a shopper typed and what
 *   the chips read back; `minPrice`/`maxPrice` are minor, like the `facets.price` span they are
 *   counted over. So they go through `toMinorUnits` with the store's own fraction digits — ISK has
 *   none, USD two — rather than a hard-coded ×100.
 * - **`category` is a slug in the URL and a uuid in the request.** The block's values are the facet
 *   terms' slugs (a filtered view has to stay linkable and readable), while `categoryId` takes
 *   catalog ids, so the slugs are resolved through the store's own category list — see
 *   `readCategories`.
 * - **`availability` is one value, not a set.** Both boxes ticked is every product, which is no
 *   filter at all, so nothing is sent; one box is sent as the platform's own
 *   `in_stock`/`out_of_stock` spelling, which `canonicalAvailabilityValues` also folds the retired
 *   hyphenated one into.
 *
 * `option` is the one parameter whose grammar is its own: `option=<key>:<value>`, repeated, OR'd
 * within a key and AND'd across keys — which is exactly the panel's own semantics, so the
 * `option:<key>` filter source maps straight onto it.
 *
 * A clause this mapping cannot express is left out rather than guessed at (an unknown category
 * slug, a price bound that is not a number, a `collection` clause on a read that has no
 * `collectionId` parameter — see `collectionProducts`), which is the storefront's standing
 * "unknown, not unmatched" rule: a filter nothing can honour must not empty a shopper's grid.
 */
interface CatalogFilterQuery {
  minPrice?: number;
  maxPrice?: number;
  categoryId?: string[];
  collectionId?: string[];
  availability?: string;
  option?: string[];
}

/**
 * **What a collection's own product list cannot filter by** (`StorefrontCollectionProducts`).
 *
 * `collection`, and only that: there is no `collectionId` parameter on
 * `GET /catalog/v1/collections/{slug}/products`. The scope already *is* one collection, and the
 * parameter the product list has is an OR over a list of ids — so a second id would widen the scope
 * rather than intersect it, and there is no token for the intersection either. The `collections`
 * facet is still answered on that route and still honest: it says which other collections these
 * products are also in, which is worth reading and is not a filter.
 *
 * It is declared rather than silently dropped because the panel has to know: a group whose filter
 * changes the chips, the URL and nothing else is the defect this whole path exists to remove. A read
 * scoped to the **whole catalogue** (`GET /catalog/v1/products/list`, which does take `collectionId`)
 * would declare nothing here; this theme has no faceted grid over it yet.
 */
const COLLECTION_SCOPE_UNFILTERABLE: readonly string[] = ['collection'];

/**
 * **A category page's `categoryId` parameter**: the ids the read should be scoped to, or `null` when
 * the path names no category this store has (which the caller answers as "no such page" rather than
 * as the unscoped catalogue).
 *
 * The platform's `categoryId` matches a whole **subtree**, so the page's own id is the scope and a
 * shopper ticking a child narrows within it. The parameter is an OR over a list, though, so the
 * shopper's clause cannot simply be sent beside the scope: it is **intersected** with the subtree,
 * and a value outside it is dropped rather than allowed to widen the page past its own category. An
 * intersection that comes out empty falls back to the scope's own id — the page unfiltered, which is
 * the honest answer when nothing the shopper asked for is in it.
 */
function scopeCategoryIds(
  index: CategoryIndex,
  categoryPath: string,
  filterQuery: CatalogFilterQuery
): string[] | null {
  const scopeId = index.idByPath.get(categoryPath);
  if (scopeId === undefined) return null;
  const inside = (filterQuery.categoryId ?? []).filter((id) => isInSubtree(index, id, scopeId));
  return inside.length > 0 ? inside : [scopeId];
}

/** `"<min>-<max>"` in whole major units → one bound in minor units, or nothing to send. */
function priceParam(raw: string | undefined, currency: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return toMinorUnits(amount, currency);
}

/**
 * The store's whole category tree — ids, slugs, titles and `parentId` — indexed both ways
 * (`app/storefront/categories.ts`).
 *
 * `GET /catalog/v1/categories` answers the whole list — a storefront's categories are a handful of
 * rows, and the read takes no filter — so one request answers for every slug a shopper can tick and
 * every ancestor a trail can name, now or later. Read once per storefront (see
 * `createGatewayStorefront`), which means a shopper arriving on a shared `?category=ceramics` link
 * pays for it once and nobody else pays at all.
 *
 * Three readers, and they want different halves of it: the `category` filter resolves slugs to the
 * `categoryId` the list takes (`idBySlug`), `catalog.product` walks a product's `primaryCategoryId`
 * up to its root for the breadcrumb trail, and the collection grid's category facet borrows the tree
 * to place and name the parent rows the platform's own counts never mention.
 *
 * **It carries no abort signal**, deliberately, because its answer belongs to every read rather than
 * to the one that happened to ask first: a shopper ticking a second category while the first read is
 * still resolving aborts that read, and a lookup tied to its signal would reject in the hands of the
 * read that replaced it — an error over a page whose filter was perfectly answerable. It is one
 * small request that finishes on its own.
 *
 * A failure is swallowed by its two *decorative* readers and by neither of the other two. A trail
 * nobody can read is a product page without a category crumb, and a facet tree nobody can read is a
 * flat category group — both are pages. A **filter** that quietly dropped the category the chips, the
 * URL and the active-filter row all say is applied is a lie, so that one fails the collection read,
 * which the block already draws as an error over the last good page.
 */
async function readCategories(client: EldraClient): Promise<CategoryIndex> {
  const rows = (await client.catalog.listCategories({})) as unknown as RawCategory[] | null;
  return buildCategoryIndex(rows);
}

/**
 * The catalog ids of some collection slugs, asked for by slug in one `slug:in:a,b` token.
 *
 * Unlike the categories, this is **not** read whole: a store's collections are a merchandising list
 * that grows without bound, while its categories are a handful of rows, and only the slugs a shopper
 * actually ticked are needed. A slug nothing matches is simply absent from the answer, which the
 * caller then leaves out of the request — the standing "unknown, not unmatched" rule.
 */
async function readCollectionIds(
  client: EldraClient,
  slugs: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  const filter = inFilter('slug', [...slugs]);
  const out = new Map<string, string>();
  if (filter.length === 0) return out;
  const raw = (await client.catalog.listCollections({
    pageSize: slugs.length,
    filter,
  })) as unknown as { data?: RawCollectionItem[] | null };
  for (const row of raw.data ?? []) {
    if (typeof row.slug === 'string' && row.slug !== '' && typeof row.id === 'string') {
      out.set(row.slug, row.id);
    }
  }
  return out;
}

/**
 * `filters` as the catalog list takes it. `categoriesOnce` is only awaited when there is a
 * category clause to resolve, so an unfiltered read — and every filtered read that touches no
 * category — makes exactly the one request it always made.
 */
async function catalogFilterQuery(
  filters: Record<string, string[]> | undefined,
  currency: string | undefined,
  categoriesOnce: () => Promise<CategoryIndex>,
  /**
   * Collection slugs → catalog ids, for a scope whose read **takes** a `collectionId`: the
   * catalogue-wide product list does, a collection's own product list does not (see
   * `COLLECTION_SCOPE_UNFILTERABLE`). Omitted, a `collection` clause is left out of the request
   * exactly as it always was.
   */
  collectionIdsFor?: (slugs: readonly string[]) => Promise<ReadonlyMap<string, string>>
): Promise<CatalogFilterQuery> {
  const query: CatalogFilterQuery = {};
  if (filters === undefined) return query;
  const option: string[] = [];
  for (const [source, selected] of Object.entries(filters)) {
    if (selected.length === 0) continue;
    if (source === 'price') {
      const [min = '', max = ''] = (selected[0] ?? '').split('-');
      const minPrice = priceParam(min, currency);
      const maxPrice = priceParam(max, currency);
      if (minPrice !== undefined) query.minPrice = minPrice;
      if (maxPrice !== undefined) query.maxPrice = maxPrice;
      continue;
    }
    if (source === 'availability') {
      const known = canonicalAvailabilityValues(selected);
      // Both values is every product: no parameter, so the request is identical to an unfiltered
      // one — and the platform never spends the cross-service stock read on a filter that excludes
      // nothing.
      if (known.length === 1) query.availability = known[0];
      continue;
    }
    if (source === 'category') {
      const { idBySlug } = await categoriesOnce();
      const matched = selected
        .map((slug) => idBySlug.get(slug))
        .filter((id): id is string => id !== undefined);
      if (matched.length > 0) query.categoryId = matched;
      continue;
    }
    if (source.startsWith(OPTION_SOURCE_PREFIX)) {
      const key = source.slice(OPTION_SOURCE_PREFIX.length);
      if (key === '') continue;
      for (const value of selected) {
        if (value !== '') option.push(`${key}:${value}`);
      }
      continue;
    }
    if (source === 'collection') {
      // Only where the scope's own read takes the parameter. A collection cannot narrow a
      // collection's own products (see `collectionProducts`), and that scope passes no resolver, so
      // the clause is dropped there rather than sent as something that would widen the scope.
      if (collectionIdsFor === undefined) continue;
      const ids = await collectionIdsFor(selected);
      const matched = selected
        .map((slug) => ids.get(slug))
        .filter((id): id is string => id !== undefined);
      if (matched.length > 0) query.collectionId = matched;
      continue;
    }
    // A source some other theme invented lands here.
  }
  if (option.length > 0) query.option = option;
  return query;
}

/**
 * The response's `facets` object as the view type the filter panel reads (`CatalogFacets`), or
 * `undefined` for a gateway that answered none — which the panel draws as the groups it can fill
 * without values, never as a scope with nothing in it.
 *
 * Only two things happen here. `price` is converted from the platform's minor units to the major
 * units every money field in `types.ts` carries (`fromMinorUnits`), and the two objects the platform
 * may **omit** are carried over only when it sent them, because in both cases an absence is a
 * different answer from a zero:
 *
 * - no `availability` means stock could not be read at all, not that nothing is in stock, and the
 *   panel hides that group rather than offering a filter whose counts are unknown;
 * - no `price` means the scope minus the price filter held nothing to span, not that everything in it
 *   is free. A 0–0 span is a dead track labelled in the store's currency, and writing one would also
 *   suppress the panel's own fallback — the widest span it has seen for this collection — which is
 *   written for exactly this case.
 */
function mapFacets(
  raw: RawProductFacets | null | undefined,
  currency: string | undefined
): CatalogFacets | undefined {
  if (raw === null || raw === undefined) return undefined;
  const price = raw.price;
  const availability = raw.availability;
  // **The one signal that says whose tree and whose counts these are.** Contract 3.8.0 adds
  // `parentId` on a category term and the ancestor roll-ups together, so a term that can place itself
  // is a term that has already been counted up — and the panel must not sum on top of that, since the
  // platform's number is deduplicated and a sum over siblings is not (a product in Cups and in Bowls
  // is one product and two counts).
  //
  // 3.8.0 omits `parentId` for a **root**, so a scope whose categories are all roots carries none and
  // reads here as unplaced — which costs the category read below and changes nothing else: a family
  // with no parent/child pair has nothing to place and nothing to roll up either way. Every tree with
  // an actual child carries that child's `parentId`, and a reported child's parent is always in the
  // same list, so there is no partial placement to get wrong.
  const placed = (raw.categories ?? []).some((term) => term.parentId !== undefined);
  return {
    ...(price === null || price === undefined
      ? {}
      : {
          price: {
            min: fromMinorUnits(price.min ?? 0, currency),
            max: fromMinorUnits(price.max ?? 0, currency),
          },
        }),
    categories: mapFacetTerms(raw.categories, placed),
    ...(placed ? { categoryCounts: 'rolled-up' as const } : {}),
    collections: mapFacetTerms(raw.collections),
    ...(availability === null || availability === undefined
      ? {}
      : {
          availability: {
            in_stock: availability.in_stock ?? 0,
            out_of_stock: availability.out_of_stock ?? 0,
          },
        }),
    options: (raw.options ?? [])
      .filter((option) => typeof option.key === 'string' && option.key !== '')
      .map((option) => ({
        key: option.key!,
        name: option.name ?? option.key!,
        values: (option.values ?? [])
          .filter((value) => typeof value.value === 'string' && value.value !== '')
          .map((value) => ({
            value: value.value!,
            label: value.label ?? value.value!,
            ...(value.swatch === undefined ? {} : { swatch: value.swatch }),
            count: value.count ?? 0,
          })),
      })),
  };
}

/**
 * `placed` carries the platform's own `parentId` through (categories only), **normalising 3.8.0's
 * absent-means-root into the explicit `null`** this theme's view type uses: once any term in the
 * family is placed, every term in it is, so a root has to say so rather than look unplaced. Outside a
 * placed family the key is deliberately left off — an absent `parentId` means "this source cannot
 * place the term", which the panel renders flat (see `CatalogFacetTerm.parentId`).
 */
function mapFacetTerms(
  raw: RawFacetTerm[] | null | undefined,
  placed = false
): CatalogFacets['categories'] {
  return (raw ?? [])
    .filter((term) => typeof term.slug === 'string' && term.slug !== '')
    .map((term) => ({
      id: term.id ?? term.slug!,
      slug: term.slug!,
      title: term.title ?? term.slug!,
      count: term.count ?? 0,
      ...(placed ? { parentId: term.parentId ?? null } : {}),
    }));
}

// ---------------------------------------------------------------------------------------------
// Collection selectors — a slug goes straight to the gateway, an id needs a lookup first
// ---------------------------------------------------------------------------------------------

/**
 * The slug to ask `/catalog/v1/collections/{slug}/products` for, or `null` when
 * there is nothing to ask about.
 *
 * `{ slug }` needs no lookup. `{ id }` — what a CMS `reference` field stores,
 * and all a depth-0 read or a page builder draft overlay carries — is resolved
 * through the collection list's `filter` query (`field:op:value` tokens), because
 * the gateway has no by-id collection route. A gateway that does not honour the
 * token answers with some other collection or with nothing; either way an
 * unmatched id resolves to `null`, so the block shows its empty state and, in
 * the editor, its "publish to load products" hint — never an error.
 */
async function resolveCollectionSlug(
  client: EldraClient,
  selector: StorefrontCollectionSelector | null,
  signal: AbortSignal
): Promise<string | null> {
  if (selector === null) return null;
  if ('slug' in selector) return selector.slug || null;
  const raw = (await client.catalog.listCollections(
    { limit: 1, filter: [`id:eq:${selector.id}`] },
    { signal }
  )) as unknown as { data?: RawCollectionItem[] | null };
  const match = (raw.data ?? []).find((item) => item.id === selector.id);
  return match?.slug ?? null;
}

/**
 * "More like this", built from what the storefront contract actually offers.
 *
 * There is no relatedness endpoint and no `relatedTo` filter field — the token
 * this used to send was refused outright — so the nearest honest answer is the
 * product's own category: read the product, then ask the product list for that
 * category through the documented `categoryId` query parameter (`GET
 * /catalog/v1/products/list`), with the product itself dropped from the result.
 * A product with no category, or a category with nothing else in it, falls back
 * to the newest active products, which is what the carousel showed before any
 * of this was filtered at all. One extra row is requested so removing the
 * current product still leaves a full carousel.
 */
async function relatedProducts(
  client: EldraClient,
  handle: string | null,
  limit: number,
  signal: AbortSignal
): Promise<StorefrontProductListItem[]> {
  if (!handle) return [];
  const current = (await client.catalog.getProduct(
    handle,
    {},
    { signal }
  )) as unknown as RawProductDetails;
  const categoryId = typeof current.categoryId === 'string' ? current.categoryId : undefined;
  const list = async (query: Record<string, unknown>): Promise<StorefrontProductListItem[]> => {
    const raw = (await client.catalog.listProducts(
      { pageSize: limit + 1, sort: ['-createdAt'], filter: [STATUS_ACTIVE], ...query },
      { signal }
    )) as unknown as RawProductList;
    return (raw.data ?? [])
      .filter((item) => item.slug !== handle)
      .slice(0, limit)
      .map(mapProductListItem);
  };
  const sameCategory = categoryId === undefined ? [] : await list({ categoryId });
  return sameCategory.length > 0 ? sameCategory : await list({});
}

/**
 * The batched volatile read behind `catalog.volatileByIds`: the live price, compare-at price,
 * availability and stock line for the products a page is already showing.
 *
 * One products-list request per chunk of ids (`chunkIds`, 50 at a time), each asking for exactly
 * that chunk through a single repeatable `id:in:a,b,c` token — the same `filter` grammar and the
 * same `id` field every other read in this file uses. The rows come back through
 * `mapProductListItem`, so a refreshed price is derived exactly the way the card's prerendered one
 * was (`minPrice`/`compareAtPrice`/`status`) and the two can never disagree about what a price is.
 *
 * **No `status:eq:ACTIVE`.** Every other list read here filters the catalogue down to what a
 * shopper may buy; this one must not. Availability is one of the values being refreshed, so a
 * product that has just gone inactive has to come back *saying so* — filtered out, it would be
 * indistinguishable from a product the refresh could not see, and the page would keep showing it
 * in stock until the next rebuild.
 *
 * A chunk whose ids cannot survive the token grammar makes no request at all: asking without the
 * token would read the whole catalogue and answer with somebody else's products.
 */
async function volatileSnapshots(
  client: EldraClient,
  ids: readonly string[],
  signal?: AbortSignal
): Promise<VolatileSnapshot[]> {
  const rows = await productRowsByIds(client, ids, signal);
  return rows.map((item) => ({
    // Deliberately no `inventory`: the products list carries none, and an absent key means
    // "unknown, keep what the page already shows" rather than "nothing left".
    id: item.productId,
    price: item.price,
    available: item.available,
    stock: item.stock,
  }));
}

/**
 * The catalogue rows for a set of **catalog product ids**, mapped the ordinary way
 * (`mapProductListItem`). One products-list request per chunk of 50 (`chunkIds`), each asking for
 * exactly that chunk through a single repeatable `id:in:a,b,c` token.
 *
 * Shared by the volatile refresh above (which keeps only the volatile values) and by the search
 * enrichment below (which also wants the thumbnail), so a price is derived one way whichever read
 * asked for it. A chunk whose ids cannot survive the token grammar makes no request at all: asking
 * without the token would read the whole catalogue and answer with somebody else's products.
 */
async function productRowsByIds(
  client: EldraClient,
  ids: readonly string[],
  signal?: AbortSignal
): Promise<StorefrontProductListItem[]> {
  const requests = chunkIds(ids)
    .map((chunk) => ({ chunk, filter: inFilter('id', chunk) }))
    .filter(({ filter }) => filter.length > 0)
    .map(async ({ chunk, filter }) => {
      const raw = (await client.catalog.listProducts(
        { pageSize: chunk.length, filter },
        // The page's own refresh passes none (`refresh.ts` owns that life cycle); the search read
        // below passes its own, so a superseded query's request is abandoned with it.
        signal === undefined ? undefined : { signal }
      )) as unknown as RawProductList;
      return raw.data ?? [];
    });
  const pages = await Promise.all(requests);
  return pages.flat().map(mapProductListItem);
}

/**
 * The products a search found, filled in from the catalogue.
 *
 * A search result is a title, a kind and a destination. It carries no money and no image at all, so
 * `mapSearchResponse` has nothing to map either from — and a product row with no price renders as
 * no price (`StorefrontSearchProduct`), a product row with no image as a placeholder. So the
 * catalogue is asked, once, for every product the search found: `productRowsByIds` is the same
 * batched `id:in:` products-list read the volatile refresh uses, and the price that comes back is
 * derived exactly the way a card's prerendered one is (`mapProductListItem`'s
 * `minPrice`/`compareAtPrice`/`status`), so the two can never disagree about what a price is.
 *
 * **It is asked by `sourceId`.** A `PRODUCT` result carries two ids: `id` names the search-index row
 * and `sourceId` names the catalog product. Asking `filter=id:in:<row id>` answers zero rows every
 * time — which is exactly what shipped, and why every suggestion and every search result card went
 * out with no price and no thumbnail while the request itself looked perfectly healthy.
 *
 * Four fields are taken from the catalogue row and the rest of the search result is kept: the title
 * is the index's (it is what the query matched, and what the panel highlights) and the destination
 * is the index's `targetUrl`, already sanitised.
 *
 * It is part of the search read rather than a refresh registered after it, because the refresh
 * cannot reach a search: it only takes results whose first load ran under the prerender
 * (`createGatewayResult`'s `ranUnderPrerender`), and a search the shopper types runs long after
 * hydration. One search, two requests, both awaited before the response is published — a row that
 * appeared priceless and corrected itself a moment later would be a worse answer than a row that
 * arrived right.
 *
 * **Fail-soft, the way every other read here is.** No products in the response, a read that did not
 * come back, or a found id the catalogue did not answer about, all leave that product at
 * `price: null` — which the suggestion panel renders without a price and the results page renders no
 * card for. A zero is never published: suggestions with no price are worth more than suggestions
 * with the wrong one.
 *
 * Only the read itself is inside the `try`, and only a *read* failure is swallowed (`isReadFailure`):
 * a bug in the mapping or the merge must surface as an error, not as a page where every row quietly
 * lost its price. An abort needs no handling beyond not throwing — the caller drops the whole answer
 * when its signal fired.
 */
async function enrichedSearchResponse(
  client: EldraClient,
  response: StorefrontSearchResponse,
  signal: AbortSignal
): Promise<StorefrontSearchResponse> {
  const ids = collectVolatileTargets(response);
  if (ids.length === 0) return response;
  let rows: StorefrontProductListItem[];
  try {
    rows = await productRowsByIds(client, ids, signal);
  } catch (caught) {
    if (!isReadFailure(caught)) throw caught;
    if (!isAbort(caught)) {
      console.warn('[eldra] search results could not be priced:', errorMessage(caught));
    }
    return response;
  }
  if (rows.length === 0) return response;
  const byId = new Map(rows.map((row) => [row.productId, row]));
  return {
    ...response,
    products: response.products.map((product) => {
      const row = byId.get(product.productId);
      if (row === undefined) return product;
      return {
        ...product,
        price: row.price,
        featuredImage: row.featuredImage ?? null,
        available: row.available,
        stock: row.stock,
      };
    }),
  };
}

/** A superseded query's own request being dropped — `AbortController.abort()` reaches `fetch` as a
 *  `DOMException` named `AbortError` in every runtime this theme runs in. */
function isAbort(caught: unknown): boolean {
  return caught instanceof Error && caught.name === 'AbortError';
}

/**
 * Whether a rejection from a gateway read is the **read** failing — something a storefront degrades
 * around — rather than a bug in this file, which must not be swallowed into a silently priceless
 * page.
 *
 * `EldraHttpError` is the gateway refusing or erroring, and an abort is a request this code dropped
 * on purpose. A `TypeError` is what `fetch` itself rejects with when the call never completed
 * (offline, DNS, CORS); it is also the shape of an ordinary programming mistake, so it counts as a
 * read failure *and* is warned about rather than passing unnoticed. Everything else —
 * `ReferenceError`, `RangeError`, `SyntaxError`, a thrown non-error — is this code being wrong, and
 * is re-thrown.
 */
function isReadFailure(caught: unknown): boolean {
  return caught instanceof EldraHttpError || isAbort(caught) || caught instanceof TypeError;
}

/**
 * The product detail page's own volatile refresh — the one result that cannot go through the
 * batched read. The batch answers from the products list, which carries no inventory at all, and
 * the one page in the theme whose stock line is about a *variant* is this one, so it re-reads its
 * own product: that read is the only one that knows the variant-level `inventory`.
 *
 * The snapshot is keyed by the id the page is *showing*, not by the fresh read's own `productId`:
 * they are the same id in every ordinary case, and keying by the fresh one would answer about a
 * product the page cannot find whenever they are not.
 */
async function detailSnapshots(
  client: EldraClient,
  handle: string | null,
  current: unknown
): Promise<VolatileSnapshot[]> {
  const [id] = collectVolatileTargets(current);
  if (handle === null || handle === '' || id === undefined) return [];
  const raw = (await client.catalog.getProduct(handle, {})) as unknown as RawProductDetails;
  // The refresh is the half of the design that matters on a prerendered page: the build-time read
  // gave the stock the product had when the page was generated, and this corrects it after mount.
  // No category tree: this read is for the refresh's four volatile values and nothing else, and a
  // trail is content — it is already on the page from the build (`VolatileKey`).
  const fresh = mapProductDetails(raw, await readStock(client, raw), null);
  return [
    {
      id,
      price: fresh.price,
      available: fresh.available,
      stock: fresh.stock,
      inventory: fresh.inventory,
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// createGatewayStorefront
// ---------------------------------------------------------------------------------------------

export interface GatewayStorefrontOptions {
  route: StorefrontRoute;
  formsEndpoint?: string;
  /**
   * What the store sells in (`StorefrontCommerce`) — the platform's own answer, which only the app
   * layer can read (`app/plugins/eldra-storefront.ts`, off the runtime config). Omitted — a
   * Storybook story, a spec that only wants a mapping — the storefront reports `null`, and every
   * price renders as a number with no symbol.
   */
  commerce?: StorefrontCommerce | null;
  /**
   * The app layer's prerender/refresh abilities. Omitted — Storybook, a spec that only wants a
   * mapping — every result loads client-side the way it always did, and nothing refreshes.
   */
  runtime?: StorefrontRuntime;
  /**
   * The active content locale, read fresh on every call (`app/plugins/eldra-storefront.ts` derives
   * it from the route, so it follows a language switch). Every catalog, search and order read goes
   * out with it, and it is part of each result's cache key — see `withContentLocale` and
   * `GatewayResultOptions.locale`. Omitted — a story, a mapping spec, a single-locale store — and
   * nothing changes: no `locale` parameter and no key suffix, exactly as before.
   */
  locale?: () => string | undefined;
}

/**
 * The same client, with the active content locale on every read whose answer is **text a merchant
 * wrote**: products, collections, categories, search, an order's line titles.
 *
 * Wrapped once here rather than threaded through the twenty-odd call sites below — including the
 * module-level helpers that take a `client` of their own — because the rule is one rule, and a
 * read that forgot it would silently serve a visitor on `/is-IS/...` the default language's copy
 * while everything around it was translated. A caller that passes its own `locale` still wins;
 * nothing in this file does, and that is the escape hatch for a read that must not be localized.
 *
 * `inventory` is deliberately untouched: stock counts carry no language.
 */
function withContentLocale(client: EldraClient, locale: () => string | undefined): EldraClient {
  const q = <T extends object | undefined>(options: T): T => {
    const value = locale();
    return (value === undefined ? options : { locale: value, ...(options ?? {}) }) as T;
  };
  const catalog = client.catalog;
  const orders = client.orders;
  return {
    ...client,
    catalog: {
      ...catalog,
      listProducts: (options, context) => catalog.listProducts(q(options), context),
      getProduct: (productId, options, context) =>
        catalog.getProduct(productId, q(options), context),
      listCategories: (options, context) => catalog.listCategories(q(options), context),
      listCollections: (options, context) => catalog.listCollections(q(options), context),
      getCollection: (slug, options, context) => catalog.getCollection(slug, q(options), context),
      listCollectionProducts: (slug, options, context) =>
        catalog.listCollectionProducts(slug, q(options), context),
      search: (query, options, context) => catalog.search(query, q(options), context),
    },
    orders: {
      ...orders,
      get: (orderId, options, context) => orders.get(orderId, q(options), context),
    },
  };
}

export function createGatewayStorefront(
  rawClient: EldraClient,
  options: GatewayStorefrontOptions
): StorefrontSource {
  const runtime = options.runtime;
  const locale = options.locale;
  // Every read below — and every module-level helper it hands this client to — carries the page's
  // content locale. See `withContentLocale`.
  const client = locale === undefined ? rawClient : withContentLocale(rawClient, locale);
  // What the store sells in, which is the scale every price parameter and the facets' own span are
  // expressed in (`CatalogFilterQuery`, `mapFacets`). `undefined` for a store that published none —
  // the same answer `<Price>` renders a plain number for, and the same two-decimal fallback.
  const currency = options.commerce?.currency;

  /**
   * The store's category tree, read at most once for the life of this storefront and only when
   * something actually needs it: a category filter to resolve, a product page's breadcrumb trail, or
   * a category facet the platform could not place its own terms in (`readCategories`).
   *
   * The in-flight read is what is cached, so a product page and a grid asking at once share one
   * request; a failure drops the cache so the next read tries again rather than inheriting the first
   * one's error. Which callers swallow that failure and which let it through is on `readCategories`.
   *
   * It is read on the **server** during a prerender, inside the same `useAsyncData` the product or
   * collection read runs under, so a generated product page carries its trail in the page payload
   * and the browser fetches nothing to draw the crumb.
   */
  let categories: Promise<CategoryIndex> | null = null;
  const categoriesOnce = (): Promise<CategoryIndex> => {
    categories ??= readCategories(client).catch((caught: unknown) => {
      categories = null;
      throw caught;
    });
    return categories;
  };

  /**
   * Collection slugs → catalog ids, memoised for the life of this storefront, asked for only the
   * slugs it does not already know (`readCollectionIds`). The catalogue-wide read is the only scope
   * whose `collection` clause goes out as a parameter, and a shopper ticking a third collection
   * should not re-ask about the two already resolved.
   */
  const collectionIds = new Map<string, string>();
  const collectionIdsFor = async (
    slugs: readonly string[]
  ): Promise<ReadonlyMap<string, string>> => {
    const missing = slugs.filter((slug) => slug !== '' && !collectionIds.has(slug));
    if (missing.length > 0) {
      for (const [slug, id] of await readCollectionIds(client, missing)) {
        collectionIds.set(slug, id);
      }
    }
    return collectionIds;
  };

  /**
   * One read, two scopes. `collectionProducts` asks a collection's own product list and
   * `products` asks the catalogue-wide one; what differs is the endpoint, the `collection`
   * clause (a parameter on one, nothing to send on the other) and therefore `unfilterable`.
   * Everything a shopper can see — the filtered page, the filtered `total`, the facets the panel
   * draws from, the category tree completed into them — is the same code on purpose, because the
   * same block renders both.
   */
  const productListResult = (
    /**
     * **Every source this result is keyed by**, which is the whole of why it is a parameter: the key
     * is how the hydrating browser finds the value the build left for it, so a collection-scoped read
     * is keyed by its selector as well as its options and the catalogue-wide one by its options
     * alone. Dropping the selector made two different collections on one page share a key.
     */
    sources: Array<Ref<unknown>>,
    opts: Ref<{
      page: number;
      pageSize: number;
      sort?: string;
      filters?: Record<string, string[]>;
      /** A category page's own scope — the catalogue-wide read only; see
       *  `StorefrontCatalog.products`. */
      categoryPath?: string;
    }>,
    scope: {
      method: string;
      /** `null` for the catalogue-wide read; a slug resolver for a collection-scoped one. */
      slug: (signal: AbortSignal) => Promise<string | null | false>;
      unfilterable?: readonly string[];
      unsortable?: readonly string[];
      collectionIdsFor?: (slugs: readonly string[]) => Promise<ReadonlyMap<string, string>>;
    }
  ): StorefrontResult<StorefrontCollectionProducts> =>
    createGatewayResult(
      sources,
      async (signal) => {
        const slug = await scope.slug(signal);
        if (slug === null) return null;
        const { page, pageSize, sort, filters, categoryPath } = opts.value;
        const gatewaySort = sort === undefined ? undefined : GATEWAY_SORT[sort];
        // The shopper's facets are the endpoint's own query parameters (contract 3.7.0, see
        // `CatalogFilterQuery`), so one request answers the filtered page, the filtered `total`
        // and — with `facets=true` — the counts the panel draws its groups from, over the whole
        // scope rather than the rows this read could reach.
        const filterQuery = await catalogFilterQuery(
          filters,
          currency,
          categoriesOnce,
          scope.collectionIdsFor
        );
        if (categoryPath !== undefined && categoryPath !== '') {
          // **A category page's own scope**, resolved after the shopper's filters so the two can be
          // intersected rather than OR-ed: `categoryId` is an OR over a list, so a ticked value
          // outside this subtree would widen the page past its own category. A path no category
          // occupies answers `null` — the grid's empty state — never the unscoped catalogue.
          const scoped = scopeCategoryIds(await categoriesOnce(), categoryPath, filterQuery);
          if (scoped === null) return null;
          filterQuery.categoryId = scoped;
        }
        const query = {
          page,
          pageSize,
          sort: gatewaySort === undefined ? undefined : [gatewaySort],
          ...filterQuery,
          facets: true,
        };
        const raw = (slug === false
          ? await client.catalog.listProducts(
              // The catalogue-wide list answers every product the merchant has, drafts included,
              // unless it is told otherwise — the collection route filters by status itself.
              { ...query, filter: [STATUS_ACTIVE] },
              { signal }
            )
          : await client.catalog.listCollectionProducts(slug, query, {
              signal,
            })) as unknown as RawProductList;
        // The facets pass through as the platform sent them. A family it did not place and did not
        // count up is **not** completed from the category list here: a synthesised parent row is a
        // filter such a gateway cannot honour, and the panel keeps that family flat instead (see
        // `parts/groups.ts`'s `rawValuesFor`). The only thing the category read is spent on is a
        // `category` *filter*'s slug→id lookup and a product's breadcrumb trail.
        const facets = mapFacets(raw.facets, currency);
        return {
          items: (raw.data ?? []).map(mapProductListItem),
          total: raw.meta.total,
          ...(scope.unfilterable === undefined ? {} : { unfilterable: scope.unfilterable }),
          ...(scope.unsortable === undefined ? {} : { unsortable: scope.unsortable }),
          ...(facets === undefined ? {} : { facets }),
        };
      },
      { method: scope.method, runtime, locale, volatile: 'batch' }
    );

  const catalog: StorefrontCatalog = {
    product: (handle) =>
      createGatewayResult(
        [handle],
        async (signal) => {
          if (!handle.value) return null;
          const raw = (await client.catalog.getProduct(
            handle.value,
            {},
            { signal }
          )) as unknown as RawProductDetails;
          // Stock and the category tree in parallel: neither needs the other, and the trail must not
          // add a serial round trip to every product page. The tree's failure is swallowed here — a
          // product page without a category crumb is a product page, while a product page that 500s
          // because the category list was unreachable is not — which is the opposite of what the
          // `category` *filter* does with the same read (`readCategories`).
          const [stock, tree] = await Promise.all([
            readStock(client, raw, signal),
            categoriesOnce().catch(() => null),
          ]);
          return mapProductDetails(raw, stock, tree);
        },
        {
          method: 'catalog.product',
          runtime,
          locale,
          volatile: (current) => detailSnapshots(client, handle.value, current),
        }
      ),
    collection: (handle) =>
      createGatewayResult(
        [handle],
        async (signal) => {
          if (!handle.value) return null;
          const raw = (await client.catalog.getCollection(
            handle.value,
            {},
            { signal }
          )) as unknown as RawCollectionItem;
          return mapCollectionItem(raw);
        },
        { method: 'catalog.collection', runtime, locale }
      ),
    /**
     * The category page's own read. There is no endpoint that takes a path — the catalog answers
     * `{id, slug, title, parentId}` rows and no trail — so this is the **whole category list**
     * (already memoised for the trail and the `category` filter, so a category page pays for it
     * once however many blocks ask) walked into a placed category.
     *
     * The failure is **not** swallowed, unlike the trail's: a category page with no category is not
     * a page, so the block's error branch is the honest surface rather than an empty grid under a
     * blank heading.
     */
    category: (path) =>
      createGatewayResult(
        [path],
        async () => {
          if (!path.value) return null;
          return placeCategory(await categoriesOnce(), path.value);
        },
        { method: 'catalog.category', runtime, locale }
      ),
    collectionProducts: (collection, opts) => {
      // `collection` is a source of this result as well as of its key, so a block that re-points the
      // grid at another collection re-reads under a key of its own — which is why the selector is
      // read off `collection.value` inside the fetcher rather than resolved once here.
      const result = productListResult([collection, opts], opts, {
        method: 'catalog.collectionProducts',
        slug: (signal) => resolveCollectionSlug(client, collection.value, signal),
        // The one source this scope cannot narrow by is declared rather than dropped: see
        // `COLLECTION_SCOPE_UNFILTERABLE`.
        unfilterable: COLLECTION_SCOPE_UNFILTERABLE,
        // `best-selling` on this scope too — see `GATEWAY_UNSORTABLE`.
        unsortable: GATEWAY_UNSORTABLE,
      });
      return result;
    },
    // `false` for the slug: not "no scope" (which is `null`, and answers nothing) but "the whole
    // catalogue", which is a different endpoint. Nothing is `unfilterable` here — that list does take
    // a `collectionId`, so the `collection` group filters for real (`StorefrontCatalog.products`).
    // `best-selling` is still `unsortable`, the same as the collection-scoped read: this list has no
    // more sales data to order by than the other one does (`GATEWAY_UNSORTABLE`).
    products: (opts) =>
      productListResult([opts], opts, {
        method: 'catalog.products',
        slug: () => Promise.resolve(false as const),
        collectionIdsFor,
        unsortable: GATEWAY_UNSORTABLE,
      }),
    related: (handle, limit) =>
      createGatewayResult(
        [handle],
        (signal) => relatedProducts(client, handle.value, limit, signal),
        { method: 'catalog.related', runtime, locale, keyArgs: [limit], volatile: 'batch' }
      ),
    byHandles: (handles) =>
      createGatewayResult(
        [handles],
        async (signal) => {
          const filter = inFilter('slug', handles.value);
          if (filter.length === 0) return [];
          const raw = (await client.catalog.listProducts(
            { pageSize: handles.value.length, filter: [...filter, STATUS_ACTIVE] },
            { signal }
          )) as unknown as RawProductList;
          return (raw.data ?? []).map(mapProductListItem);
        },
        { method: 'catalog.byHandles', runtime, locale, volatile: 'batch' }
      ),
    volatileByIds: (ids) => volatileSnapshots(client, ids),
    notifyBackInStock: (input) =>
      postToEndpoint(options.formsEndpoint, { kind: 'notifyBackInStock', ...input }),
  };

  const search: StorefrontSearch = {
    run: (query) =>
      createGatewayResult(
        [query],
        async (signal) => {
          if (!query.value)
            return {
              query: query.value,
              total: 0,
              products: [],
              articles: [],
              pages: [],
              suggestion: null,
            };
          const raw = (await client.catalog.search(
            query.value,
            {},
            { signal }
          )) as unknown as RawSearchResponse;
          // The search index carries neither prices nor images; `enrichedSearchResponse` reads
          // both from the catalogue before this result is published. See its own comment.
          return await enrichedSearchResponse(client, mapSearchResponse(raw, query.value), signal);
        },
        { method: 'search.run', runtime, locale }
      ),
  };

  const orders: StorefrontOrders = {
    current: (token) =>
      createGatewayResult(
        [token],
        async (signal) => {
          if (!token.value) return null;
          const raw = (await client.orders.get(token.value, {}, { signal })) as unknown as RawOrder;
          return mapOrder(raw);
        },
        { method: 'orders.current', runtime, locale }
      ),
  };

  const forms: StorefrontForms = {
    subscribe: (input) => postToEndpoint(options.formsEndpoint, { kind: 'subscribe', ...input }),
    sendMessage: (input) =>
      postToEndpoint(options.formsEndpoint, { kind: 'sendMessage', ...input }),
  };

  return {
    ready: ref(true),
    commerce: options.commerce ?? null,
    route: options.route,
    catalog,
    cart: createCartStore(createGatewayCartOps(client)),
    search,
    orders,
    forms,
    wishlist: createWishlistStore(),
    history: createHistoryStore(),
  };
}
