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
