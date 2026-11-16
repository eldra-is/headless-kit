<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { roundRatingToHalf } from '../../utils/rating';
import RatingStars from './RatingStars.vue';
import type { RatingProps } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<RatingProps>(), {
  count: 0,
  showValue: true,
  showCount: true,
  size: 'md',
  href: undefined,
  as: undefined,
  classes: undefined,
});

const messages = useMessages();

const rounded = computed(() => roundRatingToHalf(props.value));
const formattedValue = computed(() => rounded.value.toFixed(1));

/** Spec "Rating" → Properties, `count` row: "`0` renders the no-reviews state." */
const isEmpty = computed(() => props.count === 0);

/**
 * `href` only produces the linked variant when there is something to link to (spec "Rating" →
 * Variants, "Linked" row: "jumps to reviews"). With `count === 0` the no-reviews state's own
 * `emptyAction` slot is where an interactive link belongs instead — nesting an `<a>` around it
 * would put an `<a>` inside an `<a>` the moment a consumer used that slot, which is invalid HTML
 * and would strip the inner link's own semantics.
 */
const isLinked = computed(() => props.href != null && !isEmpty.value);

/** Resolution (spec "Link" → Properties precedent): `as` accepts a string tag (still takes
 * `href`) or a component (takes the destination as `to`, matching Vue Router / NuxtLink) — the
 * same contract `Link.vue` already documents. */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');
const linkAttrs = computed(() => {
  if (!isLinked.value) return {};
  return isComponentAs.value ? { to: props.href } : { href: props.href };
});

/**
 * Spec "Rating" → Accessibility: "Rated 4.5 out of 5, 128 reviews" — the static wrapper's
 * `aria-label`. The linked variant's accessible name reuses this same sentence via `aria-label` on
 * the `<a>` itself, rather than the spec's separately worded ", rated 4.5 out of 5" appended to the
 * visible value/count text. The API contract scopes the new message vocabulary to exactly `rating`
 * and `noReviews`; reusing one tested sentence for both forms honours that budget and gives every
 * screen reader an unambiguous single name instead of two overlapping fragments (the visible value
 * and count are marked `aria-hidden` in both forms for the same reason — see the template).
 */
const ratingSentence = computed(() => messages.value.rating(rounded.value, props.count));

/** Spec "Rating" → Anatomy, part 3: "'(128)' on cards; '128 reviews' underlined when linked." The
 * card form is a literal parenthesised number (no word to translate); the linked form is a real
 * pluralised sentence fragment, so it comes from `messages.reviewCount`. */
const cardCountText = computed(() => `(${props.count})`);
const linkedCountText = computed(() => messages.value.reviewCount(props.count));

/**
 * Spec "Rating" → States, "On primary / accent section" row, same `section-primary:`/
 * `section-accent:` mechanism `Price`/`Link` already use for the value/count/link text (the stars' own
 * copy of this lives in `RatingStars.vue`).
 */
const SECTION =
  'eldra:section-primary:text-primary-contrast ' + 'eldra:section-accent:text-accent-contrast';

const rootClass = computed(() => [
  // `flex-wrap` (spec "Rating" → Acceptance criteria: "Parts wrap without overflow at 200%
  // zoom and in a 320px column", 1.4.10) — normal content never needs it (five stars plus a
  // short "4.5 (128)" is well under 320px), but nothing here bounds `count`, so a store with
  // an extreme review count still wraps onto a second line instead of overflowing, the same
  // defensive reasoning `Price`'s own `flex-wrap` documents.
  'eldra:inline-flex eldra:flex-wrap eldra:items-center eldra:gap-2',
  // Spec "Rating" → Accessibility: "shows the standard focus ring around the whole rating"
  // (2.4.7) and "at least 1.5rem tall" (2.5.8). The ring and the minimum height sit on `root`
  // rather than on the nested `<a data-part="link">` below: `eldra-focus-proxy` is
  // `:has(:focus-visible)` (see `tailwind.css`, and `Checkbox`/`VariantPicker` for the same
  // pattern), so a real, visible, keyboard-focusable descendant still draws the ring on its
  // ancestor — which keeps the ring's box (and the 1.5rem minimum) `root`'s own predictable
  // layout box regardless of what tag `as` renders, rather than depending on an inline `<a>`'s
  // content-fitted focus box. `eldra-link-radius` reuses `Link`'s 2px ring corner: the same
  // inline-shape context, so no new per-component variable is needed for it.
  isLinked.value &&
    'eldra:eldra-focus eldra:eldra-focus-proxy eldra:eldra-link-radius eldra:target-min',
]);

