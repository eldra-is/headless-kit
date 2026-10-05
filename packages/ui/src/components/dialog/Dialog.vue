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
import { computed, ref, useSlots } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import type { DialogProps } from './types';

const props = withDefaults(defineProps<DialogProps>(), {
  modelValue: undefined,
  description: undefined,
  size: 'md',
  dismissable: true,
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

const slots = useSlots();
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

const rootClass = computed(() =>
  partClass(
    cx(
      // `hidden open:block`, not a bare `m-auto` alone (fix, from the operator's own finding):
      // the UA stylesheet's `dialog:not([open]) { display: none }` only wins on specificity, and
      // origin always beats specificity in the cascade — any author `display` utility on this
      // element, however unspecific, overrides it once the dialog closes. `hidden` sets
      // `display: none` unconditionally; `open:block` (`.open\:block:is([open], …)`, two
      // selectors deep — see `modalClosedDisplay.spec.ts`) only wins once the `open` attribute is
      // back, by specificity, both rules being the same author origin.
      //
      // `open:block`, not `open:flex` like `Drawer`'s/`SearchModal`'s own roots — a deliberate
      // deviation from the pattern those two use, proven necessary rather than assumed: this root
      // never carried `flex` before (it only ever centres one `panel` child via `m-auto`, and
      // `panel` already does its own `flex flex-col` internally), and turning it into a flex
      // *container* makes that child a flex *item* — subject to default `flex-shrink: 1`. The
      // `dialog:modal` UA rule's own `max-width` can be narrower than `panel`'s own
      // `eldra-dialog-width` at small viewports, and a flex item shrinks to fit a constrained
      // container in a way a block-level child (which simply keeps its specified width, overflow
      // or not) never does — confirmed by an A/B screenshot comparison: `open:flex` here measurably
      // narrows the panel and reflows its text at 360px (`overlays-dialog--long-content--360`, an
      // extra word per line moved down), `open:block` is pixel-identical to every existing
      // baseline. `position: fixed` (the UA's own modal positioning) already forces this box's
      // *outer* display to block regardless of which inner value wins, so the auto-margin centring
      // is unaffected either way — only the flex-shrink behaviour on the child differs.
      'hidden open:block m-auto border-0 bg-transparent p-0 text-text',
      'backdrop:bg-overlay',
      'animate-eldra-dialog-in motion-reduce:animate-eldra-dialog-in-reduced'
    ),
    props.classes,
    'root'
  )
);

/**
 * The visible box (spec "Dialog" → Sizes): the `<dialog>` itself stays transparent and unsized
 * above, so this inner flex column carries the border/shadow/radius and the width/max-height
 * clamps — and is what actually keeps long content scrolling inside `body` rather than growing the
 * whole dialog past the viewport (`header`/`footer` are `shrink-0`, `body` alone is `flex-1
 * overflow-y-auto`).
 */
const panelClass = computed(() =>
  partClass(
    cx(
      'flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-md',
      props.size === 'sm' ? 'eldra-dialog-width-sm' : 'eldra-dialog-width',
      'eldra-dialog-max-height'
    ),
    props.classes,
    'panel'
  )
);

const headerClass = computed(() =>
  partClass('flex shrink-0 items-start justify-between gap-4 p-6 pb-0', props.classes, 'header')
);

const titleClass = computed(() =>
  partClass('min-w-0 text-dialog-title text-text', props.classes, 'title')
);

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
const closeClass = computed(() =>
  partClass(
    cx(
      '-m-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-sm',
      'text-text eldra-focus',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)]'
    ),
    props.classes,
    'close'
  )
);

const bodyClass = computed(() =>
  partClass('min-h-0 flex-1 overflow-y-auto px-6 py-4', props.classes, 'body')
);

const descriptionClass = computed(() =>
  partClass('text-body text-muted', props.classes, 'description')
);

const footerClass = computed(() =>
  partClass(
    'flex shrink-0 flex-wrap items-center justify-end gap-3 px-6 pt-4 pb-6',
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
    :aria-labelledby="titleId"
    :aria-describedby="description ? descriptionId : undefined"
    @close="onNativeClose"
  >
    <div data-part="panel" :class="panelClass">
      <div data-part="header" :class="headerClass">
        <h2 :id="titleId" data-part="title" :class="titleClass">{{ title }}</h2>
        <button
          type="button"
          data-part="close"
          :class="closeClass"
          :aria-label="m.close"
          @click="onCloseClick"
        >
          <!-- Tabler's `x`, 1.75 stroke, matching Select's own clear button. -->
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
        <p v-if="description" :id="descriptionId" data-part="description" :class="descriptionClass">
          {{ description }}
        </p>
        <slot />
      </div>

      <div v-if="slots.footer" data-part="footer" :class="footerClass">
        <slot name="footer" />
      </div>
    </div>
  </dialog>
</template>
