import { expandReusableLayout, type EntryDoc } from '@eldrajs/theme-core';
import type { ResolvedEldraRoute } from './resolveRoute';

/**
 * A draft preview session's resolution, in the shape a published page's has (WS-1358).
 *
 * A session reads the drafts from Core's **preview** perspective, which serves a page or route
 * template that places a shared component with the placement kept and a
 * `reusableComponentProjection` beside it — the shape Studio's overlay needs, since it addresses a
 * node inside a component by its authored id and its placement. Rendered as it is, every such node
 * carries its authored id in `data-eldra-layout-node` and a `data-eldra-reusable-placement` the
 * published page does not have, and its Vue key differs from the hydrated one, so the component's
 * whole subtree is built again rather than patched. A session has no overlay, and what it must show
 * is what Publish puts live, so each document is expanded here exactly as Core's public read
 * expands it (`expandReusableLayout`), and the projection dropped.
 *
 * A document whose projection does not expand is left as it is: the layout then fails closed on it
 * exactly as it would have.
 */
export function asPublishedRoute(route: ResolvedEldraRoute): ResolvedEldraRoute {
  return {
    ...route,
    page: asPublishedDocument(route.page, false),
    template: asPublishedDocument(route.template, true),
    links: {
      ...route.links,
      pages: route.links.pages.map((page) => asPublishedDocument(page, false)),
      templates: route.links.templates.map((template) => asPublishedDocument(template, true)),
    },
  };
}

function asPublishedDocument<T extends EntryDoc | null>(doc: T, routeTemplate: boolean): T {
  if (doc === null || !('reusableComponentProjection' in doc)) return doc;
  const { reusableComponentProjection, ...rest } = doc as EntryDoc & {
    reusableComponentProjection?: unknown;
  };
  const data = (rest.data ?? {}) as Record<string, unknown>;
  try {
    const layout = expandReusableLayout(data.layout, reusableComponentProjection, {
      routeTemplate,
    });
    return { ...rest, data: { ...data, layout } } as T;
  } catch {
    return doc;
  }
}
