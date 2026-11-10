import type { ImageRatio } from '../image/types';

/**
 * Spec "Skeleton" → Properties/Variants, `variant` row: the five shape primitives, plus `box`, one
 * plain shape that is the component itself, for a placeholder of any size (sized by `width`,
 * `height`, `class` or `style`).
 */
export type SkeletonVariant = 'text' | 'title' | 'circle' | 'media' | 'btn' | 'box';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them:
 * the shimmering shape(s) inside the region wrapper — one `line` per text row, or one for every
 * other variant but `box`, which has none (the root is the shape). The root is styled with `class`. */
export type SkeletonPart = 'line';

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
  /**
   * An explicit height for the whole component, e.g. `'3rem'`. Meant for `box`, whose root is the
   * shape: unset, a box is `--eldra-skeleton-box-height` tall (default `1rem`). On the other
   * variants it sizes the region wrapper only; their shapes keep their own heights.
   */
  height?: string;
  /** The frame's aspect preset. `media` only. Defaults to `'4x5'` (spec "Skeleton" → Sizes,
   * `media` row — matches the product card's own ratio). See `src/utils/ratio.ts`. */
  ratio?: ImageRatio;
  /** The circle's diameter (width = height). `circle` only. Defaults to `'2.5rem'`. */
  size?: string;
  /**
   * Names the root as a live busy region (spec "Skeleton" → Anatomy, part 1: "Busy region: the
   * element being filled, with `aria-busy=\"true\"` and a visually hidden 'Loading products…'
   * text"; region-level `busyLabel`, default `"Loading products…"`). With a label, the root gets
   * `role="status"`, `aria-busy="true"` and `aria-label` set to it, and every shape is individually
   * `aria-hidden`. `null`/omitted (the default) leaves the root itself `aria-hidden`, as it always
   * was — the right shape for a `Skeleton` composed *inside* another component's own already-named
   * busy region (`ProductCard`'s loading root, for one), where naming this root too would give the
   * region two competing accessible names.
   */
  busyLabel?: string | null;
  /** Per-part classes, appended to the part's own (they win by cascade layer). */
  classes?: Partial<Record<SkeletonPart, string>>;
}
