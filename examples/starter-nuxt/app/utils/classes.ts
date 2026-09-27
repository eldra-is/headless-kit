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

/**
 * The ring drawn inside the element's box, for a control whose parent clips its overflow (the
 * `video-embed` block's play button fills a rounded, `overflow-hidden` 16:9 frame, so an offset
 * ring outside its edge would be cut away entirely and keyboard focus would be invisible). This is
 * the package's own two-tone inset utility rather than a `ring-*` recipe: the button sits over
 * arbitrary poster imagery, and a single-colour ring has no guaranteed contrast against a photo.
 */
export const focusRingInset = 'eldra-focus-inset';
