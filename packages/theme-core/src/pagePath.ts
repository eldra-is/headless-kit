import { stripStega } from './stega';

export interface PageLike {
  id: string;
  data: Record<string, unknown>;
}

/** contracts §6: path = "/" + ancestor slugs (parent-first) + own slug.
 *  A no-parent page with slug "home" contributes nothing — so home itself is "/"
 *  and children of home are "/<child>". Parent may be an id string or a resolved doc. */
export function resolvePagePath(page: PageLike, allPages: PageLike[]): string {
  const byId = new Map(allPages.map((p) => [p.id, p]));
  const slugs: string[] = [];
  const seen = new Set<string>();
  let current: PageLike | undefined = page;
  while (current !== undefined) {
    if (seen.has(current.id))
      throw new Error(`resolvePagePath: parent cycle at page ${current.id}`);
    seen.add(current.id);
    const rawSlug = current.data.slug;
    const slug = typeof rawSlug === 'string' ? stripStega(rawSlug).trim() : '';
    const parentId = parentIdOf(current.data.parent);
    const isRootHome = parentId === null && slug === 'home';
    if (!isRootHome && slug !== '') slugs.unshift(slug);
    current = parentId !== null ? byId.get(parentId) : undefined;
  }
  return '/' + slugs.join('/');
}

function parentIdOf(parent: unknown): string | null {
  if (typeof parent === 'string' && parent !== '') return parent;
  if (
    typeof parent === 'object' &&
    parent !== null &&
    typeof (parent as { id?: unknown }).id === 'string'
  ) {
    return (parent as { id: string }).id;
  }
  return null;
}
