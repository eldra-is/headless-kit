/**
 * What can actually take focus. Used to decide *what* to focus rather than to ask whether a
 * `focus()` call landed: the answer to that is not the same in every runtime (happy-dom will
 * happily make a `<fieldset>` the active element, a browser will not), and a focus move on a
 * failed submit is not something to leave to a runtime's opinion.
 */
export const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Focus the first invalid field (spec "Field wrapper" → Behaviour: "On submit, focus moves to the
 * first invalid field"). A `FieldWrapper` group marks its `<fieldset>` invalid as well as the
 * controls inside it, and a fieldset cannot take focus — so an invalid element that is not itself
 * focusable hands focus to the first focusable thing inside it.
 *
 * Shared by `FormLayout`, which does this on a native submit it refuses, and by the `./vee-validate`
 * entry's `Form`, which does it after vee-validate has rejected one asynchronously — the two must
 * agree on where focus lands, so they run the same function rather than two copies of it.
 */
export function focusInvalid(element: HTMLElement): void {
  const target = element.matches(FOCUSABLE)
    ? element
    : (element.querySelector<HTMLElement>(FOCUSABLE) ?? element);
  target.focus();
}
