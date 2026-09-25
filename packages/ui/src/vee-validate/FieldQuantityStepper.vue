<script setup lang="ts">
/**
 * `QuantityStepper` bound to a **number** field.
 *
 * The field starts at the stepper's own default — its `min`, spec "Quantity stepper" → Properties:
 * "Defaults to `min` when unset, never 0 on a cart line" — rather than at `undefined`, so what the
 * form submits is the quantity that is on screen. A `Form`'s `initialValues` still wins over it. It
 * draws the error itself only outside a `FieldWrapper`.
 */
import QuantityStepper from '../components/quantity-stepper/QuantityStepper.vue';
import type { FieldQuantityStepperProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldQuantityStepperProps>();

/** `QuantityStepper`'s own `min` default, read once exactly as the component reads it. */
const initial = props.min ?? 1;

const { model, ownError, id, onBlur } = useFieldControl<number>(props, {
  empty: initial,
  initialValue: initial,
});

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <QuantityStepper v-bind="control" :id="id" v-model="model" :error="ownError" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </QuantityStepper>
</template>
