<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
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
  change: [value: string];
}>();

const m = useMessages();

/** See Input.vue for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

const controlId = useUiId('textarea', () => props.id ?? field?.value.id);
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
 * lines) is the growth algorithm's starting point regardless of `minHeight` — CSS `min-height`
 * already enforces the visible floor for a taller `minHeight`, so the fallback only needs a
 * reasonable rows to start counting up from — and 16rem is the max height, which at the control's
 * 1.5rem line and 0.5rem block padding is about 10 rows.
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
 * so typing further scrolls instead of growing the `rows` attribute without bound.
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

onMounted(growFallback);

/** Spec "Textarea" → Sizes and States, applied the same way Input.vue's BASE is. */
const BASE =
  'block w-full min-w-0 resize-y border bg-background text-text placeholder:text-muted ' +
  'rounded-[var(--eldra-textarea-radius,var(--eldra-radius-md))] py-2 px-2.75 ' +
  'text-control max-md:text-control-mobile ' +
  'min-h-[var(--eldra-textarea-min-height)] max-h-64 overflow-y-auto ' +
  'field-sizing-content eldra-focus eldra-focus-always';

const LIVE = 'border-border-strong hover:border-text focus:border-text';
const INVALID = 'border-danger hover:border-danger focus:border-danger';
const DISABLED = 'bg-surface-strong border-border border-dashed text-muted cursor-not-allowed';
const READONLY = 'bg-surface border-border text-text';

const rootClass = computed(() =>
  partClass(
    cx('relative block w-full', isInvalid.value && 'eldra-field-invalid'),
    props.classes,
    'root'
  )
);

const controlClass = computed(() =>
  partClass(
    cx(
      BASE,
      props.disabled ? DISABLED : props.readonly ? READONLY : LIVE,
      !props.disabled && !props.readonly && isInvalid.value && INVALID
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
/**
 * Spec "Textarea" → Behaviour & motion: the limit is announced, never every keystroke. The
 * counter's own `role="status"` region is `aria-live="polite"` only from 90% of the limit onward
 * (which covers both the 90% and the 100%-and-over case the spec names) and `"off"` below it, so
 * ordinary typing stays silent and only a value close to or past the limit is read out.
 */
const percent = computed(() =>
  props.maxLength && props.maxLength > 0 ? length.value / props.maxLength : 0
);
const liveMode = computed<'polite' | 'off'>(() =>
  showCounter.value && percent.value >= 0.9 ? 'polite' : 'off'
);

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

function onInput(event: Event): void {
  const el = event.target as HTMLTextAreaElement;
  model.value = el.value;
  growFallback();
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
      <span
        :id="counterId"
        data-part="counter"
        role="status"
        :aria-live="liveMode"
        :class="counterClass"
      >
        {{ m.counter(length, maxLength as number) }}
      </span>
    </div>
  </div>
</template>
