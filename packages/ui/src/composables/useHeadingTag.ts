import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';

/**
 * The heading levels a component's own title can take under whatever heading its surrounding
 * block already put on the page (spec: "follows the block") — `2` through `6`, never `1`: a
 * component never claims the page's own top-level heading for itself. Shared by every component
 * whose `headingLevel` prop picks a `<component :is="\`h${level}\`">` tag: `ContentCard`,
 * `FeatureCard`, `ProductCard`, `EmptyState`. `FormLayout`'s own `FormLayoutHeadingLevel` (`2 | 3 |
 * 4`, narrower — a form's own title realistically never sits six levels deep) is declared as a
 * subtype of this one rather than a separate, unrelated union.
 */
export type HeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * Turns a `headingLevel` prop into the tag name `<component :is>` renders — pulled out of the five
 * components that each redeclared the identical `computed(() => \`h${props.headingLevel}\`)`
 * (`ContentCard`, `FeatureCard`, `ProductCard`, `EmptyState`, `FormLayout`) so the one-line mapping
 * lives once. Takes a ref/getter, not the level itself, so the returned tag name stays reactive to
 * a `headingLevel` prop changing after mount, the same way each component's own inline `computed`
 * already did.
 *
 * ```ts
 * const headingTag = useHeadingTag(() => props.headingLevel);
 * ```
 */
export function useHeadingTag(
  level: MaybeRefOrGetter<HeadingLevel>
): ComputedRef<`h${HeadingLevel}`> {
  return computed(() => `h${toValue(level)}` as `h${HeadingLevel}`);
}
