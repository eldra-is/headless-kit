/**
 * Writes `value` onto a text control whose DOM value has drifted from it, keeping the caret.
 *
 * Vue patches `value` only when the bound value changes. A controlled parent that refuses a
 * keystroke, or formats it back to what it already had (`'12a'` → `'12'`), leaves the bound value
 * exactly as it was, so Vue patches nothing and the field keeps showing what was typed against a
 * model that says otherwise. `Checkbox` and `RadioGroup` re-assert `checked` for the same reason.
 *
 * The caret keeps its distance from the end of the value, which is where it lands after a refused
 * or stripped character wherever in the value it was typed. It is moved only on a focused control
 * whose type has a selection API (`selectable`), so this never steals focus or throws.
 */
export function reassertValue(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  selectable = true
): void {
  if (el === null || el.value === value) return;
  const focused = selectable && el.ownerDocument.activeElement === el;
  const fromEnd = focused ? el.value.length - (el.selectionEnd ?? el.value.length) : 0;
  el.value = value;
  if (!focused) return;
  const caret = Math.max(0, value.length - fromEnd);
  el.setSelectionRange(caret, caret);
}
