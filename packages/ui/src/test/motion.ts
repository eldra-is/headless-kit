import { vi } from 'vitest';

/**
 * Helpers for the two things this package animates in JavaScript rather than in CSS — the
 * refreshed-value fade (`src/utils/valueFade.ts`) and `AccordionItem`'s panel height. Both read
 * their timing from the animated element's own computed style and both go through
 * `Element.animate()`, so a spec that wants to see either has to supply the first and watch the
 * second. Shared from `src/test/` rather than copied per spec, like `mount` and `axe`.
 */

/** The default tokens, matching `tokens.css`. */
const DURATION = '200ms';
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Puts the motion tokens on the element that will be animated.
 *
 * In a browser they arrive by inheritance from `:root`; happy-dom's `getComputedStyle` does not
 * inherit custom properties, so a spec sets them where the code reads them. Passing `'0ms'` is the
 * reduced-motion stylesheet's own answer (`tokens.css` zeroes every `--eldra-duration-*` under
 * `prefers-reduced-motion: reduce`), and passing nothing at all is the "no stylesheet loaded" case.
 */
export function giveMotionTokens(el: Element, duration = DURATION, easing = EASING): void {
  const style = (el as HTMLElement).style;
  style.setProperty('--eldra-duration-base', duration);
  style.setProperty('--eldra-ease-out', easing);
}

export interface RecordedAnimation {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  el: Element;
  /** The element's text at the moment the animation was played — which is how a spec tells a fade
   *  that shows the new value from one that would have shown the old one. */
  text: string | null;
}

/**
 * Records every `Element.animate()` call made while it is installed, and plays none of them —
 * happy-dom implements the method, but nothing here should depend on how. `vi.restoreAllMocks()`
 * (or the returned `restore`) puts the original back.
 */
export function recordAnimations(): { calls: RecordedAnimation[]; restore: () => void } {
  const calls: RecordedAnimation[] = [];
  const spy = vi
    .spyOn(Element.prototype, 'animate')
    .mockImplementation(function (this: Element, keyframes, options) {
      calls.push({
        el: this,
        text: this.textContent,
        keyframes: (keyframes ?? []) as Keyframe[],
        options: (typeof options === 'number'
          ? { duration: options }
          : (options ?? {})) as KeyframeAnimationOptions,
      });
      return { cancel() {}, finished: Promise.resolve() } as unknown as Animation;
    });
  return { calls, restore: () => spy.mockRestore() };
}

/** `prefers-reduced-motion: reduce`, for the one JavaScript check CSS cannot make for us. */
export function stubReducedMotion(reduce = true): { restore: () => void } {
  const spy = vi
    .spyOn(window, 'matchMedia')
    .mockReturnValue({ matches: reduce } as unknown as MediaQueryList);
  return { restore: () => spy.mockRestore() };
}
