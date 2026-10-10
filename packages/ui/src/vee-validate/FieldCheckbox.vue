<script setup lang="ts">
/**
 * A single `Checkbox` — a consent box, "Billing address is the same" — bound to a **boolean**
 * field. The multi-choice fieldset is `FieldCheckboxGroup`.
 *
 * Deliberately not `useField`'s `type: 'checkbox'` mode: that one keeps an array of checked values
 * across several inputs sharing a name, which is the group's job. Here the field simply holds
 * `true` or `false`, so `rules: 'required'` reads as "this box must be ticked".
 */
import Checkbox from '../components/checkbox/Checkbox.vue';
import type { FieldCheckboxProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldCheckboxProps>();

const { model, invalid, id, onBlur } = useFieldControl<boolean>(props, { empty: false });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <Checkbox v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Checkbox>
</template>
