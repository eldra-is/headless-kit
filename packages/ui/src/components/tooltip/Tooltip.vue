<script setup lang="ts">
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  computed,
  ref,
  useSlots,
  watch,
  watchEffect,
  type VNode,
} from 'vue';
import { useTeleportTarget } from '../../composables/teleportTarget';
import { useFloating, type FloatingPlacement } from '../../composables/useFloating';
import { useOverlay } from '../../composables/useOverlay';
import { cx, partClass } from '../../utils/cx';
import { joinIds, useUiId } from '../../utils/id';
import type { TooltipProps } from './types';

/**
 * A short text label that names an icon-only trigger on hover and keyboard focus (spec "Tooltip").
 * Non-modal: built directly on `useFloating` and `useOverlay`, the same pieces `usePopover` wraps
 * for the Select/MultiSelect/SearchBar family — but a tooltip never joins their "only one open at a
 * time" registry (`openRegistry`): showing one must never close somebody else's open Select.
 *
 * **Anatomy.** `root` is the inline wrapper around the slotted trigger — it carries the hover and
 * `focusin`/`focusout` listeners the spec asks the *wrapper* for ("Shows on pointer hover over the
 * wrapper and when focus is within it"), so positioning and hovering both key off one element
 * regardless of what the trigger itself is. `bubble` is the floating box, teleported like
 * `usePopover`'s panels (`useTeleportTarget`, shared with it — body, or the open modal `<dialog>`
 * the trigger sits in). `arrow` is the small triangle.
 *
 * **The trigger's ARIA.** "The component generates the tooltip id and wires the trigger to it"
 * (spec) — `aria-labelledby` for `role="label"`, `aria-describedby` for `role="description"` — and
 * that has to land on the trigger element itself, not on the neutral wrapper span: a screen reader
 * computes an element's accessible name from what *that* element points at, and the wrapper is not
 * the focusable node. The default slot's single element is therefore cloned (`cloneVNode`) with the
 * attribute merged on, joining rather than replacing anything it already carries. This is the one
 * place in the package that reaches into a slot's own vnode instead of just rendering it; every
 * other listener stays on `root` precisely so this graft can stay this small.
 *
 * **Always mounted, never re-entrant.** Unlike a `usePopover` panel — mounted fresh on every open,
 * so its `animate-eldra-popover-in` keyframe replays — the bubble stays in the DOM permanently
 * (behind `teleportDisabled` until mount, exactly like every other teleport here) and toggles
 * `opacity`/`pointer-events` through a reactive class. A CSS *transition* only plays on a change to
 * an element already in the DOM; mounting a fresh element already at its end state plays no fade at
 * all. The spec's own fade (`duration-fast`, instant under reduced motion — the same token every
 * other transition in this package reads) needs the former.
 *
 * **Hoverable (WCAG 1.4.13).** `hoveringTrigger` and `hoveringBubble` are independent booleans;
 * `visible` is their disjunction (`focusWithin` besides), so the pointer can leave the trigger and
 * land on the bubble without a gap where neither is true. The `0.5rem` gap itself is bridged in
 * pure CSS — an invisible `::before` on the bubble, sized to the gap and positioned into it, extends
 * the bubble's own hit area back to the trigger's edge, so no dead pixels sit between the two
 * hoverable regions in a real browser (see `bubbleClass` below). Dismissible: `Esc` hides it without
 * moving focus, and leaving with the pointer or focus clears the dismissal so hovering or focusing
 * again re-shows it — `useOverlay`'s own Escape handling, with outside-click/focus-out closing and
 * the focus return both turned off (a tooltip closes on `mouseleave`/`blur`, not on a click
 * elsewhere, and `Esc` must never move focus off the trigger).
 */

const props = withDefaults(defineProps<TooltipProps>(), {
  placement: 'top',
  align: 'center',
  role: 'label',
  classes: undefined,
});

const slots = useSlots();

const rootRef = ref<HTMLElement | null>(null);
const bubbleRef = ref<HTMLElement | null>(null);

const bubbleId = useUiId('tooltip');

// --- show / hide state ---------------------------------------------------------------------------

const hoveringTrigger = ref(false);
const hoveringBubble = ref(false);
const focusWithin = ref(false);
/**
 * Spec → States, Dismissed: "hidden until the pointer leaves or focus leaves the wrapper, then
 * resets." Esc sets this while the tooltip is showing; it is not itself an opacity state, but a
 * mask over `wantsOpen` below until one of the two watchers underneath clears it.
 */
const dismissed = ref(false);

const wantsOpen = computed(
  () => hoveringTrigger.value || hoveringBubble.value || focusWithin.value
);
/** What the bubble actually shows. Spec: "No delay on focus; none needed on hover" — neither does. */
const visible = computed(() => wantsOpen.value && !dismissed.value);

