/** The one part a consumer can restyle through `Accordion`'s `classes`. */
export type AccordionPart = 'root';

export interface AccordionProps {
  /**
   * `true` (default): any number of items open at once, each an independent `<details>`. `false`:
   * single-open — every `AccordionItem` inside shares the same native `name`, so the browser
   * closes the previously open sibling itself.
   */
  multiple?: boolean;
  /** The shared `name` used while `multiple` is `false`. Generated when not given. */
  name?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<AccordionPart, string>>;
}

/** The heading levels `AccordionItem`'s `title` can wrap in, when the page outline needs one
 *  (spec "Accordion" → Properties, `headingLevel` row). Undefined by default: plain text. */
export type AccordionItemHeadingLevel = 2 | 3 | 4;

/**
 * The parts a consumer can restyle through `classes`, named after the spec's own anatomy. A link
 * row (`href` set) renders none of `summary`, `chevron` or `panel`: a plain `<a>` has no
 * disclosure trigger distinct from its own root and no panel.
 */
export type AccordionItemPart = 'root' | 'summary' | 'title' | 'help' | 'chevron' | 'panel';

export interface AccordionItemProps {
  /** The row's label. Also part of the accessible name. */
  title: string;
  /** An optional second line under the label. Also part of the accessible name. */
  help?: string;
  /** Open state (two-way, `update:modelValue`), mirroring the native `<details>` `open` attribute.
   *  Ignored, along with the default slot, on a link row. */
  modelValue?: boolean;
  /** Wraps `title` in a heading of this level. Plain text (no default) unless the page outline
   *  needs one. */
  headingLevel?: AccordionItemHeadingLevel;
  /** Renders a plain `<a>` styled as a trigger instead of `<details>`/`<summary>` plus panel — a
   *  menu entry with no children (spec "Accordion" → Variants, "Link row"). No panel, no chevron. */
  href?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<AccordionItemPart, string>>;
}
