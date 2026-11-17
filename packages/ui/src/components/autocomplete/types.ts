import type { UiMessages } from '../../messages/en-US';
import type { InputPart, InputProps } from '../input/types';

/** One row of an `Autocomplete`'s list. */
export interface AutocompleteSuggestion {
  /** Identifies the row. Unique within the list. */
  value: string;
  /** The row's main line, and the text the field takes when the row is chosen. */
  label: string;
  /** A muted second line under the label: "101 Reykjavík" under "Laugavegur 1". */
  description?: string;
  /** Shown, but skipped by the arrow keys and not chosen by a press. */
  disabled?: boolean;
}

/**
 * The parts a consumer can restyle through `classes`: `Input`'s own, the panel's (named as
 * `Select`'s panel names them), `busy` (the spinner shown while `loading`) and `footer`.
 */
export type AutocompletePart =
  | InputPart
  | 'busy'
  | 'panel'
  | 'listbox'
  | 'option'
  | 'optionLabel'
  | 'optionDescription'
  | 'footer';

/** What the `option` slot receives. */
export interface AutocompleteOptionSlotProps {
  suggestion: AutocompleteSuggestion;
  /** Whether the row is the active one: under the pointer, or reached with the arrow keys. */
  active: boolean;
}

/**
 * Everything a text `Input` takes, except `type` (always `text`), `mask` and the `number` props.
 * The value is always the text in the field: a suggestion is a help, never a requirement.
 */
export interface AutocompleteProps extends Omit<
  InputProps,
  'type' | 'mask' | 'min' | 'max' | 'step' | 'classes'
> {
  /**
   * The rows to offer for the text now in the field, supplied by the consumer (the component does
   * no filtering). With none, the panel is closed.
   */
  suggestions?: AutocompleteSuggestion[];
  /**
   * A wait for `suggestions` is in progress. A spinner shows in the field once the wait has lasted
   * 300ms, and a panel that is already open keeps its rows until the answer arrives, even if
   * `suggestions` is emptied meanwhile. A closed panel stays closed.
   */
  loading?: boolean;
  /** The panel does not open while the text is shorter than this. Defaults to `1`. */
  minLength?: number;
  /** Overrides for the component's own text: `suggestions`, the list's accessible name. */
  messages?: Partial<UiMessages>;
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the root with
   * `class`.
   */
  classes?: Partial<Record<AutocompletePart, string>>;
}
