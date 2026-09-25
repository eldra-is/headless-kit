<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import { supportsFieldSizing } from './supportsFieldSizing';
import type { TextareaProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<TextareaProps>(), {
  modelValue: undefined,
  placeholder: undefined,
  maxLength: undefined,
  counter: false,
  hardLimit: false,
  minHeight: '5rem',
  invalid: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  id: undefined,
  name: undefined,
  describedBy: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Textarea" → Events: "`input`: fires with the new value on every keystroke." */
  input: [value: string];
  change: [value: string];
}>();

const m = useMessages();

/** See Input.vue for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

/**
 * The id. Taken from the field context only when that context comes from a wrapper that labels its
 * control with a `<label for>`: a `group` wrapper puts that same id on its own `<fieldset>`, so a
 * control inside one that adopted it would put a single id on two elements.
 */
const controlId = useUiId(
  'textarea',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const baseDescribedBy = computed(() => props.describedBy ?? field?.value.describedBy);
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);
const counterId = useUiId('textarea-counter');

const controlRef = ref<HTMLTextAreaElement | null>(null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');

/**
 * Spec "Textarea" → Sizes: 5rem `minHeight` by default, blocks may raise it. The value is never a
 * literal utility — it becomes a CSS variable a class reads (`min-h-[var(--eldra-textarea-min-
 * height)]`), so the box always sizes to whatever the prop says, in rem, with no px anywhere.
 */
const controlStyle = computed(() => ({ '--eldra-textarea-min-height': props.minHeight }));

/**
 * Spec "Textarea" → Variants, Auto-grow: `field-sizing: content` where supported, with a fallback
 * measured on input where it is not. The three numbers below match the spec's own: 5rem (about 3
 * lines) is the growth algorithm's starting point, and 16rem is the max height, which at the
 * control's 1.5rem line and 0.5rem block padding is about 10 rows.
 *
 * (Q3, cosmetic, documented rather than solved) `MIN_ROWS` does not adapt to a smaller `minHeight`.
 * CSS `min-height` only ever raises a box that would otherwise be shorter — it cannot shrink one
 * that is already taller — so a `minHeight` set below about 3 lines (the `HardLimit` story's
 * `min-height="3rem"`, for instance) renders at the `MIN_ROWS`-implied ~5.6rem in a runtime without
 * `field-sizing` support, not at its own smaller floor, until the box has reason to grow past it
 * anyway. Every runtime this package tests against (and every runtime the spec's browser support
 * line covers) has `field-sizing: content`, where this fallback never runs at all. Computing an
 * accurate floor would mean reverse-engineering padding and line-height back out of an arbitrary
 * `rem` string passed as a prop; not attempted here.
 */
const MIN_ROWS = 3;
const MAX_ROWS = 10;

const fieldSizingSupported = supportsFieldSizing();

/** `undefined` when `field-sizing` is supported: the browser grows the box, `rows` is untouched. */
const rowsFallback = ref<number | undefined>(fieldSizingSupported ? undefined : MIN_ROWS);

/**
 * The measured fallback (spec "Textarea" → Variants): "Elsewhere, set the height to the scroll
 * height on input, clamped to 16rem." `rows` is what is actually adjustable on a native
 * `<textarea>`, so growth is done by increasing it until the content fits, capped at `MAX_ROWS` —
 * `max-h-64` (16rem) plus `overflow-y-auto` on the control is the safety net once that cap is hit,
 * so typing further scrolls instead of growing the `rows` attribute without bound. Resetting to
 * `MIN_ROWS` on every call, rather than only ever growing, is also what shrinks the box back down
 * once its content is cleared or trimmed.
 */
function growFallback(): void {
  if (fieldSizingSupported) return;
  const el = controlRef.value;
  if (!el) return;
  // Tracked as a local number rather than read back from `el.rows` on every iteration: the DOM
  // property is only guaranteed to round-trip a number by the HTML spec, not by every runtime.
  let rows = MIN_ROWS;
  el.rows = rows;
  while (el.scrollHeight > el.clientHeight && rows < MAX_ROWS) {
    rows += 1;
    el.rows = rows;
  }
  rowsFallback.value = rows;
}

/**
 * Re-measures on mount (`immediate`), on every keystroke and on a programmatic `v-model` change
 * alike — all three are exactly "the value changed" — rather than calling `growFallback` by hand
 * from each site. `flush: 'post'` so the control's own `value` has already been patched onto the
 * DOM (and `controlRef` is attached) by the time `scrollHeight` is read.
 */
watch(() => model.value, growFallback, { flush: 'post', immediate: true });

/** Spec "Textarea" → Sizes and States, applied the same way Input.vue's BASE is. */
const BASE =
  'block w-full min-w-0 resize-y eldra-field-border bg-background text-text placeholder:text-muted ' +
  'rounded-[var(--eldra-textarea-radius,var(--eldra-radius-md))] py-2 px-2.75 ' +
  'text-control max-md:text-control-mobile ' +
  'min-h-[var(--eldra-textarea-min-height)] max-h-64 overflow-y-auto ' +
  'field-sizing-content eldra-focus eldra-focus-always';

const LIVE = 'border-border-strong hover:border-text focus:border-text';
const INVALID = 'border-danger hover:border-danger focus:border-danger';
const DISABLED = 'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
const READONLY = 'bg-surface border-border text-text';

/** See Input.vue: the danger boundary drops on a disabled field and stays on a read-only one. */
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

/**
 * `eldra-field-invalid` draws its inset line at the *field's* radius, which it reads from
 * `--eldra-field-radius` (falling back to the Input's own `--eldra-input-radius`, then to
 * `radius-md`). A Textarea rounds by `--eldra-textarea-radius`, so it points the line's radius at
 * that one here rather than letting the line and the border round differently.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'relative block w-full [--eldra-field-radius:var(--eldra-textarea-radius,var(--eldra-radius-md))]',
      showsInvalid.value && 'eldra-field-invalid'
    ),
    props.classes,
    'root'
  )
);

const controlClass = computed(() =>
  partClass(
    cx(
      BASE,
      props.disabled ? DISABLED : props.readonly ? READONLY : LIVE,
      showsInvalid.value && INVALID
    ),
    props.classes,
    'control'
  )
);

/** Spec "Textarea" → Properties, `counter`: shows only once there is something to count against. */
const showCounter = computed(() => props.counter && props.maxLength !== undefined);

/**
 * Spec "Textarea" → Acceptance criteria: "The counter shows 'n / max' … [and] is in
 * `aria-describedby`." The counter is Textarea's own part (not the `FieldWrapper`'s), so it wires
 * itself in rather than waiting on a caller to remember to.
 */
const describedBy = computed(() => {
  const ids = [baseDescribedBy.value, showCounter.value ? counterId.value : undefined].filter(
    (id): id is string => Boolean(id)
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
});

const length = computed(() => model.value.length);
/** Spec "Textarea" → States, Error row: "counter `danger` weight 600" once past the limit. */
const isOverLimit = computed(() => props.maxLength !== undefined && length.value > props.maxLength);

const footClass = computed(() =>
  partClass('mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1', props.classes, 'foot')
);

const counterClass = computed(() =>
  partClass(
    cx(
      'text-counter ms-auto shrink-0 tabular-nums whitespace-nowrap',
      isOverLimit.value ? 'text-danger font-semibold' : 'text-muted font-normal'
    ),
    props.classes,
    'counter'
  )
);

/**
 * Spec "Textarea" → Behaviour & motion: "one polite, visually hidden live region announces once
 * when the count reaches 80% of the limit ('20 characters left') and once when the limit is passed
 * ('Over the limit by 3'). It never announces every keystroke." And → Accessibility: "The counter
 * itself has **no** `aria-live`."
 *
 * So the counter span (above) carries neither `role` nor `aria-live`; a separate `VisuallyHidden`
 * region owns both, always rendered while `showCounter` is true (never toggled by the threshold
 * itself) so the region already exists in the DOM before its text ever changes — a live region a
 * screen reader discovers only when it already has new content is not reliably announced.
 *
 * The three zones below name the *crossings* the spec asks for. `announcement` is written only on
 * a zone change: entering `near` (from anywhere) announces the remaining count *at that instant*
 * (typing further within the same zone does not re-announce, matching "never announces every
 * keystroke" — the exact figure spoken is a snapshot of the crossing, not a live counter);
 * entering `over` announces the overage; returning to `below` clears the region's text, so
 * crossing back into `near` or `over` later announces again (content genuinely changes from `''`
 * rather than being set to the same string twice, which some screen readers would not re-speak).
 */
type LimitZone = 'below' | 'near' | 'over';
const limitZone = computed<LimitZone>(() => {
  if (!showCounter.value || props.maxLength === undefined) return 'below';
  if (length.value > props.maxLength) return 'over';
  if (length.value / props.maxLength >= 0.8) return 'near';
  return 'below';
});

const limitAnnouncement = ref('');

watch(limitZone, (zone) => {
  const max = props.maxLength as number;
  if (zone === 'over') {
    limitAnnouncement.value = m.value.overLimit(length.value - max);
  } else if (zone === 'near') {
    limitAnnouncement.value = m.value.charactersLeft(max - length.value);
  } else {
    limitAnnouncement.value = '';
  }
});

function onInput(event: Event): void {
  const el = event.target as HTMLTextAreaElement;
  model.value = el.value;
  emit('input', el.value);
}

/** Spec "Textarea" → Events: "`change`: fires with the committed value." */
function onChange(event: Event): void {
  emit('change', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div data-part="root" :class="rootClass">
    <textarea
      ref="controlRef"
      v-bind="$attrs"
      data-part="control"
      :class="controlClass"
      :style="controlStyle"
      :id="controlId"
      :name="name"
      :value="model"
      :rows="rowsFallback"
      :placeholder="placeholder"
      :maxlength="hardLimit ? maxLength : undefined"
      :required="isRequired || undefined"
      :readonly="readonly || undefined"
      :disabled="disabled || undefined"
      :aria-invalid="isInvalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @change="onChange"
    ></textarea>

    <div v-if="showCounter" data-part="foot" :class="footClass">
      <span :id="counterId" data-part="counter" :class="counterClass">
        {{ m.counter(length, maxLength as number) }}
      </span>
      <VisuallyHidden as="p" role="status" aria-live="polite">{{
        limitAnnouncement
      }}</VisuallyHidden>
    </div>
  </div>
</template>
