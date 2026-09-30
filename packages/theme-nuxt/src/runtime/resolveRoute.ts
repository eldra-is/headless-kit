import {
  catalogRouteTarget,
  EldraClientError,
  resolveRoute,
  stripStega,
  type EldraClient,
  type EntryDoc,
} from '@eldrajs/theme-core';
import { linkTargetKeys, type LinkTargetInfo } from '@eldrajs/theme-core/links';
import { loadCatalogEntry, type CatalogRouteRef } from './catalog';
import { collectLinkTargets } from './links';
import { localeQuery } from './locale';

export interface ResolvedEldraRoute {
  page: EntryDoc | null;
  template: EntryDoc | null;
  entry: EntryDoc | null;
  /** Set only for a catalog-backed route template: which catalog object the
   * template is rendering, so a storefront surface can set its route context
   * without re-parsing the path. */
  catalog: CatalogRouteRef | null;
  /**
   * What `resolveLink` needs to turn this document's `link` values into hrefs.
   * Filled from the page and route-template lists this resolution already
   * reads, plus one batched read per target type — and filled *here*, under the
   * page's own async-data key, so a `nuxi generate` build bakes it into the
   * payload and a prerendered page resolves every href with no client request.
   */
  links: {
    pages: EntryDoc[];
    templates: EntryDoc[];
    targets: Map<string, LinkTargetInfo>;
  };
}

export const EMPTY_ELDRA_ROUTE: ResolvedEldraRoute = {
  page: null,
  template: null,
  entry: null,
  catalog: null,
  links: { pages: [], templates: [], targets: new Map() },
};

export interface EldraRouteSchemas {
  pageSchema: string;
  routeTemplateSchema: string;
}

/**
 * Resolve one request path against the site's pages and route templates.
 *
 * Every read below puts the locale through `localeQuery`, so a blank one — what
 * a site that configured none actually carries — becomes no `locale` key at
 * all rather than an empty `?locale=` the gateway answers with 400.
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
      const page = await client.getEntry(schemas.pageSchema, match.entry.id, {
        depth: 3,
        ...localeQuery(locale),
      });
      return {
        page,
        template: null,
        entry: null,
        catalog: null,
        links: await linkState(client, pages, templates, page, locale),
      };
    }
    const schemaApiId = plainString(match.template.data.schemaApiId);
    const slugField = plainString(match.template.data.slugField);
    const slugValue = match.params[slugField];
    if (schemaApiId === '' || slugField === '' || slugValue === undefined) return EMPTY_ELDRA_ROUTE;
    const loadTemplate = client.getEntry(schemas.routeTemplateSchema, match.template.id, {
      depth: 3,
      ...localeQuery(locale),
    });
    const catalogKind = catalogRouteTarget(schemaApiId);
    if (catalogKind !== null) {
      const [template, entry] = await Promise.all([
        loadTemplate,
        loadCatalogEntry(client, catalogKind, slugValue, locale),
      ]);
      if (entry === null) return EMPTY_ELDRA_ROUTE;
      return {
        page: null,
        template,
        entry,
        catalog: { kind: catalogKind, slug: slugValue },
        links: await linkState(client, pages, templates, template, locale),
      };
    }
    const [template, entry] = await Promise.all([
      loadTemplate,
      client.getEntryByUniqueField(schemaApiId, slugField, slugValue, {
        depth: 3,
        ...localeQuery(locale),
      }),
    ]);
    return {
      page: null,
      template,
      entry,
      catalog: null,
      links: await linkState(client, pages, templates, template, locale),
    };
  } catch (cause) {
    if (cause instanceof EldraClientError && cause.status === 404) return EMPTY_ELDRA_ROUTE;
    throw cause;
  }
}

/**
 * The link context for one resolved document: the pages and route templates
 * this resolution already fetched — and used to discard — plus what the site
 * knows about every target its blocks name.
 *
 * The keys come from walking the document's own block data with
 * `linkTargetKeys`, so an unlinked page pays for no reads at all. An entry
 * target carries no schema of its own, so the schemas read are the ones the
 * site has a route template for: an entry no template serves has no href to
 * resolve to anyway.
 */
async function linkState(
  client: EldraClient,
  pages: EntryDoc[],
  templates: EntryDoc[],
  document: EntryDoc | null,
  locale?: string
): Promise<ResolvedEldraRoute['links']> {
  const keys = collectDocumentTargetKeys(document);
  const targets =
    keys.length === 0
      ? new Map<string, LinkTargetInfo>()
      : await collectLinkTargets(client, keys, locale, {
          entrySchemaApiIds: entryTemplateSchemas(templates),
          pages,
        });
  return { pages, templates, targets };
}

/**
 * How deep the generic walk below goes before it gives up.
 *
 * The bound is not a guess at how a document is shaped: the block grammar caps
 * composite nesting at 5, each of those levels costs two steps here (the object
 * and the array around it), and the document adds its own envelope — blocks, a
 * layout tree, a reusable component's projection — on top. 64 is far past every
 * one of those together, while still ending a walk through a value that
 * somehow refers back to itself.
 */
export const MAX_TARGET_WALK_DEPTH = 64;

/**
 * Every target key the document's blocks name, deduplicated. Walks the block
 * data generically rather than knowing which fields are links, so a theme
 * adding a link field needs no change here.
 *
 * Reaching the bound is reported rather than swallowed. A key this walk misses
 * is a target never read, so its link renders unlinked on the generated site —
 * which looks exactly like a target that was deleted. A build has to be able to
 * tell those two apart.
 */
export function collectDocumentTargetKeys(
  document: EntryDoc | null,
  warn: (message: string) => void = (message) => console.warn(message)
): string[] {
  if (document === null) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  let truncated = false;
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_TARGET_WALK_DEPTH) {
      truncated = true;
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const key of linkTargetKeys(value)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    for (const nested of Object.values(value as Record<string, unknown>)) visit(nested, depth + 1);
  };
  visit(document.data, 0);
  if (truncated) {
    warn(
      `[eldra] stopped looking for link targets ${MAX_TARGET_WALK_DEPTH} levels into entry ` +
        `${document.id}; any link nested deeper than that renders without a destination`
    );
  }
  return keys;
}

/** The CMS schemas the site routes, catalog ids excluded. */
function entryTemplateSchemas(templates: EntryDoc[]): string[] {
  const schemas: string[] = [];
  for (const template of templates) {
    const schemaApiId = plainString(template.data.schemaApiId);
    if (schemaApiId === '' || schemaApiId.startsWith('catalog:') || schemas.includes(schemaApiId)) {
      continue;
    }
    schemas.push(schemaApiId);
  }
  return schemas;
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
      ...localeQuery(locale),
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
