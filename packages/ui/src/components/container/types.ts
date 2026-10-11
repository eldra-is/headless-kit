/** The spec's four content widths (spec "Container and section" → Sizes). */
export type ContainerWidth = 'narrow' | 'content' | 'wide' | 'full';

/** The parts a consumer can restyle through `classes`. Container has only the one. */
export type ContainerPart = 'root';

export interface ContainerProps {
  /**
   * Maximum content width. `narrow` (40rem: FAQ, rich text, newsletter, quote), `content` (64rem:
   * most blocks, product detail, cart), `wide` (80rem: product grids, galleries, collection pages,
   * header, footer) or `full` (100%, no gutters: full-bleed media, image-background hero, gallery
   * carousel). Defaults to `content`.
   */
  width?: ContainerWidth;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ContainerPart, string>>;
  /** Render as a different tag instead of a native `<div>` — a `<figure>` around full-bleed media. */
  as?: string;
}
