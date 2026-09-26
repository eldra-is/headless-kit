<script setup lang="ts">
/**
 * The one toast host an app mounts once (design spec "Toast", shared "Modal dialogs" rules: "While
 * a modal dialog or drawer is open, toasts render inside the open dialog"). Owns everything
 * `Toast.vue` itself does not: the queue comes from `useToast` (a module-level store, so this is
 * the only place that ever reads `toasts` to render), every toast's auto-dismiss timer (paused
 * while the pointer is over the stack or focus is inside it), and where the region actually lives
 * in the DOM — a sibling of whatever opens a `Dialog` when one is open (`TOAST_HOST_KEY`, from
 * `dialogStack.ts`, Task 1), `<body>` otherwise.
 *
 * **Two live regions, never nested** (spec "Toast" -> Behaviour & motion): "insert them into the
 * same fixed stack but outside the polite status element ... so the two live regions aren't
 * nested." `root` is the fixed region itself (not a live region); `list` is the
 * `role="status" aria-live="polite"` element inside it, holding only `success`/`warning` toasts;
 * `danger` toasts render as further direct children of `root`, siblings of `list` — each one is
 * its own `role="alert"` region (set on `Toast`'s own root by its `variant`, see that component),
 * never a descendant of `list`. That is also why `Toaster`'s own anatomy has only two named parts
 * (`root`, `list`) rather than a third for the danger group: there is no visually distinct "danger
 * list" box, just more children of `root`. One consequence, accepted rather than solved here: a
 * mixed sequence of variants (success, then danger, then success again) does not interleave
 * perfectly in the visual stack — every non-danger toast is grouped inside `list`, so a danger
 * toast raised in between still renders after the whole `list` group, not literally between two
 * particular toasts. The spec does not describe cross-variant ordering in enough detail to rule
 * this out, and getting it exactly right would mean nesting the two live regions after all.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { TOAST_HOST_KEY } from '../../composables/dialogStack';
import { useMessages } from '../../composables/useMessages';
import { useToast, type ToastItem } from '../../composables/useToast';
import { cx, partClass } from '../../utils/cx';
import Toast from './Toast.vue';
import type { ToasterProps } from './types';

const props = withDefaults(defineProps<ToasterProps>(), {
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  /** Fires with a toast's id when it closes (spec "Toast" -> Events, `dismiss`), and how:
   *  `"button"`, `"escape"`, or `"timeout"`. */
  dismiss: [id: string, reason: 'button' | 'escape' | 'timeout'];
  /** Fires with a toast's id when its action is activated. */
  action: [id: string];
}>();

const { toasts, dismiss } = useToast();
const m = useMessages(() => props.messages);

const nonDanger = computed(() => toasts.value.filter((toast) => toast.variant !== 'danger'));
const danger = computed(() => toasts.value.filter((toast) => toast.variant === 'danger'));

/* ---------------------------------------------------------------------------------------------
 * Timers. One per toast with `duration > 0`, tracked here (never in the store — see `useToast`'s
 * own doc comment: it is SSR-safe and starts nothing on its own).
 * ------------------------------------------------------------------------------------------- */

interface TimerEntry {
  /** The exact item this timer belongs to — an *object identity* check, not just an id match, so
   *  a dedupe-replaced toast (`useToast`'s `show()` reusing an `id`) gets a fresh full-length
   *  timer rather than continuing whatever was left of the one it replaced. */
  item: ToastItem;
  /** Time left, in ms. Kept even while paused (`handle === null`) so resuming restarts for
   *  whatever was left rather than the full duration. */
  remaining: number;
  handle: ReturnType<typeof setTimeout> | null;
  /** When the current `handle` was armed, so pausing can compute how much of it already elapsed. */
  startedAt: number;
}

const timers = new Map<string, TimerEntry>();

/** Spec "Toast" -> Variants: "paused while hovered or focused" — tracked as two independent
 *  booleans (mouse and focus can each come and go on their own) rather than one flag, so leaving
 *  with the mouse while a close button still holds focus does not resume a toast a keyboard user
 *  is still reading. */
const hovering = ref(false);
const focusedWithin = ref(false);
const paused = computed(() => hovering.value || focusedWithin.value);

function clearTimer(id: string): void {
  const entry = timers.get(id);
  if (entry?.handle !== null && entry?.handle !== undefined) clearTimeout(entry.handle);
  timers.delete(id);
}

