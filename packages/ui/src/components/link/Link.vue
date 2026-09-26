<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useMessages } from '../../composables/useMessages';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type { LinkProps, LinkTone } from './types';

const props = withDefaults(defineProps<LinkProps>(), {
  href: undefined,
  variant: 'inline',
  arrow: false,
  external: false,
  tone: 'default',
  underline: true,
  classes: undefined,
  as: undefined,
});

const m = useMessages();

/**
 * Spec "Link" → Properties: "If no destination exists, render plain text instead of a link." That
 * plain-text form has no link semantics at all — no `href`, no focus ring, no `as` — so every
 * other computed below is gated on this.
 */
const hasHref = computed(() => props.href !== undefined);

/**
 * Resolution 1: `as` accepts a string tag (still takes `href`, e.g. a custom element that wants
 * one) or a component (takes the destination as `to`, matching Vue Router / NuxtLink).
 */
const isComponentAs = computed(() => props.as !== undefined && typeof props.as !== 'string');

const tag = computed(() => (hasHref.value ? (props.as ?? 'a') : 'span'));

const showArrow = computed(
  () => hasHref.value && props.variant === 'standalone' && props.arrow === true
);
const showExternal = computed(() => hasHref.value && props.external === true);

const rootAttrs = computed(() => {
  if (!hasHref.value) return {};
  const attrs: Record<string, unknown> = isComponentAs.value
    ? { to: props.href }
    : { href: props.href };
  if (props.external) {
    attrs.target = '_blank';
    // Resolution 2: the brief's `noopener noreferrer`, one step past the spec text's own
    // `noopener` — see the task report for why.
    attrs.rel = 'noopener noreferrer';
  }
  return attrs;
});

/**
 * Shared box (spec "Link" → Anatomy, Sizes, Behaviour & motion): the one focus ring at the spec's
 * 2px corner radius. `group` (unnamed) is the hover scope the standalone arrow reads — distinct
 * from the ancestor `group/section` a coloured Section provides. No `no-underline` here any more
 * (Deviation, operator direction 2026-09-26): every variant is underlined at rest by default now
 * — see `UNDERLINE_REST`/`UNDERLINE_OPT_OUT` below and the README's Deviations entry.
 *
 * The colour and underline changes are held to `duration-fast` by `eldra-focus`, which owns this
 * element's transition list; a `transition-*` utility here would replace the shorthand and stop
 * the ring growing in. The arrow below is a *different* element, so it keeps its own transition.
 * See `src/styles/tailwind.css` and `src/__tests__/focus-transition.spec.ts`.
 */
const BASE = 'group eldra-focus eldra-link-radius';

/** Spec "Link" → States: `text` by default, `muted` turning `text` on hover. */
const TONE: Record<LinkTone, string> = {
  default: 'text-text',
  muted: 'text-muted hover:text-text',
};

/**
 * Spec "Link" → States, "On a primary/accent section": the link inherits the section's contrast
 * colour outright, same shape as Button's ghost/link variants.
 */
const SECTION =
  'group-data-[section=primary]/section:text-primary-contrast ' +
  'group-data-[section=accent]/section:text-accent-contrast';

/**
 * The default recipe, every variant alike (Deviation, operator direction 2026-09-26: "all link
 * elements... underline by default — WCAG 2.2 F73/1.4.1", overriding the spec's own "no underline
 * at rest" for the standalone variant; see the README's Deviations entry). Originally the spec's
 * inline/external recipe only ("The underline is always shown" — spec "Link" → Variants): 1px at
 * 55% of the text colour, thickening to 2px at full colour on hover, held through `:active`.
 * `decoration-current` tracks whatever `currentColor` is (the tone, or a section's contrast), so
 * the underline never needs its own colour rule.
 */
const UNDERLINE_REST =
  'underline decoration-1 decoration-current/55 underline-offset-[0.2em] ' +
  'hover:decoration-2 hover:decoration-current active:decoration-2 active:decoration-current';

/**
 * The `underline: false` opt-out (spec's own "no underline at rest" standalone shape, kept
 * available to every variant): no underline at rest, 1px at the spec offset appearing on hover,
 * 2px through `:active`. For a navigation bar whose design removes the rest-state underline — the
 * one case the operator's ruling explicitly carves out.
 */
const STANDALONE_LAYOUT = 'inline-flex items-center gap-1 target-min font-semibold';
const UNDERLINE_OPT_OUT =
  'no-underline hover:underline hover:decoration-1 hover:decoration-current ' +
  'hover:underline-offset-[0.2em] active:underline active:decoration-2 active:underline-offset-[0.2em]';

const rootClass = computed(() => {
  if (!hasHref.value) return partClass('', props.classes, 'root');
  const layoutClass = props.variant === 'standalone' ? STANDALONE_LAYOUT : '';
  const decorationClass = props.underline ? UNDERLINE_REST : UNDERLINE_OPT_OUT;
  return partClass(
    cx(BASE, TONE[props.tone], layoutClass, decorationClass, SECTION),
    props.classes,
    'root'
  );
});

const labelClass = computed(() => partClass('', props.classes, 'label'));

/** Arrow-right, 1.125rem (`size-4.5`), moving 2px (`translate-x-0.5`) right on `group-hover`. */
const arrowClass = computed(() =>
  partClass(
    cx(
      'inline-block shrink-0 size-4.5',
      'transition-[translate] duration-fast ease-out motion-reduce:transition-none',
      'group-hover:translate-x-0.5'
    ),
    props.classes,
    'arrow'
  )
);

/**
 * External-link, 0.875rem (`size-3.5`), 0.15em left margin sitting on the text baseline (-0.1em) —
 * both `em`, so they follow the surrounding font size rather than being pixel literals.
 */
const externalIconClass = computed(() =>
  partClass('inline-block align-[-0.1em] ml-[0.15em] size-3.5', props.classes, 'externalIcon')
);
</script>

<template>
  <component :is="tag" data-part="root" :class="rootClass" v-bind="rootAttrs">
    <span data-part="label" :class="labelClass"><slot /></span>
    <svg
      v-if="showArrow"
      data-part="arrow"
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
    <template v-if="showExternal">
      <svg
        data-part="externalIcon"
        :class="externalIconClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6" />
        <path d="M11 13l9 -9" />
        <path d="M15 4h5v5" />
      </svg>
      <VisuallyHidden>{{ m.opensInNewTab }}</VisuallyHidden>
    </template>
  </component>
</template>
