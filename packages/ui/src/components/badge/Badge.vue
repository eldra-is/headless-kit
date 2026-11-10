<script setup lang="ts">
import { computed, useAttrs, watchEffect } from 'vue';
import type { BadgeProps, BadgeTone } from './types';
import { useEldraScope } from '../../composables/useEldraScope';
import { mergeClass } from '../../utils/mergeClass';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<BadgeProps>(), {
  label: undefined,
  tone: 'neutral',
  variant: 'none',
  outline: false,
  pill: false,
  icon: undefined,
  hiddenSuffix: undefined,
  as: undefined,
  classes: undefined,
});

/** Badges never carry a literal 2.25 stroke on a shared `Icon` size, so the leading icon is drawn
 * directly rather than through `Icon.vue`: none of that component's four sizes is the spec's
 * 0.875rem, and its fixed 1.75 stroke is not this component's 2.25 (spec "Badge" → Sizes, "Badge
 * icon" row). The value is a literal SVG presentation attribute, not a class, the same way
 * `Icon.vue`'s own `STROKE_WIDTH` and `Button`'s spinner stroke are. */
const ICON_STROKE_WIDTH = 2.25;

/**
 * `variant` overrides `tone` (spec "Badge" → Properties): `sale` always reads as `accent`, `new`
 * always as `primary`, whatever `tone` was passed alongside it.
 */
const effectiveTone = computed<BadgeTone>(() => {
  if (props.variant === 'sale') return 'accent';
  if (props.variant === 'new') return 'primary';
  return props.tone;
});

/**
 * The States table (spec "Badge" → States) gives `outline` exactly one row, independent of tone —
 * it is a boundary treatment, not a colour of its own, so it replaces the tone's fill rather than
 * combining with it. A badge is never both a coloured fill and an outline at once.
 */
const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'eldra:bg-surface-strong eldra:text-text eldra:border-transparent',
  primary: 'eldra:bg-primary eldra:text-primary-contrast eldra:border-transparent',
  accent: 'eldra:bg-accent eldra:text-accent-contrast eldra:border-transparent',
  success: 'eldra:bg-success eldra:text-background eldra:border-transparent',
  warning: 'eldra:bg-warning eldra:text-background eldra:border-transparent',
  danger: 'eldra:bg-danger eldra:text-background eldra:border-transparent',
};
const OUTLINE_CLASS = 'eldra:bg-background eldra:text-text eldra:border-border-strong';

const colorClass = computed(() =>
  props.outline ? OUTLINE_CLASS : TONE_CLASS[effectiveTone.value]
);

/**
 * Sizes (spec "Badge" → Sizes): 1.5rem min-height (never a fixed height, so 1.4.12's text-spacing
 * overrides can grow it), no block padding, `space-1` gap between icon and label, `radius-sm`
 * (pill `radius-full`) — both already token-backed Tailwind utilities, so no per-component
 * variable is needed for either. Padding-inline is 0.5rem, 0.625rem when `pill`.
 */
const attrs = useAttrs();
const forwardedAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

// FilterGroup's count badge and NavMenuPanel's link badge override the root.
const rootClass = computed(() =>
  mergeClass(
    [
      'eldra:inline-flex eldra:items-center eldra:min-h-6 eldra:gap-1 eldra:border eldra:text-badge eldra:whitespace-nowrap',
      props.pill ? 'eldra:rounded-full eldra:px-2.5' : 'eldra:rounded-sm eldra:px-2',
      colorClass.value,
    ],
    attrs.class
  )
);

const iconClass = computed(() => ['eldra:size-3.5 eldra:shrink-0', props.classes?.icon]);
const labelClass = computed(() => props.classes?.label);
const hiddenSuffixClass = computed(() => ['eldra:sr-only', props.classes?.hiddenSuffix]);

if (import.meta.env?.DEV) {
  /**
   * Spec "Badge" → Properties, `tone` row: "`success`/`warning`/`danger` require an icon" —
   * 1.4.1, colour is never the only signal for an order or payment state. `variant` overriding
   * `tone` to `accent`/`primary` makes this unreachable for `sale`/`new`, which is correct: those
   * two are promotional flags, not the states the rule is about.
   */
  watchEffect(() => {
    const needsIcon =
      props.variant === 'none' &&
      (props.tone === 'success' || props.tone === 'warning' || props.tone === 'danger');
    if (needsIcon && !props.icon) {
      console.warn(
        `[@eldrajs/ui] <Badge tone="${props.tone}"> has no \`icon\`. The design spec requires an ` +
          'icon on every success, warning and danger badge, so colour is never the only signal ' +
          '(WCAG 1.4.1).'
      );
    }
  });
}
</script>

<template>
  <component
    :is="as ?? 'span'"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="rootClass"
    v-bind="forwardedAttrs"
  >
    <component
      :is="icon"
      v-if="icon"
      data-part="icon"
      :class="iconClass"
      :stroke-width="ICON_STROKE_WIDTH"
      aria-hidden="true"
      focusable="false"
    />
    <span :data-eldra-slot="eldra.slotHost('default')" data-part="label" :class="labelClass">
      <slot>{{ label }}</slot>
    </span>
    <span v-if="hiddenSuffix" data-part="hiddenSuffix" :class="hiddenSuffixClass">{{
      hiddenSuffix
    }}</span>
  </component>
</template>
