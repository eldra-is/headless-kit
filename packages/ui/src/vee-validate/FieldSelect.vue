<script setup lang="ts">
/**
 * `Select` bound to a vee-validate field. The hidden native `<select>` still carries `name`, so the
 * form posts the same value with or without scripting.
 */
import Select from '../components/select/Select.vue';
import type { FieldSelectProps } from './types';
import { useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldSelectProps>();

const { model, invalid, id, onBlur } = useFieldControl<string>(props, { empty: '' });

const control = useControlProps(props, ['rules', 'label', 'id'] as const);
</script>

<template>
  <Select v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Select>
</template>
