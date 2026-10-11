import type { IconComponent } from '../icon/types';
import type { InputSize } from '../input/types';

/**
 * The parts a consumer can restyle through `classes`.
 *
 * `label` and `field` are this control's own: it draws a label when nothing above it does (see
 * `UnitInputProps.label`), so the field box is one element deeper than `Input`'s — the decorations
 * are positioned against `field`, never against a `root` that may also hold a label.
 */
export type UnitInputPart =
  | 'root'
  | 'label'
  | 'field'
  | 'leadingIcon'
  | 'control'
  | 'suffix'
  | 'dragHandle'
  | 'clearButton';

export interface UnitInputProps {
  /**
   * The value (two-way), as a **number** — never the string in the field. A numeric string is
   * accepted and normalised, `''` and `null` are an empty field, and `0` is a value like any
   * other. What comes back out of `update:modelValue` is always `number | null`.
   */
  modelValue?: number | string | null;
  /** An `Intl` unit identifier, e.g. `kilometer`, `kilogram`, `percent`. Ignored for a currency. */
  unit?: string;
  /** A BCP 47 tag. Defaults to whatever `provideEldraUiLocale` set, else `en-US`. */
  locale?: string;
  /**
   * A label drawn by the control itself — **only** when nothing above it names the field. Inside a
   * `FieldWrapper` the wrapper owns the label, and this is ignored rather than said twice.
   */
  label?: string;
  /** The most fraction digits the formatted value keeps. Defaults to `2`. */
  maxFraction?: number;
  /** The highest value the field accepts. Typing past it is refused. Defaults to `2 ** 53 - 1`. */
  max?: number;
  /** The lowest value the field accepts, and what an emptied field falls back to. Defaults to `0`. */
  min?: number;
  /** What `ArrowUp`/`ArrowDown` and one drag step move by. Defaults to `1`. */
  step?: number;
  /** Adds a suffix handle that changes the value by `step` per few pixels of vertical drag. */
  enableDragAdjust?: boolean;
  /** Shows a control that clears the numeric value to `null`. */
  clearable?: boolean;
  /** Format the value as money rather than as a unit. `CurrencyInput` is this, always on. */
  isCurrency?: boolean;
  /** ISO 4217, e.g. `USD`, `ISK`. Only read when `isCurrency`. Defaults to `USD`. */
  currency?: string;
  /** `$` rather than `US$` where the two differ (`currencyDisplay: 'narrowSymbol'`). Default `true`. */
  narrowSymbol?: boolean;
  /** One of the spec's three field sizes. Defaults to `md`. */
  size?: InputSize;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /**
   * The form field name. It is posted by a hidden input carrying the **raw** number, so a form
   * receives `1234.5` and never the locale string the customer read.
   */
  name?: string;
  /** A decorative icon at the start of the field. */
  leadingIcon?: IconComponent;
  /** Sets `aria-invalid="true"` and the error boundary. Comes from the `FieldWrapper` otherwise. */
  invalid?: boolean;
  /** `aria-describedby` ids, own ids first. Composed with the `FieldWrapper`'s. */
  describedBy?: string;
  /** Native `required`. Comes from the `FieldWrapper` otherwise. */
  required?: boolean;
  /** Native `readonly`. The value stays focusable and selectable, and nothing edits it. */
  readonly?: boolean;
  /** Native `disabled`. */
  disabled?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<UnitInputPart, string>>;
}
