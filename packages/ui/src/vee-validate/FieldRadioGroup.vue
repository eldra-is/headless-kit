<script setup lang="ts">
/**
 * `RadioGroup` bound to a vee-validate field. Like every fieldset control here it is touched by
 * `focusout` (native `blur` does not bubble out of the radios), and it renders its own error row
 * only outside a `FieldWrapper`.
 */
import RadioGroup from '../components/radio/RadioGroup.vue';
import type { FieldRadioGroupProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldRadioGroupProps>();

const { model, ownError, onBlur } = useFieldControl<string>(props, { empty: '', hasIdProp: false });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <RadioGroup v-bind="control" v-model="model" :error="ownError" @focusout="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </RadioGroup>
</template>
