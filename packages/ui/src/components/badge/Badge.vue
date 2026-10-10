<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { cx, partClass } from '../../utils/cx';
import type { BadgeProps, BadgeTone } from './types';

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
  neutral: 'bg-surface-strong text-text',
  primary: 'bg-primary text-primary-contrast',
  accent: 'bg-accent text-accent-contrast',
  success: 'bg-success text-background',
  warning: 'bg-warning text-background',
  danger: 'bg-danger text-background',
};
const OUTLINE_CLASS = 'bg-background text-text border-border-strong';

const colorClass = computed(() =>
  props.outline ? OUTLINE_CLASS : TONE_CLASS[effectiveTone.value]
);

/**
 * Sizes (spec "Badge" → Sizes): 1.5rem min-height (never a fixed height, so 1.4.12's text-spacing
 * overrides can grow it), no block padding, `space-1` gap between icon and label, `radius-sm`
 * (pill `radius-full`) — both already token-backed Tailwind utilities, so no per-component
 * variable is needed for either. Padding-inline is 0.5rem, 0.625rem when `pill`.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'inline-flex items-center min-h-6 gap-1 border border-transparent text-badge whitespace-nowrap',
      props.pill ? 'rounded-full px-2.5' : 'rounded-sm px-2',
      colorClass.value
    ),
    props.classes,
    'root'
  )
);

const iconClass = computed(() => partClass('size-3.5 shrink-0', props.classes, 'icon'));
const labelClass = computed(() => partClass('', props.classes, 'label'));
const hiddenSuffixClass = computed(() => partClass('sr-only', props.classes, 'hiddenSuffix'));

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
  <component :is="as ?? 'span'" data-part="root" :class="rootClass">
    <component
      :is="icon"
      v-if="icon"
      data-part="icon"
      :class="iconClass"
      :stroke-width="ICON_STROKE_WIDTH"
      aria-hidden="true"
      focusable="false"
    />
    <span data-part="label" :class="labelClass">
      <slot>{{ label }}</slot>
    </span>
    <span v-if="hiddenSuffix" data-part="hiddenSuffix" :class="hiddenSuffixClass">{{
      hiddenSuffix
    }}</span>
  </component>
</template>
