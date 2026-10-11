import type { ImageMedia } from '../image/types';

/** The design spec's four sizes (spec "Avatar" → Sizes): 2rem, 2.5rem, 3.5rem, 6rem diameter. */
export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type AvatarPart = 'root' | 'image' | 'initials' | 'icon';

export interface AvatarProps {
  /**
   * The person's photo. A bare `string` is treated as the asset URL directly (the same shorthand
   * `ImageMedia['src']` would be); either way, falls back to initials, then to the user icon, on
   * a missing/empty value or a failed image load (spec "Avatar" → Properties, `src` row).
   */
  src?: ImageMedia | string | null;
  /**
   * The person's name. Feeds the initials fallback (first letter of the given and family name,
   * uppercase — see `src/utils/avatar.ts#initialsFromName`) and, when `decorative` is `false`,
   * the accessible name itself.
   */
  name?: string | null;
  /** Diameter. Defaults to `md` (2.5rem). See `AvatarSize`. */
  size?: AvatarSize;
  /**
   * `true` (the default) when the name is printed next to the avatar — a review byline, a
   * journal post's author card — so the avatar itself is hidden from assistive technology
   * (`aria-hidden="true"`) rather than announced a second time. `false` for a standalone avatar
   * with nothing else naming the person: it gets `role="img"` and `aria-label` set to `name`
   * instead (spec "Avatar" → Properties, `decorative` row; → Accessibility, 1.1.1/4.1.2).
   */
  decorative?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<AvatarPart, string>>;
}

/** One person in an `AvatarGroup` (spec "Avatar" → Properties, Avatar group `people` row). */
export interface AvatarGroupPerson {
  /** See `AvatarProps.src`. */
  src?: ImageMedia | string | null;
  /** Required here (unlike `AvatarProps.name`): every group member's accessible sentence names
   * them, so there is no standalone-vs-decorative choice to make per person. */
  name: string;
}

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them,
 * plus `srText` — the visually hidden element that carries the group's one accessible sentence
 * (spec "Avatar" → Accessibility: "A group gets one name … the individual avatars and '+4' are
 * hidden"). */
export type AvatarGroupPart = 'root' | 'item' | 'more' | 'srText';

export interface AvatarGroupProps {
  /** The people to show, in the order they stack. */
  people: AvatarGroupPerson[];
  /**
   * Avatars shown before the "+N" counter. Defaults to `3`. Clamped to `0`–`3` regardless of what
   * is passed — the spec's own anatomy caps a group at "up to three avatars plus a '+N' counter
   * avatar" and its acceptance criteria say a group "never" shows more than four circles in
   * total, so this is enforced rather than merely documented (see `AvatarGroup.vue`'s own
   * comment).
   */
  max?: number;
  /** The group's own label, e.g. `"Makers"` — prefixes the accessible sentence: `"Makers: Ingrid,
   * Tomas, Maya and 4 more"` (spec "Avatar" → Properties, Avatar group `label` row). */
  label: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<AvatarGroupPart, string>>;
}
