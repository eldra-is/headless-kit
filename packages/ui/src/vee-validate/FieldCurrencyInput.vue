<script setup lang="ts">
/**
 * `CurrencyInput` bound to a vee-validate field — `FieldUnitInput` for money, with the same
 * `number | null` value. See `FieldUnitInput` for what is forwarded and why the value is a number.
 */
import CurrencyInput from '../components/currency-input/CurrencyInput.vue';
import { ref } from 'vue';
import { useMessages } from '../composables/useMessages';
import type { FieldCurrencyInputProps } from './types';
import {
  FIELD_ONLY,
  FIELD_VALIDATION_DEFAULTS,
  useControlProps,
  useFieldControl,
} from './useFieldControl';

const props = withDefaults(defineProps<FieldCurrencyInputProps>(), FIELD_VALIDATION_DEFAULTS);

const control$ = ref<InstanceType<typeof CurrencyInput> | null>(null);
const readable = ref(true);
const messages = useMessages();

const { model, invalid, id, onBlur } = useFieldControl<number | null>(props, {
  empty: null,
  unreadable: () => {
    if (readable.value) return undefined;
    return control$.value?.invalidReason === 'noDecimals'
      ? messages.value.amountNoDecimals
      : messages.value.amountNotANumber;
  },
});

const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <CurrencyInput
    v-bind="control"
    :id="id"
    ref="control$"
    v-model="model"
    :invalid="invalid"
    @update:valid="readable = $event"
    @blur="onBlur"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </CurrencyInput>
</template>
