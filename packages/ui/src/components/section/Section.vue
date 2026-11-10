<script setup lang="ts">
import { computed, inject, provide, watchEffect } from 'vue';
import { cx, partClass } from '../../utils/kitClass';
import { SECTION_KEY } from './context';
import type { SectionBackground, SectionProps, SectionSpacing } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<SectionProps>(), {
  background: 'none',
  spacing: 'md',
  labelledBy: undefined,
  ariaLabel: undefined,
  classes: undefined,
  as: undefined,
});

/**
 * "Sections are never nested inside another section" (spec "Container and section" → Behaviour &
 * motion). Every `Section` provides the marker for its own subtree and, before doing so, checks
 * whether one is already there — see `context.ts`.
 */
const parentSection = inject(SECTION_KEY, undefined);
provide(SECTION_KEY, true);

if (import.meta.env?.DEV) {
  watchEffect(() => {
    if (parentSection === true) {
      console.warn(
        '[@eldrajs/ui] <Section> is mounted inside another <Section>. The design spec: "Sections ' +
          'are never nested inside another section" — nest Containers instead, for full-bleed media.'
      );
    }
  });
}

/**
 * Spec "Container and section" → Variants: the ground fill, and the text colour it establishes for
 * any plain text a block writes with no colour of its own (a component like `Button`/`Link`/`Price`
 * inverts itself through the `section-primary:`/`section-accent:` variants below instead).
 */
const BACKGROUND: Record<SectionBackground, string> = {
  none: 'eldra:bg-background eldra:text-text',
  surface: 'eldra:bg-surface eldra:text-text',
  'surface-strong': 'eldra:bg-surface-strong eldra:text-text',
  primary: 'eldra:bg-primary eldra:text-primary-contrast',
  accent: 'eldra:bg-accent eldra:text-accent-contrast',
};

/**
 * Spec "Container and section" → Sizes, Section spacing table: fluid clamp values, applied as
 * separate `pt-*`/`pb-*` (not the `py-*` shorthand) so the adjacent-same-background rule in
 * `tailwind.css` can drop only the top half — see that rule's own comment.
 */
const SPACING: Record<SectionSpacing, string> = {
  none: '',
  sm: 'eldra:pt-[var(--eldra-section-sm)] eldra:pb-[var(--eldra-section-sm)]',
  md: 'eldra:pt-[var(--eldra-section-md)] eldra:pb-[var(--eldra-section-md)]',
  lg: 'eldra:pt-[var(--eldra-section-lg)] eldra:pb-[var(--eldra-section-lg)]',
};

/**
 * Spec "Container and section" → "Colour switching on primary and accent sections": only these two
 * grounds broadcast the inversion signal `Button`, `Link`, `Price` and `Rating` already read
 * (`section-primary:`/`section-accent:`, see e.g. `Button.vue`). `none`/`surface`/
 * `surface-strong` mark themselves with `data-section-bg` only, for the adjacent-background rule —
 * never `data-section`, so a `Card` (a later component) sitting on one of them
 * is never mistaken for a coloured ground by a `Price` inside it.
 */
const INVERTS: ReadonlySet<SectionBackground> = new Set(['primary', 'accent']);
const inverts = computed(() => INVERTS.has(props.background));

const hasLabelledBy = computed(
  () => props.labelledBy !== undefined && props.labelledBy !== null && props.labelledBy !== ''
);
const hasLabel = computed(
  () =>
    !hasLabelledBy.value &&
    props.ariaLabel !== undefined &&
    props.ariaLabel !== null &&
    props.ariaLabel !== ''
);

/**
 * Spec "Container and section" → Accessibility: "Each block root is a `<section
 * aria-labelledby="…">` pointing at the block heading; with no visible heading use `aria-label`, or
 * a plain `<div>` when the block is not a meaningful region." `as` overrides the tag outright (a
 * `<header>`/`<footer>` landmark that needs no name of its own); the aria attributes below apply
 * independently of which tag is used.
 */
const rootTag = computed(
  () => props.as ?? (hasLabelledBy.value || hasLabel.value ? 'section' : 'div')
);
const ariaLabelledBy = computed(() => (hasLabelledBy.value ? props.labelledBy! : undefined));
const resolvedAriaLabel = computed(() => (hasLabel.value ? props.ariaLabel! : undefined));

/**
 * Every block root is a width container (spec "Container and section" → Anatomy): `@container`
 * here is what every `@`-prefixed container query inside — this component's own `Container`
 * gutters, and any block's own breakpoints — measures, so a block responds to its own width rather
 * than the viewport and works in a narrow page-builder column.
 */
const rootClass = computed(() =>
  partClass(
    cx('eldra:@container', BACKGROUND[props.background], SPACING[props.spacing]),
    props.classes,
    'root'
  )
);
</script>

<template>
  <component
    :is="rootTag"
    :data-eldra-slot="eldra.slotHost('default')"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :data-section-bg="background"
    :data-section="inverts ? background : undefined"
    :class="rootClass"
    :aria-labelledby="ariaLabelledBy"
    :aria-label="resolvedAriaLabel"
  >
    <slot />
  </component>
</template>
