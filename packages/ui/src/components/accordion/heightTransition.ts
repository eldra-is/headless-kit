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

/**
 * Animates `panel`'s height from `fromPx` to `toPx` and resolves once that settles. Resolves
 * immediately (in effect, a synchronous "instant" state change from the caller's point of view)
 * whenever it cannot produce a real animation — `prefers-reduced-motion: reduce` (checked the same
 * way `useCarousel`/`Tooltip` do, via `prefersReducedMotion()`), `Element.prototype.animate`
 * missing (an older engine, or a test environment stubbing it out on purpose), or `durationVar`
 * not resolving to a positive duration — so a caller never needs two branches, only one `await`.
 * Never rejects, including when the animation is cancelled out from under it.
 *
 * `overflow: hidden` is applied as a real inline style for the animation's whole span (set before
 * `animate()` starts, so it is in effect from the very first frame, not just from whatever the
 * first keyframe happens to say) and cleared again once the animation settles — the classic
 * `<details>` height-animation shape: measure, animate `height`, clip the overflow meanwhile,
 * clean up after. `Element.prototype.animate`'s own default `fill: 'none'` already drops the
 * animated `height` itself back to the panel's ordinary `auto` the moment it finishes, so nothing
 * else needs clearing there.
 */
export function animatePanelHeight(
  panel: HTMLElement,
  fromPx: number,
  toPx: number,
  durationVar: string,
  easingVar: string
): Promise<void> {
  if (prefersReducedMotion() || typeof panel.animate !== 'function') return Promise.resolve();
  const duration = parseDurationMs(readCssVar(panel, durationVar));
  if (duration === null) return Promise.resolve();
  const easing = readCssVar(panel, easingVar) || 'ease';
  const previousOverflow = panel.style.overflow;
  panel.style.overflow = 'hidden';
  const animation = panel.animate([{ height: `${fromPx}px` }, { height: `${toPx}px` }], {
    duration,
    easing,
  });
  return animation.finished
    .then(
      () => undefined,
      () => undefined // cancelled — settle quietly rather than reject, same contract either way
    )
    .then(() => {
      panel.style.overflow = previousOverflow;
    });
}
