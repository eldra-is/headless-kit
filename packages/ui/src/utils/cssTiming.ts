/**
 * Reading the package's motion tokens off a real element, for the two places that animate in
 * JavaScript rather than in CSS (`AccordionItem`'s panel height, a refreshed value's fade-in).
 *
 * Both need the same three things — "may I animate at all", "how long", "with what easing" — and
 * both must read them from the element's own computed style rather than from a literal, so a
 * consumer who overrides `--eldra-duration-base` or `--eldra-ease-out` changes the JavaScript
 * animation exactly as it changes every CSS one. These lived in
 * `src/components/accordion/heightTransition.ts` first; they moved here when the second caller
 * arrived rather than being copied into it.
 */

/**
 * `true` under `prefers-reduced-motion: reduce`. The one JavaScript check `motion-reduce:` CSS
 * cannot make on its own: whether an animation may *start*, as opposed to how it looks once it
 * has. `useCarousel` reads it to keep autoplay from ever starting, `Carousel.vue` to scroll
 * instantly instead of smoothly, `Lightbox` for its own `←`/`→` stepping, and the two JavaScript
 * animations above to skip themselves entirely. It is re-exported from
 * `src/components/carousel/useCarousel.ts`, which is where the package's public entry has always
 * taken it from.
 *
 * `window.matchMedia` is guarded rather than assumed: a node-environment caller (there are none
 * today, but nothing here should throw if one shows up) gets `false` — the same "motion is fine"
 * default an engine with no media query support would produce.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** One custom property's computed value on `el`, or `''` where there is no style engine at all
 *  (a unit test with no CSS pipeline, most likely — a real consumer of this package always ships
 *  `tokens.css`). */
export function readCssVar(el: Element, name: string): string {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return '';
  return window.getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * Parses a CSS `<time>` (`200ms` / `0.2s`) into milliseconds, or `null` when it isn't a positive
 * one — the custom property is unset, empty, zeroed (reduced motion already zeroes every
 * `--eldra-duration-*` in `tokens.css`, which this treats the same as "cannot animate" rather than
 * animating a 0ms step), or not a time at all.
 *
 * That `null` is the second half of the reduced-motion answer, and the half that keeps working
 * when a consumer ships their own token file: `prefersReducedMotion()` above asks the visitor's
 * setting, this asks the stylesheet that setting is supposed to have changed.
 */
export function parseCssDurationMs(raw: string): number | null {
  const match = /^(-?[0-9]*\.?[0-9]+)(ms|s)$/.exec(raw);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] === 's' ? value * 1000 : value;
}
