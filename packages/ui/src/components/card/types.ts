import type { Component } from 'vue';
import type { IconComponent } from '../icon/types';
import type { ImageMedia } from '../image/types';

/** The design spec's three fixed media ratios for a Content card (spec "Content card" →
 * Properties, `ratio` row) — a subset of `ImageRatio`, `Image`'s own type. */
export type ContentCardRatio = '3x2' | '4x3' | '16x9';

/**
 * `plain` (the default, media on top, no padding), `surface` (no image, `surface` fill and
 * padding, optional link cue) or `outlined` (1px border, padding, count meta) — spec "Content
 * card" → Variants. `plain` with no image renders as `surface` automatically (spec → Properties,
 * `variant` row); see `resolvedVariant` in `ContentCard.vue`.
 */
export type ContentCardVariant = 'plain' | 'surface' | 'outlined';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them:
 * the media frame (1), the body wrapper (2) and its eyebrow/title/titleLink/excerpt/meta, the
 * surface variant's link cue (3) and the outlined variant's count meta, which reuses `meta`. */
export type ContentCardPart =
  | 'root'
  | 'media'
  | 'body'
  | 'eyebrow'
  | 'title'
  | 'titleLink'
  | 'excerpt'
  | 'meta'
  | 'cue';

export interface ContentCardProps {
  /** Card title; also the link text (spec → Properties). */
  title: string;
  /** Destination. The whole card links here. */
  href: string;
  /** With `alt`; usually `alt=""` because the image repeats the title. `null`/omitted renders no
   * media at all (not `Image`'s own placeholder — see `ContentCard.vue`'s own comment). */
  image?: ImageMedia | null;
  /** The media frame's aspect preset. Defaults to `'3x2'`. */
  ratio?: ContentCardRatio;
  /** Sentence case; displayed uppercase via `text-overline`. `null` (the default) renders none. */
  eyebrow?: string | null;
  /** About 160 characters maximum, clamped to three lines. `null` (the default) renders none. */
  excerpt?: string | null;
  /** An ISO date (`YYYY-MM-DD`), rendered as `<time datetime>` through `src/utils/date.ts`. `null`
   * (the default) renders no date. */
  date?: string | null;
  /** Extra meta after the date ("4 min read") or, alone in the `outlined` variant, the count
   * ("24 products"). `null` (the default) renders none. */
  meta?: string | null;
  /** Defaults to `'plain'`. `plain` with no `image` renders as `surface` automatically. */
  variant?: ContentCardVariant;
  /** Link cue text for the `surface` variant ("Read the update"), e.g. before the arrow. `null`
   * (the default) renders no cue; ignored outside the resolved `surface` variant. */
  cue?: string | null;
  /** The title's heading level. Follows the block. Defaults to `3`. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Renders a skeleton media frame and three skeleton text lines instead of real content.
   * Defaults to `false`. */
  loading?: boolean;
  /** The locale `date` formats in. Defaults to the ambient `useEldraUiLocale()` value. */
  locale?: string;
  /** Render the title link through a different element/component than the default `<a>` — the
   * same contract as `Button`/`Link`'s own `as` (see `Link.vue`): a string tag still takes `href`;
   * a component takes the destination as `to`, matching Vue Router / NuxtLink. */
  as?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<ContentCardPart, string>>;
}

/** `plain` (the default, no padding/border/container), `surface` (`surface` fill, padding, a
 * `background` icon tile) or `outlined` (1px border, padding) — spec "Feature card" → Variants.
 * Every card in a row should use the same variant. */
export type FeatureCardVariant = 'plain' | 'surface' | 'outlined';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them:
 * the icon tile (1), the title (2) and its titleLink when linked, the body (3), and the linked-only
 * link cue (4). */
export type FeatureCardPart = 'root' | 'iconTile' | 'title' | 'titleLink' | 'body' | 'cue';

export interface FeatureCardProps {
  /** A decorative icon component (e.g. `import { IconTruck } from '@tabler/icons-vue'`). */
  icon: IconComponent;
  /** A concrete fact ("Free shipping over $80"); also the link text when linked. */
  title: string;
  /** One or two sentences, `muted`. */
  body: string;
  /** Makes the card linked: the title wraps a stretched link and the cue shows. `null`/omitted
   * (the default) renders an unlinked card with no tab stop. */
  href?: string | null;
  /** Link cue text (linked only). Defaults to the `learnMore` message ("Learn more"). */
  cue?: string;
  /** Defaults to `'plain'`. */
  variant?: FeatureCardVariant;
  /** The title's heading level. Follows the block. Defaults to `3`. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Render the title link through a different element/component than the default `<a>` — see
   * `ContentCardProps.as`. Linked only. */
  as?: string | Component;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<FeatureCardPart, string>>;
}
