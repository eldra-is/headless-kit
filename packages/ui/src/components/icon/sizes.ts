import type { IconSize } from './types';

/**
 * The spec's sizes as Tailwind utilities. The theme's `--spacing` is 0.25rem,
 * so `size-4`/`size-5`/`size-6`/`size-8` are exactly 1/1.25/1.5/2rem — no
 * literal length appears here or in the built CSS.
 */
export const ICON_SIZE_CLASS: Record<IconSize, string> = {
  sm: 'eldra:size-4',
  md: 'eldra:size-5',
  lg: 'eldra:size-6',
  xl: 'eldra:size-8',
};

/** The spec's outline stroke weight. */
export const ICON_STROKE_WIDTH = 1.75;
