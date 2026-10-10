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
 * `<value>` is `flex` for `Drawer`/`SearchModal` (their roots already laid out more than one part
 * with `flex` before this fix existed) and `block` for `Dialog`/`Lightbox` (their roots only ever
 * centre or size one `panel` child, and never carried `flex`) — **not** a stylistic choice:
 * `Dialog`'s own rootClass comment records an A/B screenshot comparison proving `open:flex` there
 * measurably narrows the panel (a flex item's default `flex-shrink: 1` fighting the UA
 * `dialog:modal` rule's own `max-width` at small viewports, which a block-level child never does),
 * while `open:block` is pixel-identical to every existing baseline. `open` defaults to `'flex'`
 * here since that is the more common case across the four.
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
  expect(root.classList.contains('hidden')).toBe(true);
  expect(root.classList.contains(`open:${open}`)).toBe(true);
}
