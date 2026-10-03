import type {
  EldraCatalogGetProductOptions,
  EldraCatalogListProductsOptions,
  EldraClient,
  EldraClientOptions,
  EldraCmsEntryList,
  EldraCmsResolveEntryListResponse,
  EldraCmsGetEntryByUniqueFieldOptions,
  EldraCmsGetOptions,
  EldraCmsListOptions,
  EldraCmsResolveEntryListOptions,
  EldraFeature,
  EldraFeatureCapabilities,
  EldraHttpClient,
  EldraHttpRequest,
  EldraOrganizationDetails,
  EldraOrganizationFeature,
  EldraOrganizationOptions,
  EldraPlatformConfig,
  EldraPlatformReadOptions,
  EldraProductDetails,
  EldraProductList,
  EldraAddCartItemInput,
  EldraCart,
  EldraCheckoutUrlOptions,
  EldraCollection,
  EldraCollectionList,
  EldraCollectionListOptions,
  EldraCollectionProductsOptions,
  EldraCategory,
  EldraDiscountResult,
  EldraLocaleOptions,
  EldraOrder,
  EldraOrderReadOptions,
  EldraRecoveredBasket,
  EldraSearchOptions,
  EldraSearchResponse,
  EldraStockAvailability,
  EldraStockAvailabilityInput,
  EldraRequestContext,
  EldraRequestOptions,
  RuntimeEnv,
  RuntimeValue,
} from './types';

const apiBaseUrlEnvKeys = [
  'ELDRA_API_BASE_URL',
  'VITE_ELDRA_API_BASE_URL',
  'NEXT_PUBLIC_ELDRA_API_BASE_URL',
  'NUXT_PUBLIC_ELDRA_API_BASE_URL',
  'PUBLIC_ELDRA_API_BASE_URL',
] as const;

export const DEFAULT_ELDRA_API_BASE_URL = 'https://web.eldra.app/api';

const orgIdEnvKeys = [
  'ELDRA_ORG_ID',
  'VITE_ELDRA_ORG_ID',
  'NEXT_PUBLIC_ELDRA_ORG_ID',
  'NUXT_PUBLIC_ELDRA_ORG_ID',
  'PUBLIC_ELDRA_ORG_ID',
] as const;

let defaultClient: EldraClient | undefined;

export class EldraHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  /** The gateway's problem `code`, such as `CONFLICT`, when the body carried one. */
  readonly code: string | undefined;
  /**
   * The gateway's problem `errorId` — the stable identifier for *which* failure this is, such as
   * `CART_INSUFFICIENT_STOCK`. `code` names the class of failure (`CONFLICT`, `VALIDATION`) and
   * several unrelated refusals share one, so a caller that reacts to a specific cause has to read
   * this: a 409 on an add is `{ code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' }`, and
   * telling it apart from any other conflict is what lets a storefront say "out of stock" rather
   * than "something went wrong".
   */
  readonly errorId: string | undefined;

  constructor(response: Response, body: unknown) {
    super(`Web Studio request failed with ${response.status} ${response.statusText}`);
    this.name = 'EldraHttpError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
    this.code = problemString(body, 'code');
    this.errorId = problemString(body, 'errorId');
  }
}

