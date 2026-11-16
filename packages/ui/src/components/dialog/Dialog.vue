<script setup lang="ts">
/**
 * A small modal window for one decision or a short form (design spec "Dialog", lines 3568-3700).
 * Native `<dialog>` + `showModal()` throughout — the shared modal rules' non-negotiable: "there is
 * no `role="dialog"` on any other element and no custom focus-trap code." Everything the design
 * spec calls for beyond open/close (nested modals with top-only `Esc`/backdrop dismissal — operator
 * override, see the README's Deviations entry — initial focus, focus return, the page behind being
 * inert and not scrolling) is `useDialog`'s job, not this component's — see its own doc comment for
 * the full contract. This file only draws the anatomy and wires the three events a consumer needs
 * (`update:modelValue`, `cancel`, `close`).
 */
import { computed, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { useUiId } from '../../utils/id';
import type { DialogProps } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<DialogProps>(), {
  modelValue: undefined,
  title: undefined,
  description: undefined,
  size: 'md',
  dismissable: true,
  closeButton: true,
  closeOnEscape: true,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** Fires when `Esc` is pressed (the native `cancel` event), before the dialog actually closes. */
  cancel: [];
  /**
   * Fires after the dialog has closed, with how: `"escape"`, `"backdrop"`, `"button"`,
   * `"programmatic"` (a parent set `modelValue` to `false` directly, through none of the other
   * routes), or whatever a consumer passed to the exposed `close(returnValue)` method (an action
   * value — the Confirm variant's "Remove", the Form variant's successful submit).
   */
  close: [reason: string];
}>();

const slots = defineSlots<{
  /** The body, below the description. */
  default?: () => unknown;
  /** The action buttons. */
  footer?: () => unknown;
  /** Replaces the `<h2>` with markup of your own (an icon above the heading, a heading level the
   *  page needs). Still the dialog's accessible name; bring your own heading element. */
  title?: () => unknown;
}>();
const m = useMessages(() => props.messages);

/** Controlled when the parent binds `v-model`, self-managing when it does not — the same model
 *  every stateful component in this package uses (see `Select`, `Switch`). */
const model = useControllableModel<boolean>(props, emit, () => false);

const dialogEl = ref<HTMLDialogElement | null>(null);

const titleId = useUiId('dialog-title');
const descriptionId = useUiId('dialog-description');

const { close, isTop } = useDialog({
  open: model,
  setOpen: (next) => {
    model.value = next;
  },
  dialog: dialogEl,
  dismissable: () => props.dismissable,
  closeOnEscape: () => props.closeOnEscape,
  // The dialog itself takes focus on open; a field is focused only when the consumer marks it
  // `autofocus`, so a form opens without focusing (and on blur validating) its first field.
  focusFirstControl: false,
  onCancel: () => emit('cancel'),
});

/**
 * The one place the public `close` event is emitted, for every closing route at once (`Esc`, the
 * close button, a backdrop click, a consumer's own `close(value)` call, or a parent setting
 * `modelValue` to `false` directly) — `returnValue` is `useDialog`'s own record of *why*, read back
 * from the native element itself rather than tracked a second time here. `useDialog`'s `hide()`
 * always sets it to `"programmatic"` for that last route, so the `|| 'escape'` fallback below only
 * matters for a `returnValue` this composable never wrote to in the first place (defensive, not a
 * documented route).
 */
function onNativeClose(): void {
  emit('close', dialogEl.value?.returnValue || 'escape');
}

function onCloseClick(): void {
  close('button');
}

/** So a consumer can close the dialog with its own action value from a footer button — the
 *  Confirm variant's "Remove", or a form's successful submit — via a template ref:
 *  `<Dialog ref="dialogRef" …>` then `dialogRef.value.close('remove')`. */
defineExpose({ close, isTop });

/**
 * The `<dialog>` is a transparent, padded, full-viewport scroll container: a panel taller than the
 * viewport grows downward and the dialog scrolls, the way a page does, rather than squeezing its
 * body to a sliver on a short screen.
 *
 * `hidden open:flex`, never a bare `flex`: the UA's `dialog:not([open]) { display: none }` loses to
 * any author `display` utility (origin beats specificity), so `hidden` closes it unconditionally and
 * `open:flex` (two selectors deep, see `modalClosedDisplay.spec.ts`) wins only while `[open]`.
 *
 * A column, not a row: width is the cross axis, so the panel keeps its own width clamp (a row
 * shrank it at 360px), and `shrink-0` on the panel stops the main axis squeezing it.
 */
const rootClass = [
  'eldra:hidden eldra:open:flex eldra:flex-col eldra:items-center',
  'eldra:m-0 eldra:size-full eldra:max-h-none eldra:max-w-none eldra:overflow-y-auto eldra:overscroll-contain',
  'eldra:border-0 eldra:bg-transparent eldra:px-4 eldra:py-8',
  'eldra:text-[color:var(--eldra-dialog-text,var(--eldra-color-text))]',
  'eldra:backdrop:bg-[var(--eldra-dialog-backdrop,var(--eldra-color-overlay))] eldra:focus:outline-none',
];

/**
 * The visible box (spec "Dialog" → Sizes), carrying the border/shadow/radius and the width clamp.
 * `my-auto` centres a short panel and collapses to 0 on a tall one, so it starts at the top padding
 * and scrolls. Its height is capped only when a consumer sets `--eldra-dialog-max-height`; then
 * `body` (`flex-1 overflow-y-auto`, between `shrink-0` header and footer) scrolls inside instead.
 * The entrance animates this box, so the full-viewport root never carries a transform.
 */
const panelClass = computed(() => [
  'eldra:my-auto eldra:flex eldra:shrink-0 eldra:flex-col eldra:overflow-hidden eldra:rounded-lg eldra:border eldra:shadow-md',
  'eldra:border-[color:var(--eldra-dialog-border,var(--eldra-color-border))]',
  'eldra:bg-[var(--eldra-dialog-background,var(--eldra-color-background))]',
  props.size === 'sm' ? 'eldra:eldra-dialog-width-sm' : 'eldra:eldra-dialog-width',
  'eldra:eldra-dialog-max-height',
  'eldra:animate-eldra-dialog-in eldra:motion-reduce:animate-eldra-dialog-in-reduced',
  props.classes?.panel,
]);

const hasTitle = computed(() => props.title !== undefined || slots.title !== undefined);
const hasHeader = computed(() => hasTitle.value || props.closeButton);

const headerClass = computed(() => [
  hasTitle.value
    ? 'eldra:flex eldra:shrink-0 eldra:items-start eldra:justify-between eldra:gap-4 eldra:p-6 eldra:pb-0'
    : 'eldra:flex eldra:shrink-0 eldra:items-start eldra:justify-end eldra:gap-4 eldra:p-6 eldra:pb-0',
  props.classes?.header,
]);

// A slotted title fills the row so its own alignment (a centred heading) reaches the whole width.
const titleClass = computed(() => [
  'eldra:min-w-0 eldra:text-dialog-title eldra:text-[color:var(--eldra-dialog-text,var(--eldra-color-text))]',
  slots.title !== undefined && 'eldra:flex-1',
  props.classes?.title,
]);

/**
 * Spec "Dialog" → States: rest transparent, hover `text` at 6% over the panel, active 11% and
 * "moves down 1px". The 1px move is the same literal `Button`'s own press state replaced with a 2%
 * shrink instead (operator decision, 2026-09-25, recorded under Deviations in the README): a 1px
 * translate reads as a rendering artefact, not a press, and `src/__tests__/source-scan.spec.ts`
 * fails the build on any shipped `active:` translate/top/margin-top class for exactly that reason.
 * `active:scale-[0.98]` needs no `transition-*`/`duration-*` utility of its own — `eldra-focus`
 * already owns this element's whole transition list, `scale` included (see
 * `src/styles/tailwind.css` and `src/__tests__/focus-transition.spec.ts`), so adding one here would
 * fail that guard for no visual gain.
 */
const closeClass = computed(() => [
  'eldra:-m-1 eldra:inline-flex eldra:size-8 eldra:shrink-0 eldra:cursor-pointer eldra:items-center eldra:justify-center eldra:rounded-sm',
  'eldra:text-[color:var(--eldra-dialog-text,var(--eldra-color-text))] eldra:eldra-focus',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-dialog-text,var(--eldra-color-text)),transparent_94%)]',
  'eldra:active:scale-[0.98]',
  'eldra:active:bg-[color-mix(in_oklab,var(--eldra-dialog-text,var(--eldra-color-text)),transparent_89%)]',
  props.classes?.close,
]);