/**
 * "Leaving with the pointer ... clears the dismissed state" — regardless of whether focus is also
 * still on the trigger, since the rule is an *or*: either the pointer leaving or focus leaving is
 * enough. Watched rather than folded into `wantsOpen`, because a dismissal must survive the pointer
 * moving from the trigger onto the bubble (`hoveringBubble` going true) without resetting.
 */
watch(hoveringTrigger, (hovering, wasHovering) => {
  if (!hovering && wasHovering && dismissed.value) dismissed.value = false;
});
/** "... or focus leaves the wrapper" — the other half of the same rule. */
watch(focusWithin, (focused, wasFocused) => {
  if (!focused && wasFocused && dismissed.value) dismissed.value = false;
});

function onRootMouseEnter(): void {
  hoveringTrigger.value = true;
}
function onRootMouseLeave(): void {
  hoveringTrigger.value = false;
}
function onRootFocusIn(): void {
  focusWithin.value = true;
}
/** Only real focus loss counts: focus moving *inside* the wrapper is not focus leaving it. */
function onRootFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (next instanceof Node && rootRef.value?.contains(next) === true) return;
  focusWithin.value = false;
}
function onBubbleMouseEnter(): void {
  hoveringBubble.value = true;
}
function onBubbleMouseLeave(): void {
  hoveringBubble.value = false;
}

/**
 * Esc (spec → Behaviour: "hides every tooltip whose wrapper is hovered or holds focus, without
 * moving focus"). `useOverlay` bundles exactly this key handling; outside-click and focus-out
 * closing are switched off because a tooltip's open/closed life is hover/focus-driven, not a
 * click-away popup's, and `returnFocus` is off because Esc must never move focus.
 */
const overlay = useOverlay({
  open: visible,
  trigger: rootRef,
  content: bubbleRef,
  setOpen: (next) => {
    if (!next) dismissed.value = true;
  },
  closeOnOutsideClick: false,
  returnFocus: false,
});

if (import.meta.env?.DEV) {
  watchEffect(() => {
    const root = rootRef.value;
    if (root === null) return;
    if (overlay.focusables(root).length === 0) {
      console.warn(
        '[@eldrajs/ui] <Tooltip> trigger is not focusable (or is disabled). A tooltip must never ' +
          'be attached to a non-focusable element or a disabled button — a keyboard user could ' +
          'never reach it.'
      );
    }
  });
}

// --- the trigger's ARIA, wired onto the slotted element itself -----------------------------------

/** The first real vnode of a slot's output — a stray whitespace/comment node is not the trigger. */
function firstElement(nodes: VNode[]): VNode | undefined {
  return nodes.find(
    (node) => node.type !== Comment && node.type !== Text && node.type !== Fragment
  );
}

/**
 * A functional-component wrapper, so `<component :is="Trigger" />` re-invokes it on every render
 * instead of Vue diffing a plain vnode value against `is`. Declared once, here, so its identity is
 * stable for the component's lifetime — that stability is what lets Vue patch the same underlying
 * trigger element across renders (keeping its focus, its hover, everything) rather than replacing
 * it because "the component at `:is`" looked new.
 */
function Trigger(): VNode | null {
  const nodes = slots.default?.() ?? [];
  const original = firstElement(nodes);
  if (original === undefined) {
    if (import.meta.env?.DEV) {
      console.warn('[@eldrajs/ui] <Tooltip> has no default slot content to attach itself to.');
    }
    return null;
  }
  if (
    import.meta.env?.DEV &&
    nodes.filter((node) => node !== original).some((node) => firstElement([node]) !== undefined)
  ) {
    console.warn(
      '[@eldrajs/ui] <Tooltip> default slot has more than one element; only the first is wired up ' +
        'as the trigger.'
    );
  }
  const originalProps = (original.props ?? {}) as Record<string, unknown>;
  const ariaProps =
    props.role === 'label'
      ? {
          'aria-labelledby': joinIds(
            originalProps['aria-labelledby'] as string | undefined,
            bubbleId.value
          ),
        }
      : {
          'aria-describedby': joinIds(
            originalProps['aria-describedby'] as string | undefined,
            bubbleId.value
          ),
        };
  return cloneVNode(original, ariaProps);
}

// --- positioning -----------------------------------------------------------------------------------

/** `align="center"` is the plain `top`/`bottom` placement; `start`/`end` add floating-ui's suffix. */
const initialPlacement: FloatingPlacement =
  props.align === 'center'
    ? props.placement
    : (`${props.placement}-${props.align}` as FloatingPlacement);