function expire(id: string): void {
  clearTimer(id);
  dismiss(id);
  emit('dismiss', id, 'timeout');
}

function startTimer(item: ToastItem): void {
  if (item.duration <= 0) return; // danger, or an explicit `duration: 0` — stays until closed.
  const handle = paused.value ? null : setTimeout(() => expire(item.id), item.duration);
  timers.set(item.id, { item, remaining: item.duration, handle, startedAt: Date.now() });
}

function pauseAll(): void {
  for (const entry of timers.values()) {
    if (entry.handle === null) continue;
    clearTimeout(entry.handle);
    entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
    entry.handle = null;
  }
}

function resumeAll(): void {
  for (const [id, entry] of timers) {
    if (entry.handle !== null || entry.remaining <= 0) continue;
    entry.startedAt = Date.now();
    entry.handle = setTimeout(() => expire(id), entry.remaining);
  }
}

watch(paused, (isPaused) => (isPaused ? pauseAll() : resumeAll()));

/** Starts a timer for every toast newly added to the queue, clears one for every toast that left
 *  it (by id), and restarts one for a toast that was dedupe-replaced in place (by object identity
 *  — see `TimerEntry.item`'s own comment). */
watch(
  toasts,
  (list) => {
    const currentIds = new Set(list.map((toast) => toast.id));
    for (const id of [...timers.keys()]) {
      if (!currentIds.has(id)) clearTimer(id);
    }
    for (const item of list) {
      if (timers.get(item.id)?.item !== item) {
        clearTimer(item.id);
        startTimer(item);
      }
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  for (const id of [...timers.keys()]) clearTimer(id);
});

/* ---------------------------------------------------------------------------------------------
 * Events from a Toast, and from hovering/focusing the stack.
 * ------------------------------------------------------------------------------------------- */

function onToastClose(id: string, reason: 'button' | 'escape'): void {
  clearTimer(id);
  dismiss(id);
  emit('dismiss', id, reason);
}

function onToastAction(id: string): void {
  emit('action', id);
}

function onFocusIn(): void {
  focusedWithin.value = true;
}

/** `focusout` fires when focus moves *within* the stack too (one toast's action to another's
 *  close button); only treat focus as having left when `relatedTarget` is outside this element. */
function onFocusOut(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (root !== null && related !== null && root.contains(related)) return;
  focusedWithin.value = false;
}

/* ---------------------------------------------------------------------------------------------
 * Classes.
 * ------------------------------------------------------------------------------------------- */

const rootClass = computed(() =>
  partClass(
    cx('fixed right-4 bottom-4 z-toast flex w-full flex-col gap-3 eldra-toast-width'),
    props.classes,
    'root'
  )
);

/** `list` collapses to `hidden` while empty rather than `flex flex-col gap-3` — not for the aria
 *  region itself (an empty `aria-live="polite"` region announces nothing regardless of its own
 *  `display`, and Vue applies the class change in the same patch that inserts a first toast's
 *  markup, so the region is already visible by the time any announcement fires), but so the outer
 *  `root`'s own `gap-3` does not insert a spare 0.75rem gap above a danger-only stack (`list`
 *  would otherwise still count as one empty flex item). */
const listClass = computed(() =>
  partClass(
    nonDanger.value.length > 0 ? 'flex w-full flex-col gap-3' : 'hidden',
    props.classes,
    'list'
  )
);
</script>

<template>
  <Teleport :to="TOAST_HOST_KEY ?? 'body'">
    <div
      data-part="root"
      :class="rootClass"
      @mouseenter="hovering = true"
      @mouseleave="hovering = false"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
    >
      <div
        data-part="list"
        role="status"
        aria-live="polite"
        :aria-label="m.notifications"
        :class="listClass"
      >
        <Toast
          v-for="item in nonDanger"
          :key="item.id"
          :variant="item.variant"
          :title="item.title"
          :text="item.text"
          :action="item.action"
          :messages="messages"
          @close="(reason) => onToastClose(item.id, reason)"
          @action="onToastAction(item.id)"
        />
      </div>
      <Toast
        v-for="item in danger"
        :key="item.id"
        :variant="item.variant"
        :title="item.title"
        :text="item.text"
        :action="item.action"
        :messages="messages"
        @close="(reason) => onToastClose(item.id, reason)"
        @action="onToastAction(item.id)"
      />
    </div>
  </Teleport>
</template>
