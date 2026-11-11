import { expect } from 'vitest';

/**
 * A closed modal root (`Dialog`/`Drawer`/`Lightbox`/`SearchModal`'s own `<dialog>`) must render
 * nothing (fix, from the operator's own finding): the UA stylesheet's own
 * `dialog:not([open]) { display: none }` only wins on *specificity*, and cascade *origin* is
 * compared before specificity — an author rule always beats a user-agent one, so any author
 * `display` utility on the element, however unspecific, overrides that default the moment the
 * dialog closes. Every modal root in this package fixes this the same way: `hidden open:<value>`
 * (Tailwind's `open:` variant) — `hidden` sets `display: none` unconditionally (an author rule
 * that always applies), `open:<value>` only wins once the `open` attribute is back, and then by
 * specificity, both being the same author origin (`.open\:<value>:is([open], …)` — two selectors
 * deep — outranks the single-class `.hidden`).
 *
 * `<value>` is `flex` for `Dialog`/`Drawer`/`SearchModal` (their roots lay out their parts with
 * `flex`; `Dialog`'s is a column, so its panel keeps its width) and `block` for `Lightbox` (its
 * root only sizes one child). `open` defaults to `'flex'`, the common case.
 *
 * See `modalClosedDisplay.spec.ts` for the built-CSS half of this guard: happy-dom does not compute
 * layout, so `getComputedStyle(...).display` cannot prove any of this here — asserting the two
 * class names are present is the unit-level half instead, and only means something once the
 * compiled rule itself is also proven to say what this comment claims.
 */
export function expectClosedModalRendersNothing(
  root: Element,
  open: 'flex' | 'block' = 'flex'
): void {
  expect(root.hasAttribute('open')).toBe(false);
  expect(root.classList.contains('eldra:hidden')).toBe(true);
  expect(root.classList.contains(`eldra:open:${open}`)).toBe(true);
}
