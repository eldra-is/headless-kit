import type { IconComponent } from '../icon/types';

/**
 * The design spec's six fill colours (spec "Badge" → Properties). `variant` overrides this:
 * `sale` always renders like `accent`, `new` always like `primary`.
 */
export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger';

/**
 * The two product flags with a fixed tone, plus `none` for an ordinary tag (spec "Badge" →
 * Properties): "`sale` renders like `accent`, `new` like `primary`. Overrides `tone`."
 */
export type BadgeVariant = 'none' | 'sale' | 'new';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type BadgePart = 'root' | 'icon' | 'label' | 'hiddenSuffix';

export interface BadgeProps {
  /** Visible text (content). Sentence case. Also the fallback for the default slot. */
  label?: string;
  /** Fill colour. `success`/`warning`/`danger` require an `icon`: a dev warning when missing. */
  tone?: BadgeTone;
  /** Product flags. `sale` renders like `accent`, `new` like `primary`. Overrides `tone`. */
  variant?: BadgeVariant;
  /**
   * `background` fill with a 1px inset `border-strong` boundary, replacing the tone's own fill.
   * Used for "Sold out" on media and low-emphasis tags.
   */
  outline?: boolean;
  /** Fully rounded ends, wider padding. Category chips in content, filter summaries. */
  pill?: boolean;
  /** A decorative leading icon, hidden from assistive technology. */
  icon?: IconComponent | null;
  /**
   * Visually hidden text appended to the label, e.g. `" off"` after "−20%" — include any leading
   * space the spoken sentence needs; the component renders the value verbatim.
   */
  hiddenSuffix?: string | null;
  /** Render a different root element than the default `<span>`. */
  as?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<BadgePart, string>>;
}

/**
 * The stock status line's four levels (spec "Badge" → Stock status line → Properties): each picks
 * a fixed colour and icon — `in` success + circle-check, `low` warning + alert-triangle, `out`
 * danger + circle-x, `preorder` muted + clock.
 */
export type StockLevel = 'in' | 'low' | 'out' | 'preorder';

/** The parts a consumer can restyle through `classes`. */
export type StockBadgePart = 'root' | 'icon' | 'label';

export interface StockBadgeProps {
  /** Picks the colour, icon and default message. */
  level: StockLevel;
  /** Shown in the default `low` copy ("only 3 left"). Ignored by every other level. */
  quantity?: number | null;
  /** Overrides the level's default message entirely. */
  message?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<StockBadgePart, string>>;
}
