<script setup lang="ts">
/**
 * A modal side sheet for long content (design spec "Drawer", lines 3701-3835): the cart, filters
 * and quick view slide in from the right, the mobile menu from the left. Use a `Dialog` for a
 * single short decision instead, and a `Toast` — not this — to confirm "Added to cart" unless the
 * shopper asked to see the cart.
 *
 * Built on `useDialog`, the same shared "Modal dialogs" contract `Dialog` uses: native `<dialog>`
 * + `showModal()`, no `role="dialog"`, no custom focus trap, nested modals allowed with `Esc`/a
 * backdrop click acting only on the topmost one (`Dialog` and `Drawer` share the one `dialogStack`
 * stack — operator override, see the README's Deviations entry), the page behind inert and not
 * scrolling, `Esc` always closing the top, a backdrop click closing the top (the spec gives
 * `Drawer` no `dismissable` prop at all — unlike `Dialog`, a drawer's backdrop click always closes
 * it, when it is the topmost dialog). See `useDialog`'s own doc comment for the full contract; this
 * file only draws the anatomy, the per-side slide and full-screen mobile variant, and the one
 * behaviour `Dialog` does not need: which control gets initial focus differs by `side` (below).
 */
import { computed, ref, useSlots } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import type { DrawerProps } from './types';

const props = withDefaults(defineProps<DrawerProps>(), {
  modelValue: undefined,
  side: 'right',
  title: undefined,
  ariaLabel: undefined,
  count: undefined,
  width: undefined,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** Fires when `Esc` is pressed (the native `cancel` event), before the drawer actually closes. */
  cancel: [];
  /** Fires after the drawer has closed, with how: `"escape"`, `"backdrop"`, `"button"`,
   *  `"programmatic"` (a parent set `modelValue` to `false` directly), or whatever a consumer
   *  passed to the exposed `close(returnValue)` method. */
  close: [reason: string];
}>();

if (import.meta.env?.DEV && props.title === undefined && props.ariaLabel === undefined) {
  console.warn(
    '[@eldrajs/ui] Drawer has neither a title nor an ariaLabel, so it has no accessible name. ' +
      'Set title (a visible heading) or ariaLabel (the menu drawer: ariaLabel="Menu").'
  );
}

const slots = useSlots();
const m = useMessages(() => props.messages);

/** Controlled when the parent binds `v-model`, self-managing when it does not — the same model
 *  every stateful component in this package uses. */
const model = useControllableModel<boolean>(props, emit, () => false);

const dialogEl = ref<HTMLDialogElement | null>(null);
const closeButtonEl = ref<HTMLElement | null>(null);

const titleId = useUiId('drawer-title');

/**
 * Spec "Drawer" → Variants, Initial focus column: the right side (cart, filters, quick view)
 * focuses the close button by default — unlike `Dialog`'s own rule, which never picks the close
 * button while a better candidate exists — "unless a control is marked `autofocus`", which wins
 * when present. The left side (the mobile menu) gets no override here: `undefined` falls through
 * to `useDialog`'s own default (the first focusable that is not `[data-part="close"]`), which is
 * already "the first link in the menu" as long as the menu's nav is the body's first content —
 * exactly the anatomy this component draws.
 *
 * Reads `model.value` for no reason other than to force a fresh DOM query every time the drawer
 * opens (a `computed` with no reactive dependency of its own would cache its first answer
 * forever); the query itself is intentionally not reactive to DOM mutations, only to open/close.
 */
const initialFocus = computed<HTMLElement | null>(() => {
  void model.value;
  if (props.side !== 'right') return null;
  const el = dialogEl.value;
  if (el === null) return null;
  return el.querySelector<HTMLElement>('[autofocus]') ?? closeButtonEl.value;
});

const { close, isTop } = useDialog({
  open: model,
  setOpen: (next) => {
    model.value = next;
  },
  dialog: dialogEl,
  initialFocus,
  onCancel: () => emit('cancel'),
});

/** The one place the public `close` event is emitted, for every closing route at once — see
 *  `Dialog.vue`'s own comment on this exact pattern, including the `"programmatic"` reason a plain
 *  external close (a parent setting `modelValue` to `false` directly) now reads. */
function onNativeClose(): void {
  emit('close', dialogEl.value?.returnValue || 'escape');
}

function onCloseClick(): void {
  close('button');
}

/** So a consumer can close the drawer with an action value of their own via a template ref —
 *  `<Drawer ref="drawerRef">` then `drawerRef.value.close('checkout')` — the same mechanism
 *  `Dialog` exposes. */
defineExpose({ close, isTop });

/** The name this drawer gives itself: its visible `title`, else `ariaLabel` (spec "Drawer" →
 *  Accessibility: "Cart: `aria-labelledby`. Menu: `aria-label="Menu"`"). Also what the close
 *  button's own accessible name is built from ("Close cart", "Close menu", "Close filters"). */
const accessibleName = computed(() => props.title ?? props.ariaLabel);

const closeLabel = computed(() => {
  const name = accessibleName.value;
  return name === undefined ? m.value.close : m.value.closeDrawer(name);
});

/**
 * The root `<dialog>`: transparent and full-viewport, unlike `Dialog`'s own root (centred by the
 * UA's own `margin: auto`). A drawer docks its panel to one edge instead, so the UA's centring is
 * overridden outright (`inset-0 m-0 h-full w-full max-w-none`) and a flex row aligns the (only)
 * child panel to `side` — `justify-end`/`justify-start`, not a per-side inset, so the same panel
 * markup works for both without swapping which physical side it reads its position from.
 *
 * The slide-in animation lives here, not on the panel (see `tailwind.css`'s own comment on
 * `eldra-drawer-in-right`/`-left` for why): translating this full-viewport-width transparent box
 * moves its panel child fully off-screen and back regardless of the panel's own width, while the
 * `::backdrop` — a sibling box, not a descendant — is untouched and simply stays in place.
 *
 * `hidden open:flex`, not a bare `flex` (fix, from the operator's own finding — see `Dialog`'s
 * own rootClass comment for the full mechanism): a bare `flex` here is exactly what left a closed
 * `Drawer` sitting on screen, panel and all, instead of vanishing — the UA's own `display: none`
 * for a closed `<dialog>` loses to *any* author `display` utility regardless of specificity, so
 * `flex` alone painted the box even with the `open` attribute gone.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      // No explicit height: `inset-0` pins the top and the bottom and the dialog stretches between
      // them (`h-auto` overrides the user agent's `fit-content`), which on a phone is the visible
      // area whether or not the browser's toolbar is showing. `100%` measured the layout viewport,
      // which keeps a collapsed toolbar's height, so a pinned foot sat under the toolbar; `100dvh`
      // undershoots in a desktop browser's device emulation and left a strip of page below the foot.
      'fixed inset-0 m-0 hidden open:flex h-auto max-h-none w-full max-w-none border-0 bg-transparent p-0 text-text',
      props.side === 'left' ? 'justify-start' : 'justify-end',
      'backdrop:bg-overlay',
      props.side === 'left'
        ? 'animate-eldra-drawer-in-left motion-reduce:animate-eldra-dialog-in-reduced'
        : 'animate-eldra-drawer-in-right motion-reduce:animate-eldra-dialog-in-reduced'
    ),
    props.classes,
    'root'
  )
);

/**
 * The visible sheet (spec "Drawer" → Sizes): full viewport height pinned to its edge, the width
 * variable clamp (`eldra-drawer-width`, which also carries the full-screen-below-48rem-viewport
 * media query — see its own comment in `tailwind.css`), radius none, `shadow-md`, and a 1px
 * `border` on the *inner* edge only — the left edge for a right drawer, the right edge for a left
 * one, since the outer edge is the viewport boundary itself.
 */
const panelClass = computed(() =>
  partClass(
    cx(
      'flex h-full max-h-full min-w-0 flex-col bg-background text-text shadow-md',
      'eldra-drawer-width',
      props.side === 'left' ? 'border-r border-border' : 'border-l border-border'
    ),
    props.classes,
    'panel'
  )
);

/** `--eldra-drawer-width` from the `width` prop, left unset so the utility's own literal default
 *  (28rem) applies when the prop is omitted. */
const panelStyle = computed(() =>
  props.width === undefined ? undefined : { '--eldra-drawer-width': props.width }
);

const headerClass = computed(() =>
  partClass(
    'flex min-h-16 shrink-0 items-center gap-4 border-b border-border px-6 py-4',
    props.classes,
    'header'
  )
);

/** A plain layout spacer, not a named part: `flex-1` so it claims every pixel the title does not
 *  need, which is what pushes the close button to the row's end even when there is no `title` to
 *  share the row with (the menu drawer, `ariaLabel` only) — simpler than an `ms-auto` on the close
 *  button itself, which this package avoids combining with a physical `m-*`/`-m-*` utility on the
 *  same element (a logical margin and the `margin` shorthand can resolve to the same edge, and
 *  which one wins is a stylesheet-order question neither utility's class name reveals). */
const titleAreaClass = 'min-w-0 flex-1';

const titleClass = computed(() =>
  partClass('min-w-0 text-drawer-title text-text', props.classes, 'title')
);

const countClass = computed(() => partClass('text-muted font-normal', props.classes, 'count'));

/**
 * Spec "Drawer" → States, Close button row, and Sizes: "2.5rem square ghost icon button, 2.75rem
 * below 48rem" — the same viewport edge the full-screen variant measures (`max-md:`, not a
 * container query). Positioned at the header's end by `titleAreaClass`'s `flex-1` spacer, not a
 * margin of its own — otherwise the same design as `Dialog`'s own close button (ghost hover/active
 * fills, `eldra-focus`, `cursor-pointer`; see that file's comment for why the "moves down 1px"
 * active state is a 2% scale instead of a translate).
 */
const closeClass = computed(() =>
  partClass(
    cx(
      'inline-flex size-10 max-md:size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm',
      'text-text eldra-focus',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)]'
    ),
    props.classes,
    'close'
  )
);

