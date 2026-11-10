<script setup lang="ts">
/**
 * A generic, non-modal trigger + floating panel (operator addition, 2026-09-25 — there is no design
 * spec 1 "Popover" section). The private component library's own migration onto this package needs
 * one: its `Popover`/`Dropdown` back several menus, filters and dropdowns that have nothing in
 * common with `Select`'s listbox contract, so what they actually need is the *machinery* `Select`,
 * `MultiSelect` and `SearchBar` already share — `usePopover` — with no opinion at all about what
 * goes in the panel.
 *
 * **Anatomy.** `root` is a `display: contents` wrapper: it exists only so `data-part`
 * has somewhere to hang a hook on, never as a box a consumer's flex/grid layout has to route
 * around. `trigger` is not drawn by this component at all — it is the consumer's own element,
 * rendered through the `trigger` slot, exactly the private library's own `Popover`'s `#trigger`
 * (its Studio-documented shape: `{ open, toggle, triggerAttrs }`, mirrored here as `{ open, toggle,
 * attrs }`). `panel` is the floating box, teleported like every other popup in this package
 * (`usePopover`, shared with `Select`/`MultiSelect`/`SearchBar`).
 *
 * **The trigger is wired, not rendered.** A generic popover has no idea whether its trigger should
 * be a `<button>`, a `<Button>`, an `<a>`, or a table row — so unlike `Tooltip` (which clones the
 * default slot's single element to graft an `aria-labelledby` onto whatever it already is), this
 * component asks for a *named* `trigger` slot and hands it everything the consumer has to attach:
 * `attrs` (`id`, `type: 'button'`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `class` built
 * from `classes.trigger`, and the click/pointerdown pair below) for `v-bind="attrs"` onto whatever
 * element they render, plus `open`/`toggle` for a consumer who wants to build the click handling
 * themselves instead. **The slot's first element is still cloned** (`cloneVNode`, the same
 * technique `Tooltip` uses), found through any fragment around it, such as a wrapper forwarding its
 * own `<slot>` here — not to graft attributes on this time, but to reach its real DOM node: `Esc` and
 * `close()` have to put focus back on the *actual* trigger, and a `display: contents` wrapper is
 * never focusable, so `root` cannot stand in for it the way it can for everything else. A component
 * given as the trigger slot's root is unwrapped through its `$el`, so `<template #trigger="{ open,
 * toggle, attrs }"><Button v-bind="attrs">Filters</Button></template>` finds `Button`'s own
 * rendered element rather than a Vue instance.
 *
 * **No default `role` on the panel.** The design spec's non-negotiable 2 is explicit that a
 * non-modal popup is not a dialog, and unlike `Select`'s panel (always `role="listbox"`, because it
 * always *is* one) a generic `Popover`'s panel could be a menu, a listbox, a form, or nothing
 * ARIA-shaped at all — a fixed `role="dialog"` would be wrong for a menu, and a fixed `role="menu"`
 * would be wrong for a filter form. So the panel renders as a plain, role-free region and forwards
 * its own `$attrs`, `class` included (`inheritAttrs: false`), the same shape the private library's own `Popover`
 * forwards its fallthrough `attrs` onto its content element: `<Popover role="menu">` puts
 * `role="menu"` on the panel directly, `<Popover role="dialog" aria-label="Filters">` makes it an
 * (non-modal) accessible dialog surface, and leaving both off keeps it a plain, unlabelled `<div>`
 * for a consumer whose own inner markup (a `<ul role="menu">`) already carries the semantics.
 * `ariaLabel` is the one piece of this that is a real prop rather than a fallthrough attribute,
 * because it is this package's own accessible-name convention (see the README's naming rules) and
 * because a `Popover` used as a filter panel wants `aria-label` without necessarily wanting a role
 * at all.
 *
 * **One open at a time, with `Select`/`MultiSelect`/`SearchBar`.** `usePopover`'s `openRegistry` is
 * shared module state, so opening a `Popover` closes whichever of those was open, and vice versa —
 * with no wiring needed here beyond calling `usePopover` at all.
 *
 * **No focus move into the panel on open.** The private library's own `Popover` defaults
 * `focusOnOpen` to `false`, and this component makes the same choice for the same reason: it has no
 * idea what is in the panel, so it cannot know that focusing "the first thing" is even useful (a
 * filter form's first field, sure; a menu's first item, maybe; a paragraph of text, never). Opening
 * leaves focus on the trigger; `Tab` (redirected into the panel — `usePopover`'s `tabRedirect`,
 * always on here, since a menu or a form is exactly the kind of panel with real tab stops) and the
 * mouse are how a keyboard or pointer user gets to what is inside. `Esc` and an outside click still
 * close it and return focus to the trigger, same as every other popup in this package.
 * `focusOnOpen` is the opt-in for a panel whose first tab stop is the obvious place to start.
 *
 * **A programmatic `trigger.click()` toggles it**, as a pointer click does; only a click a
 * `<label>` forwards is held to focusing (`usePopover`'s `isProgrammaticClick`).
 *
 * **Keyboard activation opens it.** `usePopover`'s label-forwarded-click latch treats a click with
 * no pointer press and `detail: 0` as forwarded from a `<label>` — but that is also exactly what a
 * browser fires when `Enter` or `Space` activates a `<button>`. So `attrs` carries an `onKeydown`
 * that marks the next such click as the keyboard's, and it toggles like a pointer click does.
 *
 * **Nested popups keep it open.** A `Select` or another `Popover` opened from inside this panel
 * teleports its own panel elsewhere; `useOverlay` counts it as inside (its trigger, in this panel,
 * is `aria-expanded` and `aria-controls` it), and `openRegistry` does not close this popover when
 * it opens. A consumer's own teleported part claims it with `data-eldra-overlay-owner` set to this
 * panel's id, or to the id of any element inside it.
 */
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  useSlots,
  watch,
  type ComponentPublicInstance,
  type VNode,
} from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useUiId } from '../../utils/id';
import { usePopover } from '../select/usePopover';
import type { PopoverProps } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: undefined,
  placement: 'auto',
  offset: undefined,
  viewportPadding: undefined,
  reference: undefined,
  disabled: false,
  haspopup: 'true',
  labelledByTrigger: false,
  openOnArrowDown: false,
  focusOnOpen: false,
  closeOnOutsideClick: true,
  closeOnFocusOutside: undefined,
  closeOnEscape: true,
  returnFocus: true,
  closeWhenTriggerHidden: false,
  exclusive: true,
  matchWidth: undefined,
  ariaLabel: undefined,
  teleport: true,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
}>();

