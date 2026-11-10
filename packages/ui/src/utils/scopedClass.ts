import { getCurrentInstance, inject } from 'vue';
import { NO_HOLD, heldScope } from './scopedComputed';

export { computed } from './scopedComputed';
import { ELDRA_SCOPE_KEY } from '../composables/useEldraScope';
import { flattenClasses, mergeClassList, warnArrayClassesValue, type ClassValue } from './cx';

export type { ClassValue };

/**
 * The prefix every class this package authors carries below `provideEldraScope()`, and every class
 * selector in `scoped.css` (see `scripts/scoped-css.mjs`). With it, a consumer Tailwind build's own
 * utilities (`.rounded-md`, `.px-4`) can never match a kit element, so `scoped.css` can sit in a
 * cascade layer below the consumer's utilities and a class the consumer puts on a component wins,
 * the way it does on their own markup.
 */
export const KIT_CLASS_PREFIX = 'eldra:';

/**
 * Markers that only name an ancestor for a `group-*`/`peer-*` variant and carry no style of their
 * own. They stay unprefixed on both sides, so a consumer's own `group/section` (a coloured
 * section) still drives the kit's section variants.
 */
const isMarker = (name: string) => /^(group|peer)(\/|$)/.test(name);

const stripPrefix = (name: string) =>
  name.startsWith(KIT_CLASS_PREFIX) ? name.slice(KIT_CLASS_PREFIX.length) : name;
const withPrefix = (name: string) =>
  isMarker(name) || name.startsWith(KIT_CLASS_PREFIX) ? name : `${KIT_CLASS_PREFIX}${name}`;
const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean);

/**
 * Whether the component rendering now is below `provideEldraScope()`. The class computeds run while
 * their component renders, when Vue has a current instance, so no call site passes the scope; a
 * call outside any component (a module-level constant) is unprefixed and gets its prefix where it
 * is bound, through `cx` or `partClass` in render.
 */
function inScope(): boolean {
  const held = heldScope();
  if (held !== NO_HOLD) return held !== undefined;
  return getCurrentInstance() !== null && inject(ELDRA_SCOPE_KEY, undefined) !== undefined;
}

/**
 * The package's own `cx` for its components: the public `cx`, and below a scope every class
 * prefixed. A class that already carries the prefix (from a nested `cx`) is merged by its plain
 * name, so the last one still wins.
 */
export function cx(...inputs: ClassValue[]): string {
  const merged = mergeClassList(flattenClasses(inputs).map(stripPrefix).join(' '));
  return inScope() ? tokens(merged).map(withPrefix).join(' ') : merged;
}

/**
 * The package's own `partClass`: the public one, and below a scope the part's classes prefixed while
 * the consumer's override keeps its own names, so the consumer's CSS styles it. An override class
 * that already carries the prefix came from a component of this package passing its own classes to
 * another, and stays the kit's. A consumer class still replaces a kit class it conflicts with.
 */
export function partClass<P extends string>(
  base: string,
  classes: Partial<Record<P, string>> | undefined,
  part: P
): string {
  const override = classes?.[part] as unknown;
  if (Array.isArray(override)) warnArrayClassesValue(part);
  const overrideTokens = tokens(flattenClasses([override]).join(' '));
  if (!inScope()) return mergeClassList([base, ...overrideTokens].join(' ').trim());
  const consumer = new Set(overrideTokens.filter((name) => !name.startsWith(KIT_CLASS_PREFIX)));
  const merged = mergeClassList([...tokens(base), ...overrideTokens].map(stripPrefix).join(' '));
  return tokens(merged)
    .map((name) => (consumer.has(name) ? name : withPrefix(name)))
    .join(' ');
}

/**
 * A component template's own fixed classes (`:class="kit('size-4 shrink-0')"`): unchanged without a
 * scope, prefixed below one. For a string with nothing to merge; `cx` for one that may conflict.
 */
export function kit(classes: string): string {
  return inScope() ? tokens(classes).map(withPrefix).join(' ') : classes;
}

/**
 * `kit` bound to the calling component's scope at setup, for classes a composable writes onto the
 * DOM itself (`classList`) outside any render.
 */
export function useKitClass(): (classes: string) => string {
  const scoped = getCurrentInstance() !== null && inject(ELDRA_SCOPE_KEY, undefined) !== undefined;
  return (classes) => (scoped ? tokens(classes).map(withPrefix).join(' ') : classes);
}
