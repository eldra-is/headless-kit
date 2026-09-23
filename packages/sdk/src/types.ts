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

export interface EldraInventoryClient {
  availability(
    items: EldraStockAvailabilityInput[],
    context?: EldraRequestContext
  ): Promise<EldraStockAvailability>;
}
