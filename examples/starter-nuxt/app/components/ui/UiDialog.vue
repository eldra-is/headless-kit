<script setup lang="ts">
/**
 * Native `<dialog>` driven entirely through `.showModal()`/`.close()` (never
 * the `open` attribute directly, so real browsers get proper top-layer +
 * inert-background modal behaviour). `open` is the v-model; every path that
 * closes the dialog — the close button, a backdrop click, Escape — goes
 * through the element's own `.close()` so the single `close` event listener
 * below is the one place that emits `update:open` and releases the focus
 * trap, instead of three call sites each doing it themselves.
 *
 * jsdom does not implement `showModal()`/`close()` at all (see
 * `test/support/dialog.ts`, registered in `vitest.config.ts`'s
 * `setupFiles`); Storybook and the real app run in a real browser, where the
 * native implementation applies unchanged.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useFocusTrap } from '../../composables/useFocusTrap';
import { useId } from '../../composables/useId';
import { useScrollLock } from '../../composables/useScrollLock';
import { useT } from '../../composables/useT';
import { focusRing } from '../../utils/classes';

const DEFAULT_PANEL_CLASS =
  'm-auto w-[calc(100%-2rem)] max-w-lg rounded-theme-lg border shadow-theme-md';

const props = withDefaults(
  defineProps<{
    open: boolean;
    /** Labels the dialog (`aria-labelledby`) and is rendered as its heading. */
    title: string;
    /** When set, a backdrop click no longer closes the dialog. Escape still does. */
    persistent?: boolean;
    /**
     * Overrides the default centered-modal position/size/motion classes.
     * `UiDrawer` passes its own side-sheet classes here instead of relying
     * on attrs fallthrough: Tailwind utilities cascade by stylesheet order,
     * not by class-list order, so appending conflicting position utilities
     * (e.g. `m-auto` from this component plus a caller's `inset-y-0
     * left-0`) via fallthrough would win or lose unpredictably. Colour,
     * border and backdrop classes stay fixed below — only positioning
     * differs between a centered dialog and a side sheet.
     */
    panelClass?: string;
  }>(),
  { persistent: false, panelClass: DEFAULT_PANEL_CLASS }
);

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const t = useT();
const dialogRef = ref<HTMLDialogElement | null>(null);
const generatedId = useId();
const titleId = computed(() => `ui-dialog-title-${generatedId}`);

const { activate, deactivate } = useFocusTrap(dialogRef);
const openState = computed(() => props.open);
useScrollLock(openState);

/**
 * Applies `props.open` to the real `<dialog>` element. Used both from
 * `onMounted()` (for a dialog that starts out open) and from the `watch()`
 * below (for every open/close after that) rather than one `{ immediate:
 * true }` watcher: an immediate `flush: 'post'` watcher's callback and this
 * component's own template-ref assignment are both queued into Vue's
 * post-render job queue during the same `setup()` call, and the watcher —
 * registered first, in program order — ran before the ref was set,
 * seeing `dialogRef.value === null` on the very first (initial-open) call.
 * `onMounted()` is guaranteed to run only after this component's own refs
 * are assigned, so it doesn't have that problem.
 */
function syncOpenState(value: boolean): void {
  const dialog = dialogRef.value;
  if (!dialog) return;
  if (value) {
    if (!dialog.open) dialog.showModal();
    activate();
  } else {
    if (dialog.open) dialog.close();
    deactivate();
  }
}

onMounted(() => syncOpenState(props.open));
watch(() => props.open, syncOpenState);

/** Fires once the dialog has actually closed — by `.close()`, or by the
 * browser's own Escape default action — so this is the single place that
 * syncs `v-model` and releases the focus trap. */
function handleClose(): void {
  deactivate();
  emit('update:open', false);
}

function handleBackdropClick(event: MouseEvent): void {
  // The backdrop is the `::backdrop` pseudo-element behind `<dialog>`; a
  // click that lands there (not on any child) has the dialog itself as its
  // target, since a click inside the content stops at that child element.
  if (props.persistent) return;
  if (event.target === dialogRef.value) dialogRef.value?.close();
}

onBeforeUnmount(() => deactivate());
</script>

<template>
  <dialog
    ref="dialogRef"
    :aria-labelledby="titleId"
    :class="['text-text bg-background border-border p-0 backdrop:bg-black/50', panelClass]"
    @close="handleClose"
    @click="handleBackdropClick"
  >
    <div class="border-border flex items-start justify-between gap-4 border-b p-4">
      <h2 :id="titleId" class="font-heading text-lg font-semibold">{{ title }}</h2>
      <button
        type="button"
        :class="[
          'text-muted hover:text-text rounded-theme-sm inline-flex h-8 w-8 shrink-0 items-center justify-center',
          focusRing,
        ]"
        @click="dialogRef?.close()"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="sr-only">{{ t('dialog.close') }}</span>
      </button>
    </div>
    <div class="p-4">
      <slot />
    </div>
  </dialog>
</template>