const slots = useSlots();

/** Controlled when the parent binds `v-model`, self-managing when it does not — the same model
 *  every stateful component in this package uses (see `Select`, `Dialog`). */
const model = useControllableModel<boolean>(props, emit, () => false);

const controlId = useUiId('popover');
const panelId = computed(() => `${controlId.value}-panel`);

/** The trigger slot's own DOM node — see this file's own doc comment for why it has to be the real
 *  element rather than `root`. */
const triggerEl = ref<HTMLElement | null>(null);
const panelEl = ref<HTMLElement | null>(null);
const anchor = computed(() => props.reference ?? null);

const {
  isOpen,
  panelStyle,
  placement: resolvedPlacement,
  teleportTo,
  teleportDisabled,
  open,
  close: closePopup,
  onTriggerPointerDown,
  onTriggerClick,
  focusFirst,
  update,
} = usePopover({
  trigger: triggerEl,
  content: panelEl,
  anchor,
  canOpen: () => !props.disabled,
  placement: () => props.placement,
  offset: () => props.offset,
  padding: () => props.viewportPadding,
  exclusive: () => props.exclusive,
  closeOnOutsideClick: () => props.closeOnOutsideClick,
  closeOnFocusOutside: () => props.closeOnFocusOutside ?? props.closeOnOutsideClick,
  closeOnEscape: () => props.closeOnEscape,
  returnFocus: () => props.returnFocus,
  matchWidth: props.matchWidth,
  teleport: props.teleport,
  // A menu's rows or a filter form's fields are exactly the "real tab stops" this restores the
  // walk for; a panel with none is untouched (see `usePopover`'s own doc comment).
  tabRedirect: true,
  onOpen: () => {
    model.value = true;
    emit('open');
  },
  onClose: () => {
    model.value = false;
    emit('close');
  },
  openFromPointer: () => open(),
  afterOpen: async () => {
    if (!props.focusOnOpen) return;
    await nextTick();
    const panel = panelEl.value;
    if (panel === null) return;
    focusFirst();
    if (!panel.contains(document.activeElement)) panel.focus();
  },
});