/** One field of an RFC 9457 problem body, when the body is an object that carries it as a string. */
function problemString(body: unknown, key: 'code' | 'errorId'): string | undefined {
  if (body && typeof body === 'object' && key in body) {
    const value = (body as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

export function initEldraClient(options: EldraClientOptions): EldraClient {
  defaultClient = createEldraClient(options);
  return defaultClient;
}

export function getEldraClient(): EldraClient {
  if (!defaultClient) {
    throw new Error('Eldra client has not been initialized. Call initEldraClient() first.');
  }
  return defaultClient;
}

export function createEldraClient(options: EldraClientOptions): EldraClient {
  const httpClient = options.httpClient ?? createFetchHttpClient(options.fetch);

  const request = <T = unknown>(requestOptions: InternalRequestOptions) =>
    httpClient<T>(createHttpRequest(options, requestOptions));

  const getOrganization = (
    organizationOptions?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ) => {
    const orgId = resolveRequestOrgId(options, organizationOptions, context);

    return request<EldraOrganizationDetails>({
      ...context,
      orgId,
      path: `/organization/v1/${encodeURIComponent(orgId)}`,
    });
  };

  /**
   * The platform's own public read, cached for the life of the client: one in-flight promise serves
   * every caller, so two `checkout.url()` calls in the same session make one request. A *failed*
   * read is not remembered — the cache entry is dropped so the next call tries again rather than
   * leaving a storefront with no checkout until it is reloaded.
   *
   * Two deliberate details. The request carries **no organisation header**: the gateway made this
   * route org-independent on purpose, and `X-Org-Id` would put a public read behind the
   * origin-to-organisation binding every org-scoped read goes through — a storefront reading it
   * from a browser origin that is not registered would be refused. And the shared read carries **no
   * caller's signal**: one caller abandoning its wait must not cancel the read every other caller
   * is sharing, so a signal aborts only the waiting (`withAbort`), never the request.
   */
  let platformConfig: Promise<EldraPlatformConfig> | undefined;
  const readPlatformConfig = (
    readOptions?: EldraPlatformReadOptions
  ): Promise<EldraPlatformConfig> => {
    platformConfig ??= request<unknown>({ path: '/platform/v1/config', orgScoped: false })
      .then(toPlatformConfig)
      .catch((error: unknown) => {
        platformConfig = undefined;
        throw error;
      });
    return withAbort(platformConfig, readOptions?.signal);
  };

  const getOrganizationFeatureMap = async (
    organizationOptions?: EldraOrganizationOptions,
    context?: EldraRequestContext
  ) => {
    const organization = await getOrganization(organizationOptions, context);

    return mapOrganizationFeatures(organization.features ?? []);
  };

  return {
    request,
    cms: {
      list: <Response = unknown>(
        schemaApiId: string,
        listOptions?: EldraCmsListOptions,
        context?: EldraRequestContext
      ) =>
        request<Response>({
          ...context,
          path: `/cms/v1/schema/${encodeURIComponent(schemaApiId)}/entry`,
          query: listOptions,
        }),
      get: <Response = unknown>(
        schemaApiId: string,
        entryId: string,
        getOptions?: EldraCmsGetOptions,
        context?: EldraRequestContext
      ) =>
        request<Response>({
          ...context,
          path: `/cms/v1/schema/${encodeURIComponent(schemaApiId)}/entry/${encodeURIComponent(entryId)}`,
          query: getOptions,
        }),
      getEntryByUniqueField: <Response = unknown>(
        schemaApiId: string,
        fieldId: string,
        entryIdentifier: string,
        getOptions?: EldraCmsGetEntryByUniqueFieldOptions,
        context?: EldraRequestContext
      ) =>
        request<Response>({
          ...context,
          path:
            `/cms/v1/schema/${encodeURIComponent(schemaApiId)}/entry/unique/` +
            `${encodeURIComponent(fieldId)}/${encodeURIComponent(entryIdentifier)}`,
          query: getOptions,
        }),
      resolveEntryList: <Response = never, List extends EldraCmsEntryList = EldraCmsEntryList>(
        entryList: List,
        resolveOptions?: EldraCmsResolveEntryListOptions,
        context?: EldraRequestContext
      ) =>
        request<EldraCmsResolveEntryListResponse<Response, List>>({
          ...context,
          method: 'POST',
          path: '/cms/v1/entry-list/resolve',
          query: resolveEntryListQuery(resolveOptions),
          body: resolveEntryListBody(entryList),
        }),
    },
    features: {
      getOrganization,
      list: async (
        organizationOptions?: EldraOrganizationOptions,
        context?: EldraRequestContext
      ) => {
        const organization = await getOrganization(organizationOptions, context);

        return organization.features ?? [];
      },
      isEnabled: async (
        feature: EldraFeature,
        organizationOptions?: EldraOrganizationOptions,
        context?: EldraRequestContext
      ) => {
        const features = await getOrganizationFeatureMap(organizationOptions, context);

        return features[feature] === true;
      },
      getCapabilities: async (
        organizationOptions?: EldraOrganizationOptions,
        context?: EldraRequestContext
      ): Promise<EldraFeatureCapabilities> => {
        const features = await getOrganizationFeatureMap(organizationOptions, context);
        const cms = features.CMS === true;
        const ecommerce = features.ECOMMERCE === true;

        return {
          cms,
          catalog: ecommerce,
          products: ecommerce,
          ecommerce,
          features,
        };
      },
      getCommerce: async (
        organizationOptions?: EldraOrganizationOptions,
        context?: EldraRequestContext
      ) => {
        const organization = await getOrganization(organizationOptions, context);

        // Absent on a store that has not configured commerce — reported as `null` rather than
        // filled in with a default, so a storefront can render a price honestly (a number, no
        // symbol) instead of showing one currency's amounts under another's sign.
        return organization.commerce ?? null;
      },
    },
    catalog: {
      listProducts: <Response = EldraProductList>(
        listOptions?: EldraCatalogListProductsOptions,
        context?: EldraRequestContext
      ) =>
        request<Response>({
          ...context,
          path: '/catalog/v1/products/list',
          query: listOptions,
        }),
      getProduct: <Response = EldraProductDetails>(
        productId: string,
        getOptions?: EldraCatalogGetProductOptions,
        context?: EldraRequestContext
      ) =>
        request<Response>({
          ...context,
          path: `/catalog/v1/products/${encodeURIComponent(productId)}`,
          query: getOptions,
        }),
      listCategories: async (localeOptions?: EldraLocaleOptions, context?: EldraRequestContext) =>
        (await request<EldraCategory[] | null>({
          ...context,
          path: '/catalog/v1/categories',
          query: localeOptions,
        })) ?? [],
      listCollections: (listOptions?: EldraCollectionListOptions, context?: EldraRequestContext) =>
        request<EldraCollectionList>({
          ...context,
          path: '/catalog/v1/collections',
          query: listOptions,
        }),
      getCollection: (
        slug: string,
        localeOptions?: EldraLocaleOptions,
        context?: EldraRequestContext
      ) =>
        request<EldraCollection>({
          ...context,
          path: `/catalog/v1/collections/${encodeURIComponent(slug)}`,
          query: localeOptions,
        }),
      listCollectionProducts: (
        slug: string,
        listOptions?: EldraCollectionProductsOptions,
        context?: EldraRequestContext
      ) =>
        request<EldraProductList>({
          ...context,
          path: `/catalog/v1/collections/${encodeURIComponent(slug)}/products`,
          query: listOptions,
        }),
      search: (query: string, searchOptions?: EldraSearchOptions, context?: EldraRequestContext) =>
        request<EldraSearchResponse>({
          ...context,
          path: '/search/v1',
          query: { ...searchOptions, q: query },
        }),
    },
    cart: {
      addItem: (input: EldraAddCartItemInput, context?: EldraRequestContext) =>
        request<EldraCart>({
          ...context,
          method: 'POST',
          path: '/shopping-cart/v1/cart/items',
          body: input,
        }),
      get: (cartId: string, localeOptions?: EldraLocaleOptions, context?: EldraRequestContext) =>
        request<EldraCart>({
          ...context,
          path: `/shopping-cart/v1/cart/${encodeURIComponent(cartId)}`,
          query: localeOptions,
        }),
      updateItem: (
        cartId: string,
        itemId: string,
        input: { quantity: number },
        context?: EldraRequestContext
      ) =>
        request<EldraCart>({
          ...context,
          method: 'PATCH',
          path: `/shopping-cart/v1/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
          body: input,
        }),
      removeItem: (cartId: string, itemId: string, context?: EldraRequestContext) =>
        request<EldraCart>({
          ...context,
          method: 'DELETE',
          path: `/shopping-cart/v1/cart/${encodeURIComponent(cartId)}/items/${encodeURIComponent(itemId)}`,
        }),
      applyDiscount: async (
        cartId: string,
        code: string,
        localeOptions?: EldraLocaleOptions,
        context?: EldraRequestContext
      ): Promise<EldraDiscountResult> => {
        const trimmed = code.trim();
        const cart = await request<EldraCart>({
          ...context,
          method: 'PUT',
          path: `/shopping-cart/v1/cart/${encodeURIComponent(cartId)}/discount`,
          query: localeOptions,
          body: { code: trimmed },
        });
        const discountCode = (cart as { discountCode?: unknown }).discountCode;
        const applied =
          typeof discountCode === 'string' &&
          discountCode.trim().toUpperCase() === trimmed.toUpperCase();
        return { cart, applied };
      },
      removeDiscount: (
        cartId: string,
        localeOptions?: EldraLocaleOptions,
        context?: EldraRequestContext
      ) =>
        request<EldraCart>({
          ...context,
          method: 'DELETE',
          path: `/shopping-cart/v1/cart/${encodeURIComponent(cartId)}/discount`,
          query: localeOptions,
        }),
    },
    orders: {
      get: (orderId: string, readOptions?: EldraOrderReadOptions, context?: EldraRequestContext) =>
        request<EldraOrder>({
          ...context,
          path: `/order/v1/${encodeURIComponent(orderId)}`,
          headers: mergeHeaders(
            context?.headers,
            readOptions?.accessToken ? { 'X-Order-Token': readOptions.accessToken } : undefined
          ),
        }),
      recover: (token: string, context?: EldraRequestContext) =>
        request<EldraRecoveredBasket>({
          ...context,
          method: 'POST',
          path: '/order/v1/recover',
          body: { token: token.trim() },
        }),
    },
    platform: {
      config: (readOptions?: EldraPlatformReadOptions) => readPlatformConfig(readOptions),
    },
    checkout: {
      url: async (handoff: EldraCheckoutUrlOptions, readOptions?: EldraPlatformReadOptions) => {
        // The platform hosts checkout; where it hosts it is the platform's answer to give, so this
        // is the only source of the base URL. One refusal either way — a storefront can do nothing
        // different about a platform that published none and a read that did not come back — but
        // not one *message*: the two have completely different fixes, and a caller that logs only
        // `error.message` (or a storefront that swallows the error, as the starter does) would
        // otherwise be told the platform is misconfigured when the gateway was simply unreachable.
        let checkoutUrl: string | null = null;
        let cause: unknown;
        try {
          checkoutUrl = (await readPlatformConfig(readOptions)).checkoutUrl;
        } catch (error: unknown) {
          cause = error;
        }
        if (!checkoutUrl) {
          throw cause === undefined
            ? new Error('The platform did not publish a checkout URL (GET /platform/v1/config).')
            : new Error(
                `Could not read the platform checkout URL (GET /platform/v1/config): ${describeCause(cause)}`,
                { cause }
              );
        }
        return buildCheckoutUrl(checkoutUrl, handoff, options);
      },
    },
    inventory: {
      availability: (items: EldraStockAvailabilityInput[], context?: EldraRequestContext) =>
        request<EldraStockAvailability>({
          ...context,
          method: 'POST',
          path: '/inventory/v1/stock/availability',
          body: { items },
        }),
    },
  };
}

/**
 * `{checkoutUrl}/checkout/{orgId}/{cartId}` — where a storefront sends the customer, with the
 * locale as `lang` when it has one. Internal: the base URL comes from the platform's config, which
 * only `checkout.url()` can read, so there is no public builder that takes a base of its own.
 *
 * The published base is checked rather than trusted. It ends up in a link a shopper clicks, so a
 * value that is not an absolute `http(s)` URL is refused in terms a developer can act on instead of
 * reaching the page as `TypeError: Invalid URL` — or, for a `javascript:` or `data:` base, as a
 * working link. Every trailing slash is stripped, not just the last one, so a doubled one cannot
 * leave `//checkout` in the path.
 */
function buildCheckoutUrl(
  checkoutUrl: string,
  handoff: EldraCheckoutUrlOptions,
  options: EldraClientOptions
): string {
  const orgId = handoff.orgId ?? resolveOrgId(options);
  if (!orgId) {
    throw new Error('Missing Web Studio organization ID.');
  }
  const base = checkoutUrl.replace(/\/+$/, '');
  const path = `/checkout/${encodeURIComponent(orgId)}/${encodeURIComponent(handoff.cartId)}`;
  let url: URL;
  try {
    url = new URL(`${base}${path}`);
  } catch (cause: unknown) {
    throw unusableCheckoutUrl(checkoutUrl, cause);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw unusableCheckoutUrl(checkoutUrl);
  }
  if (handoff.locale) url.searchParams.set('lang', handoff.locale);
  return url.toString();
}

function unusableCheckoutUrl(checkoutUrl: string, cause?: unknown): Error {
  const message =
    `The platform published an unusable checkout URL (${JSON.stringify(checkoutUrl)}): ` +
    'it must be an absolute http(s) URL.';
  return cause === undefined ? new Error(message) : new Error(message, { cause });
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The caller's own wait on a shared read. The read itself is not cancellable — it is one request
 * serving every caller — so an aborted signal settles this caller's promise and leaves the request
 * alone. The listener is removed either way, so a long-lived signal collects nothing.
 */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  if (signal.aborted) {
    // Still in flight for whoever else is waiting; this caller is simply not one of them any more.
    void promise.catch(() => undefined);
    return Promise.reject(abortReason(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function abortReason(signal: AbortSignal): unknown {
  return (
    (signal.reason as unknown) ??
    new Error('The platform config read was abandoned: the signal was aborted.')
  );
}

/**
 * The gateway answers `{ checkoutUrl: string | null }`. Anything else — a blank string, a missing
 * key, a body that is not an object at all — is read as "no checkout published" rather than handed
 * on as a URL, since the value goes straight into a link a shopper clicks.
 */
function toPlatformConfig(body: unknown): EldraPlatformConfig {
  const value = (body as { checkoutUrl?: unknown } | null | undefined)?.checkoutUrl;
  const checkoutUrl = typeof value === 'string' ? value.trim() : '';
  return { checkoutUrl: checkoutUrl === '' ? null : checkoutUrl };
}

function resolveRequestOrgId(
  clientOptions: EldraClientOptions,
  organizationOptions: EldraOrganizationOptions | undefined,
  context: EldraRequestContext | undefined
): string {
  const orgId = organizationOptions?.orgId ?? context?.orgId ?? resolveOrgId(clientOptions);
  if (!orgId) {
    throw new Error('Missing Web Studio organization ID.');
  }
  return orgId;
}

function mapOrganizationFeatures(
  features: EldraOrganizationFeature[]
): Partial<Record<EldraFeature, boolean>> {
  const mapped: Partial<Record<EldraFeature, boolean>> = {};
  for (const row of features) {
    if (row.feature === 'CMS' || row.feature === 'ECOMMERCE') {
      mapped[row.feature] = row.enabled;
    }
  }
  return mapped;
}

function resolveEntryListQuery(options: EldraCmsResolveEntryListOptions | undefined): object {
  return {
    locale: options?.locale,
    page: options?.page,
    pageSize: options?.pageSize,
    limit: options?.limit,
    depth: options?.depth,
    deep: options?.deep,
  };
}

function resolveEntryListBody(entryList: EldraCmsEntryList): object {
  return {
    schemas: entryList.schemas,
    filters: entryList.filters,
    displayAs: entryList.displayAs,
    orderBy: entryList.orderBy,
    pageSize: entryList.pageSize,
  };
}

/**
 * What this module may ask of a request beyond the public `EldraRequestOptions`. `orgScoped: false`
 * is the one addition and exists for one route: the gateway's `/platform/v1/config` is
 * org-independent by design, and a read that carried `X-Org-Id` would be bound to the
 * organisation's registered origins like any org-scoped read — a 403 where the gateway promises a
 * 200. It stays internal because no consumer has a public route that needs it.
 */
type InternalRequestOptions = EldraRequestOptions & { orgScoped?: boolean };

function createHttpRequest(
  clientOptions: EldraClientOptions,
  requestOptions: InternalRequestOptions
): EldraHttpRequest {
  const method = requestOptions.method ?? (requestOptions.body === undefined ? 'GET' : 'POST');
  const headers = mergeHeaders(resolveRuntimeValue(clientOptions.headers), requestOptions.headers);
  const orgId =
    requestOptions.orgScoped === false
      ? undefined
      : (requestOptions.orgId ?? resolveOrgId(clientOptions));
  if (orgId) {
    headers.set('X-Org-Id', orgId);
  }
  const previewToken = resolveRuntimeValue(clientOptions.previewToken);
  if (previewToken) {
    headers.set('X-Preview-Token', previewToken);
  }

  let body: BodyInit | undefined;
  if (requestOptions.body !== undefined) {
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
    body = isRawBody(requestOptions.body)
      ? requestOptions.body
      : JSON.stringify(requestOptions.body);
  }

  return {
    url: buildUrl(resolveApiBaseUrl(clientOptions), requestOptions.path, requestOptions.query),
    method,
    headers,
    body,
    signal: requestOptions.signal,
  };
}

function createFetchHttpClient(fetchImpl: typeof fetch | undefined): EldraHttpClient {
  return async <T = unknown>(request: EldraHttpRequest) => {
    const resolvedFetch = fetchImpl ?? globalThis.fetch;
    if (!resolvedFetch) {
      throw new Error(
        'No fetch implementation is available. Pass fetch or httpClient to createEldraClient().'
      );
    }

    const response = await resolvedFetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new EldraHttpError(response, body);
    }
    return body as T;
  };
}

function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return Promise.resolve(undefined);
  }
  const contentType = response.headers.get('Content-Type') ?? '';
  if (
    contentType.includes('application/json') ||
    contentType.includes('application/problem+json')
  ) {
    return response.json();
  }
  return response.text();
}

function resolveApiBaseUrl(options: EldraClientOptions): string {
  return (
    resolveRuntimeValue(options.apiBaseUrl) ??
    readFirstEnvValue(resolveRuntimeValue(options.env), apiBaseUrlEnvKeys) ??
    DEFAULT_ELDRA_API_BASE_URL
  );
}

function resolveOrgId(options: EldraClientOptions): string | undefined {
  return (
    resolveRuntimeValue(options.orgId) ??
    readFirstEnvValue(resolveRuntimeValue(options.env), orgIdEnvKeys)
  );
}

function readFirstEnvValue(
  env: RuntimeEnv | undefined,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function resolveRuntimeValue<T>(value: RuntimeValue<T>): T | undefined {
  return typeof value === 'function' ? (value as () => T | undefined)() : value;
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) {
      continue;
    }
    new Headers(source).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function buildUrl(apiBaseUrl: string, path: string, query: object | undefined): string {
  const url = new URL(`${apiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    appendQueryValue(url.searchParams, key, value);
  }
  return url.toString();
}

/**
 * Query parameters the gateway declares as repeatable (`explode: true`): one
 * `key=` entry per value, never a comma-joined one. `filter` is the only one
 * today, and it has to be — a filter token is `[groupIndex:]field:op:value`
 * whose value may itself contain commas (`slug:in:a,b`), so joining several
 * tokens into one parameter runs them together and every token after the first
 * is lost. Every other array parameter (`sort`, `fields`) is declared
 * `explode: false` and stays comma-separated.
 */
const REPEATED_QUERY_KEYS: ReadonlySet<string> = new Set(['filter']);

function appendQueryValue(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (Array.isArray(value)) {
    if (REPEATED_QUERY_KEYS.has(key)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue;
        searchParams.append(key, String(entry));
      }
      return;
    }
    searchParams.set(key, value.map(String).join(','));
    return;
  }
  searchParams.set(key, String(value));
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    body instanceof ArrayBuffer
  );
}
