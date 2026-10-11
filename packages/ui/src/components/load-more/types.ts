/**
 * The parts a consumer can restyle through `classes`, named as the spec's anatomy names them
 * (spec "Pagination" → Anatomy, "load more" rows 7 and 9). The decorative meter (row 8) has no
 * part of its own — it is `aria-hidden`, purely visual, and never independently restyled, the
 * same shape `Rating`'s half-star clip or `Skeleton`'s shimmer are drawn without one.
 */
export type LoadMorePart = 'root' | 'status' | 'button';

export interface LoadMoreProps {
  /** Items currently shown. */
  shown: number;
  /** Total items. The button hides once `shown` reaches `total`. */
  total: number;
  /** The word used in the status sentence ("Showing 24 of 96 **products**"). Defaults to
   *  `"products"` — a literal prop default, not a message: a consumer in another locale passes
   *  the noun already declined for this sentence, the same way `QuantityStepper`'s `unit` does. */
  noun?: string;
  /** Loading state of the button: busy, spinner, `aria-busy`. Defaults to `false`. */
  pending?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<LoadMorePart, string>>;
}
