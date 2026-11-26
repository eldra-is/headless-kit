import type { EldraCampaignAttributionOptions } from './attribution';
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

/**
 * How hard the client tries again when the gateway says "not now" — a `429`
 * from its rate limit, a `503` while it restarts, or a dropped connection.
 * Only idempotent requests are ever repeated; see `retry.ts` for the rules.
 * Ignored when a consumer supplies its own `httpClient`: the retry belongs to
 * the transport, and a replaced transport is the consumer's own.
 */
export interface EldraRetryOptions {
  /**
   * Total attempts per request, the first included. Default 5. `0` or `1`
   * disables retrying: one request, no waiting.
   */
  attempts?: number;
  /** First backoff window, doubling per attempt. Default 250 ms. */
  baseDelayMs?: number;
  /**
   * Ceiling on the computed backoff. Default 5000 ms. A `Retry-After` the
   * gateway sends is honoured beyond it (up to a minute).
   */
  maxDelayMs?: number;
}

export interface EldraClientOptions {
  apiBaseUrl?: RuntimeValue<string>;
  orgId?: RuntimeValue<string>;
  /** Sends X-Preview-Token on requests, overriding the same header in headers/context. */
  previewToken?: RuntimeValue<string>;
  /**
   * Sends X-Eldra-Build-Token on every request: a read-only build token (`eldra_bld_…`, Studio → Settings → Developers → Build tokens), proving the request comes
   * from a theme build so the gateway counts it against the build's own rate-limit budget instead
   * of the machine's IP. **Server and build only** — never pass it from code that runs in a
   * browser, and never put it in a public config. Never pass a site deploy token here.
   * An SSR server that sends it on every visitor request shares the organisation's build budget. Omitted or empty sends no header.
   */
  buildToken?: RuntimeValue<string>;
  env?: RuntimeValue<RuntimeEnv>;
  headers?: RuntimeValue<HeadersInit>;
  httpClient?: EldraHttpClient;
  fetch?: typeof fetch;
  /** See `EldraRetryOptions`; defaults documented there. */
  retry?: EldraRetryOptions;
  /** Where `cart.addItem` reads the landing it sends as `attribution`: browser `localStorage` by default, `false` for none. */
  campaignAttribution?: Pick<EldraCampaignAttributionOptions, 'storage'> | false;
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
  /** Contract 6.19.0: price the variants in this selling currency. */
  currency?: string;
}

export type EldraFeature = 'CMS' | 'ECOMMERCE';

export interface EldraOrganizationFeature {
  feature: EldraFeature | string;
  enabled: boolean;
}

/**
 * The store's commerce settings, as `GET /organization/v1/{orgId}` publishes them under
 * `commerce` (the gateway's `dto_OrganizationCommerce`). **Absent on a store that has not
 * configured commerce**, which is why `features.getCommerce()` answers `null` rather than a
 * default: a storefront that cannot know what it sells in has to say so, not guess a currency.
 *
 * Written by hand for the same reason `EldraOrganizationDetails` below it is: the organisation
 * read backs every `features.*` method, so its shape has to resolve without the Vite plugin's
 * generated `contract.ts` augmentation.
 */
export interface EldraOrganizationCommerce {
  /** The shop's own currency, ISO 4217, e.g. `ISK`: offered or not, every product has a price in it. */
  currency: string;
  /** Prices already contain VAT; a storefront shows them as they are. */
  taxInclusivePricing: boolean;
  /** Fraction, e.g. `0.24` — applies to shipping and to products without their own rate. */
  defaultTaxRate: number;
  /** Contract 6.21.0: the currencies the storefront may offer; `currency` first while it is offered. */
  currencies?: string[];
  /** Contract 6.22.0: what pages are built in and a visitor starts in, the first of `currencies`. */
  defaultCurrency?: string;
}

/** One of the organisation's payment providers (contract 6.20.0). */
export interface EldraOrganizationPaymentProvider {
  type: string;
  name: string;
  status: string;
  /** The selling currencies it takes. Missing: ISK only. */
  currencies?: string[] | null;
  paymentMethods?: string[] | null;
  logos?: unknown;
}

