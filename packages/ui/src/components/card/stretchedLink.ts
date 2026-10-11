/**
 * The "whole card is one link" pattern shared by every card whose entire surface is a single tab
 * stop: `ContentCard` and `FeatureCard` here, and `ProductCard` (built in the same wave, and
 * consuming these same three constants rather than duplicating the pattern — see
 * `ProductCard.vue`'s own `rootClass`/`linkClass` comments).
 *
 * The card's real focusable element is the title's `<a>` (or its `as` substitute) — a normal,
 * visible piece of text, unlike `Checkbox`'s visually hidden input. Two class lists make the whole
 * card behave like one link:
 *
 * - `STRETCHED_LINK`, on the title `<a>` itself: `after:absolute after:inset-0` extends its hit
 *   area to the nearest *positioned* ancestor — the card root, which carries `CARD_FOCUS_PROXY`'s
 *   `relative` — covering the whole card for pointer and hit-testing purposes, without the `<a>`
 *   itself growing to fill it (it stays inline, sized to its own text, wrapping normally). The
 *   `<a>` is deliberately left `static` (no `relative` of its own): an absolutely positioned
 *   pseudo-element resolves against the nearest positioned ancestor, and if the anchor itself were
 *   `relative` the stretch would cover only the anchor's own text-sized box instead of the card.
 *   Positioned elements paint above normal in-flow siblings regardless of DOM order, so the
 *   pseudo-element's hit area sits above an image that comes earlier in the markup without needing
 *   its own `z-index`.
 * - `CARD_FOCUS_PROXY`, on the card root, only while the card is actually linked: `relative` (the
 *   positioning context the pseudo-element above needs), `rounded-lg` (spec acceptance: "the
 *   standard focus ring around the whole card with `radius-lg` corners"), `group` (the hover scope
 *   below) and `eldra-focus eldra-focus-proxy` — the same shape `Checkbox` gives its drawn box (see
 *   that component's own comment): the ring and its transition live in `eldra-focus`;
 *   `eldra-focus-proxy` is the modifier that turns it on from `:has(:focus-visible)` rather than
 *   the root's own focus, because the root itself is never in the tab order.
 *
 * The title `<a>` needs `outline-none` of its own (`STRETCHED_LINK_OUTLINE`) — not `outline-hidden`
 * (`Rating.vue`'s own linked variant, which *wants* its own forced-colours ring because it is not
 * part of a stretched-card root). Here the ring belongs solely to the card, and
 * `eldra-focus-proxy`'s own forced-colours rule already draws it on the root; if the `<a>` kept a
 * visible forced-colours outline of its own, a keyboard user would see two rings at once — one
 * hugging the title text and one around the card — which the spec's own acceptance criteria rule
 * out ("the link shows no separate ring").
 *
 * Hover reads the same way: the pseudo-element is generated *inside* the `<a>`'s box in the render
 * tree, so hovering anywhere over it counts as hovering the `<a>` and every real ancestor of it,
 * root included — which is why a card drives every hover effect (`group-hover:underline` on the
 * title, `group-hover:translate-x-0.5` on a cue arrow) from the root's `group` rather than from the
 * `<a>` directly: a cue is a sibling of the `<a>`, not a descendant of it.
 */
export const CARD_FOCUS_PROXY = 'group relative rounded-lg eldra-focus eldra-focus-proxy';
export const STRETCHED_LINK = 'after:absolute after:inset-0';
export const STRETCHED_LINK_OUTLINE = 'outline-none';
