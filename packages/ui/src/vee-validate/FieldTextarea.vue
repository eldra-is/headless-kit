<script setup lang="ts">
/**
 * `Textarea` bound to a vee-validate field. The counter, `maxLength`, `hardLimit` and `minHeight`
 * are forwarded untouched; the value, `invalid` and the blur are this component's.
 */
import Textarea from '../components/textarea/Textarea.vue';
import type { FieldTextareaProps } from './types';
import { useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldTextareaProps>();

const { model, invalid, id, onBlur } = useFieldControl<string>(props, { empty: '' });

const control = useControlProps(props, ['rules', 'label', 'id'] as const);
</script>

<template>
  <Textarea v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Textarea>
</template>
