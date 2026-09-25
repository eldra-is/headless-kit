/** The three arrangements the design spec's Form layout section gives. */
export type FormLayoutVariant = 'single' | 'two' | 'inline';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type FormLayoutPart = 'root' | 'heading' | 'fields' | 'actions';

export interface FormLayoutProps {
  /** `single` (default), `two` (a responsive two-column grid) or `inline` (one field, one button). */
  layout?: FormLayoutVariant;
  /** A visible heading that names the form. The form is `aria-labelledby` it. */
  heading?: string;
  /** The form's name when there is no visible heading ("Newsletter sign-up"). */
  ariaLabel?: string;
  /** Native `action`, so the form posts without scripting. */
  action?: string;
  /** Native `method`. */
  method?: string;
  /** Native `novalidate`. Defaults to `true`: the components' own messages, not browser bubbles. */
  novalidate?: boolean;
  /** While true the submit button is loading and every other action in the form is disabled. */
  submitting?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<FormLayoutPart, string>>;
}
