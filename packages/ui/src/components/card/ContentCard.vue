<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useHeadingTag } from '../../composables/useHeadingTag';
import { useMessages } from '../../composables/useMessages';
import { useSlotPresence } from '../../composables/useSlotPresence';
import { cx, partClass } from '../../utils/cx';
import { formatDate } from '../../utils/date';
import Image from '../image/Image.vue';
import Skeleton from '../skeleton/Skeleton.vue';
import { CARD_FOCUS_PROXY, STRETCHED_LINK, STRETCHED_LINK_OUTLINE } from './stretchedLink';
import { CUE_ARROW_CLASS, CUE_ARROW_PATHS } from './cueArrow';
import type { ContentCardProps, ContentCardVariant } from './types';

const props = withDefaults(defineProps<ContentCardProps>(), {
  image: null,
  ratio: '3x2',
  eyebrow: null,
  excerpt: null,
  date: null,
  meta: null,
  variant: 'plain',
  cue: null,
  headingLevel: 3,
  loading: false,
  locale: undefined,
  linkAs: undefined,
  classes: undefined,
});

const messages = useMessages();

const slots = useSlots();
/** See `useSlotPresence`'s own comment: slots are not reactive on their own, so every part whose
 * visibility can come from either a prop or a slot reads this instead of `$slots.x !== undefined`
 * directly. */
const present = useSlotPresence(slots, ['eyebrow', 'title', 'excerpt', 'meta', 'cue'] as const);

const ambientLocale = useEldraUiLocale();
/** Spec → Properties, `date` row: "Rendered as … in a `<time datetime>`." `locale` wins over the
 * ambient one, exactly like `Price`'s own `locale` prop. */
const locale = computed(() => props.locale ?? ambientLocale.value);

const hasImage = computed(() => Boolean(props.image));

/** Spec → Properties, `variant` row: "`plain` with no image becomes `surface` automatically"
 * (also → Acceptance criteria, → Do/Don't). Every other computed below that reads "the variant"
 * reads this, not `props.variant` directly. */
const resolvedVariant = computed<ContentCardVariant>(() =>
  props.variant === 'plain' && !hasImage.value ? 'surface' : props.variant
);

const hasEyebrow = computed(() => Boolean(props.eyebrow) || present.value.eyebrow);
const hasExcerpt = computed(() => Boolean(props.excerpt) || present.value.excerpt);

/** `formatDate` never throws (`src/utils/date.ts`) but returns `null` for a malformed/empty
 * `date` — in which case no `<time>` element renders at all rather than a fabricated date. */
const formattedDate = computed(() => (props.date ? formatDate(props.date, locale.value) : null));

/** Spec → Anatomy, part 2.4 and part 4: the date/meta line ("12 Sep 2026 · 4 min read") in the
 * `plain`/`surface` variants, or the count alone ("24 products") pinned to the bottom in
 * `outlined` — see `metaClass` below for the pinning. Both read this one part. Reads
 * `formattedDate`, not `props.date`, so a malformed date with no other meta renders no meta line
 * at all rather than an empty one. */
const hasMetaLine = computed(
  () => Boolean(formattedDate.value) || Boolean(props.meta) || present.value.meta
);

/** Spec → Anatomy, part 3: "Link cue (surface variant, optional) … pinned to the bottom." Reads
 * `resolvedVariant`, not `props.variant`, so a plain no-image card (which renders as `surface`)
 * can show one too. */
const showCue = computed(
  () => resolvedVariant.value === 'surface' && (Boolean(props.cue) || present.value.cue)
);

const headingTag = useHeadingTag(() => props.headingLevel);

/** `linkAs` follows `Link`/`Button`'s own `as` contract exactly — see `Link.vue`'s comment — but
 * is named for what it actually targets: the title's stretched link, a nested part, not the card's
 * own fixed `<article>` root (see `card/types.ts`'s own comment on the rename). */
const isComponentAs = computed(
  () => props.linkAs !== undefined && typeof props.linkAs !== 'string'
);
const titleTag = computed(() => props.linkAs ?? 'a');
const titleAttrs = computed<Record<string, unknown>>(() =>
  isComponentAs.value ? { to: props.href } : { href: props.href }
);

