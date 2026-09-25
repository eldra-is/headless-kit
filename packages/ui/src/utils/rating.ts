/**
 * `Rating`'s own rounding and star-fill logic (spec "Rating" → Properties, `value` row: "Stars
 * round to the nearest 0.5; the value shows one decimal (4.0, 4.5)."), pulled out of the component
 * so the rounding boundary — the one guard the task brief calls out for mutation testing — has a
 * unit test with nothing else in the render path to obscure a broken mutant.
 */

/**
 * Rounds a 0–5 rating to the nearest half star. Out-of-range input is clamped first (`5.3` or
 * `-1`), so a caller's bad data renders a legal 0–5 rating rather than a sixth star or a negative
 * one — `Rating` has no prop validation of its own beyond TypeScript's `number`.
 *
 * The boundary case is exactness at `x.25`/`x.75`: `Math.round` breaks ties up for positive
 * numbers, so `4.25 * 2 = 8.5` rounds to `9` (→ `4.5`) while `4.24 * 2 = 8.48` rounds to `8`
 * (→ `4.0`) — the task brief's own two guard cases.
 */
export function roundRatingToHalf(value: number): number {
  const clamped = Math.min(5, Math.max(0, value));
  return Math.round(clamped * 2) / 2;
}

/** One star's fill (spec "Rating" → Anatomy, part 1): "each filled, half-filled or empty
 * (outline)." */
export type RatingStarState = 'full' | 'half' | 'empty';

/**
 * The five stars' fill states for a rating, most-significant star first. Star `i` (1-indexed) is
 * `full` once the rounded rating reaches it, `half` when the rounded rating lands exactly on its
 * own half step, and `empty` otherwise — so `4.5` yields four `full` stars and one `half`, never a
 * `half` anywhere but the single star the rounded value actually lands on.
 */
export function ratingStarStates(value: number): RatingStarState[] {
  const rounded = roundRatingToHalf(value);
  return Array.from({ length: 5 }, (_, index) => {
    const position = index + 1;
    if (rounded >= position) return 'full';
    if (rounded >= position - 0.5) return 'half';
    return 'empty';
  });
}
