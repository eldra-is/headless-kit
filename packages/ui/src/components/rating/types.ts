import type { Component } from 'vue';

/** The design spec's two sizes (spec "Rating" → Sizes): the star and gap grow, the value/count
 * text stays 0.875rem at both. */
export type RatingSize = 'md' | 'lg';

/**
 * The parts a consumer can restyle through `classes`, named as the spec's anatomy names them, plus
 * two structural parts the anatomy diagram does not number: `empty` (the no-reviews text) and
 * `link` (the anchor the linked variant wraps its content in — see `Rating.vue`'s own comment on
 * why that is a second element rather than the root itself changing tag).
 */
export type RatingPart = 'root' | 'stars' | 'star' | 'value' | 'count' | 'empty' | 'link';

export interface RatingProps {
  /**
   * Average rating, 0–5. Rounded to the nearest half star for both the stars and the visible
   * value (spec "Rating" → Properties). Out of range input is clamped rather than rejected — see
   * `roundRatingToHalf` (`src/utils/rating.ts`).
   */
  value: number;
  /** Number of reviews. `0` renders the no-reviews state instead of a "0.0" rating. */
  count?: number;
  /**
   * Shows the numeric value ("4.5"). Purely visual: the one accessible sentence always states the
   * value regardless of this prop (spec "Rating" → Variants, "Stars only" row: "still carries the
   * full accessible name").
   */
  showValue?: boolean;
  /** Shows the review count. Purely visual, same accessible-name rule as `showValue`. */
  showCount?: boolean;
  /** Star and gap size. Value/count text stays 0.875rem at both sizes. */
  size?: RatingSize;
  /**
   * Renders the linked variant: the whole rating becomes one link to the reviews (e.g.
   * `"#reviews"`). Ignored while `count` is `0` — there is nothing to jump to, and nesting an `<a>`
   * around the no-reviews state would collide with that state's own `emptyAction` slot, which is
   * free to render its own link.
   */
  href?: string | null;
  /**
   * Render the linked variant's anchor as a different component (e.g. a router link), which
   * receives the destination as `to` instead of `href` — the same contract as `Link`'s `as`.
   */
  as?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RatingPart, string>>;
}
