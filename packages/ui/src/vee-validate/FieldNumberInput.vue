<script setup lang="ts">
/**
 * `NumberInput` bound to a vee-validate field.
 *
 * Everything a `NumberInput` takes is forwarded (`format`, `locale`, `currency`, `unit`, `min`,
 * `max`, `step`, `precision`, `size`, `classes`, every slot and every attribute); `name` doubles
 * as the field's path and the name the hidden input posts under. The value, `invalid` and the blur
 * that reveals the message are this component's.
 *
 * The bound value is `number | null`, not a string — so a rule reads a number (`min_value:1`
 * compares numerically) and a form submits one. `empty: null` is what an unset field is bound to,
 * which is the same thing the control itself means by an empty field.
 */
import NumberInput from '../components/number-input/NumberInput.vue';
import type { FieldNumberInputProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldNumberInputProps>();

const { model, invalid, id, onBlur } = useFieldControl<number | null>(props, { empty: null });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <NumberInput v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </NumberInput>
</template>
