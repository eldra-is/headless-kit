<script setup lang="ts">
/**
 * One toast (design spec "Toast", lines 4464-4587). Purely presentational — `Toaster` owns the
 * queue, the timers and where this renders; this component only draws the anatomy and reacts to
 * the two things a person can do to *this* toast: activate its action, or dismiss it (the close
 * button, or `Esc` while focus is inside it — a timeout is `Toaster`'s own doing, never this
 * component's).
 */
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/kitClass';
import type { ToastProps, ToastVariant } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<ToastProps>(), {
  variant: 'success',
  text: undefined,
  action: undefined,
  closable: true,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  /** Fires when the close button is clicked (`"button"`) or `Esc` is pressed while focus is
   *  inside this toast (`"escape"`) — spec "Toast" -> Events, `dismiss` (the third reason,
   *  `"timeout"`, is `Toaster`'s own timer expiring, never emitted here). */
  close: [reason: 'button' | 'escape'];
  /** Fires when the action (link or button) is activated, before `onActivate` (if any) runs. */
  action: [];
}>();

const m = useMessages(() => props.messages);

/**
 * Icons for the three variants (spec "Toast" -> Variants): "circle-check (or check)",
 * "alert-triangle", "alert-circle" — the same hand-drawn-path approach `StockBadge` uses (inline
 * SVG path data copied from `@tabler/icons-vue`, MIT licensed, rather than a runtime dependency).
 * `success`/`warning` are literally `StockBadge`'s own "in"/"low" paths (`IconCircleCheck`/
 * `IconAlertTriangle`); `danger` is `IconAlertCircle`, which `StockBadge` has no use for.
 */
const ICON_PATHS: Record<ToastVariant, string[]> = {
  success: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M9 12l2 2l4 -4'],
  info: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 9h.01', 'M11 12h1v4h1'],
  warning: [
    'M12 9v4',
    'M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0',
    'M12 16h.01',
  ],
  danger: ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M12 8v4', 'M12 16h.01'],
};

/** Matches `Dialog`'s close button and `Link`'s arrow/external icons, so a Toast's icons read at
 *  the same weight as the rest of the package rather than `StockBadge`'s own heavier 2.25. */
const ICON_STROKE_WIDTH = 1.75;

/** Spec "Toast" -> Sizes/Variants: "icon variant colour" — the icon has no fill of its own, it
 *  inherits `currentColor` from this. */
const VARIANT_TEXT_CLASS: Record<ToastVariant, string> = {
  success: 'eldra:text-success',
  info: 'eldra:text-text',
  warning: 'eldra:text-warning',
  danger: 'eldra:text-danger',
};

const actionHref = computed<string | undefined>(() =>
  props.action !== undefined && 'href' in props.action ? props.action.href : undefined
);
const hasButtonAction = computed(() => props.action !== undefined && 'onActivate' in props.action);

function onActionClick(): void {
  emit('action');
  if (props.action !== undefined && 'onActivate' in props.action) props.action.onActivate();
}

function onClose(): void {
  emit('close', 'button');
}

/**
 * Spec "Toast" -> Keyboard: "`Esc` closes the toast that holds focus." `preventDefault()` matters
 * here beyond the obvious: while this toast is teleported inside an open `Dialog` (`TOAST_HOST_KEY`,
 * shared modal rules), focus is physically inside that native `<dialog>`, and the platform's own
 * Escape-closes-the-topmost-dialog behaviour would otherwise fire *as well* — closing the dialog
 * behind this toast, not just the toast. Calling `preventDefault()` on the `keydown` suppresses
 * that native "close request" (HTML's own dialog-cancel algorithm reads the event's default-
 * prevented state before queuing `cancel`), so only this toast closes, matching the spec's own
 * "closes the toast that holds focus" — not the dialog underneath it.
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.closable) return;
  event.preventDefault();
  emit('close', 'escape');
}

const rootClass = computed(() =>
  partClass(
    cx(
      'eldra:flex eldra:w-full eldra:items-start eldra:gap-3 eldra:rounded-md eldra:border eldra:border-border eldra:bg-background eldra:p-4 eldra:shadow-md',
      'eldra:animate-eldra-toast-in'
    ),
    props.classes,
    'root'
  )
);
const iconClass = computed(() =>
  partClass(
    cx('eldra:mt-0.5 eldra:size-5 eldra:shrink-0', VARIANT_TEXT_CLASS[props.variant]),
    props.classes,
    'icon'
  )
);
const titleClass = computed(() =>
  partClass('eldra:text-toast-title eldra:text-text', props.classes, 'title')
);
const textClass = computed(() =>
  partClass('eldra:mt-0.5 eldra:text-body-sm eldra:text-muted', props.classes, 'text')
);
const actionClass = computed(() =>
  partClass(
    cx(
      'eldra:target-min eldra:mt-1 eldra:inline-flex eldra:cursor-pointer eldra:items-center eldra:text-body-sm eldra:font-semibold',
      'eldra:text-text eldra:underline eldra:decoration-1 eldra:underline-offset-[0.2em] eldra:eldra-focus'
    ),
    props.classes,
    'action'
  )
);
/**
 * Spec "Toast" -> Sizes, "Close" row: "2rem square ghost icon button, pulled 0.375rem up and
 * right into the padding." Same recipe as `Dialog`'s own close button (`-m-1` there, for its
 * 1.5rem-padding header) scaled to this toast's 1rem padding: negative top/right margins pull the
 * button toward the corner without changing the root's own `p-4`.
 */
const closeClass = computed(() =>
  partClass(
    cx(
      'eldra:-mt-1.5 eldra:-mr-1.5 eldra:inline-flex eldra:size-8 eldra:shrink-0 eldra:cursor-pointer eldra:items-center eldra:justify-center eldra:rounded-sm',
      'eldra:text-text eldra:eldra-focus',
      'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]',
      'eldra:active:scale-[0.98] eldra:active:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_89%)]'
    ),
    props.classes,
    'close'
  )
);
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :data-variant="variant"
    :class="rootClass"
    :role="variant === 'danger' ? 'alert' : undefined"
    @keydown="onKeydown"
  >
    <svg
      data-part="icon"
      :class="iconClass"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      :stroke-width="ICON_STROKE_WIDTH"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path v-for="d in ICON_PATHS[variant]" :key="d" :d="d" />
    </svg>
    <div class="eldra:min-w-0 eldra:flex-1">
      <p data-part="title" :class="titleClass">{{ title }}</p>
      <p v-if="text" data-part="text" :class="textClass">{{ text }}</p>
      <a
        v-if="actionHref !== undefined"
        data-part="action"
        :class="actionClass"
        :href="actionHref"
        @click="onActionClick"
        >{{ action?.label }}</a
      >
      <button
        v-else-if="hasButtonAction"
        type="button"
        data-part="action"
        :class="actionClass"
        @click="onActionClick"
      >
        {{ action?.label }}
      </button>
    </div>
    <button
      v-if="closable"
      type="button"
      data-part="close"
      :class="closeClass"
      :aria-label="m.dismissNotification"
      @click="onClose"
    >
      <!-- Tabler's `x`, matching Dialog's own close icon exactly. -->
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
</template>
