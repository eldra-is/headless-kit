/**
 * The crossfade a refreshed value plays when its text changes — `Price`'s amount and compare-at,
 * `StockBadge`'s status line. A class recipe rather than a component, the same shape as
 * `tagRecipe.ts`: internal to the package, never exported from `src/index.ts`.
 *
 * **Why it exists.** `revalidating` keeps a prerendered value on screen while a fresher one is
 * fetched, dimmed, with a spinner beside it. When the fresher value finally arrives, the old text
 * is simply replaced — one frame, no signal — so a visitor who looked away sees a number that was
 * never seen changing, and one who was looking sees it blink. The dim says "this may be a moment
 * old"; this says "and here is the new one".
 *
 * **Bound on a `<Transition>` whose child is keyed on the formatted text.** A new key means a new
 * element, which is what gives the transition something to leave and something to enter; the
 * formatted text is the key rather than the raw amount so a change that formats identically (a
 * currency with no minor units re-reading the same major amount) stays completely still.
 *
 * `mode: 'out-in'` is load-bearing and not a shortcut for a true overlapping crossfade: with
 * `out-in` there is never more than one copy of the value in the DOM, so the accessibility tree
 * holds exactly one number at every instant and a screen reader cannot read the old and the new
 * one back to back. The cost is that the two halves are sequential — the old value fades out over
 * `--eldra-duration-base`, then the new one fades in over the same — rather than overlapping.
 *
 * **The `<Transition>` is mounted only once the value has actually been refreshed**, and that is a
 * correctness requirement rather than an optimisation. `out-in` renders a placeholder the moment
 * its child's key changes and brings the new child in on a *later* render pass, once the leave has
 * finished — so a `<Transition>` left permanently in place would delay **every** value change in
 * the package by that pass, whether or not it was easing anything (`css: false` does not help: the
 * extra pass is the mode, not the CSS). A cart line total after a stepper click, a price after a
 * variant switch, every consumer's own assertion about either — all of them would quietly become
 * asynchronous. So the components render a plain span until their first refresh and the
 * transition-wrapped one after it; the switch itself is invisible, because a `<Transition>`
 * without `appear` does not animate the child it mounts with.
 *
 * **Reduced motion.** Every class here is `motion-safe:`-gated, so under
 * `prefers-reduced-motion: reduce` the transition applies nothing at all: no opacity change, no
 * transition property, and the new value is simply there. That is a CSS gate rather than a
 * JavaScript `matchMedia` read on purpose — it stays correct when a visitor changes the setting
 * without the component re-rendering, the same way every other motion in this package is handled
 * (and `--eldra-duration-base` is itself zeroed under reduced motion in `tokens.css`, which would
 * make the fade instant even if a consumer's build dropped the variant).
 *
 * **Layout.** Nothing here reserves width. The value parts are already `tabular-nums`
 * (`text-price-current`/`text-price-secondary`), so a number whose digit count does not change
 * keeps exactly the width it had, and `out-in` never has two values on screen at once to size
 * around. A change in digit count does change the width — at the swap, which is the value changing
 * and not the transition doing it.
 */
export interface ValueTransitionProps {
  /** One value in the DOM at a time — see above; never the default simultaneous mode. */
  mode: 'out-in';
  enterFromClass: string;
  enterActiveClass: string;
  enterToClass: string;
  leaveFromClass: string;
  leaveActiveClass: string;
  leaveToClass: string;
}

/** `transition-opacity` with the token duration and easing, on the entering and the leaving
 *  element alike. */
const FADE = 'motion-safe:transition-opacity motion-safe:duration-base motion-safe:ease-out';

/**
 * The props a refreshed value's `<Transition>` is bound to.
 *
 * The end states (`enterToClass`, `leaveFromClass`) are deliberately empty strings rather than
 * omitted: Vue falls back to its own `v-enter-to`/`v-leave-from` names for any class prop left
 * `undefined`, and those would be real classes on the element that no stylesheet in this package
 * defines — present under reduced motion too, which is exactly what this recipe promises not to do.
 */
export const VALUE_FADE: ValueTransitionProps = {
  mode: 'out-in',
  enterFromClass: 'motion-safe:opacity-0',
  enterActiveClass: FADE,
  enterToClass: '',
  leaveFromClass: '',
  leaveActiveClass: FADE,
  leaveToClass: 'motion-safe:opacity-0',
};
