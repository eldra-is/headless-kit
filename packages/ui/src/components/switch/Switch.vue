<script setup lang="ts">
import { computed, inject, useSlots } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import type { SwitchProps, SwitchSize } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SwitchProps>(), {
  modelValue: undefined,
  size: 'md',
  description: undefined,
  disabled: false,
  id: undefined,
  name: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [checked: boolean];
  /** Spec "Switch" → Events: "`change`: fires with the new boolean after each toggle." */
  change: [checked: boolean];
}>();

const slots = useSlots();

/** See Checkbox.vue for the field-context rationale: any explicit prop wins over the wrapper. */
const field = inject(FIELD_KEY, null);

/**
 * Whether a `FieldWrapper` around this switch already names it with a `<label for>` (see
 * `FieldContext.labelsControl`). Only when the switch has no `id` of its own: with one, the
 * wrapper's `for` points somewhere else and cannot reach this control.
 *
 * Not part of the design spec (which never discusses a Switch inside a field wrapper) — added per
 * task instruction, mirroring `Checkbox`'s own `isNamedByField`. Unlike `Checkbox`, dropping the
 * label here does not change the root element: the root is always the `<button>` itself, so there
 * is nothing to swap tags on, only the inner label `<span>` to skip so its text is not rendered
 * twice (once by the wrapper's `<label for>`, once by the switch's own content).
 */
const isNamedByField = computed(
  () => props.id === undefined && field?.value.labelsControl === true
);

/** The id. Taken from the field context only when that context labels its control (see above). */
const controlId = useUiId(
  'switch',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);

const descriptionId = computed(() => `${controlId.value}-description`);
const hasDescription = computed(
  () => props.description !== undefined || slots.description !== undefined
);

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<boolean>(props, emit, () => false);

function toggle(): void {
  // A native <button disabled> never fires click, so no guard is needed here — unlike Button.vue,
  // which also has to cover a disabled <a href>.
  const next = !model.value;
  model.value = next;
  emit('change', next);
}

/**
 * The button (spec "Switch" → Anatomy): "a transparent container holding the track and the
 * label." It is the one focusable element — real `<button type="button" role="switch">`, so
 * `Space`/`Enter` toggle for free and no key handler exists in this component — and the standard
 * focus ring sits directly on it, at the spec's own `radius-sm` corner ("Its focus-ring corner
 * radius is `radius-sm`").
 *
 * A two-column grid, exactly `Checkbox`'s own layout: track in column 1, label in column 2 row 1,
 * description in column 2 row 2 — which is what makes the track "align to the top of the label"
 * (spec's Sizes note) for free, without a conditional `items-start`/`items-center` switch: a
 * single-row grid centres the track against the one label line, and a second row for the
 * description leaves the track exactly where it was, at the top.
 *
 * There is deliberately no `transition-*`/`duration-*` utility here: `eldra-focus` owns this
 * element's transition list. See `src/styles/tailwind.css` and
 * `src/__tests__/focus-transition.spec.ts`.
 */
const ROOT =
  'group grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-0.5 w-fit max-w-full target-min ' +
  'rounded-sm border-0 bg-transparent p-0 text-start eldra-focus';

const rootClass = computed(() =>
  partClass(
    cx(ROOT, props.disabled ? 'cursor-not-allowed' : 'cursor-pointer'),
    props.classes,
    'root'
  )
);

/**
 * The track (spec "Switch" → Anatomy: "a pill with a 1.5px border"; → Sizes: 2.75 × 1.5rem at
 * `md`, 2.25 × 1.25rem at `sm`, both `radius-full`). `--spacing` is 0.25rem, so every dimension
 * here is a whole multiple of it (`w-11`/`h-6`, `w-9`/`h-5`) and needs no per-component variable;
 * the 1.5px border does, because no spacing step is that fine — `eldra-switch-track-border`.
 *
 * Spec "Switch" → Behaviour & motion: "The thumb slides *and the track fills* over `duration-fast`
 * with `ease-out`." The track is a separate element from the button that carries `eldra-focus`, so
 * — exactly like the thumb below, and Link's arrow — it may carry its own transition.
 */
const TRACK_BASE =
  'relative inline-flex shrink-0 rounded-[var(--eldra-switch-radius,var(--eldra-radius-full))] ' +
  'eldra-switch-track-border transition-colors duration-fast ease-out motion-reduce:transition-none';
const TRACK_SIZE: Record<SwitchSize, string> = { md: 'w-11 h-6', sm: 'w-9 h-5' };

/** Spec "Switch" → States. Only `:hover` (nothing here can express it in JavaScript) is a variant. */
const TRACK_OFF = 'bg-background border-border-strong group-hover:border-text';
const TRACK_ON =
  'bg-primary border-primary ' +
  'group-hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]';
const TRACK_DISABLED_OFF = 'bg-surface-strong border-border-strong border-dashed';
const TRACK_DISABLED_ON = 'bg-muted border-muted';

