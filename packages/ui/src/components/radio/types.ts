/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type RadioGroupPart =
  | 'root'
  | 'legend'
  | 'requiredMark'
  | 'options'
  | 'option'
  | 'radio'
  | 'input'
  | 'dot'
  | 'label'
  | 'hint'
  | 'meta'
  | 'help'
  | 'error'
  | 'errorIcon';

/** The spec's two radio sizes: 1.125rem or 1.5rem. Plain layouts only — a card's radio is fixed. */
export type RadioGroupSize = 'md' | 'lg';

/** `vertical` (default), `row` (wraps, for short labels) or `cards` (the whole option is a card). */
export type RadioGroupLayout = 'vertical' | 'row' | 'cards';

/** One option of a radio group. For `cards`, `label` is the card title and `meta` is the price. */
export interface RadioGroupOption {
  /** The value posted, and the one the group's `modelValue` holds when this option is chosen. */
  value: string;
  /** The label text (plain rows), or the card title (cards). */
  label: string;
  /** A secondary line under the label. */
  hint?: string;
  /** Cards only: a price or note, end-aligned, tabular numerals ("Free", "$12.00"). */
  meta?: string;
  /** Native `disabled` for this option alone. Say why in `hint`. */
  disabled?: boolean;
  /**
   * Extra attributes for this option's `<label>`: a `class`, a `for`, `data-*` hooks. The group's
   * own `data-part` and classes still apply.
   */
  optionAttrs?: Record<string, string | undefined>;
  /**
   * Extra attributes for this option's native radio: an `id`, a `class`, `data-*` hooks. The
   * group's own `type`, `name`, `value`, `checked`, `disabled`, `required` and `aria-invalid` win.
   */
  inputAttrs?: Record<string, string | undefined>;
}

export interface RadioGroupProps {
  /** The selected value (two-way). */
  modelValue?: string;
  /** The shared native `name`. Generated when absent, so every option still posts as one field. */
  name?: string;
  /**
   * The question, rendered as the fieldset's `<legend>`. Leave it out for a group with no visible
   * question: no `<legend>` renders, so name the group with `aria-label` or `aria-labelledby`
   * (the component's attributes reach the `<fieldset>`). The required mark lives in the legend, so
   * it goes with it. `legend=""` still renders one.
   */
  legend?: string;
  /** The options. At most about 6 — past that, use `Select`. */
  options: RadioGroupOption[];
  /** `vertical` (default), `row` (wraps) or `cards` (the whole option is a bordered card). */
  layout?: RadioGroupLayout;
  /** Radio 1.125rem (`md`, the default) or 1.5rem (`lg`). Plain layouts only. */
  size?: RadioGroupSize;
  /** Native `required` on every radio. */
  required?: boolean;
  /**
   * Shows the `*` required mark after the legend, drawn exactly as `FieldWrapper`'s, without
   * setting native `required` — for a caller that validates the group itself and must not have
   * the browser block a submit. The fieldset's name then ends with the "Required" message (visually
   * hidden), since no native `required` announces it. With `required` as well, only the mark is
   * added: the radios already announce it.
   */
  requiredMark?: boolean;
  /** The group's error message. Sets `aria-invalid="true"` on every radio, linked by id. */
  error?: string;
  /**
   * Help text under the options, in `FieldWrapper`'s help style, linked to the fieldset by
   * `aria-describedby` after the error.
   */
  help?: string;
  /**
   * Draws the error state and sets `aria-invalid="true"` on every radio without an error row, for
   * a caller that shows its own message. `error` implies it.
   */
  invalid?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RadioGroupPart, string>>;
}

/** The parts of a standalone `Radio`: the same names as one `RadioGroup` option's parts. */
export type RadioPart = 'option' | 'radio' | 'input' | 'dot' | 'label' | 'hint';

/** The values a standalone `Radio` and its group's model hold. */
export type RadioValue = string | number;

export interface RadioProps {
  /**
   * The value the radios sharing this `name` currently hold (two-way) — the *group's* value, not
   * this radio's. This radio is checked when it equals `value`. Always bind it: a standalone radio
   * cannot see its siblings, so it keeps no state of its own; `undefined` means nothing is chosen.
   */
  modelValue?: RadioValue;
  /** This radio's own value: posted when it is checked, and emitted when it is chosen. */
  value: RadioValue;
  /** The native `name` this radio shares with its siblings, wherever they are rendered. */
  name?: string;
  /** The label text. The default slot overrides it. */
  label?: string;
  /** A secondary line under the label. The `hint` slot overrides it. */
  hint?: string;
  /** Radio 1.125rem (`md`, the default) or 1.5rem (`lg`). */
  size?: RadioGroupSize;
  /** Native `disabled`. */
  disabled?: boolean;
  /** Draws the error state and sets `aria-invalid="true"`. */
  invalid?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RadioPart, string>>;
}
