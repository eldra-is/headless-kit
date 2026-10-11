import { parseCssDurationMs, prefersReducedMotion, readCssVar } from './cssTiming';

/**
 * The fade a refreshed value plays when its text changes — `Price`'s amount and compare-at,
 * `StockBadge`'s status line. Internal to the package, like `tagRecipe.ts`; `ValueText.vue` is its
 * only caller.
 *
 * **Why it exists.** `revalidating` keeps a prerendered value on screen while a fresher one is
 * fetched, dimmed, with a spinner beside it. When the fresher value finally arrives the old text
 * is simply replaced — one frame, no signal — so a visitor who looked away sees a number that was
 * never seen changing, and one who was looking sees it blink. The dim says "this may be a moment
 * old"; this says "and here is the new one".
 *
 * **Enter only, on the element that already holds the new text.** The value is swapped in the same
 * render as every other signal about it (`aria-busy`, the dim, the spinner) and *then* fades from
 * transparent to its settled opacity. Nothing fades out, because there is nothing stale left to
 * show: a leaving half would keep the previous value on screen for the length of the fade, after
 * the component had already stopped saying it was busy — which is precisely what a visitor must
 * not be shown on a price.
 *
 * That is also why this is a one-element animation rather than a Vue `<Transition>` keyed on the
 * text. A `<Transition mode="out-in">` renders a placeholder as soon as the key changes and brings
 * the new child in on a *later* render pass, so the DOM's text lags the props by one pass for
 * every value change in the package — refresh or not. (Measured, not assumed: with that shape the
 * starter's cart line total still read the old amount a tick after the stepper click, and emptying
 * the leave classes did not change it — the extra pass is the mode.) The default mode does not
 * help either: it keeps the leaving element in the DOM for two animation frames, which is a second
 * copy of the value in the accessibility tree. One element with its text interpolated normally has
 * neither problem: the text is always the current one, synchronously, and there is exactly one
 * copy of it at every instant.
 *
 * **Reduced motion is answered twice.** `prefersReducedMotion()` asks the visitor's setting, and
 * the duration is read from `--eldra-duration-base` on the element itself, which `tokens.css`
 * zeroes under `prefers-reduced-motion: reduce` — either one skips the animation outright, and the
 * second keeps working for a consumer who ships their own token file. The same read is what makes
 * the timing and easing a consumer's to change: both come from the element's computed style, never
 * from a literal (the house pattern `AccordionItem`'s panel animation already follows).
 *
 * **Layout.** Nothing here moves or sizes anything: one element, one animated `opacity`. The value
 * parts are already `tabular-nums` (`text-price-current`/`text-price-secondary`), so a number
 * whose digit count does not change keeps exactly the width it had; a change in digit count does
 * change the width, at the moment the value changes, which is the value changing and not this.
 */
export function fadeInChangedValue(el: HTMLElement | null | undefined): Animation | null {
  if (!el || typeof el.animate !== 'function') return null;
  if (prefersReducedMotion()) return null;
  const duration = parseCssDurationMs(readCssVar(el, '--eldra-duration-base'));
  if (duration === null) return null;
  const easing = readCssVar(el, '--eldra-ease-out') || 'ease';
  // `fill` is left at its default (`none`): the element's settled opacity is whatever the dim and
  // the cascade say it is, and this animation must hand it back untouched the moment it ends.
  return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
}
