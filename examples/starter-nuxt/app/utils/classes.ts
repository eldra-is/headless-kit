/**
 * The one shared Tailwind class recipe left in the theme: the focus ring for
 * the elements this starter still draws itself.
 *
 * Buttons, links and form controls come from `@eldrajs/ui` now and carry the
 * package's own `eldra-focus` ring (drawn from `--eldra-color-focus` /
 * `--eldra-color-focus-inner`, see `tokens.json`), so the recipes that used
 * to live here — `buttonBase`, `buttonVariants`, `buttonSizes`, `inputBase` —
 * are gone with the primitives that used them. What is left is everything the
 * theme itself makes focusable: the still-local primitives
 * (`UiAccordionItem`'s summary, `UiTab`, `UiDialog`'s close button — all
 * replaced in the next sub-projects), a carousel track, a lightbox thumbnail,
 * and the skip link.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
