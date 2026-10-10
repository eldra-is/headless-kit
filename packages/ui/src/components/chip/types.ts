import type { UiMessages } from '../../messages/en-US';
import type { IconComponent } from '../icon/types';
import type { ImageMedia } from '../image/types';

/**
 * `Chip` and `ChipGroup` are an operator addition (2026-09-25), not a design spec 1 section — see
 * `README.md`'s Additions list. The visual language is derived from two spec sections that do
 * exist: Badge's pill shape (`## Badge` → Properties, `pill` row) and Multi-select's removable tag
 * row (`## Multi-select` → Sizes, Tags row), which is also where `Chip`'s `sm` size and its remove
 * button come from directly — see `src/utils/tagRecipe.ts`, shared with `MultiSelect.vue`.
 */
export type ChipPart = 'root' | 'icon' | 'avatar' | 'label' | 'removeButton';

/**
 * `sm` is the exact "small chip" `MultiSelect`'s own tag row draws (1.75rem min height, 0.8125rem
 * text). `md` is this component's own, larger recipe: 2.25rem min height, 0.875rem text — a chip
 * a consumer reaches for on its own, outside a control's tag row, wants a target closer to the
 * package's other controls' minimum (2.5.8) than the tag row's compact 1.75rem.
 */
export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  /** The visible text (content). Also the default slot's fallback. */
  label: string;
  /** One of the two sizes. Defaults to `md`. */
  size?: ChipSize;
  /**
   * Adds a remove button, named `"Remove <label>"` (`messages.removeTag`, the same message
   * `MultiSelect`'s own tags use). See `Chip.vue`'s own comment for why a removable chip's root is
   * never also the selection toggle, whatever `selectable` says.
   */
  removable?: boolean;
  /**
   * Renders the root as a `<button type="button" aria-pressed>` that toggles `selected` on click —
   * unless `removable` is also `true` (see `Chip.vue`'s comment). Ignored inside a `ChipGroup`
   * that already derives `selected` for this chip (a `value` set and a group above it): the group
   * still needs `selectable` on the child chip to render it as a button in the first place, but the
   * *value* toggled is the group's `modelValue`, not this chip's own `selected`.
   */
  selectable?: boolean;
  /**
   * Selected state (two-way, `update:selected`). Ignored — read from the `ChipGroup` context
   * instead — when this chip has both a `value` and a `ChipGroup` ancestor.
   */
  selected?: boolean;
  /** Not focusable or clickable; the remove button, if any, is disabled too. */
  disabled?: boolean;
  /** A decorative leading icon. Ignored when `avatar` is also given. */
  icon?: IconComponent;
  /**
   * A decorative leading photo, drawn with `Avatar` at the chip's own icon size (see `Chip.vue`'s
   * comment — no built-in `Avatar` size is small enough to sit inside either chip size). A missing
   * or failed image falls back to initials of `label`, then to `Avatar`'s own user icon — both
   * scaled down to fit the chip's own leading slot. Takes priority over `icon` when both are given.
   */
  avatar?: ImageMedia | string | null;
  /** This chip's value inside a `ChipGroup` — see `selected` and `ChipGroup`'s own docs. */
  value?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ChipPart, string>>;
  /**
   * Overrides for the one string this component renders itself: `removeTag`, the remove button's
   * accessible name, which defaults to "Remove <label>".
   *
   * It is a prop rather than only the ambient provide because the override is often **per chip**
   * rather than per app: a row of filter chips all read "Brown", "M", "Sweaters", and each one's
   * remove button has to say which facet it belongs to ("Remove filter Colour: Brown") — one
   * provided string cannot, because it cannot see the chip.
   */
  messages?: Partial<UiMessages>;
}

/** The one part a consumer can restyle through `ChipGroup`'s `classes`. */
export type ChipGroupPart = 'root';

export interface ChipGroupProps {
  /** The selected chips' values (two-way, `update:modelValue`). */
  modelValue: string[];
  /**
   * The group's accessible name (`aria-label` on the `role="group"` root). Named `ariaLabel`, not
   * `label`: it is never visible text, unlike `label` on `Badge`/`Chip`/`Checkbox`/`Select` and the
   * rest of the package — see the README's "`ariaLabel` is always an accessible name" rule.
   */
  ariaLabel: string;
  /** Disables every member `Chip`, in addition to whatever each one says on its own. */
  disabled?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ChipGroupPart, string>>;
}
