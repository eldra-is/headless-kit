/**
 * The one shared Tailwind class recipe left in the theme: the focus ring for
 * the elements this starter still draws itself.
 *
 * Buttons, links and form controls come from `@eldrajs/ui` now and carry the
 * package's own `eldra-focus` ring (drawn from `--eldra-color-focus` /
 * `--eldra-color-focus-inner`, see `tokens.json`), so the recipes that used
 * to live here — `buttonBase`, `buttonVariants`, `buttonSizes`, `inputBase` —
 * are gone with the primitives that used them. What is left is the `gallery`
 * block's own image triggers, which open the package's `Lightbox` on click
 * (`blocks/gallery/Block.vue`) — the one interactive element left in this
 * starter that is not a package component and so does not already carry
 * `eldra-focus` on its own.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';
