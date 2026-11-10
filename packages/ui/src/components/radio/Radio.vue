<script setup lang="ts">
import { nextTick, ref, useSlots } from 'vue';
import { computed, cx, partClass } from '../../utils/scopedClass';
import {
  HINT,
  INPUT,
  PLAIN_OPTION,
  dotRecipe,
  labelRecipe,
  optionCursor,
  radioRecipe,
} from './recipes';
import type { RadioProps, RadioValue } from './types';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

/**
 * One native radio in `RadioGroup`'s plain-row design, for a radio whose siblings (sharing its
 * `name`) are rendered somewhere else — a table row, a card of its own. Every attribute reaches the
 * `<input>`; the root `<label>` is the `option` part.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<RadioProps>(), {
  modelValue: undefined,
  name: undefined,
  label: undefined,
  hint: undefined,
  size: 'md',
  disabled: false,
  invalid: false,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: RadioValue];
  /** Fires with this radio's `value` when it is chosen. */
  change: [value: RadioValue];
}>();

const slots = useSlots();

const isChecked = computed(
  () => props.modelValue !== undefined && props.modelValue === props.value
);

const inputRef = ref<HTMLInputElement | null>(null);

/**
 * Choosing this radio checks it in the DOM before any event, so a controlled parent that refuses
 * the change would leave it visibly checked. Once the parent has had its say, this radio — and only
 * this one — is written back from `modelValue`. It never re-asserts on any other render: with no
 * view of its siblings, a stale write here is what would steal the selection from one of them.
 */
async function onChange(): Promise<void> {
  emit('update:modelValue', props.value);
  emit('change', props.value);
  await nextTick();
  if (inputRef.value) inputRef.value.checked = isChecked.value;
}

const hasLabel = computed(() => props.label !== undefined || slots.default !== undefined);
const hasHint = computed(() => props.hint !== undefined || slots.hint !== undefined);

const optionClass = computed(() =>
  partClass(
    cx(
      PLAIN_OPTION,
      !hasLabel.value && !hasHint.value && 'grid-cols-[auto] gap-x-0',
      optionCursor(props.disabled)
    ),
    props.classes,
    'option'
  )
);
const radioClass = computed(() =>
  partClass(
    radioRecipe(props.size, {
      selected: isChecked.value,
      disabled: props.disabled,
      invalid: props.invalid,
    }),
    props.classes,
    'radio'
  )
);
const dotClass = computed(() => partClass(dotRecipe(isChecked.value), props.classes, 'dot'));
const inputClass = computed(() => partClass(INPUT, props.classes, 'input'));
const labelClass = computed(() =>
  partClass(labelRecipe(false, props.disabled), props.classes, 'label')
);
const hintClass = computed(() => partClass(HINT, props.classes, 'hint'));
</script>

<template>
  <label data-eldra-ui :data-eldra-scope="eldra.scope" data-part="option" :class="optionClass">
    <span data-part="radio" :class="radioClass">
      <input
        ref="inputRef"
        v-bind="$attrs"
        :class="inputClass"
        type="radio"
        :name="name"
        :value="value"
        :checked="isChecked"
        :disabled="disabled || undefined"
        :aria-invalid="invalid ? 'true' : undefined"
        @change="onChange"
      />
      <span aria-hidden="true" :class="dotClass" />
    </span>

    <span
      v-if="hasLabel"
      :data-eldra-slot="eldra.slotHost('default')"
      data-part="label"
      :class="labelClass"
    >
      <slot>{{ label }}</slot>
    </span>

    <span
      v-if="hasHint"
      :data-eldra-slot="eldra.slotHost('hint')"
      data-part="hint"
      :class="hintClass"
    >
      <slot name="hint">{{ hint }}</slot>
    </span>
  </label>
</template>