/** The linked variant's anchor (spec "Rating" → Accessibility: "Linked: an `<a>`"). `outline-
 * hidden` suppresses the browser's own default focus outline on this element (still restored in
 * forced-colours mode) — the visible ring is `root`'s proxy ring above, not this element's own, so
 * showing both here as well would double it. */
const linkClass = computed(() => [
  'eldra:group eldra:inline-flex eldra:flex-wrap eldra:items-center eldra:gap-2 eldra:outline-hidden',
  props.classes?.link,
]);

const valueClass = computed(() => [
  'eldra:text-body-sm eldra:font-semibold eldra:text-text',
  SECTION,
  props.classes?.value,
]);

/** Spec "Rating" → States, "Count / 'No reviews yet'" row: `muted`, in every variant. Spec →
 * States, "Linked, hover" row: "count underline thickens from 1px to 2px" — the underline itself
 * only applies when linked; the hover/active states read off the ancestor `<a>`'s own `group`
 * (`linkClass` above) rather than this element's own `:hover`, so hovering anywhere on the whole
 * rating — not just the count text — thickens it, matching "the whole rating is one link". */
const countClass = computed(() => [
  'eldra:text-body-sm eldra:text-muted',
  SECTION,
  isLinked.value &&
    'eldra:underline eldra:decoration-1 eldra:decoration-current/55 eldra:underline-offset-[0.2em] eldra:group-hover:decoration-2 eldra:group-hover:decoration-current',
  props.classes?.count,
]);

const emptyClass = computed(() => ['eldra:text-body-sm eldra:text-muted', props.classes?.empty]);
</script>

<template>
  <span
    :data-eldra-slot="eldra.slotHost('emptyAction')"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="rootClass"
    v-bind="!isLinked && !isEmpty ? { role: 'img', 'aria-label': ratingSentence } : {}"
  >
    <component
      :is="as ?? 'a'"
      v-if="isLinked"
      :data-eldra-scope="eldra.scope"
      data-part="link"
      :class="linkClass"
      :aria-label="ratingSentence"
      v-bind="linkAttrs"
    >
      <RatingStars :value="value" :size="size" :classes="classes" />
      <span v-if="showValue" data-part="value" :class="valueClass" aria-hidden="true">{{
        formattedValue
      }}</span>
      <span v-if="showCount" data-part="count" :class="countClass" aria-hidden="true">{{
        linkedCountText
      }}</span>
    </component>
    <template v-else>
      <RatingStars :value="value" :size="size" :classes="classes" />
      <template v-if="isEmpty">
        <span :data-eldra-scope="eldra.scope" data-part="empty" :class="emptyClass">{{
          messages.noReviews
        }}</span>
        <slot name="emptyAction" />
      </template>
      <template v-else>
        <span
          v-if="showValue"
          :data-eldra-scope="eldra.scope"
          data-part="value"
          :class="valueClass"
          aria-hidden="true"
          >{{ formattedValue }}</span
        >
        <span
          v-if="showCount"
          :data-eldra-scope="eldra.scope"
          data-part="count"
          :class="countClass"
          aria-hidden="true"
          >{{ cardCountText }}</span
        >
      </template>
    </template>
  </span>
</template>
