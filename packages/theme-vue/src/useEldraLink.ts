import { resolveLink, type ResolvedLink } from '@eldrajs/theme-core/links';
import { inject } from 'vue';
import { ELDRA_KEY, type EldraLocaleState } from './context';

/**
 * Resolve a `link` field's value against the site's own routes.
 *
 * Call it once per component and keep the returned function — it closes over
 * the reactive link state, so every call reads whatever the adapter has filled
 * in by then, and a row re-resolves when a target arrives or a preview draft
 * changes the value.
 *
 * Outside a themed app (a block rendered in isolation, a story with no
 * provider) it resolves nothing: every value comes back `null`, which a block
 * already has to handle for a target that no longer exists.
 *
 * Every href it hands back is spelled in the **active content locale**
 * (`useEldraLocale()`), so a navigation resolved on `/is-IS/about` points at
 * `/is-IS/products/x` and a visitor cannot be dropped back into the default
 * language by following a link. The rewrite is idempotent, which is what lets a
 * theme's router-link component prefix as well without the two compounding.
 */
export function useEldraLink(): (value: unknown) => ResolvedLink | null {
  const context = inject(ELDRA_KEY, null);
  // Also `null` for a context assembled before this state existed: an adapter
  // one version behind resolves nothing rather than throwing inside a render.
  if (context === null || context.links === undefined) return () => null;
  return (value: unknown) => localized(resolveLink(value, context.links), context.locales);
}

/**
 * The resolved link with every same-site href under the active locale, children included.
 *
 * Short-circuits on the two states that need no rewrite — no locale state at all, and a page in
 * the locale served at `/` — because that is nearly every page of nearly every site, and a
 * navigation block resolves one of these per row on every render.
 */
function localized(
  link: ResolvedLink | null,
  locales: EldraLocaleState | undefined
): ResolvedLink | null {
  if (link === null || locales === undefined) return link;
  if (locales.active === null || locales.active === locales.defaultLocale) return link;
  const prefix = locales.path;
  const walk = (one: ResolvedLink): ResolvedLink => ({
    ...one,
    href: one.href === null ? null : prefix(one.href),
    children: one.children.map(walk),
  });
  return walk(link);
}
