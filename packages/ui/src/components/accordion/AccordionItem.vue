<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { ACCORDION_KEY } from './context';
import { supportsExclusiveDetailsGroups } from './detailsExclusivity';
import { createPanelHeightAnimator, type PanelHeightAnimator } from './heightTransition';
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

/** The `<details>` and its panel, both needed by the height animation below: `detailsRef` so
 *  `onSummaryClick` can read/flip `open` without walking the DOM from the event, `panelRef` so
 *  both it and `onToggle` can measure and animate the same element. Undefined on a link row, which
 *  renders neither. */
const detailsRef = ref<HTMLDetailsElement>();
const panelRef = ref<HTMLDivElement>();

/**
 * The one height-animation owner for this item's panel (`heightTransition.ts`), created lazily —
 * `panelRef` is `undefined` until mount, and this never runs before it — and memoized: every
 * open/close for this item's whole lifetime goes through the same instance, which is what lets it
 * reverse a still-running animation instead of racing it (review round 1, 2026-09-26: "one
 * animation owner per item").
 */
let heightAnimator: PanelHeightAnimator | null = null;
function heightAnimatorFor(panel: HTMLDivElement | undefined): PanelHeightAnimator | null {
  if (!panel) return null;
  heightAnimator ??= createPanelHeightAnimator(panel);
  return heightAnimator;
}

/**
 * `true` for the whole span from "a close was requested" to "that close actually settled and
 * `open` was cleared" — including while `onSummaryClick`'s own animation is reversing a still-
 * running *open* back toward closed. `details.open` itself cannot carry this: it stays `true` for
 * that entire span too (see `onSummaryClick`), so this is what lets a second click tell "closing,
 * click again to reopen" apart from "opening, click again to close" — both read `details.open ===
 * true`. Plain instance state, not a `ref`: nothing here is rendered.
 */
let closing = false;

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
  // Closed via any route — this handler's own eventual `.open = false` at the end of
  // `onSummaryClick` included — leaves nothing left for that guard to protect.
  if (!open) closing = false;
  model.value = open;
  emit('toggle', open);
  /**
   * Keyed off `toggle` rather than the click handler below, so a browser-forced open — find-in-
   * page revealing a match inside a closed panel, `hidden="until-found"` — animates too (spec
   * "Accordion" → Acceptance criteria: "Find-in-page finds text in closed panels and opens the
   * item"). The browser has already flipped `open` and revealed the panel by the time this event
   * fires, so `scrollHeight` here already reflects the fully laid-out panel; the animation plays
   * from `0` up to it (or reverses a close `onSummaryClick` below has in flight — the animator
   * handles that itself; this call site does not need to know which). See `heightTransition.ts`
   * for exactly when this is skipped in favour of an instant reveal (reduced motion, no
   * `Element.prototype.animate`, or no stylesheet to read the duration/easing tokens from).
   */
  if (open) {
    void heightAnimatorFor(panelRef.value)?.open();
  }
  if (open && detailsName.value !== undefined && !supportsExclusiveDetailsGroups()) {
    closeOtherOpenSiblings(detailsName.value, target);
  }
}

/**
 * Intercepts the summary's own click (spec "Accordion" → Behaviour & motion, operator override
 * 2026-09-26: "the accordion should have some expand transition" — the collapse animates too, not
 * just the expand). Native `<summary>` activation closes the `<details>` — and, with it, removes
 * the panel from layout via the browser's own
 * `details:not([open]) > *:not(summary) { display: none; }` UA rule — before any script gets a
 * chance to see the panel at its full height, so there would be nothing left to animate *from* by
 * the time a `toggle` listener runs. `preventDefault()` here stops that default action; this
 * function then plays the same height animation in reverse and only flips `open` itself once it
 * settles, which is what fires the native `toggle` this component already listens for (`onToggle`
 * above) — `model`/`update:modelValue`/the re-emitted `toggle` all still go through that one path,
 * completely unchanged.
 *
 * Three cases, all reached through the same `details.open`/`closing` pair (fix, review round 1,
 * 2026-09-26 — "one animation owner per item", see `heightTransition.ts`'s own comment for the bug
 * this replaced):
 *
 * - **Opening** (`details.open` is `false`): no interception at all. The native default action
 *   already reveals the panel — there is no "before" state worth preserving — so it is left to
 *   run, and `onToggle` above does the animating once it has.
 * - **Closing** (`details.open` is `true`, `closing` is `false` — a fully open, idle panel, *or* an
 *   opening animation from an earlier click still in flight): intercepted, animates toward `0`.
 *   `heightAnimatorFor(...)?.close()` reverses that still-running open animation itself if there is
 *   one (reads the panel's *current* rendered height, not an assumed `scrollHeight`) — this call
 *   site does not need to tell the two apart.
 * - **Reopening** (`closing` is already `true` — a second click arrived while an earlier close was
 *   still animating): reverses back toward `scrollHeight` and keeps `open`, exactly the mirror of
 *   the closing case. `details.open` never actually left `true` for this whole span (only the
 *   *first* close request's own eventual settle would have cleared it, and this call supersedes
 *   that request before it gets the chance to), so there is nothing to restore here beyond
 *   `closing` itself.
 *
 * `Enter`/`Space` on a focused `<summary>` reach here too: the browser's own default action for
 * both converts them into this same `click` event (see `AccordionItem.spec.ts`'s own comment on
 * why that particular conversion is untestable in happy-dom), so no separate `@keydown` is needed.
 *
 * Exclusive `name` groups: a sibling that closes natively because this item opened is not reached
 * through this function at all — the browser (or `closeOtherOpenSiblings`'s fallback) flips that
 * sibling's `open` directly, with no click of its own to intercept — so that sibling still closes
 * instantly, exactly as it did before this change. Animating that collapse too would mean reaching
 * into a sibling `AccordionItem` instance from this one; the README's Deviations entry records
 * this as the deliberate, documented gap rather than something left unfinished.
 */
function onSummaryClick(event: MouseEvent): void {
  const details = detailsRef.value;
  if (!details) return;
  if (closing) {
    // Reopening: cancel/reverse the in-flight close and head back toward `scrollHeight`, keeping
    // `open` — `details.open` is still `true` here (see the function comment), so the browser's
    // own default action for *this* click would otherwise close it outright; prevented for the
    // same reason the closing branch below prevents it.
    event.preventDefault();
    closing = false;
    void heightAnimatorFor(panelRef.value)?.open();
    return;
  }
  if (!details.open) return; // opening: let the native default action run; onToggle animates it
  event.preventDefault();
  closing = true;
  void heightAnimatorFor(panelRef.value)
    ?.close()
    .then(() => {
      if (!closing) return; // superseded by a reopen in the meantime; that call owns the outcome
      closing = false;
      details.open = false; // fires the native `toggle` → `onToggle` → model/emit, exactly as today
    });
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
 *  opened" — still exactly `eldra-accordion-panel`'s own CSS opacity fade (see its comment in
 *  `tailwind.css`), running alongside the height animation `onToggle`/`onSummaryClick` above drive
 *  through the Web Animations API (operator override 2026-09-26, `heightTransition.ts`), not
 *  replaced by it. Reduced motion: both are instant. */
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
    ref="detailsRef"
    data-part="root"
    :class="rootClass"
    :name="detailsName"
    :open="model"
    @toggle="onToggle"
  >
    <summary data-part="summary" :class="summaryClass" @click="onSummaryClick">
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
    <div ref="panelRef" data-part="panel" :class="panelClass">
      <slot />
    </div>
  </details>
</template>
