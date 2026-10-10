<script setup lang="ts">
/**
 * `CheckboxGroup` bound to a **string array** field — one question, several answers ("Material").
 *
 * A `<fieldset>` cannot take focus and native `blur` does not bubble, so the touch comes from
 * `focusout`, which does. The group draws its own error row only when it is standing on its own:
 * inside a `FieldWrapper` the wrapper owns that row (see `useFieldControl`'s `ownError`).
 */
import CheckboxGroup from '../components/checkbox/CheckboxGroup.vue';
import type { FieldCheckboxGroupProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

/** Module-level, so an empty selection is the same array identity on every render. */
const EMPTY: string[] = [];

const props = defineProps<FieldCheckboxGroupProps>();

const { model, ownError, onBlur } = useFieldControl<string[]>(props, {
  empty: EMPTY,
  hasIdProp: false,
});

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <CheckboxGroup v-bind="control" v-model="model" :error="ownError" @focusout="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </CheckboxGroup>
</template>
