/** The three arrangements the design spec's Form layout section gives. */
export type FormLayoutVariant = 'single' | 'two' | 'inline';

/** The heading levels the form's own title can take under a page's `<h1>`. */
export type FormLayoutHeadingLevel = 2 | 3 | 4;

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type FormLayoutPart = 'root' | 'heading' | 'errorSummary' | 'fields' | 'actions' | 'status';

/** What the `submit` event carries once every field in the form is valid. */
export interface FormLayoutSubmitPayload {
  /** The native event, so a scripted form can `preventDefault()` it itself. */
  event: SubmitEvent;
  /** The form's values, read from the native form — no bookkeeping of its own. */
  data: FormData;
}

export interface FormLayoutProps {
  /** `single` (default), `two` (a responsive two-column grid) or `inline` (one field, one button). */
  layout?: FormLayoutVariant;
  /** A visible heading that names the form. The form is `aria-labelledby` it. */
  heading?: string;
  /** The heading's element, for a form nested under a page's own headings. Defaults to `2`. */
  headingLevel?: FormLayoutHeadingLevel;
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
  /**
   * A short sentence announced in the form's polite live region ("Thanks, you're subscribed"). It
   * is never visible: the visible confirmation is the page's, this is what a screen reader hears.
   */
  statusMessage?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<FormLayoutPart, string>>;
}