/**
 * The organisation's configured **content** locales, as the public organisation read publishes
 * them: which locale a document's untagged content belongs to, and every locale its fields may
 * carry a value for.
 *
 * Hand-written for the same reason `EldraOrganizationCommerce` above it is — the organisation read
 * backs every `features.*` method and has to resolve without the Vite plugin's generated
 * `contract.ts`.
 *
 * `supported` is default-first and always contains `default`. An organisation that has configured
 * none publishes no `locales` at all, which `features.getLocales()` reports as `null`: a consumer
 * can then behave exactly as it did before locales existed (one unprefixed site, the gateway's own
 * default locale on every read) rather than inventing a tag nobody chose.
 */
export interface EldraOrganizationLocales {
  /** The locale served unprefixed, e.g. `en-US`. */
  default: string;
  /** Every configured locale, `default` first, e.g. `["en-US", "is-IS"]`. */
  supported: string[];
}

/**
 * The organisation's **regional format**, as the public organisation read publishes it under
 * `region` (the gateway's `dto_OrganizationRegion`): how money, numbers and dates are written and
 * which clock they are read on. It is the merchant's choice in Studio and is independent of the
 * content locale — an English-language Icelandic store writes `4.790 kr.` and `26. nóvember 2026`.
 *
 * Hand-written for the same reason `EldraOrganizationCommerce` is — the organisation read backs
 * every `features.*` method and has to resolve without the Vite plugin's generated `contract.ts`.
 */
export interface EldraOrganizationRegion {
  /** ISO 3166-1 alpha-2, upper case, e.g. `IS`; `''` until the merchant sets a country. */
  countryCode: string;
  /** BCP 47 tag, canonicalised, to format with (`Intl.NumberFormat`, `Intl.DateTimeFormat`), e.g. `is-IS`. */
  formatLocale: string;
  /** IANA time zone to show the organisation's dates and times in, e.g. `Atlantic/Reykjavik`. */
  timeZone: string;
}

