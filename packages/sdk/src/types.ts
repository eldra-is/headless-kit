import type {
  EldraContractBody,
  EldraContractItem as Item,
  EldraContractProp as Prop,
  EldraContractQuery,
  EldraContractResponse,
} from './contract';

export type RuntimeValue<T> = T | (() => T | undefined) | undefined;

export type RuntimeEnv = Record<string, string | boolean | number | undefined>;

export interface EldraRequestContext {
  orgId?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface EldraRequestOptions extends EldraRequestContext {
  method?: string;
  path: string;
  query?: object;
  body?: unknown;
}

export interface EldraHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: BodyInit;
  signal?: AbortSignal;
}

export type EldraHttpClient = <T = unknown>(request: EldraHttpRequest) => Promise<T>;

export interface EldraClientOptions {
  apiBaseUrl?: RuntimeValue<string>;
  orgId?: RuntimeValue<string>;
  /** Sends X-Preview-Token on requests, overriding the same header in headers/context. */
  previewToken?: RuntimeValue<string>;
  env?: RuntimeValue<RuntimeEnv>;
  headers?: RuntimeValue<HeadersInit>;
  httpClient?: EldraHttpClient;
  fetch?: typeof fetch;
  /**
   * Origin of the hosted checkout app, used by `checkout.handoffUrl`. Defaults to
   * `https://checkout.eldra.app` when the API base URL is the default.
   */
  checkoutUrl?: RuntimeValue<string>;
}

export interface EldraPaginationOptions {
  page?: number;
  pageSize?: number;
  limit?: number;
  fields?: string[];
  sort?: string[];
  filter?: string[];
}

export interface EldraCmsListOptions extends EldraPaginationOptions {
  locale?: string;
  depth?: number;
}

export interface EldraCmsGetOptions {
  locale?: string;
  depth?: number;
}

export type EldraCmsGetEntryByUniqueFieldOptions = EldraCmsGetOptions;

export type EldraCmsEntryListDisplayMode = 'GRID' | 'ROW' | 'CAROUSEL' | 'MASONRY' | (string & {});

export interface EldraCmsEntryListFilterCriterion {
  schemaId: string;
  fieldId: string;
  operator: string;
  value: unknown;
}

export interface EldraCmsEntryList {
  schemas?: string[];
  filters?: EldraCmsEntryListFilterCriterion[];
  displayAs?: EldraCmsEntryListDisplayMode;
  orderBy?: string;
  pageSize?: number;
  entries?: unknown;
}

export interface EldraPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface EldraPaginated<Entry = unknown> {
  data: Entry[];
  meta: EldraPageMeta;
}

export type EldraCmsEntryListEntry<List> = List extends {
  entries?: { data: Array<infer Entry> };
}
  ? Entry
  : List extends { entries?: EldraPaginated<infer Entry> }
    ? Entry
    : unknown;

export type EldraCmsResolvedEntryList<List extends EldraCmsEntryList> = Omit<List, 'entries'> & {
  schemas?: string[];
  filters?: EldraCmsEntryListFilterCriterion[];
  displayAs?: EldraCmsEntryListDisplayMode;
  orderBy?: string;
  pageSize?: number;
  entries: EldraPaginated<EldraCmsEntryListEntry<List>>;
};

export type EldraCmsResolveEntryListResponse<Response, List extends EldraCmsEntryList> = [
  Response,
] extends [never]
  ? EldraCmsResolvedEntryList<List>
  : Response;

export interface EldraCmsResolveEntryListOptions {
  locale?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  depth?: number;
  deep?: number;
}

export type EldraCatalogListProductsOptions = EldraContractQuery<
  '/catalog/v1/products/list',
  'get'
>;

export interface EldraCatalogGetProductOptions {
  locale?: string;
}

export type EldraFeature = 'CMS' | 'ECOMMERCE';

export interface EldraOrganizationFeature {
  feature: EldraFeature | string;
  enabled: boolean;
}

