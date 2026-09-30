import { resolveLink, type ResolvedLink } from '@eldrajs/theme-core/links';
import { inject } from 'vue';
import { ELDRA_KEY } from './context';

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
 */
export function useEldraLink(): (value: unknown) => ResolvedLink | null {
  const context = inject(ELDRA_KEY, null);
  if (context === null) return () => null;
  return (value: unknown) => resolveLink(value, context.links);
}
