import { prefersReducedMotion } from '../carousel/useCarousel';

/**
 * The Web Animations API height animation `AccordionItem.vue` plays on its panel element (spec
 * "Accordion" → Behaviour & motion, operator override 2026-09-26: "the accordion should have some
 * expand transition" — see the README's Deviations entry for the full ruling and why a CSS-only
 * height animation was rejected here the same way it was for the original fade). Isolated in its
 * own file for the same reason `detailsExclusivity.ts` is: a runtime DOM capability that needs
 * feature detection and reads better tested on its own than inlined into the component.
 *
 * Duration and easing are read from the animated element's own computed style at animation time —
 * `--eldra-duration-base` and `--eldra-ease-out`/`--eldra-ease-in`, the exact tokens
 * `eldra-accordion-chevron`/`eldra-accordion-panel` already key their own CSS transitions off —
 * rather than a literal duration/easing baked into this file. A consumer overriding those tokens,
 * or `tokens.css` zeroing `--eldra-duration-base` under `prefers-reduced-motion`, changes this
 * animation too with no extra prop. There is deliberately no literal fallback for either: when a
 * variable does not resolve to a usable value at all (no stylesheet loaded — a unit test mounting
 * the component with no CSS pipeline, most likely, since a real consumer of this package always
 * ships `tokens.css`), the animation is skipped outright rather than guessing a number that could
 * silently disagree with whatever the page's real tokens turn out to say.
 */

function readCssVar(el: Element, name: string): string {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return '';
  return window.getComputedStyle(el).getPropertyValue(name).trim();
}

/** Parses a CSS `<time>` (`200ms` / `0.2s`) into milliseconds, or `null` when it isn't a positive
 *  one — the custom property is unset, empty, zeroed (reduced motion already zeroes it in
 *  `tokens.css`, which this treats the same as "cannot animate" rather than animating a 0ms step),
 *  or not a time at all. */
function parseDurationMs(raw: string): number | null {
  const match = /^(-?[0-9]*\.?[0-9]+)(ms|s)$/.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] === 's' ? value * 1000 : value;
}

export interface PanelHeightAnimator {
  /** Animates the panel open: `0 → scrollHeight`, `--eldra-ease-out`. Reverses a close still in
   *  flight instead, if there is one (see the factory's own comment). Resolves once settled — or
   *  immediately, in effect synchronously, whenever no real animation could run at all. */
  open(): Promise<void>;
  /** Animates the panel closed: `scrollHeight → 0`, `--eldra-ease-in`. Reverses an open still in
   *  flight instead, if there is one. Resolves once settled, same contract as `open()`. */
  close(): Promise<void>;
}

/**
 * Creates a stateful height-animation controller for one `AccordionItem`'s panel — one instance
 * per item, reused for that panel's whole lifetime (see `AccordionItem.vue`'s own lazily-created,
 * memoized instance). Stateful rather than a bare per-call function because a request can arrive
 * for the *opposite* direction while the previous request's animation is still running — a click
 * during the opening animation, or a second click while closing (`AccordionItem.vue`'s own
 * `onSummaryClick` covers exactly when each happens).
 *
 * Fixes review round 1 (2026-09-26): "one animation owner per item." The original shape (a bare
 * `animatePanelHeight(panel, from, to, ...)` call per direction, each independently capturing and
 * restoring `panel.style.overflow` around its own `Element.animate()` call) let two overlapping
 * calls race: a click during the opening animation started a *second*, independent call before the
 * first's `overflow` cleanup had run. Whichever cleanup ran *last* reset `overflow` to whatever
 * *that* call had captured as "before" — which, because the two calls overlapped, was the *other*
 * call's already-`'hidden'` value, not the panel's real original style — leaving `overflow: hidden`
 * permanently stuck (reproduced with a plain double-click against the built Storybook `Multiple`
 * story). This version keeps exactly one `Animation` handle and one saved "original" `overflow`
 * value alive across however many direction-reversals happen before something actually settles:
 *
 * - A fresh request (nothing currently animating) captures the panel's real pre-animation
 *   `overflow` once, and animates from the natural starting point for that direction (`0` opening,
 *   the panel's own `scrollHeight` closing).
 * - A request that arrives while an animation is already running **reverses** it: reads the
 *   panel's *currently rendered* height (`getBoundingClientRect()`, not either call's own start
 *   value) before cancelling the running `Animation`, then starts a new one from that live height
 *   to the new target — the box changes direction from wherever it visually was, never jumping.
 *   The `overflow` captured by the *first* request in the sequence is carried forward untouched
 *   through as many reversals as happen; only the animation that finally settles without itself
 *   being superseded restores it.
 */
export function createPanelHeightAnimator(panel: HTMLElement): PanelHeightAnimator {
  let currentAnimation: Animation | null = null;
  let originalOverflow: string | null = null; // non-null exactly while an animation owns `overflow`

  /** The last word for this whole reversal chain: drop the handle and, if something is still
   *  waiting to be restored, restore the ORIGINAL style captured before the first animation in the
   *  chain started — never a value captured mid-chain by a call this one superseded. */
  function settle(): void {
    currentAnimation = null;
    if (originalOverflow !== null) {
      panel.style.overflow = originalOverflow;
      originalOverflow = null;
    }
  }

  function run(
    freshFromPx: number,
    toPx: number,
    durationVar: string,
    easingVar: string
  ): Promise<void> {
    const reversing = currentAnimation !== null;
    // Read the live height BEFORE cancelling: `getBoundingClientRect()` still reflects the running
    // animation's current frame at this point, which is exactly the continuity the ruling asks for
    // ("reads the panel's CURRENT rendered height as the start value").
    const fromPx = reversing ? panel.getBoundingClientRect().height : freshFromPx;
    if (reversing) {
      currentAnimation!.cancel();
      currentAnimation = null;
    }
    if (prefersReducedMotion() || typeof panel.animate !== 'function') {
      // Nothing left to animate. If this call just cancelled one, it is now the last word for the
      // whole chain — there is no new `Animation` to hand cleanup off to.
      settle();
      return Promise.resolve();
    }
    const duration = parseDurationMs(readCssVar(panel, durationVar));
    if (duration === null) {
      settle();
      return Promise.resolve();
    }
    // Capture the ORIGINAL style only once per chain — a reversal must never treat the previous
    // call's `'hidden'` as the value to restore back to later.
    if (originalOverflow === null) originalOverflow = panel.style.overflow;
    panel.style.overflow = 'hidden';
    const easing = readCssVar(panel, easingVar) || 'ease';
    const animation = panel.animate([{ height: `${fromPx}px` }, { height: `${toPx}px` }], {
      duration,
      easing,
    });
    currentAnimation = animation;
    return animation.finished
      .then(
        () => undefined,
        () => undefined // cancelled by a reversal — settle quietly, the superseding call owns cleanup
      )
      .then(() => {
        if (currentAnimation !== animation) return; // superseded before it naturally finished
        settle();
      });
  }

  return {
    open: () => run(0, panel.scrollHeight, '--eldra-duration-base', '--eldra-ease-out'),
    close: () => run(panel.scrollHeight, 0, '--eldra-duration-base', '--eldra-ease-in'),
  };
}
