import {
  buildDynamicRoutePath,
  type CatalogDoc,
  type EldraClient,
  type EntryDoc,
} from '@eldrajs/theme-core';
import { localeQuery } from './locale';

export type CatalogRouteKind = 'product' | 'collection';

/** Which catalog object a resolved route is showing, and under which slug. */
export interface CatalogRouteRef {
  kind: CatalogRouteKind;
  slug: string;
}

/** The public list endpoints cap a page at 200; 100 keeps one response small
 * while halving the request count of the gateway's default page. */
const CATALOG_PAGE_SIZE = 100;

/** The only catalog status a storefront route may be generated for. */
const ACTIVE_STATUS = 'ACTIVE';

/**
 * Map a public catalog response onto the binding paths a catalog-backed route
 * template exposes. These keys are the documented, stable surface a template's
 * `bindings`/`templates` address — a product's `title`, `variants.0.price`,
 * `images.0.url` — so every one of them is always present, whatever the
 * response omitted. The gateway resolves a product's or collection's title and
 * description for the requested locale (falling back to the default one)
 * before serving it, so no translation table is walked here.
 *
 * Returns null when the response carries no id: an entry without one cannot be
 * addressed, overlaid or keyed, and inventing one would hide a broken read.
 */
export function projectCatalogEntry(kind: CatalogRouteKind, doc: unknown): EntryDoc | null {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
  const raw = doc as CatalogDoc;
  const id = text(raw.id);
  if (id === '') return null;
  return {
    id,
    data: kind === 'product' ? productProjection(raw) : collectionProjection(raw),
  };
}

function productProjection(raw: CatalogDoc): Record<string, unknown> {
  return {
    slug: text(raw.slug),
    title: text(raw.title),
    // Rich text: handed to the theme's rich-text renderer unchanged.
    description: raw.description ?? null,
    status: text(raw.status),
    categoryId: optionalText(raw.categoryId),
    tags: stringList(raw.tags),
    variants: list(raw.variants).map((variant) => ({
      sku: text(variant.sku),
      price: optionalNumber(variant.price),
      compareAtPrice: optionalNumber(variant.compareAtPrice),
      optionValues: list(variant.optionValues).map((value) => ({
        id: text(value.id),
        name: text(value.name),
        optionId: text(value.optionId),
        optionValueId: text(value.optionValueId),
      })),
    })),
    images: mediaList(raw.mediaLinks),
  };
}

function collectionProjection(raw: CatalogDoc): Record<string, unknown> {
  return {
    slug: text(raw.slug),
    title: text(raw.title),
    description: optionalText(raw.description),
    productCount: typeof raw.productCount === 'number' ? raw.productCount : 0,
    image: mediaItem(raw.image),
  };
}

/** Read one catalog object by slug and project it. A 404 is the caller's to
 * handle — it is the not-found shell, not an error. */
export async function loadCatalogEntry(
  client: EldraClient,
  kind: CatalogRouteKind,
  slug: string,
  locale?: string
): Promise<EntryDoc | null> {
  const query = localeQuery(locale);
  const doc =
    kind === 'product'
      ? await client.catalog.getProduct(slug, query)
      : await client.catalog.getCollection(slug, query);
  return projectCatalogEntry(kind, doc);
}

/** Page through every catalog object a storefront route may exist for. The
 * product list endpoint filters on status server-side; the collection list
 * serves published collections only and exposes no status field, so anything
 * it does report is filtered again below, client-side. */
export async function listCatalogDocs(
  client: EldraClient,
  kind: CatalogRouteKind,
  locale?: string
): Promise<CatalogDoc[]> {
  const docs: CatalogDoc[] = [];
  let page = 1;
  for (;;) {
    const list =
      kind === 'product'
        ? await client.catalog.listProducts({
            page,
            pageSize: CATALOG_PAGE_SIZE,
            ...localeQuery(locale),
            filter: [`status:eq:${ACTIVE_STATUS}`],
          })
        : await client.catalog.listCollections({
            page,
            pageSize: CATALOG_PAGE_SIZE,
            ...localeQuery(locale),
          });
    docs.push(...list.data);
    // A page that claims a successor but serves nothing would loop forever.
    if (list.meta.hasNext !== true || list.data.length === 0) return docs;
    page += 1;
  }
}

/** Turn catalog documents into the routes a template generates. A slug that
 * cannot become a path is skipped with a warning naming it; the build goes on,
 * because one unusable merchant record must not cost every other page. */
export function catalogDocRoutes(
  docs: readonly CatalogDoc[],
  pattern: string,
  warn: (message: string) => void = (message) => console.warn(message)
): string[] {
  const paths: string[] = [];
  for (const doc of docs) {
    if (!isActive(doc)) continue;
    const path = buildDynamicRoutePath(pattern, doc.slug);
    if (path === null) {
      warn(
        `[eldra] skipped ${routeLabel(pattern, doc.slug)}: unusable catalog slug ${JSON.stringify(
          text(doc.slug)
        )}`
      );
      continue;
    }
    paths.push(path);
  }
  return paths;
}

function isActive(doc: CatalogDoc): boolean {
  const status = doc.status;
  return typeof status !== 'string' || status.toUpperCase() === ACTIVE_STATUS;
}

/** The path the slug would have occupied, so a warning points at a route a
 * reader can recognise rather than at an opaque record id. */
function routeLabel(pattern: string, slug: unknown): string {
  return `${pattern.replace(/:[^/]*$/, '')}${text(slug)}`;
}

function mediaList(value: unknown): Array<{ url: string; alt: string }> {
  return list(value)
    .filter((item) => text(item.url) !== '')
    .map((item, index) => ({ item, index }))
    .sort((a, b) => sortOrder(a.item) - sortOrder(b.item) || a.index - b.index)
    .map(({ item }) => ({ url: text(item.url), alt: text(item.altText) }));
}

function mediaItem(value: unknown): { url: string; alt: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as CatalogDoc;
  const url = text(record.url);
  return url === '' ? null : { url, alt: text(record.altText) };
}

function sortOrder(item: CatalogDoc): number {
  return typeof item.sortOrder === 'number' ? item.sortOrder : Number.MAX_SAFE_INTEGER;
}

function list(value: unknown): CatalogDoc[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CatalogDoc =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
