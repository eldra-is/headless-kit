import type { ImageRatio } from '../image/types';

/** Spec "Skeleton" → Properties/Variants, `variant` row: the five shape primitives. */
export type SkeletonVariant = 'text' | 'title' | 'circle' | 'media' | 'btn';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them:
 * the region wrapper, and the shimmering shape(s) inside it — one `line` per text row, or one for
 * every other variant. */
export type SkeletonPart = 'root' | 'line';

export interface SkeletonProps {
  /** The shape. Defaults to `'text'`. */
  variant?: SkeletonVariant;
  /** Number of text lines. `text` only — every other variant always renders one shape. */
  lines?: number;
  /**
   * An explicit width for the whole component, e.g. `'12rem'`. Unset (the default), the root is
   * `block w-full` — see `Skeleton.vue`'s own comment for why a percentage-width shape inside an
   * `inline-flex`/shrink-to-fit ancestor needs this escape hatch. When set, every shape inside
   * renders at the root's full (now definite) width instead of its own default percentage.
   */
  width?: string;
  /** The frame's aspect preset. `media` only. Defaults to `'4x5'` (spec "Skeleton" → Sizes,
   * `media` row — matches the product card's own ratio). See `src/utils/ratio.ts`. */
  ratio?: ImageRatio;
  /** The circle's diameter (width = height). `circle` only. Defaults to `'2.5rem'`. */
  size?: string;
  /** Per-part class overrides, merged over the component's own classes with `tailwind-merge`. */
  classes?: Partial<Record<SkeletonPart, string>>;
}