export interface EldraOrganizationDetails {
  id: string;
  name: string;
  description?: string;
  features?: EldraOrganizationFeature[];
  /** See `EldraOrganizationCommerce`: absent, or `null`, until the store configures commerce. */
  commerce?: EldraOrganizationCommerce | null;
  /** See `EldraOrganizationLocales`: absent, or `null`, until the organisation configures any. */
  locales?: EldraOrganizationLocales | null;
  /** See `EldraOrganizationRegion`: read it through `features.getRegion()`, which validates it. */
  region?: EldraOrganizationRegion | null;
  paymentProviders?: EldraOrganizationPaymentProvider[];
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

// Typed product extensions, keyed by CMS schema apiId. Empty until the CMS types the Vite plugin (or
// `eldra-theme types`) writes fill it in:
//
//   declare module '@eldrajs/sdk' { interface EldraProductExtensions extends EldraCMSProductExtensions {} }
//
// Then `product.extensions?.clothing?.material` is typed. Before that it is `{}`: nothing is
// guessed, and nothing can be read off it either.
export interface EldraProductExtensions {}

// The contract serves `extensions` as `{ [schemaApiId]: { [fieldId]: unknown } }`; that is replaced
// by the registry above. Before generation `Omit<unknown, ...>` would be `{}`, so the detail stays
// `unknown` there instead of turning into a guess.
export type EldraProductDetails =
  EldraContractResponse<'/catalog/v1/products/{productId}', 'get'> extends infer Generated
    ? unknown extends Generated
      ? unknown
      : Omit<Generated, 'extensions'> & { extensions?: EldraProductExtensions }
    : never;
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
  /** The shop's active brands, ordered by name; `[]` for none (contract 6.4.0). */
  listBrands(options?: EldraLocaleOptions, context?: EldraRequestContext): Promise<EldraBrand[]>;
  /** One active brand; 404 `CATALOG_BRAND_NOT_FOUND` for a slug that is missing or not active. */
  getBrand(
    slug: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraBrand>;
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
  /**
   * What the store sells in: the organisation's own `commerce` settings, or `null` when it
   * publishes none. Reads the same organisation document the other `features` methods read, so a
   * caller that already has one can take `commerce` off it instead of calling this.
   */
  getCommerce(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrganizationCommerce | null>;
  /**
   * Which content locales the organisation publishes: `{ default, supported }`, or `null` when it
   * has configured none. Reads the same organisation document the other `features` methods read,
   * so a caller that already has one can take `locales` off it instead of calling this.
   *
   * The answer is validated rather than passed through: a record without a non-empty string
   * `default`, or whose `supported` is not an array of non-empty strings, is reported as `null` —
   * the same answer as "none configured". A consumer uses this to decide which locale lives at
   * which URL, and half an answer there would route real visitors to paths no content exists at.
   * `default` is always first in `supported`, and duplicates are collapsed.
   */
  getLocales(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrganizationLocales | null>;
  /**
   * The organisation's regional format: `{ countryCode, formatLocale, timeZone }`, or `null` when
   * it publishes none. Reads the same organisation document the other `features` methods read.
   *
   * Validated rather than passed through: a `formatLocale` that is not a well-formed BCP 47 tag, a
   * `timeZone` this runtime's `Intl` does not know, or a `countryCode` that is neither empty nor two
   * letters makes the whole record `null` — the same answer as "none published", so a consumer
   * falls back to its own locale instead of throwing a `RangeError` from `Intl` on every price.
   * `formatLocale` is canonicalised (`is-is` → `is-IS`) and `countryCode` upper-cased.
   */
  getRegion(
    options?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ): Promise<EldraOrganizationRegion | null>;
}

export interface EldraClient {
  request<T = unknown>(options: EldraRequestOptions): Promise<T>;
  cms: EldraCmsClient;
  catalog: EldraCatalogClient;
  features: EldraFeatureClient;
  cart: EldraCartClient;
  orders: EldraOrdersClient;
  platform: EldraPlatformClient;
  forms: EldraFormsClient;
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
export type EldraBrand = EldraContractResponse<'/catalog/v1/brands/{slug}', 'get'>;
export type EldraSearchOptions = Omit<EldraContractQuery<'/search/v1', 'get'>, 'q'>;
export type EldraSearchResponse = EldraContractResponse<'/search/v1', 'get'>;

export type EldraCart = EldraContractResponse<'/shopping-cart/v1/cart/{cartID}', 'get'>;
export type EldraCartItem = Item<Prop<EldraCart, 'items'>>;
export type EldraCartTotals = Prop<EldraCart, 'totals'>;
/**
 * @deprecated Contract 6.8.0: a cart holds several gift cards. The cart's `giftCard` is the first
 * of `giftCards`, except that its `amountDue` is the cart's `amountDue` (what is due after every
 * card); it is answered for one more contract version. Read `giftCards`
 * ({@link EldraCartGiftCardEntry}) and the cart's `amountDue` instead.
 */
export type EldraCartGiftCard = Prop<EldraCart, 'giftCard'>;
/**
 * One gift card on the cart (contract 6.8.0), from `giftCards`, in the order applied:
 * `{entryId, last4, balance, applied, amountDue}`. `applied` is what it pays after the cards
 * before it (0 when they already cover the total; such a card stays on the cart), `amountDue`
 * what is still due after it. `entryId` names the card on this cart for
 * `cart.removeGiftCardEntry`; it is not the card's id or code.
 */
export type EldraCartGiftCardEntry = Item<Prop<EldraCart, 'giftCards'>>;
/**
 * One discount code on the cart (contract 6.9.0), from `discountCodes`, in the order added:
 * `{code, amount}`. Each code applies to what the codes before it left, and `amount` (major
 * units) is what it takes now: 0 for a code that reduces nothing at the moment (nothing left to
 * reduce, only gift-card lines, or a code the shop has since stopped letting combine); such a
 * code stays on the cart. `code` names it for `cart.removeDiscountEntry`. The cart's deprecated
 * `discountCode` is the first of these whose `amount` is above 0.
 */
export type EldraCartDiscountCodeEntry = Item<Prop<EldraCart, 'discountCodes'>>;
/** The cart after `cart.applyCode`, with `appliedAs` saying which kind the code was. */
export type EldraCartAppliedCode = EldraContractResponse<
  '/shopping-cart/v1/cart/{cartID}/code',
  'put'
>;
export type EldraAddCartItemInput = EldraContractBody<'/shopping-cart/v1/cart/items', 'post'>;

export interface EldraDiscountResult {
  cart: EldraCart;
  /**
   * The server drops a code it will not honour, so the returned cart is the verdict: true when the
   * cart's `discountCodes` holds the code (any case; since contract 6.9.0, even while it takes 0),
   * or, from a gateway older than 6.9.0, when its single `discountCode` is the code.
   */
  applied: boolean;
}

export type EldraOrder = EldraContractResponse<'/order/v1/{orderId}', 'get'>;
export type EldraOrderLine = Item<Prop<EldraOrder, 'orderLines'>>;
/**
 * One discount code of an order (contract 6.9.0), from the order's `discountCodes`: each code that
 * reduced the order, in the order applied, as `{code, amount}`. The order's `discountCode` is
 * deprecated (the first of these).
 */
export type EldraOrderDiscountCode = Item<Prop<EldraOrder, 'discountCodes'>>;
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

export interface EldraCheckoutUrlOptions {
  cartId: string;
  locale?: string;
  /** Overrides the client's own `orgId` — a storefront serving several organisations. */
  orgId?: string;
}

/**
 * Mirrors `GET /platform/v1/config` on the web gateway: the public, organisation-independent read
 * (it takes no `X-Org-Id`, and the SDK sends none, so it answers the same thing whatever the
 * browser's origin;
 * `Cache-Control: public, max-age=300`) that tells a storefront where the platform hosts checkout.
 * Written by hand because the generated contract does not carry the path yet; it becomes
 * `EldraContractResponse<'/platform/v1/config', 'get'>` once the contract is regenerated.
 */
export interface EldraPlatformConfig {
  /** Origin of the platform-hosted checkout app; `null` when the platform publishes none. */
  checkoutUrl: string | null;
}

/**
 * The only per-call option the platform reads take. There is no request context to pass: the route
 * carries no organisation, no preview token and no auth, and the answer is shared by every caller of
 * one client — so headers or an `orgId` per call could not mean anything.
 */
export interface EldraPlatformReadOptions {
  /**
   * Abandons **this** caller's wait. The read is shared, so it is not cancelled: aborting rejects
   * the promise you are holding and leaves the request to whoever else is waiting on it.
   */
  signal?: AbortSignal;
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
  /** Moves the cart to `currency` and reprices it (6.21.0); errors 400 CART_CURRENCY_NOT_SOLD, 409 CART_CURRENCY_CUSTOMER_ISK_ONLY. */
  setCurrency(cartId: string, currency: string, context?: EldraRequestContext): Promise<EldraCart>;
  /**
   * Applies a discount code and answers the cart with `applied` (see {@link EldraDiscountResult}).
   * Since contract 6.9.0 a discount code is **added** after the cart's codes instead of replacing
   * one; each applies to what the codes before it left, at most 6 per cart, and two codes sit
   * together only when both allow combining. Three refusals leave the cart exactly as it was, each a
   * 409 `EldraHttpError` read from `errorId`, with its detail in `errors` (the problem's `errors`
   * object): `CART_DISCOUNT_NOT_COMBINABLE` (the code and a code on the cart cannot both be used;
   * `errors.blockingCode` is the code on the cart that blocks it, for "cannot be combined with
   * SUMMER10"; remove it with `removeDiscountEntry` and apply again to change codes),
   * `CART_DISCOUNT_CODES_LIMIT_REACHED` (the cart already holds `errors.limit` codes, 6) and
   * `CART_DISCOUNT_ALREADY_APPLIED` (the cart already holds this code).
   * Other refusals are unchanged: `CART_DISCOUNT_NOT_USABLE`, `CART_DISCOUNT_EXHAUSTED`,
   * `CART_DISCOUNT_TOO_MANY_ATTEMPTS`.
   */
  applyDiscount(
    cartId: string,
    code: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraDiscountResult>;
  /**
   * Removes every discount code on the cart (contract 6.9.0; before it, the one code); succeeds
   * when none is applied. To take off one code, use `removeDiscountEntry`.
   */
  removeDiscount(
    cartId: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  /**
   * Adds a gift card (contract 6.4.0; since 6.8.0 it adds the card after the cart's other cards
   * instead of replacing one, with no limit, and the discount code stays). A refusal is an
   * `EldraHttpError` whose `errorId` names it: `CART_GIFT_CARD_INVALID`, `CART_GIFT_CARD_EXHAUSTED`,
   * `CART_GIFT_CARD_ALREADY_APPLIED` (409, the cart already holds this card),
   * `CART_DISCOUNT_TOO_MANY_ATTEMPTS`, `CART_GIFT_CARD_UNAVAILABLE`.
   */
  applyGiftCard(
    cartId: string,
    code: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  /**
   * Applies a code from one field, as whichever it is (contract 6.7.0): a gift card or a discount
   * code. The answer is the cart with `appliedAs` (`GIFT_CARD` or `DISCOUNT`). Since 6.8.0 a gift
   * card is added after the cart's other cards; remove one with `removeGiftCardEntry`, or one
   * discount code with `removeDiscountEntry`. A refusal is an `EldraHttpError` whose `errorId` names it:
   * `CART_CODE_INVALID` (neither kind; the answer does not say which exists), `CART_CODE_REQUIRED`,
   * `CART_GIFT_CARD_EXHAUSTED`, `CART_GIFT_CARD_ALREADY_APPLIED` (409, the cart already holds this
   * card; the code is not then tried as a discount code), `CART_DISCOUNT_EXHAUSTED`,
   * `CART_DISCOUNT_TOO_MANY_ATTEMPTS`, `CART_GIFT_CARD_UNAVAILABLE`.
   *
   * Since contract 6.9.0 a discount code is **added** after the cart's codes instead of replacing
   * one; each applies to what the codes before it left, at most 6 per cart, and two codes sit
   * together only when both allow combining. Three refusals leave the cart exactly as it was, each a
   * 409 `EldraHttpError` read from `errorId`, with its detail in `errors` (the problem's `errors`
   * object): `CART_DISCOUNT_NOT_COMBINABLE` (the code and a code on the cart cannot both be used;
   * `errors.blockingCode` is the code on the cart that blocks it, for "cannot be combined with
   * SUMMER10"; remove it with `removeDiscountEntry` and apply again to change codes),
   * `CART_DISCOUNT_CODES_LIMIT_REACHED` (the cart already holds `errors.limit` codes, 6) and
   * `CART_DISCOUNT_ALREADY_APPLIED` (the cart already holds this code).
   */
  applyCode(
    cartId: string,
    code: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCartAppliedCode>;
  /**
   * Removes every gift card on the cart (contract 6.8.0; before it, the one card); succeeds when
   * none is applied. To take off one card, use `removeGiftCardEntry`.
   */
  removeGiftCard(
    cartId: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  /**
   * Removes one gift card, the one whose `giftCards[].entryId` is `entryId` (contract 6.8.0), and
   * answers the cart; the other cards keep their order. An `entryId` the cart does not hold answers
   * the cart unchanged, so a double click does not fail.
   */
  removeGiftCardEntry(
    cartId: string,
    entryId: string,
    options?: EldraLocaleOptions,
    context?: EldraRequestContext
  ): Promise<EldraCart>;
  /**
   * Removes one discount code, the one whose `discountCodes[].code` is `code` (any case; contract
   * 6.9.0), and answers the cart; the other codes keep their order. A code the cart does not hold
   * answers the cart unchanged, so a double click does not fail.
   */
  removeDiscountEntry(
    cartId: string,
    code: string,
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
  /**
   * Where a storefront sends the customer: `{checkoutUrl}/checkout/{orgId}/{cartId}`, with the
   * locale as `lang`. The base URL is the platform's — read from `platform.config()`, cached per
   * client — so this is async, and it rejects when the platform published no checkout URL, when the
   * read failed (with that failure as the error's `cause`), and when what the platform published is
   * not an absolute `http(s)` URL. Each refusal says which it was.
   */
  url(options: EldraCheckoutUrlOptions, readOptions?: EldraPlatformReadOptions): Promise<string>;
}

export interface EldraPlatformClient {
  /**
   * The platform's public configuration. Read once per client instance: concurrent callers share
   * the one in-flight request — cancellable by none of them, see `EldraPlatformReadOptions` — and a
   * read that failed is retried by the next call.
   */
  config(readOptions?: EldraPlatformReadOptions): Promise<EldraPlatformConfig>;
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
 * Error ids of the sales-order routes (contract 6.15.0). `SALES_ORDER_CART_ALREADY_ORDERED`
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
  | 'SALES_ORDER_CREDIT_CURRENCY_MISMATCH'
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
 * Orders on account for a signed-in business customer's active company (contract 6.15.0).
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
   * required (1 to 255 printable ASCII characters, no spaces): without a usable one the call rejects
   * with an `EldraIdempotencyKeyError`, a programming error, and sends nothing. **A 502, a 503 or a timeout may
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

/**
 * A localized string as the forms API publishes it: one entry per locale tag the merchant wrote
 * (`en-US`, `is-IS`). A caller resolves its own locale and falls back; the API never guesses.
 */
export type EldraFormLocalized = Record<string, string>;

/**
 * The field types a form definition can carry. `checkbox` and `consent` both carry a boolean;
 * `required` on a `consent` field means it must be checked. `number` and `url` carry text the
 * platform validates (a finite number, an absolute http(s) URL).
 */
export type EldraFormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'consent'
  | 'number'
  | 'url';

export interface EldraFormFieldOption {
  value: string;
  label: EldraFormLocalized;
}

export interface EldraFormField {
  /** Stable id: the key of the field in a submission's `values` and in a 422's `errors`. */
  id: string;
  type: EldraFormFieldType;
  required: boolean;
  label: EldraFormLocalized;
  placeholder?: EldraFormLocalized;
  options?: EldraFormFieldOption[];
  validation?: { minLength?: number; maxLength?: number; pattern?: string };
}

/** The actions a submission triggers; the merchant's notify/confirm targets are never published. */
export type EldraFormActionKind = 'store' | 'notify' | 'confirm' | 'subscribe';

/**
 * A form definition exactly as `GET /site/v1/forms/{key}` answers it. Hand-written rather than
 * contract-derived (the SDK ships no response types): the shape is the platform's documented wire
 * contract, and `@eldrajs/theme-nuxt` validates a build-time read of it before baking it.
 */
export interface EldraFormDefinition {
  key: string;
  name: string;
  fields: EldraFormField[];
  /** The name of a field that must stay empty: render it hidden from people, send it as `hp`. */
  honeypotField: string;
  /** Cloudflare Turnstile site key, or `null` when the merchant has not enabled it. */
  turnstileSiteKey: string | null;
  success: { message: EldraFormLocalized; redirect?: EldraFormLocalized };
  kinds: EldraFormActionKind[];
  /**
   * The consent sentence per locale, with the shop name already filled in for `{shop}`. Present
   * only when `kinds` contains `subscribe`. Show it next to the submit button (escaped, plain
   * text): submitting the form is the visitor's consent to exactly this wording, and the platform
   * stores it as the proof. There is no extra checkbox and no extra submit field.
   */
  consentText?: EldraFormLocalized;
}

export interface EldraFormSubmitInput {
  /** `fieldId` to the entered value; a checkbox is a boolean, everything else a string. */
  values: Record<string, string | boolean>;
  locale: string;
  pagePath: string;
  turnstileToken?: string;
  /** The honeypot field's value, which a person never fills. */
  hp?: string;
}

/**
 * What a submission resolves to. A `422` is an answer, not a failure — it carries the field-keyed
 * messages a form shows inline — so it resolves as `status: 'invalid'`. Every other non-2xx
 * (`404` unknown form, `413` oversize, `429` rate limited) rejects with `EldraHttpError`.
 */
export type EldraFormSubmitResult =
  | {
      status: 'ok';
      /** `true` when the form subscribes the visitor and a confirmation email is on its way. */
      pending: boolean;
    }
  | {
      status: 'invalid';
      /** `fieldId` to messages, the shape `@eldrajs/ui`'s `apiErrors` expects. */
      errors: Record<string, string[]>;
      /** Messages about the form as a whole. */
      form: string[];
    };

export interface EldraFormTokenResult {
  status: 'confirmed' | 'unsubscribed';
}

/**
 * The site-forms API. Needs the organisation's `FORMS` feature (not `PAGE_BUILDER`) and a registered
 * storefront origin in a browser; works with no theme. The mailed confirm and unsubscribe links point
 * at the web gateway's own page, not the storefront.
 */
export interface EldraFormsClient {
  /** `GET /site/v1/forms/{key}`. Rejects with `EldraHttpError` (`404`) for an unknown key. */
  get(key: string, context?: EldraRequestContext): Promise<EldraFormDefinition>;
  /** `POST /site/v1/forms/{key}/submissions`. See `EldraFormSubmitResult`. */
  submit(
    key: string,
    input: EldraFormSubmitInput,
    context?: EldraRequestContext
  ): Promise<EldraFormSubmitResult>;
  /** Double opt-in: `POST /site/v1/forms/subscriptions/confirm?token=` (a GET of the link is only a page). */
  confirm(token: string, context?: EldraRequestContext): Promise<EldraFormTokenResult>;
  /** `POST /site/v1/forms/subscriptions/unsubscribe?token=` (a GET of the link is only a page). */
  unsubscribe(token: string, context?: EldraRequestContext): Promise<EldraFormTokenResult>;
}
