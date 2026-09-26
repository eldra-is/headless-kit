<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useHeadingTag } from '../../composables/useHeadingTag';
import { useMessages } from '../../composables/useMessages';
import { useSlotPresence } from '../../composables/useSlotPresence';
import { cx, partClass } from '../../utils/cx';
import { ALERT_TRIANGLE_PATHS } from '../../icons/paths';
import Button from '../button/Button.vue';
import type { EmptyStateProps, EmptyStateVariant } from './types';

const props = withDefaults(defineProps<EmptyStateProps>(), {
  variant: 'empty',
  icon: undefined,
  text: null,
  plain: false,
  headingLevel: 3,
  retrying: false,
  classes: undefined,
});

const emit = defineEmits<{ retry: [] }>();

const messages = useMessages();
const slots = useSlots();

/**
 * `icon` per variant when none is given (spec "Empty and error states" → Properties, `icon` row:
 * "per use", e.g. `shopping-bag`, `search`, `alert-triangle`, `heart"). These three are the
 * variant-neutral fallback — `search` for "nothing matched", `alert-triangle` for "something
 * failed" — Tabler outline path data (`IconInbox`/`IconSearch`/`IconAlertTriangle`, MIT licensed),
 * the same "copy the path data rather than depend on `@tabler/icons-vue` at runtime" decision
 * `StockBadge.vue` already documents. `error`'s `alert-triangle` path data is `src/icons/paths.ts`'s
 * `ALERT_TRIANGLE_PATHS`, shared with `StockBadge`'s own `low` icon rather than duplicated (M19).
 */
const DEFAULT_ICON_PATHS: Record<EmptyStateVariant, string[]> = {
  empty: [
    'M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12',
    'M4 13h3l3 3h4l3 -3h3',
  ],
  noResults: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
  error: ALERT_TRIANGLE_PATHS,
};

/** Icon circle (spec → Sizes): 1.75rem icon, stroke 1.5 — not one of `Icon.vue`'s four sizes
 * (`sm`/`md`/`lg`/`xl` are 1/1.25/1.5/2rem) or its fixed 1.75 stroke, so, like `Badge`'s own
 * leading icon, it is drawn directly rather than through that shared component. */
const ICON_STROKE_WIDTH = 1.5;

const present = useSlotPresence(slots, ['actions'] as const);

/**
 * Roles (spec → Accessibility): `noResults` and `empty` are `role="status"` (announced politely);
 * `error` is `role="alert"` (announced assertively). `plain` does not change this — it only drops
 * the boundary, not the semantics.
 */
const role = computed(() => (props.variant === 'error' ? 'alert' : 'status'));

const hasText = computed(() => Boolean(props.text));

/**
 * The actions row shows whenever a caller supplies the `actions` slot, or — with none — whenever
 * `variant` is `error`: the built-in "Try again" button is the one case this component has a
 * generic next step of its own to offer (spec → Variants, "Error" row: "'Try again' button").
 * `empty`/`noResults` have no generic action to fall back to (the spec's own examples — "Shop
 * bestsellers", "Clear filters" — are all store-specific), so those variants render nothing here
 * until a caller supplies one.
 */
const hasActions = computed(() => present.value.actions || props.variant === 'error');

const headingTag = useHeadingTag(() => props.headingLevel);

const rootClass = computed(() =>
  partClass(
    cx(
      'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
      !props.plain && 'rounded-lg border border-dashed border-border-strong bg-background'
    ),
    props.classes,
    'root'
  )
);

/**
 * The icon circle (spec → Sizes): 3.5rem, `surface-strong` fill. Colour (spec → States): `text`
 * for `empty`/`noResults`, `danger` for `error` — "the icon turns `danger`" happens whichever icon
 * is showing, the built-in default or a caller's own `icon` prop, because both inherit
 * `currentColor` from this wrapper (spec → Accessibility, 1.4.1: the shape changes too, not only
 * the colour, for a caller using the built-in default).
 */
const iconClass = computed(() =>
  partClass(
    cx(
      'flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-strong',
      props.variant === 'error' ? 'text-danger' : 'text-text'
    ),
    props.classes,
    'icon'
  )
);

const titleClass = computed(() =>
  partClass('text-empty-state-title text-text', props.classes, 'title')
);

/** 36ch max-width (spec → Sizes, "Text" row) is a content measure, not a design token — the same
 * literal-arbitrary-value shape `Price.vue`'s `w-[35%]` documents. */
const textClass = computed(() =>
  partClass('max-w-[36ch] text-body text-muted', props.classes, 'text')
);

/** Actions (spec → Sizes): 0.75rem gap between parts, plus an extra 0.5rem above the actions row
 * specifically — `mt-2` on top of `root`'s own `gap-3`, rather than folded into it. */
const actionsClass = computed(() =>
  partClass('mt-2 flex flex-wrap items-center justify-center gap-3', props.classes, 'actions')
);
</script>

<template>
  <div data-part="root" :class="rootClass" :role="role">
    <span data-part="icon" :class="iconClass" aria-hidden="true">
      <component
        :is="icon"
        v-if="icon"
        class="size-7"
        :stroke-width="ICON_STROKE_WIDTH"
        aria-hidden="true"
        focusable="false"
      />
      <svg
        v-else
        class="size-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="ICON_STROKE_WIDTH"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path v-for="d in DEFAULT_ICON_PATHS[variant]" :key="d" :d="d" />
      </svg>
    </span>
    <component :is="headingTag" data-part="title" :class="titleClass">{{ title }}</component>
    <p v-if="hasText" data-part="text" :class="textClass">{{ text }}</p>
    <div v-if="hasActions" data-part="actions" :class="actionsClass">
      <slot name="actions" :retrying="retrying">
        <Button
          v-if="variant === 'error'"
          variant="primary"
          :loading="retrying"
          :label="messages.tryAgain"
          @click="emit('retry')"
        />
      </slot>
    </div>
  </div>
</template>
