<script setup lang="ts">
import { computed, inject } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { FIELD_KEY } from '../field-wrapper/context';
import FieldError from '../field-wrapper/FieldError.vue';
import Checkbox from './Checkbox.vue';
import type { CheckboxGroupProps } from './types';

const props = withDefaults(defineProps<CheckboxGroupProps>(), {
  modelValue: undefined,
  layout: 'vertical',
  error: undefined,
  name: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [values: string[]];
  /** Spec "Checkbox" → Events: "`change`: fires with … the new array of values (group)." */
  change: [values: string[]];
}>();

/**
 * A group may sit inside a `FieldWrapper` that adds help text of its own. It never takes the
 * wrapper's `id` or `required`: a fieldset is not a control, and the wrapper's `invalid` is not
 * this group's error — `error` is the only thing that puts the group in error.
 */
const field = inject(FIELD_KEY, null);

const errorId = useUiId('checkbox-group-error');

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string[]>(props, emit, () => []);

const selected = computed(() => new Set(model.value));

/**
 * Spec "Checkbox" → Accessibility: the error is linked to the fieldset, and — as everywhere else
 * in this package — the error id comes first, so it is what a screen reader hears first.
 */
const describedBy = computed(() => {
  const ids = [props.error ? errorId.value : undefined, field?.value.describedBy].filter(
    (id): id is string => Boolean(id)
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
});

/**
 * A value is added on check and filtered out on uncheck, and the array is always a new one: a
 * parent holding the old array in `v-model` is never mutated under it, and a `watch` on the value
 * fires.
 */
function toggle(value: string, checked: boolean): void {
  const next = checked
    ? [...model.value.filter((v) => v !== value), value]
    : model.value.filter((v) => v !== value);
  model.value = next;
  emit('change', next);
}

/**
 * Spec "Field wrapper" → Sizes, the fieldset variant, which this group follows so a set of
 * checkboxes looks the same whichever of the two draws it: "no border, padding or min-width, grid
 * with a 0.75rem (`space-3`) gap, and the legend has a 0.5rem (`space-2`) bottom margin."
 */
const rootClass = computed(() =>
  partClass('grid min-w-0 content-start gap-3 rounded-none border-0 p-0', props.classes, 'root')
);

/** The same type style as a `FieldWrapper` label, with a `<legend>`'s default padding removed. */
const legendClass = computed(() =>
  partClass('text-label text-text mb-2 block w-fit p-0', props.classes, 'legend')
);

/**
 * Spec "Checkbox" → Sizes: "Vertical group gap 0.5rem (`space-2`). Row group gap 0.5rem × 1.5rem
 * (`space-2` × `space-6`), wrapping."
 */
const optionsClass = computed(() =>
  partClass(
    cx(
      'flex min-w-0',
      props.layout === 'row' ? 'flex-row flex-wrap gap-x-6 gap-y-2' : 'flex-col gap-2'
    ),
    props.classes,
    'options'
  )
);
</script>

<template>
  <fieldset
    data-part="root"
    :class="rootClass"
    :aria-describedby="describedBy"
    :aria-invalid="error ? 'true' : undefined"
  >
    <legend data-part="legend" :class="legendClass">{{ legend }}</legend>

    <div data-part="options" :class="optionsClass">
      <Checkbox
        v-for="option in options"
        :key="option.value"
        :model-value="selected.has(option.value)"
        :value="option.value"
        :name="name"
        :hint="option.hint"
        :disabled="option.disabled"
        @update:model-value="(checked: boolean) => toggle(option.value, checked)"
        >{{ option.label }}</Checkbox
      >
    </div>

    <!-- The same error row a `FieldWrapper` draws (`FieldError`): linked by id, never a live
         region. The `error` and `errorIcon` parts, and their `classes` keys, are this group's. -->
    <FieldError v-if="error" :id="errorId" :classes="classes">{{ error }}</FieldError>
  </fieldset>
</template>
