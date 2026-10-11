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
import type { FieldUnitInputProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldUnitInputProps>();

const { model, invalid, id, onBlur } = useFieldControl<number | null>(props, { empty: null });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <UnitInput v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </UnitInput>
</template>
