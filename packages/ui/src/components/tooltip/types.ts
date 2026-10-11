/** Above or below the trigger. Combines with `align` (spec "Tooltip" → Variants). */
export type TooltipPlacement = 'top' | 'bottom';

/** Centred on the trigger, or aligned to its start / end edge (a trigger near a screen edge). */
export type TooltipAlign = 'start' | 'center' | 'end';

/**
 * `label`: the tooltip **is** the trigger's accessible name (`aria-labelledby`) — for an icon-only
 * button, which otherwise has none. `description`: an extra hint added to a trigger that already
 * has a visible label (`aria-describedby`).
 */
export type TooltipRole = 'label' | 'description';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type TooltipPart = 'root' | 'bubble' | 'arrow';

/**
 * The default slot's first element is the trigger `Tooltip` names or describes. **It must be a
 * plain element, or a component whose focusable root receives `$attrs`** — an `aria-labelledby` or
 * `aria-describedby` is grafted onto it (`cloneVNode`), and that graft only reaches the DOM when
 * the vnode's own attrs land on a real element. `Button` works: it lets `$attrs` fall through
 * undisturbed. A component declared `inheritAttrs: false` whose own template binds its *own*
 * `aria-describedby` after spreading `$attrs` (`Input`, `Textarea`, `Select`, `Switch`, and this
 * package's other form controls) silently overwrites the grafted attribute instead — a dev-only
 * warning fires when this happens (checked against the rendered DOM, not `inheritAttrs` itself, so
 * it also catches an unrelated `$attrs`-ordering issue with the same symptom). Wrap such a control
 * in a plain element the tooltip can attach to instead.
 */
export interface TooltipProps {
  /** The label text, a few words. Never essential information, an error, a price or a link. */
  text: string;
  /**
   * Above or below the trigger. Defaults to `top`. Read once, like every `useFloating` placement —
   * a tooltip that has to change it at runtime re-keys the component instead.
   */
  placement?: TooltipPlacement;
  /**
   * Centred, or aligned to the trigger's start / end edge for a trigger near a screen edge.
   * Defaults to `center`. Read once, the same as `placement`.
   */
  align?: TooltipAlign;
  /**
   * Whether the tooltip names the trigger (`label`, for an icon-only button with no other name) or
   * only describes it (`description`, for a trigger that already has a visible label). Defaults to
   * `label`.
   */
  role?: TooltipRole;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<TooltipPart, string>>;
}
