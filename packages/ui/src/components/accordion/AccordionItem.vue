<script setup lang="ts">
import { computed, inject } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { ACCORDION_KEY } from './context';
import { supportsExclusiveDetailsGroups } from './detailsExclusivity';
import type { AccordionItemProps } from './types';

const props = withDefaults(defineProps<AccordionItemProps>(), {
  help: undefined,
  modelValue: undefined,
  headingLevel: undefined,
  href: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [open: boolean];
  /** Spec "Accordion" → Events: "`toggle`: fires with the item's new open state (the native
   *  `toggle` event)." */
  toggle: [open: boolean];
}>();

/** See `context.ts`. Optional: a standalone item with no `Accordion` above it reads nothing from
 *  it and gets no shared `name`. */
const group = inject(ACCORDION_KEY, null);

const model = useControllableModel<boolean>(props, emit, () => false);

const isLinkRow = computed(() => props.href !== undefined);

/** No default: plain text unless the page outline needs a heading (spec "Accordion" →
 *  Accessibility: "Put a heading inside the summary only if the page outline needs it"). */
const titleTag = computed(() =>
  props.headingLevel !== undefined ? `h${props.headingLevel}` : 'span'
);

/**
 * Spec "Accordion" → Properties, `name` row: every `<details>` in a single-open group shares it.
 * `AccordionContext.name` is already `undefined` whenever the group's `multiple` is not `false`
 * (see `Accordion.vue`'s own `context` computed, the one place that rule is enforced) — trusted
 * here rather than re-checked, so there is exactly one place in the package that decides whether a
 * `name` applies.
 */
const detailsName = computed(() => group?.value.name);

/**
 * The fallback for an engine that does not close a same-`name` sibling itself (see
 * `detailsExclusivity.ts`) — mirrors what the browser's own algorithm would have done. Setting
 * `.open = false` directly bypasses that sibling's own Vue binding, but not its own `toggle`
 * listener: both engines this fallback actually runs in (verified for happy-dom; the same
 * `toggle`-on-any-change behaviour is MDN's documented spec) dispatch `toggle` themselves on a
 * scripted `open` change, which is what keeps that sibling's own `v-model`/`toggle` emit in sync
 * with no further plumbing here.
 */
function closeOtherOpenSiblings(name: string, current: HTMLDetailsElement): void {
  if (typeof document === 'undefined') return;
  // `getAttribute`, not the `.name` IDL property: `name` on `<details>` is a recent HTML addition
  // and the property is not implemented by every DOM engine this fallback has to run in (happy-dom
  // among them, which is why this codepath has a test at all) — the attribute Vue actually wrote
  // is the one thing every engine agrees on.
  for (const details of document.querySelectorAll('details')) {
    if (details !== current && details.getAttribute('name') === name && details.open) {
      details.open = false;
    }
  }
}

function onToggle(event: Event): void {
  const target = event.target as HTMLDetailsElement;
  const open = target.open;
  model.value = open;
  emit('toggle', open);
  if (open && detailsName.value !== undefined && !supportsExclusiveDetailsGroups()) {
    closeOtherOpenSiblings(detailsName.value, target);
  }
}

/**
 * The trigger row (spec "Accordion" → Sizes, "Trigger" row: min-height 3.5rem, `padding 1rem 0`,
 * `gap 1rem`, `radius-sm` "for the focus ring"; → Accessibility: "Target: the whole row, min-
 * height 3.5rem"). Shared, unmodified, by the `<summary>` below and the link row's `<a>` — both
 * are the same "whole row is the target" trigger. No `transition-*`/`duration-*` utility lives
 * here: this is the element `eldra-focus` sits on, and it owns this element's whole transition
 * list (see `src/__tests__/focus-transition.spec.ts`). `cursor-pointer` is explicit rather than
 * relied on as a default: a `<summary>` is not a `<button>`, so the package's own "every enabled
 * `<button>` is `cursor-pointer`" convention is repeated here by hand for the other native
 * disclosure trigger.
 */
const TRIGGER_BASE =
  'group flex w-full items-center justify-between gap-4 min-h-14 py-4 rounded-sm text-start ' +
  'cursor-pointer eldra-focus';

const rootClass = computed(() => {
  if (isLinkRow.value) {
    return partClass(
      cx(TRIGGER_BASE, 'border-b border-border no-underline'),
      props.classes,
      'root'
    );
  }
  // Spec "Accordion" → Sizes, "Dividers" row: 1px `border` below every item. The trigger classes
  // live on `summary` for a disclosure item (see below), so `root` here only carries the divider.
  return partClass('border-b border-border', props.classes, 'root');
});

/** Hides the native disclosure triangle in every engine still drawing one via the legacy
 *  `::-webkit-details-marker` pseudo, alongside the `list-item` `::marker` `list-none` already
 *  removes (spec "Accordion" → Accessibility: "Hide the default disclosure marker and use the
 *  chevron"). */
const summaryClass = computed(() =>
  partClass(
    cx(TRIGGER_BASE, 'list-none [&::-webkit-details-marker]:hidden'),
    props.classes,
    'summary'
  )
);

/** Spec "Accordion" → States: "Hover: label underlined (1px, 0.2em offset)" — never colour alone
 *  (1.4.1). `group-hover` reads the ancestor trigger's own hover, whichever element it is. */
const titleClass = computed(() =>
  partClass(
    cx(
      'text-accordion-title text-text',
      'group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[0.2em]'
    ),
    props.classes,
    'title'
  )
);

/** Spec "Accordion" → Sizes, "Help text" row: "0.875rem / 1.5, weight 400, gap 0.125rem below the
 *  label" — `text-body-sm` is exactly that size/line/weight already, and `mt-0.5` is exactly
 *  0.125rem. Accessibility: "The help text is part of the accessible name" — true for free, since
 *  it is plain text inside the same `<summary>`/`<a>`, whose accessible name is its full text
 *  content by default. */
const helpClass = computed(() =>
  partClass('mt-0.5 block text-body-sm text-muted', props.classes, 'help')
);

/** Spec "Accordion" → Sizes: chevron 1.25rem (`size-5`). Behaviour & motion: rotates 180° over
 *  `duration-base` `ease-out`, reduced motion snapping instead — both baked into
 *  `eldra-accordion-chevron` (see `tailwind.css`), self-conditioned on the ancestor `<details>`'s
 *  own `[open]`, so no open/closed class needs computing here at all. */
const chevronClass = computed(() =>
  partClass('size-5 shrink-0 text-text eldra-accordion-chevron', props.classes, 'chevron')
);

/** Spec "Accordion" → Sizes: panel `padding-bottom 1.25rem, max-width 65ch`. States, "Open" row:
 *  "panel copy `muted`". Behaviour & motion: "fades in over `duration-base` `ease-out` when
 *  opened" (baked into `eldra-accordion-panel`, see its own comment in `tailwind.css` for why that
 *  is a fade and not a height animation), reduced motion instant. */
const panelClass = computed(() =>
  partClass('max-w-[65ch] pb-5 text-muted eldra-accordion-panel', props.classes, 'panel')
);
</script>

<template>
  <a v-if="isLinkRow" data-part="root" :class="rootClass" :href="href">
    <span class="min-w-0 flex-1">
      <component :is="titleTag" data-part="title" :class="titleClass">{{ title }}</component>
      <span v-if="help" data-part="help" :class="helpClass">{{ help }}</span>
    </span>
  </a>
  <details
    v-else
    data-part="root"
    :class="rootClass"
    :name="detailsName"
    :open="model"
    @toggle="onToggle"
  >
    <summary data-part="summary" :class="summaryClass">
      <span class="min-w-0 flex-1">
        <component :is="titleTag" data-part="title" :class="titleClass">{{ title }}</component>
        <span v-if="help" data-part="help" :class="helpClass">{{ help }}</span>
      </span>
      <!-- Tabler's `chevron-down`, stroke 1.75, decorative (spec: "use the chevron (decorative,
           `aria-hidden`)"). -->
      <svg
        data-part="chevron"
        :class="chevronClass"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M6 9l6 6l6 -6" />
      </svg>
    </summary>
    <div data-part="panel" :class="panelClass">
      <slot />
    </div>
  </details>
</template>
