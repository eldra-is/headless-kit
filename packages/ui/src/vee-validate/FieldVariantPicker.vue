<script setup lang="ts">
/**
 * `VariantPicker` bound to a vee-validate field.
 *
 * The picker's documented default is the first available option, and a controlled picker cannot
 * choose it for itself — so the field starts there instead (`initialValue`), which a `Form`'s
 * `initialValues` still overrides. `name` is both the field's path and the radios' shared native
 * name, exactly as the component asks for.
 */
import VariantPicker from '../components/variant-picker/VariantPicker.vue';
import type { FieldVariantPickerProps } from './types';
import { useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldVariantPickerProps>();

/**
 * Read once, at setup, exactly as `VariantPicker`'s own uncontrolled fallback is: the first
 * available option, or the very first one when the product is sold out end to end, so a fully
 * sold-out picker still starts on a real choice rather than on nothing.
 */
const initial =
  props.options.find((option) => option.available)?.value ?? props.options[0]?.value ?? '';

const { model, onBlur } = useFieldControl<string>(props, {
  empty: initial,
  initialValue: initial,
  hasIdProp: false,
});

const control = useControlProps(props, ['rules', 'label', 'id'] as const);
</script>

<template>
  <VariantPicker v-bind="control" v-model="model" @focusout="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </VariantPicker>
</template>
