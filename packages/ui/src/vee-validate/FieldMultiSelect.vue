<script setup lang="ts">
/**
 * `MultiSelect` bound to a **string array** field.
 *
 * The empty selection is a module-level array rather than a fresh `[]` per read: a new identity on
 * every render would restart the control's own watchers for no reason.
 */
import MultiSelect from '../components/select/MultiSelect.vue';
import type { FieldMultiSelectProps } from './types';
import { FIELD_ONLY, useControlProps, useFieldControl } from './useFieldControl';

/** Module-level, so an empty selection is the same array identity on every render. */
const EMPTY: string[] = [];

const props = defineProps<FieldMultiSelectProps>();

const { model, invalid, id, onBlur } = useFieldControl<string[]>(props, { empty: EMPTY });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <MultiSelect v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </MultiSelect>
</template>
