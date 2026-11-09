import type { UiMessages } from '../../composables/useMessages';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type DialogPart =
  | 'root'
  | 'panel'
  | 'header'
  | 'title'
  | 'close'
  | 'description'
  | 'body'
  | 'footer';

/** The spec's two panel widths: `sm` 24rem, `md` (the default) 32rem — both capped at the
 *  viewport width minus 2rem. */
export type DialogSize = 'sm' | 'md';

export interface DialogProps {
  /** Shows the dialog with `showModal()` when `true`, closes it when `false` (two-way). */
  modelValue?: boolean;
  /** The `<h2>` title text; the dialog's accessible name (`aria-labelledby`). Optional when the
   *  `title` slot draws the heading instead; with neither, name the dialog yourself through
   *  `aria-label` or `aria-labelledby` on the component (they land on the `<dialog>`). */
  title?: string;
  /** Body text below the title; the dialog is `aria-describedby` it. Omit when the body is a
   *  form — the spec's own Form variant carries no `description`. */
  description?: string;
  /** Panel width: `sm` 24rem, `md` (default) 32rem, always capped at `100vw - 2rem`. */
  size?: DialogSize;
  /** Whether a backdrop click closes the dialog. `Esc` and the close button always do. Set
   *  `false` for a form with unsaved input, or a destructive confirm a stray click must not
   *  count as an answer for. Default `true`. */
  dismissable?: boolean;
  /** Whether the header's close button is drawn. Default `true`. `false` is for a dialog whose own
   *  footer already holds every way out; `Esc` still closes it unless `closeOnEscape` is `false`. */
  closeButton?: boolean;
  /** Whether `Esc` closes the dialog. Default `true`. `false` is for a decision the user must answer
   *  through the dialog's own actions; keep a visible way out (the close button or a footer action)
   *  whenever you turn this off. */
  closeOnEscape?: boolean;
  /** Message overrides (only `close` applies here). See `useMessages`. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<DialogPart, string>>;
}