/** Close, returning focus to the trigger unless `returnFocus` is off. */
function close(): void {
  closePopup(props.returnFocus);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closePopup(false);
  }
);

/**
 * A `v-model` write from outside — a parent's own "Open filters" button elsewhere on the page, or a
 * story opening on mount for a screenshot — opens or closes the popup through the same registry and
 * closing rules a trigger click does. `immediate` so a consumer that starts `modelValue` `true`
 * gets an open popup from the first render, the same as `Dialog`'s `modelValue` does.
 */
watch(
  () => props.modelValue,
  (value) => {
    if (value === undefined) return;
    // `closePopup(false)`: an external write is not the Esc/outside-click/trigger-click kind of
    // closing that should also yank focus back — the caller may well have moved it on purpose.
    if (value) open();
    else closePopup(false);
  },
  { immediate: true }
);

function toggle(): void {
  if (isOpen.value) close();
  else open();
}

// --- keyboard activation and ArrowDown ----------------------------------------------------------

/** Set by `Enter`/`Space` on the trigger, so the `detail: 0` click they fire counts as a real one. */
let keyboardActivation = false;

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    keyboardActivation = true;
    return;
  }
  if (event.key === 'ArrowDown' && props.openOnArrowDown && !isOpen.value && !props.disabled) {
    event.preventDefault();
    open();
  }
}

function onClick(event: MouseEvent): void {
  const fromKeyboard = keyboardActivation && event.detail === 0;
  keyboardActivation = false;
  if (fromKeyboard) {
    if (!props.disabled) toggle();
    return;
  }
  onTriggerClick(event);
}

// --- closing once the trigger scrolls out of view ----------------------------------------------

let triggerObserver: IntersectionObserver | null = null;

function unobserveTrigger(): void {
  triggerObserver?.disconnect();
  triggerObserver = null;
}

watch(
  [isOpen, triggerEl, () => props.closeWhenTriggerHidden],
  ([opened, trigger, enabled]) => {
    unobserveTrigger();
    if (!opened || !enabled || trigger === null || typeof IntersectionObserver === 'undefined') {
      return;
    }
    triggerObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry !== undefined && !entry.isIntersecting) closePopup(false);
      },
      { threshold: 0 }
    );
    triggerObserver.observe(trigger);
  },
  { flush: 'post' }
);

onBeforeUnmount(unobserveTrigger);

// --- the trigger's ARIA, wired through the `attrs` slot prop, and its real DOM node --------------

const triggerAttrs = computed(() => ({
  id: controlId.value,
  type: 'button' as const,
  'aria-haspopup': props.haspopup,
  'aria-expanded': isOpen.value ? ('true' as const) : ('false' as const),
  'aria-controls': panelId.value,
  'data-part': 'trigger' as const,
  class: props.classes?.trigger,
  ...(props.disabled ? { disabled: true } : {}),
  onPointerdown: onTriggerPointerDown,
  onClick,
  onKeydown: onTriggerKeydown,
}));

/** `aria-labelledby` from `labelledByTrigger`; a fallthrough `aria-labelledby` still wins. */
const panelLabelledBy = computed(() =>
  props.labelledByTrigger && props.ariaLabel === undefined ? controlId.value : undefined
);

/** Every real vnode of the `trigger` slot's output, in order: a stray whitespace/comment node is
 *  not the trigger, and a fragment (a wrapper component forwarding its own `<slot>` into this one,
 *  or a `v-for`) is looked through rather than skipped. */
