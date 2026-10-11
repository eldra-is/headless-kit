/** The spec's five grounds (spec "Container and section" → Variants). */
export type SectionBackground = 'none' | 'surface' | 'surface-strong' | 'primary' | 'accent';

/** Vertical padding steps (spec "Container and section" → Sizes, Section spacing table). */
export type SectionSpacing = 'none' | 'sm' | 'md' | 'lg';

/** The parts a consumer can restyle through `classes`. Section has only the one. */
export type SectionPart = 'root';

export interface SectionProps {
  /** Section ground. Defaults to `none`. */
  background?: SectionBackground;
  /** Vertical padding. Defaults to `md`. */
  spacing?: SectionSpacing;
  /**
   * Id of the visible block heading, when the block has one — typically an `<h1>`/`<h2>` the block
   * itself renders. Renders `aria-labelledby` and, with no `as` override, a `<section>`. Wins over
   * `ariaLabel` when both are given.
   */
  labelledBy?: string | null;
  /**
   * Used when the block has no visible heading. Renders `aria-label` and, with no `as` override, a
   * `<section>`. With neither this nor `labelledBy`, the root is a plain `<div>` instead — the spec's
   * "not a meaningful region" case. Named `ariaLabel`, not `label`: this is the section's accessible
   * name only, never visible text (unlike `label` on `Badge`/`Checkbox`/`Select` and the rest of the
   * package — see the README's "`ariaLabel` is always an accessible name" rule).
   */
  ariaLabel?: string | null;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<SectionPart, string>>;
  /**
   * Render as a different tag instead of the automatic `<section>`/`<div>` choice — a `<header>` for
   * the site header, a `<footer>` for the site footer, both already unique landmarks that need no
   * name of their own. `aria-labelledby`/`aria-label` still apply when given, independent of the tag.
   */
  as?: string;
}
