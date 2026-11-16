/**
 * Caret bookkeeping for a field that is re-spaced on every keystroke. Writing an input's `value`
 * moves the caret to the end, so the caret is put back by what the customer typed, not by offset:
 * the digits (and a leading `+`) before it are counted in the old text, and it lands after the same
 * number of them in the new one. Spaces, brackets and dashes belong to the format and count for
 * nothing.
 */

/** Whether the character at `index` is one the customer typed: a digit, or a `+` that leads. */
function significant(text: string, index: number, seen: number): boolean {
  const char = text[index]!;
  if (char >= '0' && char <= '9') return true;
  return char === '+' && seen === 0;
}

/** How many typed characters sit before `caret` in `text`. */
export function significantBefore(text: string, caret: number): number {
  let count = 0;
  const end = Math.min(caret, text.length);
  for (let index = 0; index < end; index += 1) {
    if (significant(text, index, count)) count += 1;
  }
  return count;
}

/**
 * Where the caret goes in `text` so that `count` typed characters sit before it. Past the last one
 * it goes to the very end, so a closing bracket the format added is behind the caret, not ahead.
 */
export function caretAfter(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!significant(text, index, seen)) continue;
    seen += 1;
    if (seen === count)
      return significantBefore(text, text.length) === count ? text.length : index + 1;
  }
  return text.length;
}
