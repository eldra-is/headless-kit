/**
 * Which one top-level entry of the header is "current".
 *
 * At most one is, by the product owner's rule: the entry for the page's MAIN category wins (a
 * product's primary category, or the category the page is), then the single best match for the
 * page's path, else none. `NavMenu` draws the result as `aria-current="page"` when the entry is the
 * page itself, `"true"` when it only holds it (an ancestor, or a menu that contains the page).
 */

export interface CurrentEntry {
  /** The entry's own destination, when it has one. */
  href: string | null | undefined;
  /** The destinations in its panel. */
  menu: readonly (string | null | undefined)[];
}

export interface CurrentContext {
  /** The page's own path. */
  path: string;
  /** The page's main category and its ancestors, root first (a product's primary category's trail). */
  trail: readonly string[];
}

export type CurrentMark = 'page' | 'true' | undefined;

function normalise(href: string | null | undefined): string | null {
  if (typeof href !== 'string' || href === '') return null;
  const bare = href.split(/[?#]/)[0] ?? '';
  if (!bare.startsWith('/')) return null;
  return bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
}

/** The length of the match: the whole path when equal, the entry's when it is an ancestor path; 0 for none. */
function matchLength(href: string | null | undefined, target: string): number {
  const own = normalise(href);
  if (own === null) return 0;
  if (own === target) return own.length;
  return own !== '/' && target.startsWith(`${own}/`) ? own.length : 0;
}

export function markCurrent(
  entries: readonly CurrentEntry[],
  context: CurrentContext
): CurrentMark[] {
  const marks: CurrentMark[] = entries.map(() => undefined);
  const path = normalise(context.path) ?? '';
  const specific = context.trail
    .map(normalise)
    .filter((href): href is string => href !== null)
    .reverse();

  // 1. The entry that links to the main category, else to its nearest ancestor that has an entry.
  for (const target of specific) {
    const at = entries.findIndex((entry) => normalise(entry.href) === target);
    if (at !== -1) {
      marks[at] = target === path ? 'page' : 'true';
      return marks;
    }
  }

  // 2. The most specific entry whose link or menu holds the page (or, failing that, its category):
  // the longest matching path wins, and an entry's own link beats a menu at the same length.
  for (const target of [path, ...specific]) {
    if (target === '') continue;
    let best = -1;
    let bestScore = 0;
    entries.forEach((entry, at) => {
      const own = matchLength(entry.href, target);
      const menu = Math.max(0, ...entry.menu.map((href) => matchLength(href, target)));
      const score = Math.max(own * 2 + (own > 0 ? 1 : 0), menu * 2);
      if (score > bestScore) {
        best = at;
        bestScore = score;
      }
    });
    if (best !== -1) {
      marks[best] = normalise(entries[best]!.href) === target && target === path ? 'page' : 'true';
      return marks;
    }
  }
  return marks;
}