const bodyClass = computed(() =>
  partClass('min-h-0 flex-1 overflow-y-auto p-6', props.classes, 'body')
);

const footerClass = computed(() =>
  partClass(
    'flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-background px-6 py-5',
    props.classes,
    'footer'
  )
);
</script>

<template>
  <dialog
    ref="dialogEl"
    data-part="root"
    :class="rootClass"
    :aria-labelledby="title ? titleId : undefined"
    :aria-label="!title ? ariaLabel : undefined"
    @close="onNativeClose"
  >
    <div data-part="panel" :class="panelClass" :style="panelStyle">
      <div data-part="header" :class="headerClass">
        <div :class="titleAreaClass">
          <h2 v-if="title" :id="titleId" data-part="title" :class="titleClass">
            {{ title }}
            <span v-if="count != null" data-part="count" :class="countClass">({{ count }})</span>
          </h2>
        </div>
        <button
          ref="closeButtonEl"
          type="button"
          data-part="close"
          :class="closeClass"
          :aria-label="closeLabel"
          @click="onCloseClick"
        >
          <!-- Tabler's `x`, 1.75 stroke, matching Dialog's own close button. -->
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div data-part="body" :class="bodyClass">
        <slot />
      </div>

      <div v-if="slots.footer" data-part="footer" :class="footerClass">
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>