export interface EldraOrganizationDetails {
  id: string;
  name: string;
  description?: string;
  features?: EldraOrganizationFeature[];
  paymentProviders?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface EldraOrganizationOptions {
  orgId?: string;
}

export interface EldraFeatureCapabilities {
  cms: boolean;
  catalog: boolean;
  products: boolean;
  ecommerce: boolean;
  features: Partial<Record<EldraFeature, boolean>>;
}

export interface EldraCmsClient {
  list<Response = unknown>(
    schemaApiId: string,
    options?: EldraCmsListOptions,
    context?: EldraRequestContext
  ): Promise<Response>;
  get<Response = unknown>(
    schemaApiId: string,
    entryId: string,
    options?: EldraCmsGetOptions,
    context?: EldraRequestContext
  ): Promise<Response>;
  getEntryByUniqueField<Response = unknown>(
    schemaApiId: string,
    fieldId: string,
    entryIdentifier: string,
    options?: EldraCmsGetEntryByUniqueFieldOptions,
    context?: EldraRequestContext
  ): Promise<Response>;
  resolveEntryList<Response = never, List extends EldraCmsEntryList = EldraCmsEntryList>(
    entryList: List,
    options?: EldraCmsResolveEntryListOptions,
    context?: EldraRequestContext
  ): Promise<EldraCmsResolveEntryListResponse<Response, List>>;
}

export type EldraProductList = EldraContractResponse<'/catalog/v1/products/list', 'get'>;
export type EldraProductListItem = Item<Prop<EldraProductList, 'data'>>;
export type EldraProductDetails = EldraContractResponse<'/catalog/v1/products/{productId}', 'get'>;
export type EldraProductVariant = Item<Prop<EldraProductDetails, 'variants'>>;
export type EldraProductOption = Item<Prop<EldraProductDetails, 'options'>>;
export type EldraProductOptionValue = Item<Prop<EldraProductOption, 'values'>>;
export type EldraProductMediaLink = Item<Prop<EldraProductDetails, 'mediaLinks'>>;
export type EldraProductThumbnail = Prop<EldraProductListItem, 'thumbnail'>;

export interface EldraCatalogClient {
  listProducts<Response = EldraProductList>(
    options?: EldraCatalogListProductsOptions,
    context?: EldraRequestContext
  ): Promise<Response>;
  getProduct<Response = EldraProductDetails>(
    productId: string,
    options?: EldraCatalogGetProductOptions,
    context?: EldraRequestContext
  ): Promise<Response>;
  listCategories(
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCategory[]>;
  listCollections(
    options?: EldraCollectionListOptions,
    context?: EldraRequestContext
  ): Promise<EldraCollectionList>;
  getCollection(
    slug: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCollection>;
  listCollectionProducts(
    slug: string,
    options?: EldraCollectionProductsOptions,
    context?: EldraRequestContext
  ): Promise<EldraProductList>;
  search(
    query: string,
    options?: EldraSearchOptions,
    context?: EldraRequestContext
  ): Promise<EldraSearchResponse>;
}

export interface EldraFeatureClient {
  getOrganization(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrganizationDetails>;
  list(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrganizationFeature[]>;
  isEnabled(
    feature: EldraFeature,
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<boolean>;
  getCapabilities(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraFeatureCapabilities>;
}

export interface EldraClient {
  request<T = unknown>(options: EldraRequestOptions): Promise<T>;
  cms: EldraCmsClient;
  catalog: EldraCatalogClient;
  features: EldraFeatureClient;
  cart: EldraCartClient;
  orders: EldraOrdersClient;
  checkout: EldraCheckoutClient;
  inventory: EldraInventoryClient;
  customer: EldraCustomerClient;
  salesOrders: EldraSalesOrdersClient;
}

export interface EldraLocaleOptions {
  locale?: string;
}

export type EldraCategory = Item<EldraContractResponse<'/catalog/v1/categories', 'get'>>;
export type EldraCollectionList = EldraContractResponse<'/catalog/v1/collections', 'get'>;
export type EldraCollection = EldraContractResponse<'/catalog/v1/collections/{slug}', 'get'>;
export type EldraCollectionListOptions = EldraContractQuery<'/catalog/v1/collections', 'get'>;
export type EldraCollectionProductsOptions = EldraContractQuery<
  '/catalog/v1/collections/{slug}/products',
  'get'
>;
export type EldraSearchOptions = Omit<EldraContractQuery<'/search/v1', 'get'>, 'q'>;
export type EldraSearchResponse = EldraContractResponse<'/search/v1', 'get'>;

export type EldraCart = EldraContractResponse<'/shopping-cart/v1/cart/{cartID}', 'get'>;
export type EldraCartItem = Item<Prop<EldraCart, 'items'>>;
export type EldraCartTotals = Prop<EldraCart, 'totals'>;
export type EldraAddCartItemInput = EldraContractBody<'/shopping-cart/v1/cart/items', 'post'>;

export interface EldraDiscountResult {
  cart: EldraCart;
  /** The server drops a code it will not honour, so the returned cart is the verdict. */
  applied: boolean;
}

export type EldraOrder = EldraContractResponse<'/order/v1/{orderId}', 'get'>;
export type EldraOrderLine = Item<Prop<EldraOrder, 'orderLines'>>;
export type EldraRecoveredBasket = EldraContractResponse<'/order/v1/recover', 'post'>;
export type EldraRecoveredBasketItem = Item<Prop<EldraRecoveredBasket, 'items'>>;

export interface EldraOrderReadOptions {
  /** The one-time token returned when the order was created. Required unless the caller owns the order. */
  accessToken?: string;
}

export type EldraStockAvailabilityInput = Item<
  Prop<EldraContractBody<'/inventory/v1/stock/availability', 'post'>, 'items'>
>;
export type EldraStockAvailability = EldraContractResponse<
  '/inventory/v1/stock/availability',
  'post'
>;
export type EldraStockAvailabilityItem = Item<Prop<EldraStockAvailability, 'items'>>;

export interface EldraCheckoutHandoffOptions {
  cartId: string;
  locale?: string;
  checkoutUrl?: string;
  orgId?: string;
}

export interface EldraCartClient {
  addItem(input: EldraAddCartItemInput, context?: EldraRequestContext): Promise<EldraCart>;
  get(
    cartId: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  updateItem(
    cartId: string,
    itemId: string,
    input: { quantity: number },
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  removeItem(cartId: string, itemId: string, context?: EldraRequestContext): Promise<EldraCart>;
  applyDiscount(
    cartId: string,
    code: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraDiscountResult>;
  removeDiscount(
    cartId: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
}

export interface EldraOrdersClient {
  get(
    orderId: string,
    options?: EldraOrderReadOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrder>;
  recover(token: string, context?: EldraRequestContext): Promise<EldraRecoveredBasket>;
}

export interface EldraCheckoutClient {
  /** Where a storefront sends the customer: `{checkoutUrl}/checkout/{orgId}/{cartId}`. */
  handoffUrl(options: EldraCheckoutHandoffOptions): string;
}

export type EldraCustomerMe = EldraContractResponse<'/customer/v1/me', 'get'>;
export type EldraShopUser = Prop<EldraCustomerMe, 'shopUser'>;
export type EldraCustomerMembership = Item<Prop<EldraCustomerMe, 'memberships'>>;

export interface EldraCustomerClient {
  /**
   * The signed-in business customer and their company memberships. Pass the shop-realm access
   * token in `context.headers`, for example `bearer(accessToken)`. Rejects with `EldraHttpError`,
   * branch on `errorId`:
   * - 401 `SHOP_TOKEN_INVALID`: the token is missing, expired or not from this shop realm; refresh
   *   or sign in again.
   * - 403 `SHOP_NO_MEMBERSHIP`: the login buys for no customer company.
   * - 403 `FEATURE_DISABLED`: the organisation has business sales turned off.
   * - 503 `SHOP_LOGIN_UNAVAILABLE`: the login service is unreachable; try again.
   */
  me(context?: EldraRequestContext): Promise<EldraCustomerMe>;
  /**
   * The active company's delivery locations as `{ data }`, the default first; `data` is `[]` for a
   * company with none.
   * Pass `customerHeaders(accessToken, customerId)` as `context.headers`. Server-side only. Refusals
   * are the sign-in's: 401 `SHOP_TOKEN_INVALID`, 403 `SHOP_NO_MEMBERSHIP`, `FEATURE_DISABLED`,
   * `SHOP_CUSTOMER_NOT_MEMBER`, 409 `SHOP_CUSTOMER_REQUIRED`, 503 `SHOP_LOGIN_UNAVAILABLE`.
   */
  locations(context?: EldraRequestContext): Promise<EldraCustomerLocationList>;
}

export type EldraCustomerLocationList = EldraContractResponse<'/customer/v1/locations', 'get'>;
export type EldraCustomerLocation = Item<Prop<EldraCustomerLocationList, 'data'>>;

export type EldraSalesOrderPreviewInput = EldraContractBody<'/sales-order/v1/preview', 'post'>;
export type EldraSalesOrderPreview = EldraContractResponse<'/sales-order/v1/preview', 'post'>;
export type EldraSalesOrderPreviewLine = Item<Prop<EldraSalesOrderPreview, 'lines'>>;
export type EldraSalesOrderCredit = Prop<EldraSalesOrderPreview, 'credit'>;
export type EldraCreateSalesOrderInput = EldraContractBody<'/sales-order/v1', 'post'>;
export type EldraSalesOrder = EldraContractResponse<'/sales-order/v1/{salesOrderId}', 'get'>;
export type EldraSalesOrderLine = Item<Prop<EldraSalesOrder, 'lines'>>;
export type EldraSalesOrderWarning = Item<Prop<EldraSalesOrder, 'warnings'>>;
export type EldraSalesOrderDelivery = Prop<EldraSalesOrder, 'delivery'>;
export type EldraSalesOrderStatus = Prop<EldraSalesOrder, 'salesStatus'>;
export type EldraSalesOrderList = EldraContractResponse<'/sales-order/v1', 'get'>;
export type EldraSalesOrderListItem = Item<Prop<EldraSalesOrderList, 'data'>>;
export type EldraSalesOrderListOptions = EldraContractQuery<'/sales-order/v1', 'get'>;

export interface EldraCreateSalesOrderOptions {
  /**
   * Required. Mint one per attempt to place the order (a random UUID), keep it across retries of
   * that attempt, and mint a new one when the cart or the form changes. The same key replays the
   * first order rather than placing a second; a different body under it is 409
   * `ORDER_IDEMPOTENCY_CONFLICT`.
   */
  idempotencyKey: string;
}

/** Error ids of the business sign-in, on every route that takes a shop token. */
export type EldraShopErrorId =
  | 'SHOP_TOKEN_INVALID'
  | 'SHOP_NO_MEMBERSHIP'
  | 'SHOP_CUSTOMER_NOT_MEMBER'
  | 'SHOP_CUSTOMER_REQUIRED'
  | 'SHOP_LOGIN_UNAVAILABLE'
  | 'FEATURE_DISABLED';

/**
 * Error ids of the sales-order routes (contract 2.18.0). `SALES_ORDER_CART_ALREADY_ORDERED`
 * carries `errors.salesOrderId`, `SALES_ORDER_LINE_INVALID` `errors.variantId` and
 * `ORDER_PRODUCT_UNAVAILABLE` `errors.variantIds` on `EldraHttpError.errors`.
 */
export type EldraSalesOrderErrorId =
  | 'SALES_ORDER_IDEMPOTENCY_KEY_REQUIRED'
  | 'SALES_ORDER_CART_EMPTY'
  | 'SALES_ORDER_TOO_MANY_LINES'
  | 'SALES_ORDER_LINE_INVALID'
  | 'SALES_ORDER_CART_NOT_BOUND'
  | 'SALES_ORDER_CART_ALREADY_ORDERED'
  | 'SALES_ORDER_LOCATION_UNKNOWN'
  | 'SALES_ORDER_CREDIT_LIMIT_EXCEEDED'
  | 'SALES_ORDER_CREDIT_CHECK_UNAVAILABLE'
  | 'SALES_ORDER_TERMS_UNAVAILABLE'
  | 'SALES_ORDER_CART_UNAVAILABLE'
  | 'SALES_ORDER_UPSTREAM_REFUSED'
  | 'SALES_ORDER_NOT_FOUND'
  | 'CUSTOMER_BLOCKED'
  | 'CART_NOT_FOUND'
  | 'ORDER_CUSTOMER_UNAVAILABLE'
  | 'ORDER_CUSTOMER_PRICES_OFF'
  | 'ORDER_PRODUCT_UNAVAILABLE'
  | 'ORDER_PRICES_UNAVAILABLE'
  | 'ORDER_IDEMPOTENCY_CONFLICT'
  | 'ORIGIN_NOT_REGISTERED';

/**
 * The `errors` object each refusal carries, by `errorId`, as the gateway documents it. Read it through
 * `isEldraError(error, id)`. `ORDER_PRODUCT_UNAVAILABLE` names `variantIds` on a sales order and the
 * cart's `itemIds` on a web order.
 */
export interface EldraProblemErrors {
  SALES_ORDER_CART_ALREADY_ORDERED: { salesOrderId: string };
  SALES_ORDER_LINE_INVALID: { variantId: string };
  ORDER_PRODUCT_UNAVAILABLE: { variantIds: string[]; itemIds: string[] };
  SHIPPING_CART_NOT_EXPORTABLE: { itemIds: string[] };
}

/** A problem's `errorId`: the ids above, or any other the gateway answers. */
export type EldraErrorId =
  | EldraShopErrorId
  | EldraSalesOrderErrorId
  | keyof EldraProblemErrors
  | (string & {});

/**
 * Orders on account for a signed-in business customer's active company (contract 2.18.0).
 * Server-side only: pass `customerHeaders(accessToken, customerId)` as `context.headers` on every
 * call. Every answer is `Cache-Control: private, no-store`; never cache one. See
 * docs/sales-orders.md.
 *
 * Only 401 `SHOP_TOKEN_INVALID` means sign in again. 502 `SALES_ORDER_UPSTREAM_REFUSED` is the
 * supplier's order service refusing the platform, not the person: try again later and never sign
 * the person out over it.
 */
export interface EldraSalesOrdersClient {
  /**
   * Prices the company's bound cart exactly as placing it would, and writes nothing. No credit
   * limit or balance is answered: `credit.wouldBlock` says placing would be refused for credit.
   */
  preview(
    input: EldraSalesOrderPreviewInput,
    context?: EldraRequestContext
  ): Promise<EldraSalesOrderPreview>;
  /**
   * Places the order from the cart (201) and the cart is removed. `options.idempotencyKey` is
   * required (at most 255 characters): without a usable one the call rejects with a `TypeError`, a
   * programming error, and sends nothing. **A 502, a 503 or a timeout may
   * follow an order that was placed**: retry with the same key, which replays that order rather
   * than placing a second. `warnings` name steps the supplier finishes later; the order stands.
   */
  create(
    input: EldraCreateSalesOrderInput,
    options: EldraCreateSalesOrderOptions,
    context?: EldraRequestContext
  ): Promise<EldraSalesOrder>;
  /** The company's sales orders, newest first; `pageSize` 1–50 (default 50). */
  list(
    options?: EldraSalesOrderListOptions,
    context?: EldraRequestContext
  ): Promise<EldraSalesOrderList>;
  /** One sales order; another company's is 404 `SALES_ORDER_NOT_FOUND`. `warnings` is `[]`. */
  get(salesOrderId: string, context?: EldraRequestContext): Promise<EldraSalesOrder>;
}

export interface EldraInventoryClient {
  availability(
    items: EldraStockAvailabilityInput[],
    context?: EldraRequestContext
  ): Promise<EldraStockAvailability>;
}
