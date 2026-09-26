<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import Icon from '../icon/Icon.vue';
import { CARD_FOCUS_PROXY, STRETCHED_LINK, STRETCHED_LINK_OUTLINE } from './stretchedLink';
import type { FeatureCardProps, FeatureCardVariant } from './types';

const props = withDefaults(defineProps<FeatureCardProps>(), {
  href: null,
  cue: undefined,
  variant: 'plain',
  headingLevel: 3,
  as: undefined,
  classes: undefined,
});

const messages = useMessages();

/** Spec "Feature card" → Properties, `href` row: "Makes the card linked." Same empty-string
 * treatment as `LogoItem`'s own `hasHref` — an explicit `''` is "no destination", not a link to
 * nowhere. */
const hasHref = computed(
  () => props.href !== null && props.href !== undefined && props.href !== ''
);

/** Spec → Properties, `cue` row: default `"Learn more"`, through the message catalogue rather than
 * a literal prop default (`useMessages()`'s own `learnMore` key) so an Icelandic store gets the
 * translation without passing `cue` on every card. */
const resolvedCue = computed(() => props.cue ?? messages.value.learnMore);

const headingTag = computed(() => `h${props.headingLevel}`);

/** `as` follows `Link`/`Button`'s own contract exactly — see `Link.vue`'s comment. Linked only:
 * with no `href` there is no tag to choose. */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');
const titleTag = computed(() => props.as ?? 'a');
const titleAttrs = computed<Record<string, unknown>>(() =>
  isComponentAs.value ? { to: props.href } : { href: props.href }
);

/** Spec → Variants: `plain` "No padding, border or visible container"; `surface`/`outlined` both
 * take the spec's own `space-6` (1.5rem) padding, `outlined` adding the 1px `border` boundary.
 * Fill: `background` by default (spec → States, Default row), `surface` for that variant. */
const VARIANT_CLASS: Record<FeatureCardVariant, string> = {
  plain: '',
  surface: 'bg-surface p-6',
  outlined: 'bg-background border border-border p-6',
};

/** Spec → States, Default row: "`text` on `surface-strong` tile (surface variant: `background`
 * tile)" — the icon tile inverts specifically for the `surface` variant, `plain`/`outlined` share
 * the same `surface-strong` fill. */
const ICON_TILE_CLASS: Record<FeatureCardVariant, string> = {
  plain: 'bg-surface-strong text-text',
  surface: 'bg-background text-text',
  outlined: 'bg-surface-strong text-text',
};

/**
 * The card root (spec → Anatomy). `CARD_FOCUS_PROXY` — `relative`, `rounded-lg`, `group`,
 * `eldra-focus eldra-focus-proxy`, see `stretchedLink.ts`'s own comment — only while linked: an
 * unlinked card has no tab stop at all (spec → Keyboard: "Unlinked: none"), so it needs no
 * positioning context, ring proxy or hover scope.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'flex flex-col gap-3 rounded-lg',
      hasHref.value && CARD_FOCUS_PROXY,
      VARIANT_CLASS[props.variant]
    ),
    props.classes,
    'root'
  )
);

/** Spec → Sizes: "Icon tile: 2.75rem square, `radius-md`" — `size-11` is 11 × 0.25rem = 2.75rem.
 * `shrink-0` is the acceptance criterion "The icon tile stays 2.75rem square when the title wraps
 * to four lines." */
const iconTileClass = computed(() =>
  partClass(
    cx(
      'flex size-11 shrink-0 items-center justify-center rounded-md',
      ICON_TILE_CLASS[props.variant]
    ),
    props.classes,
    'iconTile'
  )
);

/** Spec → Sizes: "Title: heading family, 1.125rem, line-height 1.35, weight 600" — `text-h4`
 * already reads exactly this combination (`tailwind.css`'s `--eldra-text-h4-*` tokens), reused
 * directly rather than a new utility. */
const titleClass = computed(() => partClass('text-h4 text-text', props.classes, 'title'));

/** The stretched link (spec → Anatomy, part 2: "with the stretched link when linked"); see
 * `stretchedLink.ts`'s own comment and `ContentCard.vue`'s `titleLinkClass` for why
 * `group-hover:underline`/`outline-none` are written this way. */
const titleLinkClass = computed(() =>
  partClass(
    cx('no-underline group-hover:underline', STRETCHED_LINK, STRETCHED_LINK_OUTLINE),
    props.classes,
    'titleLink'
  )
);

/** Spec → Sizes: "Body: 0.9375rem, `muted`" — the same numeric size as `ContentCard`'s own
 * excerpt, so it reuses `text-content-card-excerpt` rather than a third near-identical utility
 * (see that utility's own comment in `tailwind.css`). */
const bodyClass = computed(() =>
  partClass('text-content-card-excerpt text-muted', props.classes, 'body')
);

/** Spec → Sizes: "Link cue: standalone link style … min-height 1.5rem" — the same shape
 * `ContentCard`'s own `cueClass` renders, minus the `mt-auto` (a Feature card's cue sits directly
 * under the body in normal flow, never pinned). */
const cueClass = computed(() =>
  partClass(
    'inline-flex items-center gap-1 target-min font-semibold text-text',
    props.classes,
    'cue'
  )
);

/** The cue's arrow — identical geometry and hover-nudge to `ContentCard.vue`'s own; see that
 * component's comment on its `arrowClass`. */
const arrowClass =
  'inline-block size-4.5 shrink-0 transition-[translate] duration-fast ease-out ' +
  'motion-reduce:transition-none group-hover:translate-x-0.5';
</script>

<template>
  <div data-part="root" :class="rootClass">
    <!-- Spec → Accessibility: "Icons are `aria-hidden="true"`; the title carries the meaning." -->
    <span data-part="iconTile" :class="iconTileClass" aria-hidden="true">
      <Icon :icon="icon" size="lg" />
    </span>
    <component :is="headingTag" data-part="title" :class="titleClass">
      <component
        v-if="hasHref"
        :is="titleTag"
        data-part="titleLink"
        :class="titleLinkClass"
        v-bind="titleAttrs"
      >
        <slot name="title">{{ title }}</slot>
      </component>
      <template v-else
        ><slot name="title">{{ title }}</slot></template
      >
    </component>
    <p data-part="body" :class="bodyClass">
      <slot name="body">{{ body }}</slot>
    </p>
    <!-- Spec → Accessibility: "Cue is `aria-hidden`." -->
    <span v-if="hasHref" data-part="cue" :class="cueClass" aria-hidden="true">
      <slot name="cue">{{ resolvedCue }}</slot>
      <svg
        :class="arrowClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 12l14 0" />
        <path d="M13 18l6 -6" />
        <path d="M13 6l6 6" />
      </svg>
    </span>
  </div>
</template>
