import { onWatcherCleanup, ref, watch, type Ref } from 'vue';
import { createCartSession, EldraHttpError, type EldraClient } from '@eldrajs/sdk';
import { safeHref } from '../utils/links';
import { createCartStore, type CartOps, type CartSnapshot } from './cart';
import { createHistoryStore, createWishlistStore } from './history';
import type {
  StorefrontAck,
  StorefrontCartLine,
  StorefrontCartTotals,
  StorefrontCatalog,
  StorefrontCollectionInfo,
  StorefrontCollectionSelector,
  StorefrontFacet,
  StorefrontForms,
  StorefrontMedia,
  StorefrontOrder,
  StorefrontOrders,
  StorefrontProduct,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontRoute,
  StorefrontSearch,
  StorefrontSearchResponse,
  StorefrontSource,
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

interface RawProductOptionSwatchValue {
  key: string;
  name: string;
}

interface RawProductOptionSwatch {
  key: string;
  values?: RawProductOptionSwatchValue[] | null;
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
  options?: RawProductOptionSwatch[] | null;
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
  description?: Record<string, unknown>;
  mediaLinks?: RawMediaItem[] | null;
  options?: RawProductOption[] | null;
  variants?: RawProductVariant[] | null;
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
}

interface RawSearchResult {
  id: string;
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
// Mapping — raw gateway JSON → this theme's view types (all money in minor units already)
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
    stock: raw.status === 'ACTIVE' ? 'in' : 'out',
    available: raw.status === 'ACTIVE',
    variantId: raw.id,
  };
}

