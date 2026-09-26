<script setup lang="ts">
/**
 * A generic, non-modal trigger + floating panel (operator addition, 2026-09-25 — there is no design
 * spec 1 "Popover" section). The private component library's own migration onto this package needs
 * one: its `Popover`/`Dropdown` back several menus, filters and dropdowns that have nothing in
 * common with `Select`'s listbox contract, so what they actually need is the *machinery* `Select`,
 * `MultiSelect` and `SearchBar` already share — `usePopover` — with no opinion at all about what
 * goes in the panel.
 *
 * **Anatomy.** `root` is a `display: contents` wrapper: it exists only so `data-part`/`classes`
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
 * themselves instead. **The slot's element is still cloned** (`cloneVNode`, the same technique
 * `Tooltip` uses) — not to graft attributes on this time, but to reach its real DOM node: `Esc` and
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
 * its own `$attrs` (`inheritAttrs: false`), the same shape the private library's own `Popover`
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
 */
import {
  Comment,
  Fragment,
  Text,
  cloneVNode,
  computed,
  ref,
  useSlots,
  watch,
  type ComponentPublicInstance,
  type VNode,
} from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { usePopover } from '../select/usePopover';
import type { PopoverProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<PopoverProps>(), {
  modelValue: undefined,
  placement: 'auto',
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

const {
  isOpen,
  panelStyle,
  placement: resolvedPlacement,
  teleportTo,
  teleportDisabled,
  open,
  close,
  onTriggerPointerDown,
  onTriggerClick,
} = usePopover({
  trigger: triggerEl,
  content: panelEl,
  placement: props.placement,
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
});

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
    // `close(false)`: an external write is not the Esc/outside-click/trigger-click kind of
    // closing that should also yank focus back — the caller may well have moved it on purpose.
    if (value) open();
    else close(false);
  },
  { immediate: true }
);

function toggle(): void {
  if (isOpen.value) close();
  else open();
}

// --- the trigger's ARIA, wired through the `attrs` slot prop, and its real DOM node --------------

const triggerClass = computed(() => partClass('', props.classes, 'trigger'));

const triggerAttrs = computed(() => ({
  id: controlId.value,
  type: 'button' as const,
  'aria-haspopup': 'true' as const,
  'aria-expanded': isOpen.value ? ('true' as const) : ('false' as const),
  'aria-controls': panelId.value,
  'data-part': 'trigger' as const,
  class: triggerClass.value,
  onPointerdown: onTriggerPointerDown,
  onClick: onTriggerClick,
}));

/** The first real vnode of the `trigger` slot's output — a stray whitespace/comment node is not
 *  the trigger. Shared with `Tooltip`'s own identical helper in spirit, not in code: the two clone
 *  for different reasons (see this file's own doc comment) and live in different components. */
function firstElement(nodes: VNode[]): VNode | undefined {
  return nodes.find(
    (node) => node.type !== Comment && node.type !== Text && node.type !== Fragment
  );
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
  const original = firstElement(nodes);
  if (original === undefined) {
    if (import.meta.env?.DEV) {
      console.warn('[@eldrajs/ui] <Popover> has no `trigger` slot content to attach itself to.');
    }
    return null;
  }
  if (
    import.meta.env?.DEV &&
    nodes.filter((node) => node !== original).some((node) => firstElement([node]) !== undefined)
  ) {
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

const rootClass = computed(() => partClass('contents', props.classes, 'root'));

const panelClass = computed(() =>
  partClass(
    cx(
      'z-popover overflow-hidden rounded-md border border-border bg-background shadow-md',
      'animate-eldra-popover-in'
    ),
    props.classes,
    'panel'
  )
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <component :is="Trigger" />

    <Teleport :to="teleportTo" :disabled="teleportDisabled">
      <div
        v-if="isOpen"
        :id="panelId"
        ref="panelEl"
        data-part="panel"
        :data-eldra-overlay-owner="panelId"
        :class="panelClass"
        :style="panelStyle"
        :data-placement="resolvedPlacement"
        :aria-label="ariaLabel"
        v-bind="$attrs"
      >
        <slot :close="() => close()" />
      </div>
    </Teleport>
  </div>
</template>