const trackState = computed(() => {
  if (props.disabled) return model.value ? TRACK_DISABLED_ON : TRACK_DISABLED_OFF;
  return model.value ? TRACK_ON : TRACK_OFF;
});

const trackClass = computed(() =>
  partClass(cx(TRACK_BASE, TRACK_SIZE[props.size], trackState.value), props.classes, 'track')
);

/**
 * The thumb (spec "Switch" → Anatomy: "a circle, with a check icon when on"; → Sizes: 1rem at
 * `md`, 0.75rem at `sm`, resting 0.1875rem from the track's start edge, travelling 1.25rem/1rem to
 * the end). Positioned once via `eldra-switch-thumb-offset` (a logical inset, so it reads
 * correctly in an RTL document) and vertically centred; the "on" state adds its own
 * `translate-x-*` — a `--spacing` multiple — on top of that rest position, which is also the
 * thumb's motion (spec "Behaviour & motion": "The thumb slides ... over `duration-fast` with
 * `ease-out`"). The thumb is a *separate* element from the button that carries `eldra-focus`, so
 * it may carry its own transition, exactly as Link's arrow does.
 */
const THUMB_BASE =
  'absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center ' +
  'rounded-[var(--eldra-switch-radius,var(--eldra-radius-full))] eldra-switch-thumb-offset ' +
  'transition-[translate] duration-fast ease-out motion-reduce:transition-none';
const THUMB_SIZE: Record<SwitchSize, string> = { md: 'size-4', sm: 'size-3' };
const THUMB_TRAVEL: Record<SwitchSize, string> = { md: 'translate-x-5', sm: 'translate-x-4' };

/** Fill only changes with on/off, not with disabled (spec's States table repeats it unchanged). */
const THUMB_OFF = 'bg-border-strong';
const THUMB_ON = 'bg-primary-contrast text-primary';

const thumbClass = computed(() =>
  partClass(
    cx(
      THUMB_BASE,
      THUMB_SIZE[props.size],
      model.value ? cx(THUMB_ON, THUMB_TRAVEL[props.size]) : THUMB_OFF
    ),
    props.classes,
    'thumb'
  )
);

/** Spec "Switch" → Sizes: check icon 0.75rem/3px stroke at `md`, 0.625rem at `sm`. */
const CHECK_SIZE: Record<SwitchSize, string> = { md: 'size-3', sm: 'size-2.5' };
const checkClass = computed(() => cx('pointer-events-none', CHECK_SIZE[props.size]));

/**
 * The label (spec "Switch" → Sizes: "Label | 1rem" at `md`, "0.875rem / 1.5" at `sm` — the second
 * number matches `text-body-sm` exactly, so `sm` reuses it rather than a near-identical utility).
 */
const LABEL_SIZE: Record<SwitchSize, string> = { md: 'text-switch-label', sm: 'text-body-sm' };

const labelClass = computed(() =>
  partClass(
    cx(LABEL_SIZE[props.size], 'col-start-2 min-w-0', props.disabled ? 'text-muted' : 'text-text'),
    props.classes,
    'label'
  )
);

/**
 * The description (spec "Switch" → Anatomy: "a `muted` second line"; → Accessibility: "The
 * description is referenced by `aria-describedby`."). It sits in the grid's second row, `col-
 * start-2` set explicitly (not left to auto-flow) so it still lands under the label even when
 * `isNamedByField` drops the label `<span>`.
 *
 * `aria-hidden` keeps it out of the button's accessible *name* (spec: "The visible label is the
 * button's content" — singular) while `aria-describedby` on the button still exposes it as the
 * *description*; browsers read an `aria-describedby` target's text regardless of `aria-hidden` on
 * that target, which is the standard technique for a description that must not double as the name.
 */
const descriptionClass = computed(() =>
  partClass('text-switch-description text-muted col-start-2', props.classes, 'description')
);
</script>

<template>
  <button
    type="button"
    role="switch"
    data-part="root"
    v-bind="$attrs"
    :id="controlId"
    :class="rootClass"
    :aria-checked="model ? 'true' : 'false'"
    :aria-describedby="hasDescription ? descriptionId : undefined"
    :disabled="disabled || undefined"
    @click="toggle"
  >
    <span data-part="track" :class="trackClass">
      <span data-part="thumb" :class="thumbClass">
        <svg
          v-if="model"
          :class="checkClass"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M2.5 6.5l2.5 2.5l4.5 -5.5" />
        </svg>
      </span>
    </span>
    <span v-if="!isNamedByField" data-part="label" :class="labelClass"><slot /></span>
    <span
      v-if="hasDescription"
      :id="descriptionId"
      data-part="description"
      aria-hidden="true"
      :class="descriptionClass"
    >
      <slot name="description">{{ description }}</slot>
    </span>
  </button>
  <input
    type="checkbox"
    hidden
    tabindex="-1"
    aria-hidden="true"
    :name="name"
    :checked="model"
    :disabled="disabled || undefined"
  />
</template>
