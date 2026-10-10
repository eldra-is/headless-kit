/**
 * The format masks the design spec's Input asks for ("Like BS1 4XE", `(###) ###-####`).
 *
 * A *format* is a template string in which some characters are **placeholder slots** and
 * everything else is a **separator**. `applyMask` fills the slots from the raw value in order and
 * writes the separators between them; `stripMask` takes a formatted string back to the raw value.
 * The two are inverse for any raw value `applyMask` accepted, which is what lets a component keep
 * the raw value in its model and only ever show the formatted one.
 *
 * A format with **no placeholder slots at all** (`'--'`, `'()- '`) therefore formats every value to
 * the empty string and strips every value to the empty string: separators are only ever written
 * behind a slot that filled, and there is no slot. A field masked that way shows nothing, whatever
 * is typed into it. That is the consistent answer rather than a special case, but it is worth
 * knowing before a format is built from anything but a literal.
 *
 * Deliberately tiny and stateless: no caret model, no incremental diffing, no DOM. The component
 * owns the caret; this owns the string.
 */

/**
 * The placeholder characters every format understands unless the caller passes its own map:
 * `#` a digit, `A` a letter, `*` either. Any character that is not a key here is a separator, so
 * `(`, `)`, `-` and a space in `(###) ###-####` are literal text.
 */
export const defaultCharacterMeaning: Readonly<Record<string, RegExp>> = {
  '#': /\d/,
  A: /[a-zA-Z]/,
  '*': /[a-zA-Z0-9]/,
};

/**
 * Tests one character against a slot rule without letting a caller's `/g` regex carry `lastIndex`
 * from one call to the next — a stateful regex would make the same input format differently the
 * second time it was typed.
 */
function accepts(rule: RegExp, character: string): boolean {
  rule.lastIndex = 0;
  return rule.test(character);
}

/**
 * Formats `raw` into `format`.
 *
 * - Raw characters fill the placeholder slots in order; a character that does not satisfy the slot
 *   it reaches is dropped and the next one is tried, so pasting `(555) 123-4567` into a
 *   `(###) ###-####` field yields the same string back.
 * - Separators are written only once there is a value after them, so a partially typed value never
 *   grows a dangling `)` or `-` the customer then has to delete.
 * - The result never exceeds the format: input past the last slot is ignored.
 *
 * An empty `format` means "no mask" and returns `raw` unchanged. A non-empty format with no
 * placeholder slots in it returns `''` — see the module comment.
 */
export function applyMask(
  raw: string,
  format: string,
  characterMeaning: Readonly<Record<string, RegExp>> = defaultCharacterMeaning
): string {
  if (format.length === 0) return raw;

  let result = '';
  /** Separators seen since the last slot was filled; written only if another slot fills. */
  let pendingSeparators = '';
  let index = 0;

  for (const slot of format) {
    const rule = characterMeaning[slot];
    if (rule === undefined) {
      pendingSeparators += slot;
      continue;
    }

    let filled: string | undefined;
    while (index < raw.length) {
      const character = raw[index];
      index += 1;
      if (accepts(rule, character)) {
        filled = character;
        break;
      }
    }
    if (filled === undefined) return result;

    result += pendingSeparators + filled;
    pendingSeparators = '';
  }

  return result;
}

/**
 * The inverse of {@link applyMask}: the raw value behind a formatted string.
 *
 * It tolerates a string that is not exactly what `applyMask` would have produced — a value the
 * customer pasted without separators, or one mid-edit with a separator deleted — by matching
 * characters against the slot rules rather than by position. Anything that fits no slot is
 * dropped. An empty `format` returns the value unchanged, and one with no placeholder slots in
 * it returns `''`.
 */
export function stripMask(
  formatted: string,
  format: string,
  characterMeaning: Readonly<Record<string, RegExp>> = defaultCharacterMeaning
): string {
  if (format.length === 0) return formatted;

  let result = '';
  let slotIndex = 0;
  let index = 0;

  while (slotIndex < format.length && index < formatted.length) {
    const slot = format[slotIndex];
    const rule = characterMeaning[slot];
    const character = formatted[index];

    if (rule === undefined) {
      // A separator: consume it when it is there, and step over it when it is not (the customer
      // pasted the raw digits, or deleted one).
      if (character === slot) index += 1;
      slotIndex += 1;
      continue;
    }

    if (accepts(rule, character)) {
      result += character;
      slotIndex += 1;
    }
    index += 1;
  }

  return result;
}
