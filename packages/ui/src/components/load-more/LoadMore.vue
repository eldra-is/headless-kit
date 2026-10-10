<script setup lang="ts">
import { computed } from 'vue';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import Spinner from '../spinner/Spinner.vue';
import type { LoadMoreProps } from './types';

const props = withDefaults(defineProps<LoadMoreProps>(), {
  noun: 'products',
  pending: false,
  classes: undefined,
});

const emit = defineEmits<{ load: [] }>();

const m = useMessages();

const statusId = useUiId('load-more-status');

/** Spec "Pagination" → Properties, Load more, `total` row: "The button hides when `shown` equals
 *  `total`." `<=` also covers a caller passing `shown` past `total`, defensively. */
const showButton = computed(() => props.shown < props.total);

/** Clamped so a caller's transient `shown > total` (a batch that overshot) or `total: 0` (nothing
 *  to show yet) never draws a meter past full or divides by zero. */
const meterPercent = computed(() => {
  if (props.total <= 0) return 0;
  return Math.min(100, Math.max(0, (props.shown / props.total) * 100));
});

/** Spec → Sizes, "Load-more stack": "centred, gap 0.75rem." */
const rootClass = computed(() =>
  partClass('flex flex-col items-center gap-3', props.classes, 'root')
);

/** Spec → Sizes, "Load-more status": "0.875rem, tabular numbers" — the shared `text-body-sm` type
 *  style is the same 0.875rem, so this needs no per-component variable of its own. Accessibility:
 *  "the status `<p aria-live="polite">`." */
const statusClass = computed(() =>
  partClass('text-body-sm text-muted tabular-nums text-center', props.classes, 'status')
);

/** Spec → Sizes, "Load-more meter": "`min(14rem, 100%)` × 0.25rem, `radius-full`." `max-w-56` is
 *  the 14rem the spec gives (56 × the shared 0.25rem spacing unit), paired with `w-full` for the
 *  "100%" half of the `min()` on a narrower container. States: "track `surface-strong` … fill
 *  `text`." Accessibility: "the meter is `aria-hidden`." */
const meterTrackClass = 'h-1 w-full max-w-56 overflow-hidden rounded-full bg-surface-strong';
const meterFillClass =
  'h-full rounded-full bg-text transition-[width] duration-base ease-out motion-reduce:transition-none';

/**
 * Spec → Sizes: "Load more button: outline button" — the same recipe `Button`'s own `outline`
 * variant draws (`control-h`, `text-button-md`, the `eldra-focus` ring, the 98%-scale press), hand
 * rolled rather than composing `<Button>` because this part needs its own literal `data-part`
 * (`button`, per the task's controller decision) and `Button`'s root hard-codes `data-part="container"`
 * with no way to override it — the same reason `Drawer`'s own close button is hand-rolled instead
 * of a wrapped `<Button icon-only>` (see that component's own comment).
 */
const buttonClass = computed(() =>
  partClass(
    cx(
      'relative inline-flex items-center justify-center control-h gap-2 rounded-md border px-4.5',
      'border-border-strong bg-background text-text text-button-md font-medium cursor-pointer',
      'eldra-focus hover:border-text hover:bg-surface',
      'active:scale-[0.98] motion-reduce:active:scale-100'
    ),
    props.classes,
    'button'
  )
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <p :id="statusId" data-part="status" :class="statusClass" role="status" aria-live="polite">
      {{ m.showingOf(shown, total, noun) }}
    </p>

    <div :class="meterTrackClass" aria-hidden="true">
      <div :class="meterFillClass" :style="{ width: `${meterPercent}%` }" />
    </div>

    <button
      v-if="showButton"
      type="button"
      data-part="button"
      :class="buttonClass"
      :aria-describedby="statusId"
      :aria-busy="pending ? 'true' : undefined"
      @click="emit('load')"
    >
      <!-- Same spinner circle Button draws, from the same `Spinner.vue`: 1.125rem, 2px stroke,
           one turn every 700ms; with reduced motion it pulses 60–100% opacity instead. -->
      <Spinner v-if="pending" class="size-4.5" />
      <span>{{ m.loadMore }}</span>
    </button>
  </div>
</template>
