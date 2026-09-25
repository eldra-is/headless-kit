<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { ratingStarStates } from '../../utils/rating';
import type { RatingPart, RatingSize } from './types';

/**
 * The five-star row (spec "Rating" → Anatomy, part 1), factored out of `Rating.vue` because the
 * markup is rendered from three different branches there (static, no-reviews, linked) and the two
 * SVGs per star make inlining it three times a maintenance hazard rather than a real duplication
 * saving. Not exported from the package: it is `Rating`'s own implementation detail, the same way
 * `Select`'s option row is not a component of its own either.
 */
const props = defineProps<{
  value: number;
  size: RatingSize;
  classes?: Partial<Record<RatingPart, string>>;
}>();

const starStates = computed(() => ratingStarStates(props.value));

/** Spec "Rating" → Sizes: star 1rem at `md`, 1.25rem at `lg` — both already Tailwind's own
 * token-backed spacing scale, so neither needs a per-component variable. */
const SIZE_CLASS: Record<RatingSize, string> = { md: 'size-4', lg: 'size-5' };

/** Spec "Rating" → Sizes: "Gap between stars: 1px" at both sizes — Tailwind's own `gap-px`
 * utility, not a hand-written arbitrary value. */
const starsClass = computed(() =>
  partClass('inline-flex items-center gap-px', props.classes, 'stars')
);

const starClass = computed(() =>
  partClass(cx('relative shrink-0', SIZE_CLASS[props.size]), props.classes, 'star')
);

/**
 * Spec "Rating" → States: "On primary / accent section, not in a card ... filled stars inherit;
 * empty stars inherit at 55% opacity." The same `group-data-[section=…]/section:` mechanism
 * `Button`, `Link` and `Price` already use — inert until a coloured `Section` (a later task)
 * provides the group, so it is untestable yet the same way `Price`'s own copy of this was at that
 * point in the plan (see the task report).
 */
const SECTION_FILLED =
  'group-data-[section=primary]/section:text-primary-contrast ' +
  'group-data-[section=accent]/section:text-accent-contrast';
const SECTION_EMPTY = `${SECTION_FILLED} group-data-[section=primary]/section:opacity-55 group-data-[section=accent]/section:opacity-55`;

/** Tabler's own outline/filled star paths (`@tabler/icons-vue`, MIT), copied as literal path data
 * the same way `StockBadge`'s level icons and `Link`'s arrow/external icons are — this package has
 * no runtime dependency on the icon set. Spec "Rating" → Anatomy: "Stars: five icons, each filled,
 * half-filled or empty (outline)" — the *filled* style is otherwise off-limits (Badge's icons stay
 * outline), an exception the design spec carves out for rating stars only. */
const OUTLINE_STAR_PATH =
  'M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245';
const FILLED_STAR_PATH =
  'M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z';

/** Spec "Rating" → Sizes/States: no explicit stroke weight is given for the empty-star outline, so
 * it reuses `Link`'s 1.75 — the closest existing "outline icon" in this package. */
const OUTLINE_STROKE_WIDTH = 1.75;
</script>

<template>
  <span data-part="stars" :class="starsClass" aria-hidden="true">
    <span v-for="(state, index) in starStates" :key="index" data-part="star" :class="starClass">
      <!--
        Empty star (spec "Rating" → States, "Empty star (and empty half)" row): `border-strong`
        outline, never a fill — 1.4.11's 3:1 boundary is what this line has to meet, not a solid
        shape. Rendered for `empty` and `half` (as the half star's base, beneath the clipped
        filled overlay below).
      -->
      <svg
        v-if="state !== 'full'"
        :class="cx('text-border-strong size-full', SECTION_EMPTY)"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="OUTLINE_STROKE_WIDTH"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path :d="OUTLINE_STAR_PATH" />
      </svg>
      <!--
        Filled/half star (spec "Rating" → States, "Filled / half star" row): `text` colour, never
        yellow or brand colour. A half star is the same filled icon clipped to its left half
        (`eldra-rating-half`, `clip-path: inset(0 50% 0 0)`), stacked over the outline star above so
        the unfilled half still reads as an outline rather than blank space.
      -->
      <svg
        v-if="state !== 'empty'"
        :class="
          cx(
            'text-text',
            SECTION_FILLED,
            state === 'half' ? 'eldra-rating-half absolute inset-0 size-full' : 'size-full'
          )
        "
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path :d="FILLED_STAR_PATH" />
      </svg>
    </span>
  </span>
</template>
