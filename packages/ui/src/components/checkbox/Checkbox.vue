<script setup lang="ts">
import { computed, inject, ref, useSlots, watchPostEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import type { CheckboxProps, CheckboxSize } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<CheckboxProps>(), {
  modelValue: undefined,
  indeterminate: false,
  value: undefined,
  name: undefined,
  size: 'md',
  hint: undefined,
  // Undefined, not false: these three fall back to the field wrapper's context, where `false`
  // would be an answer rather than "no opinion" (see Input.vue).
  invalid: undefined,
  required: undefined,
  disabled: false,
  controls: undefined,
  id: undefined,
  describedBy: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [checked: boolean];
  /** Spec "Checkbox" → Events: "`change`: fires with the new `checked` boolean." */
  change: [checked: boolean];
}>();

const slots = useSlots();

/** See Input.vue for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

/**
 * Whether a `FieldWrapper` around this box already names it with a `<label for>` (see
 * `FieldContext.labelsControl`). Only when the box has no `id` of its own: with one, the wrapper's
 * `for` points somewhere else and cannot reach this control, so the box keeps its own label.
 *
 * It decides the root element. A `Checkbox` is normally a `<label>`, which is what makes the whole
 * row — box, text and hint — the click target. When it is already labelled from outside, a second
 * `<label>` would give one control two of them (`form-field-multiple-labels`) and an accessible
 * name assembled out of both, so the root is a plain `<span>` instead. The drawn box stays
 * clickable either way, because the control itself covers it (see `CONTROL` below).
 */
const isNamedByField = computed(
  () => props.id === undefined && field?.value.labelsControl === true
);

/**
 * The id. Taken from the field context only when that context comes from a wrapper that labels its
 * control: a `group` wrapper puts that same id on its own `<fieldset>`, so a control inside it that
 * adopted it would put one id on two elements.
 */
const controlId = useUiId(
  'checkbox',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const describedBy = computed(() => props.describedBy ?? field?.value.describedBy);
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);

const controlRef = ref<HTMLInputElement | null>(null);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<boolean>(props, emit, () => false);

/**
 * Writes the two states the DOM owns but Vue's template bindings cannot keep honest.
 *
 * `indeterminate` (spec "Checkbox" → Accessibility: "Indeterminate is exposed as 'mixed' (native
 * `indeterminate`)") is a *property*, not an attribute, so there is nothing for a binding to set.
 *
 * `checked` needs re-asserting because activating a checkbox changes the element before any
 * event is dispatched: a controlled parent that refuses the change leaves `modelValue` exactly as
 * it was, Vue's own bound value therefore never changes, and Vue patches nothing — so the box
 * would stay visibly ticked against a model that says it is not. Writing the model back onto the
 * element is what makes "the parent is the single source of truth" true for a native control.
 *
 * `watchPostEffect` tracks both and runs after every render the mounted component does, so a
 * change from any direction lands; `onChange` calls it directly as well, for the case where
 * nothing Vue can see has changed at all. (Activating a box also clears `indeterminate` in the
 * browser, which is the other half of that case: the caller recomputes an indeterminate parent
 * from its children *after* the change, exactly as the spec's Behaviour section describes.)
 */
function syncElement(): void {
  const el = controlRef.value;
  if (!el) return;
  el.checked = model.value;
  el.indeterminate = props.indeterminate;
}
watchPostEffect(syncElement);

/** The two states that fill the box and show a mark (spec "Checkbox" → States). */
const isMarked = computed(() => props.indeterminate || model.value);

const hasHint = computed(() => props.hint !== undefined || slots.hint !== undefined);

/**
 * Spec "Checkbox" → Anatomy and Sizes. The row is a two-column grid rather than a flex row: the
 * box takes column 1, the label text column 2, and the hint sits in column 2 of the next row, so
 * it lines up under the label exactly as the anatomy draws it — with no wrapper element around
 * the two of them that would be neither a part nor invisible to layout.
 *
 * `target-min` is the spec's own note against the row's 1.5rem minimum height ("The whole label is
 * the target, so even a one-word option is at least 1.5rem tall"), which is WCAG 2.5.8.
 * `gap-x-2.5` is the 0.625rem box-to-text gap, `gap-y-0.5` the hint's own line spacing.
 */
const ROOT =
  'group grid w-fit max-w-full grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0.5 target-min';

/**
 * Spec "Checkbox" → Sizes: box 1.125rem "nudged 0.1875rem down to align with the first text line"
 * at md, 1.5rem "top-aligned" at lg. `--spacing` is 0.25rem, so `size-4.5` is 1.125rem, `size-6`
 * is 1.5rem and `mt-0.75` is the 0.1875rem nudge. A 1.5rem box on a 1.5rem line needs none.
 */
const BOX_SIZE: Record<CheckboxSize, string> = { md: 'size-4.5 mt-0.75', lg: 'size-6' };

/**
 * The drawn box (spec "Checkbox" → Anatomy: "a native `<input type="checkbox">` with custom
 * appearance"). The input itself is invisible *inside* this element, which is what makes
 * `eldra-focus-proxy` — `:has(:focus-visible)` — draw the one focus ring around the shape a
 * keyboard user can actually see. That is the focus-ring foundation's "Proxy focus" rule.
 *
 * There is deliberately no `transition-*`/`duration-*` utility here: `eldra-focus` owns this
 * element's transition list, including the `duration-fast` background and border-colour fade the
 * spec's Behaviour section asks for. See `src/styles/tailwind.css`.
 */
const BOX =
  'relative inline-flex shrink-0 items-center justify-center ' +
  'rounded-[var(--eldra-checkbox-radius,var(--eldra-radius-sm))] eldra-focus eldra-focus-proxy';

/**
 * States (spec "Checkbox" → States). Driven from the component's own state rather than from CSS
 * `:checked`/`:indeterminate` variants, for the reason Input.vue gives: a dead or invalid box must
 * not be able to win its live colours back through a variant that happens to be generated later in
 * the stylesheet. Only `:hover` — which nothing here can express in JavaScript — is a variant, and
 * it is written only into the two states that have a hover.
 */
const UNCHECKED =
  'bg-background border-border-strong group-hover:border-text eldra-checkbox-border';
const CHECKED = 'bg-primary border-primary eldra-checkbox-border';
/** Spec "Checkbox" → States, Error: `background` fill and a **2px** `danger` border. */
const INVALID =
  'bg-background border-danger group-hover:border-danger eldra-checkbox-border-invalid';
/**
 * The error row of the spec's States table describes an *unchecked* box — that is the required
 * consent it is written for. A box that is checked or indeterminate keeps its `primary` fill and
 * tells the error by the 2px `danger` boundary alone: the mark is `primary-contrast`, so a
 * `background` fill would draw it in the page's own colour and the tick would simply disappear.
 * "Checked differs by fill and tick shape, not only colour" (Accessibility) has to stay true in
 * every state, error included.
 */
const INVALID_MARKED =
  'bg-primary border-danger group-hover:border-danger eldra-checkbox-border-invalid';
const DISABLED = 'bg-surface-strong border-border border-dashed eldra-checkbox-border';
const DISABLED_CHECKED = 'bg-muted border-muted eldra-checkbox-border';

/**
 * A disabled box drops the danger boundary and keeps `aria-invalid` — the same reading as Input
 * and Textarea: the field is still invalid, it just cannot be corrected here, so it shows the dead
 * boundary rather than an actionable one.
 */
const boxState = computed(() => {
  if (props.disabled) return isMarked.value ? DISABLED_CHECKED : DISABLED;
  if (isMarked.value) return isInvalid.value ? INVALID_MARKED : CHECKED;
  return isInvalid.value ? INVALID : UNCHECKED;
});

const rootClass = computed(() =>
  partClass(
    cx(ROOT, props.disabled ? 'cursor-not-allowed' : 'cursor-pointer'),
    props.classes,
    'root'
  )
);

/**
 * The control itself, stretched over the drawn box rather than `sr-only` in a corner of it.
 *
 * It is still a real `<input type="checkbox">`, and `opacity: 0` hides it from sight exactly as
 * `sr-only` did; being inside the box is what lets `eldra-focus-proxy` (`:has(:focus-visible)`)
 * draw the ring on the shape a keyboard user can see. The difference is that it stays
 * **hit-testable**. A 1px clipped input is not, so the drawn box used to be clickable only through
 * the `<label>` around it — and a box named by a `FieldWrapper` has no label of its own to click
 * through. Covering the box with the control makes the box the target in both arrangements, and a
 * click on it is a click on the control rather than a label forwarding one.
 */
const CONTROL =
  'absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 ' +
  'disabled:cursor-not-allowed';

const boxClass = computed(() =>
  partClass(cx(BOX, BOX_SIZE[props.size], boxState.value), props.classes, 'box')
);

/**
 * The mark (spec "Checkbox" → Behaviour & motion): "The tick scales in from 0 over `duration-fast`
 * with `ease-out`. … With reduced motion the tick simply appears." Reduced motion needs no class:
 * `tokens.css` zeroes `--eldra-duration-fast` under `prefers-reduced-motion`, which is what
 * `duration-fast` reads.
 *
 * The mark is one part with two shapes, so a disabled *checked* box keeps its tick (spec's States
 * table) while an empty one has nothing to show.
 */
const checkClass = computed(() =>
  partClass(
    cx(
      'pointer-events-none size-2.5 text-primary-contrast transition-transform duration-fast ease-out',
      isMarked.value ? 'scale-100' : 'scale-0'
    ),
    props.classes,
    'check'
  )
);

/**
 * Spec "Checkbox" → Sizes: label 0.9375rem on a 1.5rem line — the same two numbers as the
 * compact-control type, so it is the same utility rather than a second one that would drift from
 * it. (Not the mobile 1rem override: that rule is scoped to "inputs, textareas, select triggers
 * and select search fields", where it stops iOS zooming into a focused field.)
 */
const labelClass = computed(() =>
  partClass(
    cx('text-control min-w-0', props.disabled ? 'text-muted' : 'text-text'),
    props.classes,
    'label'
  )
);

/** Spec "Checkbox" → Sizes: "Hint: 0.875rem, `muted`, on its own line", in column 2 under it. */
const hintClass = computed(() =>
  partClass('text-body-sm text-muted col-start-2 min-w-0', props.classes, 'hint')
);

function onChange(event: Event): void {
  const el = event.target as HTMLInputElement;
  model.value = el.checked;
  emit('change', el.checked);
  syncElement();
}
</script>

<template>
  <component :is="isNamedByField ? 'span' : 'label'" data-part="root" :class="rootClass">
    <span data-part="box" :class="boxClass">
      <!-- The native control, invisible but focusable, in the tab order and over the drawn box,
           which is its appearance. -->
      <input
        ref="controlRef"
        v-bind="$attrs"
        :class="CONTROL"
        type="checkbox"
        :id="controlId"
        :name="name"
        :value="value"
        :checked="model"
        :required="isRequired || undefined"
        :disabled="disabled || undefined"
        :aria-invalid="isInvalid ? 'true' : undefined"
        :aria-describedby="describedBy"
        :aria-controls="controls"
        :aria-checked="indeterminate ? 'mixed' : undefined"
        @change="onChange"
      />
      <!-- The mark (spec "Checkbox" → Sizes): "tick 0.3125 × 0.625rem, 2px stroke; dash 0.625rem
           wide, 2px". The box is 0.625rem across and the viewBox 10 units, so one unit is one
           pixel of the mark at its drawn size: `stroke-width="2"` is the spec's 2px, and the ink —
           the centreline plus a 1-unit round cap each side — measures 10 × 5 units for the tick
           (0.625 × 0.3125rem) and 10 × 2 for the dash. The tick is therefore twice as wide as it
           is tall, which is the spec's own ratio, not a steeper one. Decorative: the checked state
           is the input's, which assistive technology reads. -->
      <svg
        data-part="check"
        :class="checkClass"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path v-if="indeterminate" data-mark="dash" d="M1 5h8" />
        <path v-else data-mark="tick" d="M1 4.75l2 1.75l6 -3" />
      </svg>
    </span>

    <span data-part="label" :class="labelClass"><slot /></span>

    <span v-if="hasHint" data-part="hint" :class="hintClass">
      <slot name="hint">{{ hint }}</slot>
    </span>
  </component>
</template>
