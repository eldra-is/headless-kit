<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import Avatar from './Avatar.vue';
import type { AvatarGroupProps } from './types';

const props = withDefaults(defineProps<AvatarGroupProps>(), {
  max: 3,
  classes: undefined,
});

const messages = useMessages();

/**
 * `AvatarGroupProps` has no `size` prop (the task brief's own type gives it none) — every avatar
 * in a group renders at `sm` (2rem), the compact size the spec's anatomy diagram shows for a
 * stacked group of up to three plus a counter, distinct from the single lg avatars the spec shows
 * elsewhere (a testimonial's byline, an author card).
 */
const ITEM_SIZE = 'sm';
/** `Avatar.vue`'s own `size-8` for `sm` — needed again here so the item wrapper (which draws the
 * overlap and the ring) is exactly the avatar's own box, not a guess at its size. */
const ITEM_SIZE_CLASS = 'size-8';
/** 25% of the `sm` diameter (spec "Avatar" → Sizes: "each following avatar is pulled back by 25%
 * of the diameter") — `size-8` is 2rem, so `-ml-2` (0.5rem) is exact, not a derived literal. */
const OVERLAP_CLASS = '-ml-2';

/**
 * Spec "Avatar" → Anatomy, part 3: "up to three avatars plus a '+N' counter avatar"; → Acceptance
 * criteria: "Groups never show more than four circles in total." `max` is documented as
 * adjustable (`AvatarGroupProps.max`'s own comment), but the "never" in that acceptance criterion
 * is unconditional, so it is enforced here rather than trusted to whatever a caller passes:
 * clamping to `0`–`3` guarantees at most 3 avatars plus, when there is overflow, one more "+N"
 * circle — 4 in total, whatever `max` says.
 */
const effectiveMax = computed(() => Math.min(Math.max(Math.trunc(props.max), 0), 3));

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (props.max > 3 || props.max < 0) {
      console.warn(
        `[@eldrajs/ui] <AvatarGroup max="${props.max}"> is clamped to 0-3: a group never shows ` +
          'more than three avatars plus one "+N" counter.'
      );
    }
  });
}

const visiblePeople = computed(() => props.people.slice(0, effectiveMax.value));
const overflowCount = computed(() => Math.max(0, props.people.length - visiblePeople.value.length));

/**
 * Spec "Avatar" → Accessibility: "A group gets one name: `role="group"`, `aria-label="Makers:
 * Ingrid, Tomas, Maya and 4 more"`; the individual avatars and '+4' are hidden." The visible
 * avatars are `decorative` (so each is itself `aria-hidden`, see the template); this sentence,
 * not any of them, is the group's one accessible name — via `aria-labelledby` pointing at the
 * `srText` part rather than `aria-label` directly, so the sentence exists as real (hidden) text
 * once, in the DOM, instead of being duplicated into an attribute string.
 */
const groupLabel = computed(() =>
  messages.value.avatarGroup(
    props.label,
    visiblePeople.value.map((person) => person.name),
    overflowCount.value
  )
);
const srTextId = useUiId('avatar-group-label');

const rootClass = computed(() => partClass(cx('inline-flex items-center'), props.classes, 'root'));

function itemClass(index: number): string {
  return partClass(
    cx(
      'inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-background',
      ITEM_SIZE_CLASS,
      index > 0 && OVERLAP_CLASS
    ),
    props.classes,
    'item'
  );
}

const moreClass = computed(() =>
  partClass(
    cx(
      'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-strong ' +
        'text-text ring-2 ring-background text-avatar-initials-sm',
      ITEM_SIZE_CLASS,
      visiblePeople.value.length > 0 && OVERLAP_CLASS
    ),
    props.classes,
    'more'
  )
);

const srTextClass = computed(() => partClass('sr-only', props.classes, 'srText'));
</script>

<template>
  <div data-part="root" :class="rootClass" role="group" :aria-labelledby="srTextId">
    <span
      v-for="(person, index) in visiblePeople"
      :key="`${person.name}-${index}`"
      data-part="item"
      :class="itemClass(index)"
    >
      <Avatar :src="person.src" :name="person.name" :size="ITEM_SIZE" decorative />
    </span>
    <span v-if="overflowCount > 0" data-part="more" :class="moreClass" aria-hidden="true"
      >+{{ overflowCount }}</span
    >
    <span :id="srTextId" data-part="srText" :class="srTextClass">{{ groupLabel }}</span>
  </div>
</template>
