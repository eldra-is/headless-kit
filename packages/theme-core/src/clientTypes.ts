export interface EldraClientOptions {
  gatewayUrl: string; // web-gateway origin, no path suffix
  orgId: string; // sent as X-Org-Id on every request
  stega?: boolean; // default false; encoding also requires enablePreview()
  fetch?: typeof globalThis.fetch; // injectable for tests/SSR
}

export class EldraClientError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, statusText: string, path: string) {
    super(`[eldra] gateway request failed: ${status} ${statusText} for ${path}`);
    this.name = 'EldraClientError';
    this.status = status;
    this.path = path;
  }
}

export interface PageMeta {
  hasNext: boolean;
  hasPrev: boolean;
  page: number;
  pageSize: number;
  rows: number;
  total: number;
  totalPages: number;
}

export interface EntryDoc {
  id: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EntryList {
  data: EntryDoc[];
  meta: PageMeta;
}

export interface EntryQuery {
  locale?: string;
  depth?: number;
  page?: number;
  pageSize?: number;
  sort?: string[];
  filter?: string[];
  fields?: string[];
}

/** The query the public catalog read endpoints accept. A subset of `EntryQuery`
 * on purpose: catalog reads have no `depth`, `sort` or `fields`. */
export interface CatalogQuery {
  locale?: string;
  page?: number;
  pageSize?: number;
  filter?: string[];
}

/**
 * A public catalog document — a product or a collection — exactly as the
 * gateway serves it. No response shape is declared here: the catalog is not
 * CMS content, its documents are never stega-encoded or locale-projected, and
 * a consumer reads one through a projection rather than field by field.
 */
export type CatalogDoc = Record<string, unknown>;

export interface CatalogList {
  data: CatalogDoc[];
  meta: PageMeta;
}

/** Read-only catalog access: the four public endpoints a theme needs to render
 * and prerender catalog-backed routes. Writes (cart, checkout, orders) are not
 * part of the theme client. */
export interface EldraCatalogReader {
  getProduct(productIdOrSlug: string, query?: CatalogQuery): Promise<CatalogDoc>;
  listProducts(query?: CatalogQuery): Promise<CatalogList>;
  getCollection(slug: string, query?: CatalogQuery): Promise<CatalogDoc>;
  listCollections(query?: CatalogQuery): Promise<CatalogList>;
}

export interface ResolveEntryListBody {
  schemas: string[];
  filters?: Array<{ schemaId: string; fieldId: string; operator: string; value: unknown }>;
  displayAs?: string;
  orderBy?: string;
  pageSize?: number;
}

export interface EldraClient {
  /** Public catalog reads, for catalog-backed route templates. */
  catalog: EldraCatalogReader;
  getEntries(schemaIdentifier: string, query?: EntryQuery): Promise<EntryList>;
  getEntry(schemaIdentifier: string, entryId: string, query?: EntryQuery): Promise<EntryDoc>;
  getEntryByUniqueField(
    schemaIdentifier: string,
    fieldId: string,
    value: string,
    query?: EntryQuery
  ): Promise<EntryDoc>;
  resolveEntryListField(
    entryId: string,
    fieldId: string,
    query?: EntryQuery
  ): Promise<Record<string, unknown>>;
  resolveEntryList(
    body: ResolveEntryListBody,
    query?: EntryQuery
  ): Promise<Record<string, unknown>>;
  getTypeScriptDefinitions(opts?: {
    schemas?: string[];
    maxDepth?: number;
    moduleName?: string;
  }): Promise<string>;
  enablePreview(token: string): void; // switches to draft perspective (X-Preview-Token + no-store)
  disablePreview(): void;
  readonly previewEnabled: boolean;
  /** stega-encode all string leaves of an entry-shaped data doc (exported for draft re-stega in B6).
   * `apiId` (the entry's own schemaApiId, when known) skips encoding a registered
   * `select` field's resolved value, top-level or nested inside a `list`'s composite
   * item — see the doc comment on the implementation. */
  encodeEntryDataStega(
    entryId: string,
    data: Record<string, unknown>,
    locale: string | null,
    apiId?: string
  ): Record<string, unknown>;
}
