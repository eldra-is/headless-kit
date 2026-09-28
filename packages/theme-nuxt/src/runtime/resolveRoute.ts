import {
  catalogRouteTarget,
  EldraClientError,
  resolveRoute,
  stripStega,
  type EldraClient,
  type EntryDoc,
} from '@eldrajs/theme-core';
import { loadCatalogEntry, type CatalogRouteRef } from './catalog';

export interface ResolvedEldraRoute {
  page: EntryDoc | null;
  template: EntryDoc | null;
  entry: EntryDoc | null;
  /** Set only for a catalog-backed route template: which catalog object the
   * template is rendering, so a storefront surface can set its route context
   * without re-parsing the path. */
  catalog: CatalogRouteRef | null;
}

export const EMPTY_ELDRA_ROUTE: ResolvedEldraRoute = {
  page: null,
  template: null,
  entry: null,
  catalog: null,
};

export interface EldraRouteSchemas {
  pageSchema: string;
  routeTemplateSchema: string;
}

/**
 * Resolve one request path against the site's pages and route templates.
 *
 * A miss — no match, a template without a usable slug, or a 404 from the
 * gateway for the matched page, entry or catalog object — resolves to the
 * empty route, which the theme renders as its not-found shell. Every other
 * failure is thrown, so the caller can show its error branch instead of
 * silently claiming the page does not exist.
 */
export async function resolveEldraRoute(
  client: EldraClient,
  schemas: EldraRouteSchemas,
  path: string,
  locale?: string
): Promise<ResolvedEldraRoute> {
  try {
    const [pages, templates] = await Promise.all([
      listAllEntries(client, schemas.pageSchema, locale),
      listRouteTemplates(client, schemas.routeTemplateSchema, locale),
    ]);
    const match = resolveRoute(path, { pages, templates });
    if (match === null) return EMPTY_ELDRA_ROUTE;
    if (match.kind === 'static') {
      const page = await client.getEntry(schemas.pageSchema, match.entry.id, { depth: 3, locale });
      return { page, template: null, entry: null, catalog: null };
    }
    const schemaApiId = plainString(match.template.data.schemaApiId);
    const slugField = plainString(match.template.data.slugField);
    const slugValue = match.params[slugField];
    if (schemaApiId === '' || slugField === '' || slugValue === undefined) return EMPTY_ELDRA_ROUTE;
    const loadTemplate = client.getEntry(schemas.routeTemplateSchema, match.template.id, {
      depth: 3,
      locale,
    });
    const catalogKind = catalogRouteTarget(schemaApiId);
    if (catalogKind !== null) {
      const [template, entry] = await Promise.all([
        loadTemplate,
        loadCatalogEntry(client, catalogKind, slugValue, locale),
      ]);
      if (entry === null) return EMPTY_ELDRA_ROUTE;
      return { page: null, template, entry, catalog: { kind: catalogKind, slug: slugValue } };
    }
    const [template, entry] = await Promise.all([
      loadTemplate,
      client.getEntryByUniqueField(schemaApiId, slugField, slugValue, { depth: 3, locale }),
    ]);
    return { page: null, template, entry, catalog: null };
  } catch (cause) {
    if (cause instanceof EldraClientError && cause.status === 404) return EMPTY_ELDRA_ROUTE;
    throw cause;
  }
}

export async function listAllEntries(
  client: EldraClient,
  schemaApiId: string,
  locale?: string
): Promise<EntryDoc[]> {
  const entries: EntryDoc[] = [];
  let page = 1;
  for (;;) {
    const response = await client.getEntries(schemaApiId, {
      page,
      pageSize: 100,
      depth: 0,
      locale,
    });
    entries.push(...response.data);
    if (!response.meta.hasNext) return entries;
    page += 1;
  }
}

async function listRouteTemplates(
  client: EldraClient,
  schemaApiId: string,
  locale?: string
): Promise<EntryDoc[]> {
  try {
    return await listAllEntries(client, schemaApiId, locale);
  } catch (cause) {
    // Upgrade bootstrap: manifest ingest creates this system schema for
    // sites that predate dynamic pages. Static pages must remain renderable
    // in the artifact that performs that first ingest.
    if (cause instanceof EldraClientError && cause.status === 404) return [];
    throw cause;
  }
}

function plainString(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
}