/**
 * Container fill (spec → States, Default row: "`background` (surface variant: `surface`)", and →
 * Variants). `outlined` additionally gets the 1px `border` boundary. Padding is the spec's own
 * `space-6` (1.5rem) for `surface`/`outlined`; the `plain`-with-image variant gets none at all
 * (spec → Variants, "Image (plain, default)" row: "no padding").
 */
const VARIANT_CLASS: Record<ContentCardVariant, string> = {
  plain: 'bg-background',
  surface: 'bg-surface p-6',
  outlined: 'bg-background border border-border p-6',
};

/**
 * The card root (spec → Anatomy; → Accessibility: "Root `<article>`"). `rounded-lg` is always
 * present, whatever the variant, because the focus ring's own corners read it (spec → Acceptance
 * criteria on the sibling Product card: "the standard focus ring around the whole card with
 * `radius-lg` corners") — see `stretchedLink.ts`'s own comment for the rest of `CARD_FOCUS_PROXY`.
 * It is dropped entirely while `loading`: a loading card has no focusable title link for it to
 * proxy.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'flex flex-col gap-4 rounded-lg',
      !props.loading && CARD_FOCUS_PROXY,
      VARIANT_CLASS[resolvedVariant.value]
    ),
    props.classes,
    'root'
  )
);

const mediaClass = computed(() => partClass('', props.classes, 'media'));

/** Spec → Sizes: "Body gap: 0.5rem (`space-2`)." `flex-1` is the anatomy's "Body (grows to fill)":
 * inside a row of cards of equal height, the meta line/cue below still pins to each card's own
 * bottom edge (see `metaClass`/`cueClass`'s own `mt-auto`). */
const bodyClass = computed(() => partClass('flex flex-1 flex-col gap-2', props.classes, 'body'));

/** Spec → Sizes: "Eyebrow: 0.75rem, weight 600, letter-spacing 0.12em, line-height 1.3, uppercase
 * via styling" — `text-overline` (`tailwind.css`) is exactly this combination already, reused
 * directly rather than duplicated. Colour: `accent` (spec → States). */
const eyebrowClass = computed(() =>
  partClass('text-overline text-accent', props.classes, 'eyebrow')
);

/** Spec → Sizes: "Title: heading family, 1.25rem, line-height 1.3, weight 600, letter-spacing
 * −0.01em" — see `text-content-card-title` in `tailwind.css` for why this is its own utility
 * rather than a reused one. */
const titleClass = computed(() =>
  partClass('text-content-card-title text-text', props.classes, 'title')
);

/**
 * The stretched link itself (spec → Anatomy, part 2.2: "Title: heading containing the stretched
 * link"). `group-hover:underline` (spec → States, Hover: "title underlined 1px") reads the card
 * root's own `group`, not a `:hover` on this element directly — see `stretchedLink.ts`'s own
 * comment for why. `STRETCHED_LINK_OUTLINE` (`outline-none`) is deliberate, not an oversight: the
 * ring lives on the root, not here.
 */
const titleLinkClass = computed(() =>
  partClass(
    cx('no-underline group-hover:underline', STRETCHED_LINK, STRETCHED_LINK_OUTLINE),
    props.classes,
    'titleLink'
  )
);

/** Spec → Sizes: "Excerpt: 0.9375rem, clamp 3 lines" — `line-clamp-3` is stock Tailwind. Colour:
 * `muted` (spec → States). See `text-content-card-excerpt` in `tailwind.css`. */
const excerptClass = computed(() =>
  partClass('text-content-card-excerpt text-muted line-clamp-3', props.classes, 'excerpt')
);

/** Spec → Sizes: "Meta: 0.8125rem" — `text-caption`'s own size already matches exactly, so this
 * reuses it rather than a new utility (unlike the title/excerpt above, neither of which any shared
 * type style matches). `mt-auto` only in `outlined`: that is the variant whose count meta pins to
 * the card's own bottom edge (spec → Anatomy, part 4); `plain`/`surface` let it flow after the
 * excerpt instead. */
const metaClass = computed(() =>
  partClass(
    cx('text-caption text-muted', resolvedVariant.value === 'outlined' && 'mt-auto'),
    props.classes,
    'meta'
  )
);

