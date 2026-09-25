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

/**
 * A `MultiSelect`'s parts: every part of a `Select` plus the ones only a multi-select draws.
 *
 * `optionCheck` is reused for an option's **checkbox** — it is the mark that says "this row is
 * chosen" in both controls, so a consumer styles it once. The footer parts are not in the brief's
 * list but are in the spec's anatomy ("footer: live count · Clear (link button) · Done (primary
 * sm)"), and a part the component draws and a consumer cannot reach is not a part.
 */
export type MultiSelectPart =
  | SelectPart
  | 'summary'
  | 'summaryMore'
  | 'tags'
  | 'tag'
  | 'tagRemove'
  | 'footer'
  | 'footerCount'
  | 'footerClear'
  | 'footerDone';

/**
 * Everything a `Select` takes except the three the spec redefines: the value is a list, the
 * placeholder's default is `"Any"` rather than `"Select"`, and there is no `clearable` — "the clear
 * button is always available when something is selected".
 */
export interface MultiSelectProps extends Omit<
  SelectProps,
  'modelValue' | 'placeholder' | 'clearable'
> {
  /** The selected values (two-way). `[]` means nothing is selected. */
  modelValue?: string[];
  /** Shown in `muted` when nothing is selected ("Any colour"). */
  placeholder?: string;
  /** The removable tag list under the control. `false` for compact toolbars. */
  showTags?: boolean;
  /** How many labels the trigger lists before the "+N" pill. Defaults to 2. */
  maxSummary?: number;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<MultiSelectPart, string>>;
}