const bodyClass = computed(() => [
  'eldra:min-h-0 eldra:flex-1 eldra:overflow-y-auto eldra:px-6 eldra:py-4',
  !hasHeader.value && 'eldra:pt-6',
  props.classes?.body,
]);

const descriptionClass = computed(() => [
  'eldra:text-body eldra:text-[color:var(--eldra-dialog-muted,var(--eldra-color-muted))]',
  props.classes?.description,
]);

const footerClass = computed(() => [
  'eldra:flex eldra:shrink-0 eldra:flex-wrap eldra:items-center eldra:justify-end eldra:gap-3 eldra:px-6 eldra:pt-4 eldra:pb-6',
  props.classes?.footer,
]);
</script>

<template>
  <dialog
    ref="dialogEl"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="rootClass"
    :aria-labelledby="hasTitle ? titleId : undefined"
    :aria-describedby="description ? descriptionId : undefined"
    @close="onNativeClose"
  >
    <div data-part="panel" :class="panelClass">
      <div v-if="hasHeader" data-part="header" :class="headerClass">
        <div
          v-if="slots.title"
          :data-eldra-slot="eldra.slotHost('title')"
          :id="titleId"
          data-part="title"
          :class="titleClass"
        >
          <slot name="title" />
        </div>
        <h2 v-else-if="title !== undefined" :id="titleId" data-part="title" :class="titleClass">
          {{ title }}
        </h2>
        <button
          v-if="closeButton"
          type="button"
          data-part="close"
          :class="closeClass"
          :aria-label="m.close"
          @click="onCloseClick"
        >
          <!-- Tabler's `x`, 1.75 stroke, matching Select's own clear button. -->
          <svg
            class="eldra:size-4"
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

      <div :data-eldra-slot="eldra.slotHost('default')" data-part="body" :class="bodyClass">
        <p
          v-if="description"
          :data-eldra-scope="eldra.scope"
          :id="descriptionId"
          data-part="description"
          :class="descriptionClass"
        >
          {{ description }}
        </p>
        <slot />
      </div>

      <div
        v-if="slots.footer"
        :data-eldra-slot="eldra.slotHost('footer')"
        data-part="footer"
        :class="footerClass"
      >
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>
