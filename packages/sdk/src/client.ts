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
  EldraProductDetails,
  EldraProductList,
  EldraAddCartItemInput,
  EldraCart,
  EldraCheckoutHandoffOptions,
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
  /** The problem's category, such as `NOT_FOUND` or `CONFLICT`, when the body carried one. */
  readonly code: string | undefined;
  /** The problem's specific reason, such as `CART_NOT_FOUND`, when the body carried one. */
  readonly errorId: string | undefined;

  constructor(response: Response, body: unknown) {
    super(`Web Studio request failed with ${response.status} ${response.statusText}`);
    this.name = 'EldraHttpError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
    this.code = problemField(body, 'code');
    this.errorId = problemField(body, 'errorId');
  }
}

function problemField(body: unknown, field: 'code' | 'errorId'): string | undefined {
  if (body && typeof body === 'object' && field in body) {
    const value = (body as Record<string, unknown>)[field];
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

  const request = <T = unknown>(requestOptions: EldraRequestOptions) =>
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
    checkout: {
      handoffUrl: (handoff: EldraCheckoutHandoffOptions) => {
        const checkoutUrl = handoff.checkoutUrl ?? resolveRuntimeValue(options.checkoutUrl);
        if (!checkoutUrl) {
          throw new Error(
            'Missing checkout URL. Pass checkoutUrl to createEldraClient() or to handoffUrl().'
          );
        }
        const orgId = handoff.orgId ?? resolveOrgId(options);
        if (!orgId) {
          throw new Error('Missing Web Studio organization ID.');
        }
        const url = new URL(
          `${checkoutUrl.replace(/\/$/, '')}/checkout/${encodeURIComponent(orgId)}/${encodeURIComponent(handoff.cartId)}`
        );
        if (handoff.locale) url.searchParams.set('lang', handoff.locale);
        return url.toString();
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

function createHttpRequest(
  clientOptions: EldraClientOptions,
  requestOptions: EldraRequestOptions
): EldraHttpRequest {
  const method = requestOptions.method ?? (requestOptions.body === undefined ? 'GET' : 'POST');
  const headers = mergeHeaders(resolveRuntimeValue(clientOptions.headers), requestOptions.headers);
  const orgId = requestOptions.orgId ?? resolveOrgId(clientOptions);
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

function appendQueryValue(searchParams: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (Array.isArray(value)) {
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
