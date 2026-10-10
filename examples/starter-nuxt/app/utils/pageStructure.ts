/**
 * Where a page's block list is cut into the three landmark regions a document needs.
 *
 * A CMS page is one flat, author-ordered list of blocks. Rendering all of it inside
 * `<main id="main">` is what the starter used to do, and it costs the page both of its outer
 * landmarks: `navigation` renders a `<header>` and `footer` renders a `<footer>`, but neither maps
 * to the `banner` / `contentinfo` role while it is a descendant of `<main>` (HTML-AAM: those two
 * elements only take their landmark role when they are *not* scoped to a sectioning element). The
 * skip link in `app/app.vue` targets `#main`, so with the header inside `<main>` the one
 * affordance that exists to jump *over* the navigation landed the visitor above it.
 *
 * So `app/pages/[...slug].vue` partitions the list here and renders the three parts as three
 * sibling zones: leading structure blocks before `<main>`, a trailing `footer` after it,
 * everything else inside. `test/support/mountPage.ts` (and the page stories) mirror the same
 * split, so a page spec tests the shape the route really renders.
 *
 * The rule is deliberately positional rather than "every block of category `structure`":
 *
 * - `header` is the *leading run* of blocks whose apiId is in {`announcement-bar`, `navigation`} —
 *   the two blocks that belong above the content. Taken as a prefix run, so an author who puts a
 *   second announcement bar halfway down the page keeps it where they put it (inside `<main>`)
 *   instead of having it silently teleported into the banner.
 * - `footer` is a *trailing* `footer` block (at most one, the last block in the list). A `footer`
 *   block anywhere else stays in `<main>`, where a `<footer>` is legal markup for a section's
 *   own footer and carries no landmark role.
 * - Everything else is `main`, in its original order. `breadcrumbs` deliberately stays inside
 *   `<main>`: the spec puts it below the header as page content, and it renders a `<nav>`, which
 *   is a landmark wherever it sits.
 *
 * A page with no `navigation` block simply has no `banner` — the partition never invents markup.
 */

/** apiIds that form the page header, when they lead the block list. */
export const LEADING_STRUCTURE_API_IDS: readonly string[] = ['announcement-bar', 'navigation'];

/** The one apiId that forms the page footer, when it ends the block list. */
export const TRAILING_STRUCTURE_API_ID = 'footer';

export interface PartitionedPageBlocks<T> {
  /** Rendered before `<main>` — the `banner` region. */
  header: T[];
  /** Rendered inside `<main id="main">`. */
  main: T[];
  /** Rendered after `<main>` — the `contentinfo` region. */
  footer: T[];
}

/**
 * Splits a page's block list into header / main / footer.
 *
 * Generic over the block shape because the two callers carry the apiId differently: the route
 * template has `EntryDoc`s (apiId via `getBlockSchemaApiId`), the test/story harness has
 * `{apiId, id, data}` fixture entries. `apiIdOf` may return `null` for a block whose schema
 * cannot be resolved — such a block is never treated as structure.
 */
export function partitionPageBlocks<T>(
  blocks: readonly T[],
  apiIdOf: (block: T) => string | null
): PartitionedPageBlocks<T> {
  const list = [...blocks];

  let leading = 0;
  while (leading < list.length) {
    const block = list[leading];
    if (block === undefined || !LEADING_STRUCTURE_API_IDS.includes(apiIdOf(block) ?? '')) break;
    leading += 1;
  }
  const header = list.slice(0, leading);
  const rest = list.slice(leading);

  const last = rest[rest.length - 1];
  const hasTrailingFooter = last !== undefined && apiIdOf(last) === TRAILING_STRUCTURE_API_ID;
  const footer = hasTrailingFooter && last !== undefined ? [last] : [];
  const main = hasTrailingFooter ? rest.slice(0, -1) : rest;

  return { header, main, footer };
}
