<script setup lang="ts">
/**
 * `Switch` bound to a boolean field.
 *
 * A `Switch` has neither an `invalid` nor an `error` prop — the spec gives it no error state — so
 * the message is the `FieldWrapper`'s to show, through the `Form`'s `errors` slot prop.
 */
import Switch from '../components/switch/Switch.vue';
import type { FieldSwitchProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

const props = defineProps<FieldSwitchProps>();

const { model, id, onBlur } = useFieldControl<boolean>(props, { empty: false });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <Switch v-bind="control" :id="id" v-model="model" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Switch>
</template>
