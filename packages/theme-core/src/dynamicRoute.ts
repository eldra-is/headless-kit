import { resolvePagePath, type PageLike } from './pagePath';
import { stripStega } from './stega';

export const MAX_DYNAMIC_ROUTE_PATTERN_BYTES = 255;

export interface ParsedDynamicRoutePattern {
  value: string;
  prefixSegments: string[];
  paramName: string;
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
    /[?#*\\]/.test(value)
  )
    return null;
  const segments = value.slice(1).split('/');
  const parameter = segments.at(-1) ?? '';
  const prefixSegments = segments.slice(0, -1);
  if (
    prefixSegments.some((segment) => segment === '' || segment.includes(':')) ||
    !parameter.startsWith(':') ||
    parameter.slice(1).includes(':')
  )
    return null;
  const paramName = parameter.slice(1);
  if (!/^[a-z][a-zA-Z0-9]{0,48}$/.test(paramName)) return null;
  return { value, prefixSegments, paramName };
}

export function matchDynamicRoutePattern(
  pattern: unknown,
  path: unknown
): Record<string, string> | null {
  const parsed = parseDynamicRoutePattern(pattern);
  const segments = decodeRequestPath(path);
  if (parsed === null || segments === null || segments.length !== parsed.prefixSegments.length + 1)
    return null;
  if (parsed.prefixSegments.some((segment, index) => segment !== segments[index])) return null;
  const value = segments.at(-1) ?? '';
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
  if (parsed === null || value === '' || /[/\\?#]/.test(value) || /[\p{Cc}\p{Cf}]/u.test(value))
    return null;
  return `/${[...parsed.prefixSegments, encodeURIComponent(value)].join('/')}`;
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
