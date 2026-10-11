/** What the document's `<title>` falls back to when nothing named the page. */
const FALLBACK_TITLE = 'Site';

export interface PageTitleParts {
  /** The route is showing the not-found shell. */
  isNotFound: boolean;
  /** The translated not-found title. */
  notFoundTitle: string;
  /**
   * The title of the catalog object a catalog-backed route resolved to — a product's or a
   * collection's own name. `null`/absent for every other route.
   */
  catalogTitle?: unknown;
  /** The page or route-template document's own `title` field. */
  documentTitle?: unknown;
}

/**
 * The document title for one route, in priority order: the not-found shell names itself; a
 * catalog-backed route is named by the object it is showing; anything else by its own document.
 *
 * The catalog case is the reason this is a function rather than one expression in the page: a
 * product route renders through a route *template*, and the template's own title is the template's
 * name ("Product") — the same three words on every product page, which is what a browser tab, a
 * bookmark and a search result would have shown.
 *
 * Titles arrive as `unknown` (a document field, which is data the CMS holds, not a typed prop), so
 * anything that is not a non-blank string is treated as absent rather than rendered.
 */
export function pageTitle(parts: PageTitleParts): string {
  if (parts.isNotFound) return parts.notFoundTitle;
  return text(parts.catalogTitle) ?? text(parts.documentTitle) ?? FALLBACK_TITLE;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
