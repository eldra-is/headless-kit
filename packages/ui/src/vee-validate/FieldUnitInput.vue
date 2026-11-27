<script setup lang="ts">
/**
 * `UnitInput` bound to a vee-validate field.
 *
 * Everything a `UnitInput` takes is forwarded (`unit`, `locale`, `min`, `max`, `step`,
 * `maxFraction`, `clearable`, `enableDragAdjust`, `size`, `classes`, every slot and every
 * attribute); `name` doubles as the field's path and the name the hidden input posts under. The
 * value, `invalid` and the blur that reveals the message are this component's.
 *
 * The bound value is `number | null`, not a string — so a rule reads a number (`min_value:1`
 * compares numerically) and a form submits one.
 */
import UnitInput from '../components/unit-input/UnitInput.vue';
import { ref } from 'vue';
import { useMessages } from '../composables/useMessages';
import type { FieldUnitInputProps } from './types';
import {
  FIELD_ONLY,
  FIELD_VALIDATION_DEFAULTS,
  useControlProps,
  useFieldControl,
} from './useFieldControl';

const props = withDefaults(defineProps<FieldUnitInputProps>(), FIELD_VALIDATION_DEFAULTS);

const control$ = ref<InstanceType<typeof UnitInput> | null>(null);
const readable = ref(true);
const messages = useMessages();

const { model, invalid, id, onBlur } = useFieldControl<number | null>(props, {
  empty: null,
  unreadable: () => {
    if (readable.value) return undefined;
    return control$.value?.invalidReason === 'noDecimals'
      ? messages.value.amountNoDecimals
      : messages.value.amountNotANumber;
  },
});

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <UnitInput
    v-bind="control"
    :id="id"
    ref="control$"
    v-model="model"
    :invalid="invalid"
    @update:valid="readable = $event"
    @blur="onBlur"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </UnitInput>
</template>
