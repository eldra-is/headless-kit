<script setup lang="ts">
/**
 * `CurrencyInput` bound to a vee-validate field — `FieldUnitInput` for money, with the same
 * `number | null` value. See `FieldUnitInput` for what is forwarded and why the value is a number.
 */
import CurrencyInput from '../components/currency-input/CurrencyInput.vue';
import type { FieldCurrencyInputProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldCurrencyInputProps>();

const { model, invalid, id, onBlur } = useFieldControl<number | null>(props, { empty: null });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <CurrencyInput v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </CurrencyInput>
</template>