function mapProductDetails(raw: RawProductDetails): StorefrontProduct {
  const variants = raw.variants ?? [];
  const firstAvailable = variants.find((variant) => variant.status === 'ACTIVE') ?? variants[0];
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
            variant.status === 'ACTIVE' &&
            (variant.optionValues ?? []).some((ov) => ov.optionValueId === value.id)
        ),
      })),
    })),
    categoryTrail: [],
    description: (() => {
      const text = raw.description?.text;
      return typeof text === 'string' ? text : '';
    })(),
    inventory: null,
    stock: firstAvailable?.status === 'ACTIVE' ? 'in' : 'out',
    available: raw.status === 'ACTIVE',
    variantId: firstAvailable?.id ?? raw.id,
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
    variantId: raw.variantId,
    title: raw.title,
    url: `/products/${raw.productId}`,
    variantLabel,
    quantity: raw.quantity,
    unitPrice: raw.price,
    lineTotal: raw.price * raw.quantity,
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
    variantId: line.variantId ?? line.productId,
    title: line.productName,
    url: `/products/${line.productId}`,
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
 * Every URL in this response is gateway-supplied, so each one goes through `safeHref` here and a
 * result whose `targetUrl` does not survive it is **dropped**, not carried with a placeholder.
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
    const href = safeHref(result.targetUrl);
    return href === null ? [] : [{ result, href }];
  });
  const products: StorefrontProductListItem[] = linkedResults
    .filter(({ result }) => result.kind === 'PRODUCT')
    .map(({ result, href }) => ({
      handle: result.id,
      title: result.title,
      url: href,
      featuredImage: null,
      price: { amount: 0 },
      stock: 'in',
      available: true,
      variantId: result.id,
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

function createGatewayResult<T>(
  sources: Ref<unknown>[],
  resolve: (signal: AbortSignal) => Promise<T | null>
): StorefrontResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const pending = ref(true);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    const controller = new AbortController();
    onWatcherCleanup(() => controller.abort());
    pending.value = true;
    error.value = null;
    try {
      const result = await resolve(controller.signal);
      if (controller.signal.aborted) return;
      data.value = result;
    } catch (caught) {
      if (controller.signal.aborted) return;
      error.value = errorMessage(caught);
    } finally {
      if (!controller.signal.aborted) pending.value = false;
    }
  }

  watch(sources, load, { immediate: true, deep: true });

  return { data, pending, error, refresh: load };
}

// ---------------------------------------------------------------------------------------------
// Cart — createCartSession() for the remembered cart id, client.cart.* for persistence
// ---------------------------------------------------------------------------------------------

function createGatewayCartOps(client: EldraClient, checkoutBaseUrl: string | undefined): CartOps {
  const session = createCartSession();
  let cartId = session.read();
  const checkoutUrl = ref<string | null>(
    cartId ? client.checkout.handoffUrl({ cartId, checkoutUrl: checkoutBaseUrl }) : null
  );

  function remember(id: string): void {
    cartId = id;
    session.remember(id);
    checkoutUrl.value = client.checkout.handoffUrl({ cartId: id, checkoutUrl: checkoutBaseUrl });
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
        return {
          lines: [],
          totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
        };
      }
    },
    async add({ variantId, quantity }) {
      const raw = (await client.cart.addItem({
        cartId: cartId ?? undefined,
        productId: variantId,
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
 * filter tokens (`packages/sdk/src/__tests__/fixtures/web-gateway.json`, the
 * `filter` parameter of `GET /catalog/v1/products/list` and
 * `/catalog/v1/collections`), and refuse — 400, not an empty list — a token
 * whose field is not one the endpoint filters on or whose operator it does not
 * know. Tokens sharing a `groupIndex` are OR'd; every other token is AND'd.
 *
 * Only a handful of fields are filterable on a storefront product list (`id`,
 * `slug`, `status`, `createdAt`), so every token this file builds is written
 * here, once, rather than at the call sites that used to hand-roll them.
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

// ---------------------------------------------------------------------------------------------
// Collection selectors — a slug goes straight to the gateway, an id needs a lookup first
// ---------------------------------------------------------------------------------------------

/**
 * The slug to ask `/catalog/v1/collections/{slug}/products` for, or `null` when
 * there is nothing to ask about.
 *
 * `{ slug }` needs no lookup. `{ id }` — what a CMS `reference` field stores,
 * and all a depth-0 read or a page builder draft overlay carries — is resolved
 * through the collection list's `filter` query (`field:op:value` tokens, the
 * same vocabulary `collectionProducts` uses for its own facet filters), because
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

// ---------------------------------------------------------------------------------------------
// createGatewayStorefront
// ---------------------------------------------------------------------------------------------

export interface GatewayStorefrontOptions {
  route: StorefrontRoute;
  formsEndpoint?: string;
  checkoutUrl?: string;
}

export function createGatewayStorefront(
  client: EldraClient,
  options: GatewayStorefrontOptions
): StorefrontSource {
  const catalog: StorefrontCatalog = {
    product: (handle) =>
      createGatewayResult([handle], async (signal) => {
        if (!handle.value) return null;
        const raw = (await client.catalog.getProduct(
          handle.value,
          {},
          { signal }
        )) as unknown as RawProductDetails;
        return mapProductDetails(raw);
      }),
    collection: (handle) =>
      createGatewayResult([handle], async (signal) => {
        if (!handle.value) return null;
        const raw = (await client.catalog.getCollection(
          handle.value,
          {},
          { signal }
        )) as unknown as RawCollectionItem;
        return mapCollectionItem(raw);
      }),
    collectionProducts: (collection, opts) =>
      createGatewayResult([collection, opts], async (signal) => {
        const slug = await resolveCollectionSlug(client, collection.value, signal);
        if (slug === null) return null;
        const { page, pageSize, sort } = opts.value;
        // No `filter` token is built from `opts.filters`: the shopper's facets
        // (`category`, `option:size`, `price`, `availability`) are not fields
        // this endpoint filters on — it takes `id`, `slug`, `status` and
        // `createdAt` — so every facet the block sent used to make the request
        // a 400. They are dropped until the gateway grows a facet parameter,
        // which is the same reason `facets` below is `[]`; the grid then shows
        // the collection unfiltered rather than an error.
        const gatewaySort = sort === undefined ? undefined : GATEWAY_SORT[sort];
        const raw = (await client.catalog.listCollectionProducts(
          slug,
          {
            page,
            pageSize,
            sort: gatewaySort === undefined ? undefined : [gatewaySort],
          },
          { signal }
        )) as unknown as RawProductList;
        // `dto_ProductListResult` — the contract type behind `GET
        // /catalog/v1/collections/{slug}/products` (checked against
        // `packages/sdk/src/__tests__/fixtures/{web-gateway.json,contract.ts}`, 2026-09-27) —
        // declares only `data`/`meta`. No facets/aggregations field exists on this response today,
        // so there is nothing to map; `facets` stays `[]` until the gateway's contract adds one —
        // documented here rather than left as a silent, unexplained empty array.
        const facets: StorefrontFacet[] = [];
        return { items: (raw.data ?? []).map(mapProductListItem), total: raw.meta.total, facets };
      }),
    related: (handle, limit) =>
      createGatewayResult([handle], (signal) =>
        relatedProducts(client, handle.value, limit, signal)
      ),
    byHandles: (handles) =>
      createGatewayResult([handles], async (signal) => {
        const filter = inFilter('slug', handles.value);
        if (filter.length === 0) return [];
        const raw = (await client.catalog.listProducts(
          { pageSize: handles.value.length, filter: [...filter, STATUS_ACTIVE] },
          { signal }
        )) as unknown as RawProductList;
        return (raw.data ?? []).map(mapProductListItem);
      }),
    notifyBackInStock: (input) =>
      postToEndpoint(options.formsEndpoint, { kind: 'notifyBackInStock', ...input }),
  };

  const search: StorefrontSearch = {
    run: (query) =>
      createGatewayResult([query], async (signal) => {
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
        return mapSearchResponse(raw, query.value);
      }),
  };

  const orders: StorefrontOrders = {
    current: (token) =>
      createGatewayResult([token], async (signal) => {
        if (!token.value) return null;
        const raw = (await client.orders.get(token.value, {}, { signal })) as unknown as RawOrder;
        return mapOrder(raw);
      }),
  };

  const forms: StorefrontForms = {
    subscribe: (input) => postToEndpoint(options.formsEndpoint, { kind: 'subscribe', ...input }),
    sendMessage: (input) =>
      postToEndpoint(options.formsEndpoint, { kind: 'sendMessage', ...input }),
  };

  return {
    ready: ref(true),
    route: options.route,
    catalog,
    cart: createCartStore(createGatewayCartOps(client, options.checkoutUrl)),
    search,
    orders,
    forms,
    wishlist: createWishlistStore(),
    history: createHistoryStore(),
  };
}
