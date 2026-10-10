/**
 * `Avatar`'s own initials logic (spec "Avatar" → Properties, `name` row: "first letter of given
 * and family name, uppercase"; Do/Don't: "keep initials to two letters"), pulled out of the
 * component the same way `roundRatingToHalf` is pulled out of `Rating` — a unit test can hit the
 * boundary case with nothing else in the render path to obscure a broken mutant.
 *
 * A name with two or more words takes the first letter of the first word and the first letter of
 * the last one — the spec's own two examples, "Maya Okafor" → "MO" and "Jonas Lindqvist" → "JL",
 * both come out of this rule directly. A single-word name (a mononym, a store handle) takes that
 * word's own first two letters, uppercase, so the avatar is never left with a lone letter when a
 * second one is sitting right there to show. An empty or all-whitespace name has no letters to
 * take, and returns `''` — `Avatar.vue` treats that the same as no name at all, falling on to the
 * icon.
 */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  const first = (words[0] as string).charAt(0);
  const last = (words[words.length - 1] as string).charAt(0);
  return `${first}${last}`.toUpperCase();
}
