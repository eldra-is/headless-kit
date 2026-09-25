import { localeSeparators } from './number-format';

/**
 * The `beforeinput` filter that makes a numeric text field actually numeric.
 *
 * `QuantityStepper` and `NumberInput` both draw a `type="text"` field rather than
 * `type="number"` — see `QuantityStepper.vue`'s own doc comment for why (a native number input's
 * DOM value cannot hold a locale-grouped string, which is the whole point of parsing with
 * `parseLocaleNumber`). The cost of that decision, reported by the operator as "I can type
 * anything into it", is that the browser's own numeric input filtering goes with it: both fields
 * accepted letters happily and only corrected themselves on blur.
 *
 * `beforeinput` is where a control gets that back. It is cancelable, it fires for every way text
 * can arrive (typing, pasting, dropping, an IME composition), and it names *what kind* of edit is
 * about to happen in `inputType` — so deletions, undo and redo pass untouched while insertions are
 * checked. It is not `keydown`: a `keydown` filter has to guess at the resulting value, misses
 * paste entirely, and eats modifier combinations.
 *
 * **Pasting is sanitised, never refused.** Pasting `"12ab3"` into a quantity field inserts `123`
 * rather than nothing: a customer who copied a quantity out of a table with a stray label attached
 * meant the digits, and refusing the whole paste is a dead end with no message. The same rule
 * applies to typing, where it degenerates into "the one character is either allowed or it is not".
 */

export interface NumericInputFilterOptions {
  /** Allow a leading `-`. A quantity passes `min < 0`; a `NumberInput` passes the same test. */
  allowNegative?: boolean;
  /** Allow one decimal separator. `false` for a whole-number field like a quantity. */
  allowDecimal?: boolean;
  /** Which locale's separators to accept. Defaults to `en-US`. */
  locale?: string;
}

/** `insertText` is a keystroke; the other three are text arriving in bulk or through an IME. */
const INSERTING = new Set([
  'insertText',
  'insertFromPaste',
  'insertCompositionText',
  'insertFromDrop',
]);

/**
 * Whether `text` is a value this field could be *part-way through* typing — not whether it is a
 * finished number. `""`, `"-"`, `"1."` and `"1,2"` all have to pass, or the keystroke that would
 * produce them is rejected and the value can never be reached at all. Committing is
 * `parseLocaleNumber`'s job, on blur, and it is the one that refuses `"-"`.
 *
 * The group separator is accepted **whether or not** decimals are: the text in the field is the
 * formatted value, so a quantity field showing `1,000` under `en-US` already contains one, and a
 * filter that refused it would refuse every keystroke made after it. It costs nothing — the parse
 * strips group separators before reading the number.
 */
function isPartialNumber(
  text: string,
  group: string,
  decimal: string,
  options: Required<Omit<NumericInputFilterOptions, 'locale'>>
): boolean {
  let rest = text;
  if (rest.startsWith('-')) {
    if (!options.allowNegative) return false;
    rest = rest.slice(1);
  }
  const [whole, fraction, ...extra] = options.allowDecimal ? rest.split(decimal) : [rest];
  // More than one decimal separator: `1.2.3` is not a number in any locale.
  if (extra.length > 0) return false;
  if (fraction !== undefined && !/^\d*$/.test(fraction)) return false;
  const digitsAndGroups =
    group === '' ? /^\d*$/ : new RegExp(`^[\\d${escapeForCharacterClass(group)}]*$`);
  return digitsAndGroups.test(whole ?? '');
}

/** Escapes a character for use inside a `RegExp` character class. */
function escapeForCharacterClass(text: string): string {
  return text.replace(/[\\\]^-]/g, '\\$&');
}

/**
 * Filters one `beforeinput` event on a numeric text field.
 *
 * Returns `true` when the event was cancelled — either because nothing of what arrived was
 * numeric, or because only part of it was and that part has been inserted directly — and `false`
 * when the edit was left to the browser. Callers do not need the return value; it is there for
 * tests and for a caller that wants to know an edit was rewritten.
 */
export function filterNumericBeforeInput(
  event: InputEvent,
  options: NumericInputFilterOptions = {}
): boolean {
  const inputType = event.inputType;
  // Deletions, undo, redo, formatting commands: never ours to police. A filter that checked the
  // resulting value instead of the input type would refuse `Backspace` on `"-"`.
  if (!INSERTING.has(inputType)) return false;

  const element = event.target;
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    return false;
  }

  // A paste carries its text on the `DataTransfer` in some engines and on `data` in others, so
  // both are read, and an *empty* `data` counts as absent — Chromium sets `data: null` for
  // `insertFromPaste` and happy-dom normalises that same field to `""`, so a nullish check alone
  // would look at the wrong one of the two under test. `insertCompositionText` always uses `data`.
  const typed = event.data ?? '';
  const incoming = typed === '' ? (event.dataTransfer?.getData('text/plain') ?? '') : typed;
  if (incoming === '') return false;

  const locale = options.locale ?? 'en-US';
  const { group, decimal } = localeSeparators(locale);
  const settings = {
    allowNegative: options.allowNegative === true,
    allowDecimal: options.allowDecimal === true,
  };

  const value = element.value;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? start;
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Whether a candidate is allowed is a question about the **resulting value**, not about the
  // character on its own: a `-` is fine at the start of an empty field and wrong in the middle of
  // one, and a second decimal separator is wrong only because the field already holds one.
  const accepts = (candidate: string): boolean =>
    isPartialNumber(`${before}${candidate}${after}`, group, decimal, settings);

  if (accepts(incoming)) return false;

  // Keep the longest prefix-wise sanitisation: characters are taken in order, each kept only if
  // the value it would produce is still a number in progress. Typing one wrong character leaves
  // `""` (the keystroke is simply swallowed); pasting `"12ab3"` leaves `"123"`.
  let kept = '';
  for (const character of incoming) {
    if (accepts(kept + character)) kept += character;
  }

  event.preventDefault();
  if (kept === '') return true;

  // The browser was told not to do the insertion, so it is done here — and announced with an
  // `input` event, because that is the only thing the component's own `@input` handler listens to
  // and the model would otherwise never see the sanitised text.
  element.value = `${before}${kept}${after}`;
  const caret = start + kept.length;
  element.setSelectionRange(caret, caret);
  element.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType, data: kept, composed: true })
  );
  return true;
}
