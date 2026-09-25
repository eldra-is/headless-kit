<script setup lang="ts">
/**
 * `Input` bound to a vee-validate field.
 *
 * Everything an `Input` takes is forwarded (`type`, `size`, `mask`, `leadingIcon`, `autocomplete`,
 * `classes`, every slot and every attribute); `name` doubles as the field's path and the control's
 * native `name`. The value, `invalid` and the blur that reveals the message are this component's.
 */
import Input from '../components/input/Input.vue';
import type { FieldInputProps } from './types';
import { useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldInputProps>();

const { model, invalid, id, onBlur } = useFieldControl<string>(props, { empty: '' });

const control = useControlProps(props, ['rules', 'label', 'id'] as const);
</script>

<template>
  <Input v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Input>
</template>
