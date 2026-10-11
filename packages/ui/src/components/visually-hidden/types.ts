/** The parts a consumer can restyle through `classes`. */
export type VisuallyHiddenPart = 'root';

export interface VisuallyHiddenProps {
  /** The element to render. Defaults to `span`. */
  as?: string;
  /**
   * Reveal the content while it has focus — the skip-link pattern. Leave it
   * off for text that is only ever read aloud (a live region, an icon-only
   * control's name).
   */
  focusable?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<VisuallyHiddenPart, string>>;
}