/** Spec → Sizes: "Link cue: standalone link style: weight 600, arrow icon 1.125rem, gap 0.25rem,
 * min-height 1.5rem" — `target-min` is exactly the 1.5rem minimum height token, `gap-1` the
 * 0.25rem gap; this is the same combination `Link`'s own `standalone` variant renders (see
 * `Link.vue`), reused here as plain classes rather than through the component because `Link`
 * renders no arrow/no styling at all with no `href` (see this component's own comment on `Link`
 * above `showCue`). Always `mt-auto`: the cue is the `surface` variant's own bottom-pinned part. */
const cueClass = computed(() =>
  partClass(
    'mt-auto inline-flex items-center gap-1 target-min font-semibold text-text',
    props.classes,
    'cue'
  )
);

/** The cue's arrow (spec → States, Hover: "cue arrow moves 2px right (`duration-fast`)") — the
 * same geometry and hover-nudge as `Link.vue`'s own standalone arrow, redrawn here for the same
 * "no `href`, no styling" reason `cueClass` explains. A different element than `titleLinkClass`
 * above, so it keeps its own `transition-*` utility (`src/__tests__/focus-transition.spec.ts` only
 * guards elements that also carry `eldra-focus*`). Shared with `FeatureCard.vue` via
 * `card/cueArrow.ts` rather than redeclared here. */
const arrowClass = CUE_ARROW_CLASS;

/**
 * The loading root is a `<div>`, not the `<article>` the real card below renders: the
 * ARIA-in-HTML allowed-roles table does not permit `role="group"` on `<article>` (axe's
 * `aria-allowed-role` rule catches it — see `ProductCard.vue`'s own comment, which established
 * this pattern first), and there is no real article content to justify the tag while loading
 * anyway. Named (`aria-label="messages.loading"`) so a loading card is never an empty, unlabelled
 * busy region (spec "Skeleton" → Anatomy, part 1: "Busy region … with a visually hidden 'Loading
 * …' text"). No stray HTML comment sits beside the `v-if`/`v-else` pair below in the template
 * either — see `ProductCard.vue`'s own comment for why that would turn the single conditional
 * root into a genuine multi-root Fragment.
 */
</script>

<template>
  <div
    v-if="loading"
    data-part="root"
    :class="rootClass"
    role="group"
    aria-busy="true"
    :aria-label="messages.loading"
  >
    <div data-part="media" :class="mediaClass" aria-hidden="true">
      <Skeleton variant="media" :ratio="ratio" />
    </div>
    <div data-part="body" :class="bodyClass">
      <Skeleton variant="text" :lines="3" />
    </div>
  </div>

  <article v-else data-part="root" :class="rootClass">
    <!-- Spec → Anatomy, part 1: "Media (optional)". `alt` is left to `Image`'s own default
         (the media's own `alt`, then `""`) rather than forced here, so a card whose image adds
         real information can still describe it (spec → Accessibility, 1.1.1). -->
    <div v-if="hasImage" data-part="media" :class="mediaClass">
      <Image :media="image" :ratio="ratio" rounded="lg" />
    </div>
    <div data-part="body" :class="bodyClass">
      <p v-if="hasEyebrow" data-part="eyebrow" :class="eyebrowClass">
        <slot name="eyebrow">{{ eyebrow }}</slot>
      </p>
      <component :is="headingTag" data-part="title" :class="titleClass">
        <component :is="titleTag" data-part="titleLink" :class="titleLinkClass" v-bind="titleAttrs">
          <slot name="title">{{ title }}</slot>
        </component>
      </component>
      <p v-if="hasExcerpt" data-part="excerpt" :class="excerptClass">
        <slot name="excerpt">{{ excerpt }}</slot>
      </p>
      <p v-if="hasMetaLine" data-part="meta" :class="metaClass">
        <slot name="meta">
          <time v-if="formattedDate" :datetime="date!">{{ formattedDate }}</time>
          <template v-if="formattedDate && meta"> · </template>
          <template v-if="meta">{{ meta }}</template>
        </slot>
      </p>
      <!-- Spec → Accessibility: "The cue is `aria-hidden="true"` so the destination is not read
           twice. No separate 'Read more' link." -->
      <span v-if="showCue" data-part="cue" :class="cueClass" aria-hidden="true">
        <slot name="cue">{{ cue }}</slot>
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
          <path v-for="d in CUE_ARROW_PATHS" :key="d" :d="d" />
        </svg>
      </span>
    </div>
  </article>
</template>
