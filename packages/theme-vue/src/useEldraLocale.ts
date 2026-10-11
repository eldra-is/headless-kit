import { inject } from 'vue';
import { createEldraLocaleState, ELDRA_KEY, type EldraLocaleState } from './context';

/**
 * The locale this page is in, the locales the site serves, and how to spell a destination in one
 * of them.
 *
 * Call it once per component and keep what it returns — the state is reactive, so a template that
 * reads `active` or calls `path()` re-renders when the visitor changes language.
 *
 * Outside a themed app, and on a site whose organisation configures no locales, it answers the
 * one-unprefixed-site answer: `active` and `defaultLocale` `null`, `supported` empty, `path()` the
 * identity. A block can therefore read it unconditionally and render the same markup in a
 * Storybook story as on a single-locale site — which is also why a language switcher's own rule is
 * `supported.length > 1`, never "is there a locale at all".
 */
export function useEldraLocale(): EldraLocaleState {
  const context = inject(ELDRA_KEY, null);
  // Also the fallback for a context assembled before this state existed: an adapter one version
  // behind serves one unprefixed site rather than throwing inside a render.
  return context?.locales ?? INERT;
}

/**
 * One shared inert state, not one per call: it is immutable in every way that matters (nothing
 * writes to it) and a block calling this in `setup()` must not allocate a reactive object per
 * instance.
 */
const INERT: EldraLocaleState = createEldraLocaleState();
