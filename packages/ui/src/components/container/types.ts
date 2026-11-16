/** The spec's four content widths (spec "Container and section" → Sizes). */
export type ContainerWidth = 'narrow' | 'content' | 'wide' | 'full';

export interface ContainerProps {
  /**
   * Maximum content width. `narrow` (40rem: FAQ, rich text, newsletter, quote), `content` (64rem:
   * most blocks, product detail, cart), `wide` (80rem: product grids, galleries, collection pages,
   * header, footer) or `full` (100%, no gutters: full-bleed media, image-background hero, gallery
   * carousel). Defaults to `content`.
   */
  width?: ContainerWidth;
  /** Render as a different tag instead of a native `<div>` — a `<figure>` around full-bleed media. */
  as?: string;
}
