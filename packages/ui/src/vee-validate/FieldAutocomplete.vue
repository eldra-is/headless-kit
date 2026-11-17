<script setup lang="ts">
/**
 * `Autocomplete` bound to a vee-validate field.
 *
 * Everything an `Autocomplete` takes is forwarded (`suggestions`, `loading`, `minLength`, `size`,
 * `autocomplete`, `classes`, every slot and every attribute, the `select` listener among them);
 * `name` doubles as the field's path and the control's native `name`. The value, `invalid` and the
 * blur that reveals the message are this component's. The field's value is the text, whether it
 * was typed or written by a chosen suggestion.
 */
import Autocomplete from '../components/autocomplete/Autocomplete.vue';
import type { FieldAutocompleteProps } from './types';
import {
  FIELD_ONLY,
  FIELD_VALIDATION_DEFAULTS,
  useControlProps,
  useFieldControl,
} from './useFieldControl';

const props = withDefaults(defineProps<FieldAutocompleteProps>(), FIELD_VALIDATION_DEFAULTS);

const { model, invalid, id, onBlur } = useFieldControl<string>(props, { empty: '' });

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <Autocomplete v-bind="control" :id="id" v-model="model" :invalid="invalid" @blur="onBlur">
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </Autocomplete>
</template>
