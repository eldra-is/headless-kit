<script setup lang="ts">
import { computed, h, inject, useSlots, type FunctionalComponent } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { joinIds, useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import FieldError from '../field-wrapper/FieldError.vue';
import RequiredMark from '../field-wrapper/RequiredMark.vue';
import VisuallyHidden from '../visually-hidden/VisuallyHidden.vue';
import type { SwitchProps, SwitchSize, SwitchSlotProps } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<SwitchProps>(), {
  modelValue: undefined,
  size: 'md',
  description: undefined,
  disabled: false,
  requiredMark: false,
  error: undefined,
  invalid: false,
  id: undefined,
  name: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [checked: boolean];
  /** Spec "Switch" → Events: "`change`: fires with the new boolean after each toggle." */
  change: [checked: boolean];
}>();

defineSlots<{
  /** The label. */
  default?: () => unknown;
  /** The second line under the label; `description` is its fallback. */
  description?: () => unknown;
  /** Replaces what the thumb draws (the check icon when on, nothing when off). */
  thumb?: (props: SwitchSlotProps) => unknown;
  /** Drawn on the track where the thumb rests when off, so it shows while the switch is on. */
  trackStart?: (props: SwitchSlotProps) => unknown;
  /** Drawn on the track where the thumb rests when on, so it shows while the switch is off. */
  trackEnd?: (props: SwitchSlotProps) => unknown;
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
  () =>
    props.id === undefined && field?.value.labelsControl === true && field.value.labelled !== false
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

/**
 * Spec precedent (Checkbox/CheckboxGroup/RadioGroup's own `describedBy` composition): a
 * `FieldWrapper`'s `help` text describes the control too, alongside this switch's own
 * description — own id first, so it is what a screen reader hears first, then whatever the field
 * context adds.
 */
const errorId = computed(() => `${controlId.value}-error`);
const hasError = computed(() => Boolean(props.error));
/** In error with a message (`error`) or without one (`invalid`), RadioGroup's own split. */
const inError = computed(() => hasError.value || props.invalid);
const describedBy = computed(() =>
  joinIds(
    hasError.value && errorId.value,
    hasDescription.value && descriptionId.value,
    field?.value.describedBy
  )
);
const m = useMessages();

/** The error row follows the switch (and its hidden mirror input) only when there is an error, so
 *  a switch without one renders exactly the two nodes it always has. */
const WithError: FunctionalComponent = (_props, { slots: own }) => {
  const content = own.default?.() ?? [];
  if (!hasError.value) return content;
  return [
    ...content,
    h(
      FieldError,
      { id: errorId.value, rowClass: 'eldra:mt-1', classes: props.classes },
      () => props.error
    ),
  ];
};

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
  'eldra:group eldra:grid eldra:grid-cols-[auto_1fr] eldra:items-center eldra:gap-x-3 eldra:gap-y-0.5 eldra:w-fit eldra:max-w-full eldra:target-min ' +
  'eldra:rounded-sm eldra:border-0 eldra:bg-transparent eldra:p-0 eldra:text-start eldra:eldra-focus';

const rootClass = computed(() => [
  ROOT,
  props.disabled ? 'eldra:cursor-not-allowed' : 'eldra:cursor-pointer',
]);

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
  'eldra:relative eldra:inline-flex eldra:shrink-0 eldra:rounded-[var(--eldra-switch-radius,var(--eldra-radius-full))] ' +
  'eldra:eldra-switch-track-border eldra:transition-colors eldra:duration-fast eldra:ease-out eldra:motion-reduce:transition-none';
const TRACK_SIZE: Record<SwitchSize, string> = {
  md: 'eldra:w-11 eldra:h-6',
  sm: 'eldra:w-9 eldra:h-5',
};

/** Spec "Switch" → States. Only `:hover` (nothing here can express it in JavaScript) is a variant. */
const TRACK_OFF = 'eldra:bg-background eldra:border-border-strong eldra:group-hover:border-text';
const TRACK_ON =
  'eldra:bg-primary eldra:border-primary ' +
  'eldra:group-hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]';
const TRACK_DISABLED_OFF = 'eldra:bg-surface-strong eldra:border-border-strong eldra:border-dashed';
const TRACK_DISABLED_ON = 'eldra:bg-muted eldra:border-muted';

const trackState = computed(() => {
  if (props.disabled) return model.value ? TRACK_DISABLED_ON : TRACK_DISABLED_OFF;
  return model.value ? TRACK_ON : TRACK_OFF;
});

const trackClass = computed(() => [
  [TRACK_BASE, TRACK_SIZE[props.size], trackState.value],
  props.classes?.track,
]);

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
  'eldra:absolute eldra:top-1/2 eldra:-translate-y-1/2 eldra:inline-flex eldra:items-center eldra:justify-center ' +
  'eldra:rounded-[var(--eldra-switch-radius,var(--eldra-radius-full))] eldra:eldra-switch-thumb-offset ' +
  'eldra:transition-[translate] eldra:duration-fast eldra:ease-out eldra:motion-reduce:transition-none';
const THUMB_SIZE: Record<SwitchSize, string> = { md: 'eldra:size-4', sm: 'eldra:size-3' };
const THUMB_TRAVEL: Record<SwitchSize, string> = {
  md: 'eldra:translate-x-5',
  sm: 'eldra:translate-x-4',
};

/** Fill only changes with on/off, not with disabled (spec's States table repeats it unchanged). */
const THUMB_OFF = 'eldra:bg-border-strong';
const THUMB_ON = 'eldra:bg-primary-contrast eldra:text-primary';
/** Ink for `thumb` slot content on the off thumb, which has no text colour of its own: `background`
 *  on `border-strong` is the spec's own 4.5:1 pair. Only added when the slot is filled. */
const THUMB_OFF_INK = 'eldra:text-background';

const thumbClass = computed(() => [
  [
    THUMB_BASE,
    THUMB_SIZE[props.size],
    model.value
      ? [THUMB_ON, THUMB_TRAVEL[props.size]]
      : [THUMB_OFF, slots.thumb !== undefined && THUMB_OFF_INK],
  ],
  props.classes?.thumb,
]);

const slotProps = computed<SwitchSlotProps>(() => ({
  checked: model.value,
  disabled: props.disabled,
}));

/**
 * The `trackStart`/`trackEnd` boxes: the thumb's own size at the thumb's own two rest positions
 * (the same offset, and the same travel for the end one), so track content sits exactly where the
 * thumb is not and the thumb, painted after them, covers the one it rests on. Ink: on the `primary`
 * track `primary-contrast`; off, and on a disabled track, `muted`.
 */
const TRACK_SLOT_BASE =
  'eldra:pointer-events-none eldra:absolute eldra:top-1/2 eldra:-translate-y-1/2 eldra:inline-flex eldra:items-center eldra:justify-center ' +
  'eldra:eldra-switch-thumb-offset';

function trackSlotClass(end: boolean, part: 'trackStart' | 'trackEnd') {
  return [
    [
      TRACK_SLOT_BASE,
      THUMB_SIZE[props.size],
      end && THUMB_TRAVEL[props.size],
      model.value && !props.disabled ? 'eldra:text-primary-contrast' : 'eldra:text-muted',
    ],
    props.classes?.[part],
  ];
}

const trackStartClass = computed(() => trackSlotClass(false, 'trackStart'));
const trackEndClass = computed(() => trackSlotClass(true, 'trackEnd'));

/** Spec "Switch" → Sizes: check icon 0.75rem/3px stroke at `md`, 0.625rem at `sm`. */
const CHECK_SIZE: Record<SwitchSize, string> = { md: 'eldra:size-3', sm: 'eldra:size-2.5' };
const checkClass = computed(() => ['eldra:pointer-events-none', CHECK_SIZE[props.size]]);

/**
 * The label (spec "Switch" → Sizes: "Label | 1rem" at `md`, "0.875rem / 1.5" at `sm` — the second
 * number matches `text-body-sm` exactly, so `sm` reuses it rather than a near-identical utility).
 */
const LABEL_SIZE: Record<SwitchSize, string> = {
  md: 'eldra:text-switch-label',
  sm: 'eldra:text-body-sm',
};

const labelClass = computed(() => [
  [
    LABEL_SIZE[props.size],
    'eldra:col-start-2 eldra:min-w-0',
    props.disabled ? 'eldra:text-muted' : 'eldra:text-text',
  ],
  props.classes?.label,
]);

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
const descriptionClass = computed(() => [
  'eldra:text-switch-description eldra:text-muted eldra:col-start-2',
  props.classes?.description,
]);
</script>

<template>
  <WithError>
    <button
      type="button"
      role="switch"
      data-eldra-ui
      :data-eldra-scope="eldra.scope"
      data-part="root"
      v-bind="$attrs"
      :id="controlId"
      :class="rootClass"
      :aria-checked="model ? 'true' : 'false'"
      :aria-describedby="describedBy"
      :aria-invalid="inError ? 'true' : undefined"
      :disabled="disabled || undefined"
      @click="toggle"
    >
      <span data-part="track" :class="trackClass">
        <span
          v-if="$slots.trackStart"
          :data-eldra-slot="eldra.slotHost('trackStart')"
          data-part="trackStart"
          aria-hidden="true"
          :class="trackStartClass"
        >
          <slot name="trackStart" v-bind="slotProps" />
        </span>
        <span
          v-if="$slots.trackEnd"
          :data-eldra-slot="eldra.slotHost('trackEnd')"
          data-part="trackEnd"
          aria-hidden="true"
          :class="trackEndClass"
        >
          <slot name="trackEnd" v-bind="slotProps" />
        </span>
        <span data-part="thumb" :class="thumbClass">
          <span
            v-if="$slots.thumb"
            :data-eldra-slot="eldra.slotHost('thumb')"
            aria-hidden="true"
            class="eldra:pointer-events-none eldra:inline-flex"
          >
            <slot name="thumb" v-bind="slotProps" />
          </span>
          <svg
            v-else-if="model"
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
      <span
        v-if="!isNamedByField"
        :data-eldra-slot="eldra.slotHost('default')"
        data-part="label"
        :class="labelClass"
        ><slot /><RequiredMark v-if="requiredMark" :classes="classes" /><VisuallyHidden
          v-if="requiredMark"
          >{{ m.required }}</VisuallyHidden
        ></span
      >
      <span
        v-if="hasDescription"
        :data-eldra-slot="eldra.slotHost('description')"
        :id="descriptionId"
        data-part="description"
        aria-hidden="true"
        :class="descriptionClass"
      >
        <slot name="description">{{ description }}</slot>
      </span>
    </button>
    <input
      data-eldra-ui
      :data-eldra-scope="eldra.scope"
      type="checkbox"
      hidden
      tabindex="-1"
      aria-hidden="true"
      :name="name"
      :checked="model"
      :disabled="disabled || undefined"
    />
  </WithError>
</template>
