<script setup lang="ts">
/**
 * `VariantPicker` bound to a vee-validate field.
 *
 * The one control here whose `name` is **visible**: it is the option name ("Size", "Colour"), drawn
 * in the legend as well as used as the radios' shared native name. So `name` stays the legend and
 * **`path`** says where the value lives — without it the field would be called "Size" in
 * `initialValues`, `validationSchema`, `apiErrors` and the `errors` slot prop, and either the
 * legend or the key would have to be wrong. `path` defaults to `name`, so a picker whose option
 * name already reads as a key needs nothing extra.
 *
 * The picker's documented default is the first available option, and a controlled picker cannot
 * choose it for itself — so the field starts there instead (`initialValue`), which a `Form`'s
 * `initialValues` still overrides.
 */
import VariantPicker from '../components/variant-picker/VariantPicker.vue';
import type { FieldVariantPickerProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

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

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <VariantPicker v-bind="control" v-model="model" @focusout="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </VariantPicker>
</template>