function elements(nodes: VNode[]): VNode[] {
  return nodes.flatMap((node) => {
    if (node.type === Fragment) {
      return Array.isArray(node.children) ? elements(node.children as VNode[]) : [];
    }
    return node.type === Comment || node.type === Text ? [] : [node];
  });
}

/** A plain element ref is already an `HTMLElement`; a component ref is unwrapped through `$el`, so
 *  a `<Button>` (or any other single-root component) used as the trigger still gives `usePopover`
 *  a real node to measure, focus and treat as "inside". */
function assignTriggerEl(value: Element | ComponentPublicInstance | null): void {
  if (value === null) {
    triggerEl.value = null;
    return;
  }
  if (value instanceof Element) {
    triggerEl.value = value as HTMLElement;
    return;
  }
  triggerEl.value = (value.$el as HTMLElement | undefined) ?? null;
}

/**
 * A functional-component wrapper, so `<component :is="Trigger" />` re-invokes it on every render
 * instead of Vue diffing a plain vnode value against `is`. Declared once, here, so its identity is
 * stable for the component's lifetime — the same reason `Tooltip`'s own `Trigger` is written this
 * way — which is what lets Vue patch the same underlying trigger element across renders rather than
 * replacing it because "the component at `is`" looked new.
 */
function Trigger(): VNode | null {
  const nodes = slots.trigger?.({ open: isOpen.value, toggle, attrs: triggerAttrs.value }) ?? [];
  const found = elements(nodes);
  const original = found[0];
  if (original === undefined) {
    if (import.meta.env?.DEV && props.reference == null) {
      console.warn('[@eldrajs/ui] <Popover> has no `trigger` slot content to attach itself to.');
    }
    return null;
  }
  if (import.meta.env?.DEV && found.length > 1) {
    console.warn(
      '[@eldrajs/ui] <Popover> `trigger` slot has more than one element; only the first is wired ' +
        'up as the trigger.'
    );
  }
  // `mergeRef: true` (the third argument) so a consumer who also put their own `ref` on the
  // trigger element keeps it — Vue merges the two into one array-form ref instead of losing theirs.
  return cloneVNode(original, { ref: assignTriggerEl }, true);
}

// --- classes -------------------------------------------------------------------------------------

defineExpose({
  /** Open the panel, as a trigger click would. */
  open: () => open(),
  /** Close the panel, as the default slot's `close` would. */
  close,
  toggle,
  /** Reposition now — after a virtual `reference` has moved. */
  update,
});

const panelClass = computed(() => [
  'eldra:z-popover eldra:overflow-hidden eldra:rounded-md eldra:border eldra:shadow-md',
  'eldra:border-[color:var(--eldra-popover-border,var(--eldra-color-border))]',
  'eldra:bg-[color:var(--eldra-popover-background,var(--eldra-color-background))]',
  // No fallback: unset, the panel's colour is inherited exactly as before.
  'eldra:text-[color:var(--eldra-popover-text)]',
  'eldra:animate-eldra-popover-in',
  props.classes?.panel,
]);
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    :data-eldra-slot="eldra.slotHost('trigger')"
    data-part="root"
    class="eldra:contents"
  >
    <component :is="Trigger" />

    <Teleport :to="teleportTo" :disabled="teleportDisabled">
      <div
        v-if="isOpen"
        :data-eldra-slot="eldra.slotHost('default')"
        :id="panelId"
        ref="panelEl"
        data-eldra-ui
        :data-eldra-scope="eldra.scope"
        data-part="panel"
        :data-eldra-overlay-owner="panelId"
        :class="panelClass"
        :style="panelStyle"
        :data-placement="resolvedPlacement"
        :aria-label="ariaLabel"
        :aria-labelledby="panelLabelledBy"
        :tabindex="focusOnOpen ? -1 : undefined"
        v-bind="$attrs"
      >
        <slot :close="() => close()" :open="isOpen" :toggle="toggle" />
      </div>
    </Teleport>
  </div>
</template>
