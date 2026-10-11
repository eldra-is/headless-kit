import { resolvePagePath, type PageLike } from './pagePath';
import { stripStega } from './stega';

export const MAX_DYNAMIC_ROUTE_PATTERN_BYTES = 255;

export interface ParsedDynamicRoutePattern {
  value: string;
  prefixSegments: string[];
  paramName: string;
  /**
   * A trailing catch-all parameter (`/categories/:path*`): it matches **one or
   * more** segments rather than exactly one, and the parameter's value is the
   * remainder joined with `/` and no leading slash.
   *
   * `*` is forbidden everywhere else in a pattern, which is what keeps this the
   * only wildcard a route template can carry: one, last, immediately after the
   * parameter name.
   */
  catchAll: boolean;
}

export interface RouteTemplateLike {
  id: string;
  data: Record<string, unknown>;
}

export type DynamicRouteResolution<P extends PageLike, T extends RouteTemplateLike> =
  | { kind: 'static'; entry: P }
  | { kind: 'template'; template: T; params: Record<string, string> }
  | null;

export function parseDynamicRoutePattern(value: unknown): ParsedDynamicRoutePattern | null {
  if (
    typeof value !== 'string' ||
    value === '' ||
    new TextEncoder().encode(value).byteLength > MAX_DYNAMIC_ROUTE_PATTERN_BYTES ||
    !value.startsWith('/') ||
    value === '/' ||
    value.endsWith('/') ||
    value.includes('//') ||
    /[?#\\]/.test(value)
  )
    return null;
  const segments = value.slice(1).split('/');
  const parameter = segments.at(-1) ?? '';
  const prefixSegments = segments.slice(0, -1);
  if (
    // A static prefix carries neither a parameter nor a wildcard: the catch-all
    // below is only ever the *last* segment, so `/a*/:slug` and `/:a*/:b` are
    // refused rather than half-honoured.
    prefixSegments.some((segment) => segment === '' || /[:*]/.test(segment)) ||
    !parameter.startsWith(':') ||
    parameter.slice(1).includes(':')
  )
    return null;
  const catchAll = parameter.endsWith('*');
  // `:path**` leaves a `*` in the name, which the id shape below refuses — so
  // exactly one trailing star is accepted and nothing else is.
  const paramName = catchAll ? parameter.slice(1, -1) : parameter.slice(1);
  if (!/^[a-z][a-zA-Z0-9]{0,48}$/.test(paramName)) return null;
  return { value, prefixSegments, paramName, catchAll };
}

export function matchDynamicRoutePattern(
  pattern: unknown,
  path: unknown
): Record<string, string> | null {
  const parsed = parseDynamicRoutePattern(pattern);
  const segments = decodeRequestPath(path);
  if (parsed === null || segments === null) return null;
  const prefixLength = parsed.prefixSegments.length;
  // One segment exactly, or — for a catch-all — one or more. Never zero: a
  // pattern's own prefix (`/categories`) is not one of the paths it serves.
  if (parsed.catchAll ? segments.length < prefixLength + 1 : segments.length !== prefixLength + 1) {
    return null;
  }
  if (parsed.prefixSegments.some((segment, index) => segment !== segments[index])) return null;
  const rest = segments.slice(prefixLength);
  // Every segment is already decoded and separator-free (`decodeRequestPath`
  // refuses a `%2F`), so the join cannot invent a boundary that was not in the
  // request.
  const value = parsed.catchAll ? rest.join('/') : (rest[0] ?? '');
  return value === '' ? null : { [parsed.paramName]: value };
}

export function resolveRoute<P extends PageLike, T extends RouteTemplateLike>(
  path: unknown,
  input: { pages: readonly P[]; templates: readonly T[] }
): DynamicRouteResolution<P, T> {
  const segments = decodeRequestPath(path);
  if (segments === null) return null;
  const normalizedPath = '/' + segments.join('/');
  const staticEntry = input.pages.find(
    (page) => resolvePagePath(page, [...input.pages]) === normalizedPath
  );
  if (staticEntry !== undefined) return { kind: 'static', entry: staticEntry };
  for (const template of input.templates) {
    const pattern = stripTemplateString(template.data.routePattern);
    const slugField = stripTemplateString(template.data.slugField);
    const parsed = parseDynamicRoutePattern(pattern);
    if (parsed === null || parsed.paramName !== slugField) continue;
    const params = matchDynamicRoutePattern(pattern, normalizedPath);
    if (params !== null) return { kind: 'template', template, params };
  }
  return null;
}

export function buildDynamicRoutePath(pattern: unknown, slugValue: unknown): string | null {
  const parsed = parseDynamicRoutePattern(pattern);
  const value = stripTemplateString(slugValue);
  if (parsed === null || value === '' || /[\\?#]/.test(value) || /[\p{Cc}\p{Cf}]/u.test(value))
    return null;
  // A `/` is a path separator for a catch-all and a refusal for everything
  // else: a single-segment parameter whose value carries one is not a slug, and
  // encoding it would address a segment nobody can route to.
  if (!parsed.catchAll) {
    if (value.includes('/')) return null;
    return `/${[...parsed.prefixSegments, encodeURIComponent(value)].join('/')}`;
  }
  const rest = value.split('/');
  // `a//b`, a leading or a trailing slash: none of those is a canonical path,
  // and padding the gap would silently address a different object.
  if (rest.some((segment) => segment === '')) return null;
  return `/${[...parsed.prefixSegments, ...rest.map((s) => encodeURIComponent(s))].join('/')}`;
}

/**
 * Recognises a catalog route template's schema id (e.g. a route template's
 * `data.schemaApiId`) as a product, collection or category target,
 * stega-stripped and matched exactly. Anything else — including a related but
 * different id, or a non-string — returns null.
 */
export function catalogRouteTarget(
  schemaApiId: unknown
): 'product' | 'collection' | 'category' | null {
  const value = stripTemplateString(schemaApiId);
  if (value === 'catalog:product') return 'product';
  if (value === 'catalog:collection') return 'collection';
  if (value === 'catalog:category') return 'category';
  return null;
}

function decodeRequestPath(path: unknown): string[] | null {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('//') ||
    /[?#\\]/.test(path)
  )
    return null;
  const canonicalPath = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path;
  if (canonicalPath === '/') return [];
  const rawSegments = canonicalPath.slice(1).split('/');
  const segments: string[] = [];
  try {
    for (const raw of rawSegments) {
      const decoded = decodeURIComponent(raw);
      if (decoded === '' || /[/\\]/.test(decoded) || /[\p{Cc}\p{Cf}]/u.test(decoded)) return null;
      segments.push(decoded);
    }
  } catch {
    return null;
  }
  return segments;
}

function stripTemplateString(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
}
