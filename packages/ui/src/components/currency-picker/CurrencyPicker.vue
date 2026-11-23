<script setup lang="ts">
import { computed } from 'vue';
import { useEldraScope } from '../../composables/useEldraScope';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Select from '../select/Select.vue';
import type { SelectOption } from '../select/types';
import type { CurrencyPickerProps } from './types';

const props = withDefaults(defineProps<CurrencyPickerProps>(), {
  modelValue: undefined,
  label: undefined,
  showLabel: false,
  size: 'sm',
  placement: 'auto',
  busy: false,
  locale: undefined,
  classes: undefined,
});

const emit = defineEmits<{ 'update:modelValue': [code: string] }>();

const eldra = useEldraScope();
const messages = useMessages();
const uiLocale = useEldraUiLocale();
const locale = computed(() => props.locale ?? uiLocale.value);

function currencyName(code: string): string {
  try {
    // The runtime's own names: the list only opens in the browser, so no server render depends on them.
    const name = new Intl.DisplayNames(locale.value, { type: 'currency' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(locale.value) + name.slice(1);
  } catch {
    return code;
  }
}

// A value outside the list (a cart in a currency no longer offered) is still shown, never blank.
const codes = computed(() =>
  props.modelValue && !props.currencies.includes(props.modelValue)
    ? [...props.currencies, props.modelValue]
    : props.currencies
);
const options = computed<SelectOption[]>(() =>
  codes.value.map((code) => ({
    value: code,
    label: currencyName(code) === code ? code : `${currencyName(code)} (${code})`,
  }))
);

const selected = computed<string>({
  get: () => props.modelValue ?? '',
  set: (code) => emit('update:modelValue', code),
});

const { root: rootClass, trigger: triggerClass, ...otherClasses } = props.classes ?? {};
const selectClasses = computed(() => ({
  ...otherClasses,
  trigger: [props.busy ? 'eldra:opacity-60' : '', triggerClass ?? ''].join(' ').trim() || undefined,
}));
const labelClasses = computed(() => (props.showLabel ? undefined : { label: 'eldra:sr-only' }));
</script>

<template>
  <FieldWrapper
    v-if="props.currencies.length > 1"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :label="label ?? messages.currencyPickerLabel"
    :classes="labelClasses"
    :class="rootClass"
    :aria-busy="busy ? 'true' : undefined"
  >
    <Select
      v-model="selected"
      :options="options"
      :placement="placement"
      :searchable="false"
      :size="size"
      :classes="selectClasses"
    >
      <template #value="{ option }">{{ option.value }}</template>
    </Select>
  </FieldWrapper>
</template>
