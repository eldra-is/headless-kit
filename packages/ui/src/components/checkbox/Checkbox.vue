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

const controlId = useUiId('checkbox', () => props.id ?? field?.value.id);
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
 * appearance"). The input itself is `sr-only` *inside* this element, which is what makes
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
const DISABLED = 'bg-surface-strong border-border border-dashed eldra-checkbox-border';
const DISABLED_CHECKED = 'bg-muted border-muted eldra-checkbox-border';

/**
 * A disabled box drops the danger boundary and keeps `aria-invalid` — the same reading as Input
 * and Textarea: the field is still invalid, it just cannot be corrected here, so it shows the dead
 * boundary rather than an actionable one.
 */
const boxState = computed(() => {
  if (props.disabled) return isMarked.value ? DISABLED_CHECKED : DISABLED;
  if (isInvalid.value) return INVALID;
  return isMarked.value ? CHECKED : UNCHECKED;
});

const rootClass = computed(() =>
  partClass(
    cx(ROOT, props.disabled ? 'cursor-not-allowed' : 'cursor-pointer'),
    props.classes,
    'root'
  )
);

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
  <label data-part="root" :class="rootClass">
    <span data-part="box" :class="boxClass">
      <!-- The native control, visually hidden but focusable and in the tab order: the label around
           it makes the whole row the click target, and the drawn box above is its appearance. -->
      <input
        ref="controlRef"
        v-bind="$attrs"
        class="sr-only"
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
      <!-- The mark, at 0.625rem: a tick 2 units thick on a 10-unit box is the spec's 2px stroke.
           Decorative — the checked state is the input's, which assistive technology reads. -->
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
        <path v-if="indeterminate" data-mark="dash" d="M0.75 5h8.5" />
        <path v-else data-mark="tick" d="M1 5.25l2.75 2.75l5.25 -5.25" />
      </svg>
    </span>

    <span data-part="label" :class="labelClass"><slot /></span>

    <span v-if="hasHint" data-part="hint" :class="hintClass">
      <slot name="hint">{{ hint }}</slot>
    </span>
  </label>
</template>
