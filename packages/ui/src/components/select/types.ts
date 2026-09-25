import type { UiMessages } from '../../composables/useMessages';
import type { IconComponent } from '../icon/types';

/**
 * One option of a `Select`.
 *
 * Everything past `value`/`label` is the spec's "Rich options" variant: a `swatch` (a colour from
 * product data), an `icon`, a `hint` line under the label, a `meta` note aligned to the end, and
 * `disabled` for a sold-out choice — which the spec asks to *show*, struck through with its
 * reason, rather than hide.
 */
export interface SelectOption {
  /** The value posted, and the one `modelValue` holds when this option is chosen. */
  value: string;
  /** The visible label. Also what type-ahead and the search field match against. */
  label: string;
  /** Group heading this option belongs under. Builds an `<optgroup>` on the native select too. */
  group?: string;
  /** A secondary line under the label ("Next business day if ordered by 2pm"). */
  hint?: string;
  /** A note aligned to the end of the row ("In stock", "Only 2 left", "Sold out"). */
  meta?: string;
  /** The meta's tone. `muted` by default; `warning` and `danger` are weight 600. */
  metaTone?: 'warning' | 'danger';
  /** A colour from product data, drawn as a 1rem circle with a 1px inner edge. Any CSS colour. */
  swatch?: string;
  /** A decorative icon for this option, shown in the row and in the trigger when it is chosen. */
  icon?: IconComponent;
  /** Sold out / unavailable. Skipped by the arrow keys, cannot be chosen, struck through. */
  disabled?: boolean;
}

/**
 * The parts a consumer can restyle through `classes`, named as the spec's anatomy names them.
 *
 * `optionIcon` is not in the anatomy's numbered list — the list names the option's contents in
 * prose ("swatch, icon, label + hint, meta, check") — but it is a part all the same, and the
 * trigger reuses `optionSwatch`/`optionIcon` for the chosen option's mark, so "an option's swatch"
 * is styled once wherever it appears.
 */
export type SelectPart =
  | 'root'
  | 'trigger'
  | 'leadingIcon'
  | 'value'
  | 'placeholder'
  | 'chevron'
  | 'clearButton'
  | 'panel'
  | 'search'
  | 'listbox'
  | 'group'
  | 'groupLabel'
  | 'option'
  | 'optionLabel'
  | 'optionHint'
  | 'optionMeta'
  | 'optionSwatch'
  | 'optionIcon'
  | 'optionCheck'
  | 'empty'
  | 'native';

/** The shared control box, exactly as `Input`'s: 2rem, 2.5rem or 3rem tall. */
export type SelectSize = 'sm' | 'md' | 'lg';

/**
 * `auto` opens below and flips above when there is no room; `above` always opens above (the
 * spec's example is a footer's language selector, where below is off-screen by definition).
 */
export type SelectPlacement = 'auto' | 'above';

export interface SelectProps {
  /** The selected value (two-way). `''` means nothing is selected. */
  modelValue?: string;
  /** The options. `group` builds headings here and `<optgroup>`s on the native select. */
  options: SelectOption[];
  /** Form field name, put on the hidden native `<select>`. */
  name?: string;
  /** The trigger's `id`. Comes from a `FieldWrapper` when there is one. */
  id?: string;
  /** One of the spec's three sizes. Defaults to `md`. */
  size?: SelectSize;
  /** Adds the search field. Defaults to `true` when there are more than 10 options. */
  searchable?: boolean;
  /** The search field's placeholder *and* its accessible name ("Search countries"). */
  searchPlaceholder?: string;
  /** Shows the clear button while there is a value. `Backspace`/`Delete` clear too. */
  clearable?: boolean;
  /** Shown in `muted` when there is no value. Never an option in the list. */
  placeholder?: string;
  /** A decorative icon at the start of the trigger. */
  leadingIcon?: IconComponent;
  /** Error state. Usually passed down from the `FieldWrapper`. */
  invalid?: boolean;
  /** Copied to the trigger as `aria-describedby`. Usually from the `FieldWrapper`. */
  describedBy?: string;
  /** `aria-required="true"` on the trigger and `required` on the native select. */
  required?: boolean;
  /** Not focusable, does not open. */
  disabled?: boolean;
  /** The value is readable but fixed: no chevron, does not open. */
  readonly?: boolean;
  /** `auto` (default) flips above when there is no room below; `above` always opens above. */
  placement?: SelectPlacement;
  /** Message overrides for this control alone. */
  messages?: Partial<UiMessages>;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<SelectPart, string>>;
}