const { teleportTo, teleportDisabled } = useTeleportTarget({
  trigger: rootRef,
  teleport: true,
  isOpen: visible,
});

const { styles: floatingStyles, placement: resolvedPlacement } = useFloating(rootRef, bubbleRef, {
  placement: initialPlacement,
  // Spec → Sizes: "Gap to trigger: 0.5rem".
  offset: 8,
  strategy: 'fixed',
});

const isAbove = computed(() => resolvedPlacement.value.startsWith('top'));

// --- classes -------------------------------------------------------------------------------------

const rootClass = computed(() => partClass(cx('inline-flex'), props.classes, 'root'));

/**
 * Spec → Sizes / States: padding `0.375rem 0.625rem`, one-line inverted-colour fill (`text` on
 * `background`, 16.9:1), `radius-sm`, opacity fade `duration-fast` `ease-out` (0ms under reduced
 * motion — the same token every transition in this package reads, see `tokens.css`).
 *
 * The `before:` pseudo-element bridges the visual gap (spec → Sizes: "bridged for the pointer by an
 * invisible 0.5rem strip"): it is not a DOM node — the anatomy has no fourth part for it — so it
 * cannot be reached by `classes`, but it extends the bubble's own hit-test area back to the
 * trigger's edge, which is what keeps `mouseenter`/`mouseleave` on this element (`hoveringBubble`
 * above) firing continuously across the gap in a real browser. jsdom/happy-dom do not lay out pseudo
 * elements, so the *tests* simulate crossing it by dispatching events on the bubble directly — see
 * `__tests__/tooltip.spec.ts`.
 *
 * `border-transparent forced-colors:border-[CanvasText]`: the spec draws no border in any live
 * state, but forced-colours mode replaces `bg-text` with the system `Canvas` — usually the same
 * colour as the page — and a fill-only box with no border then reads as loose text with no box at
 * all, the same defect `eldra-field-invalid`'s own forced-colours branch exists for. The border is
 * `transparent` (so it costs nothing and shifts nothing) everywhere else.
 */
const bubbleClass = computed(() =>
  partClass(
    cx(
      'z-popover flex items-center rounded-sm bg-text text-background',
      'border border-transparent forced-colors:border-[CanvasText]',
      'py-1.5 px-2.5 text-tooltip font-medium whitespace-nowrap',
      'transition-opacity duration-fast ease-out',
      visible.value ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      isAbove.value
        ? "before:absolute before:inset-x-0 before:-bottom-2 before:h-2 before:content-['']"
        : "before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-['']"
    ),
    props.classes,
    'bubble'
  )
);

/**
 * Spec → Sizes, Arrow: "0.3125rem, centred (start / end: 1.25rem from the aligned edge)". The size
 * has no shared token (`--eldra-tooltip-arrow-size` — see `tailwind.css`'s `eldra-tooltip-arrow`
 * utility and the README's Customisation table); `1.25rem` is `--eldra-space-5`, a shared one, so
 * `left-5`/`right-5` are stock utilities. The vertical offset depends on which side the bubble
 * resolved to (it can flip), so — like `usePopover`'s `--eldra-popover-origin` — it is a reactive
 * inline style rather than a class.
 */
const arrowClass = computed(() => {
  const align = resolvedPlacement.value.endsWith('-start')
    ? 'left-5'
    : resolvedPlacement.value.endsWith('-end')
      ? 'right-5'
      : 'left-1/2 -translate-x-1/2';
  return partClass(cx('eldra-tooltip-arrow', align), props.classes, 'arrow');
});

const arrowStyle = computed<Record<string, string>>(() => ({
  [isAbove.value ? 'bottom' : 'top']: 'calc(var(--eldra-tooltip-arrow-size, 0.3125rem) / -2)',
}));
</script>

<template>
  <span
    ref="rootRef"
    data-part="root"
    :class="rootClass"
    @mouseenter="onRootMouseEnter"
    @mouseleave="onRootMouseLeave"
    @focusin="onRootFocusIn"
    @focusout="onRootFocusOut"
  >
    <component :is="Trigger" />

    <Teleport :to="teleportTo" :disabled="teleportDisabled">
      <div
        :id="bubbleId"
        ref="bubbleRef"
        role="tooltip"
        data-part="bubble"
        :data-placement="resolvedPlacement"
        :class="bubbleClass"
        :style="floatingStyles"
        @mouseenter="onBubbleMouseEnter"
        @mouseleave="onBubbleMouseLeave"
      >
        {{ text }}
        <span data-part="arrow" aria-hidden="true" :class="arrowClass" :style="arrowStyle" />
      </div>
    </Teleport>
  </span>
</template>
