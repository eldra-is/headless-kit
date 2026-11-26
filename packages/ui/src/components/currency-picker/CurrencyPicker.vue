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

const {
  root: rootClass,
  label: labelClass,
  trigger: triggerClass,
  ...otherClasses
} = props.classes ?? {};
const selectClasses = computed(() => ({
  ...otherClasses,
  trigger: [props.busy ? 'eldra:opacity-60' : '', triggerClass ?? ''].join(' ').trim() || undefined,
}));
const labelClasses = computed(() =>
  props.showLabel ? { label: labelClass } : { label: 'eldra:sr-only' }
);

/** A row's currency name alone, for an `optionContent` slot that prints the code apart from it. */
function nameOf(option: SelectOption): string {
  return currencyName(option.value);
}
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
    <!-- The label's own content, with `showLabel`: an icon beside the words. -->
    <template v-if="$slots.label" #label><slot name="label" /></template>
    <Select
      v-model="selected"
      :options="options"
      :placement="placement"
      :searchable="false"
      :size="size"
      :classes="selectClasses"
    >
      <!-- `leading` and `value` are `Select`'s own, so a header can draw "Prices in ISK" with an
           icon; `value` gets the code and the full label, and defaults to the code. -->
      <template v-if="$slots.leading" #leading><slot name="leading" /></template>
      <!-- `optionContent` gets the code, the currency's name alone (`currencyName`; a slot prop
           cannot be called `name`) and the full label, so a row can print the code apart. -->
      <template v-if="$slots.optionContent" #optionContent="{ option, selected: chosen }">
        <slot
          name="optionContent"
          :code="option.value"
          :currency-name="nameOf(option)"
          :label="option.label"
          :selected="chosen"
        />
      </template>
      <template #value="{ option }">
        <slot name="value" :code="option.value" :label="option.label">{{ option.value }}</slot>
      </template>
    </Select>
  </FieldWrapper>
</template>
