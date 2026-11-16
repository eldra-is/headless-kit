<script setup lang="ts">
/**
 * `PhoneInput` bound to a vee-validate field. The field's value is the number in E.164.
 *
 * With no `rules` of its own it checks the number against the country the field is on
 * (`phoneRule`), in the locale and with the messages the field itself uses, so the common case
 * needs nothing passed. `rules` replaces that check; a form `validationSchema` runs beside it.
 * An empty field passes: add a required rule where the number is required.
 *
 * It validates like the other typed controls: when the field is left and on submit, not while a
 * number is being typed.
 */
import { computed, reactive, ref, toRefs } from 'vue';
import { useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import {
  FIELD_ONLY,
  FIELD_VALIDATION_DEFAULTS,
  useControlProps,
  useFieldControl,
} from '../../vee-validate/useFieldControl';
import PhoneInput from '../PhoneInput.vue';
import { phoneRule } from '../rule';
import type { FieldPhoneInputProps } from './types';

const props = withDefaults(defineProps<FieldPhoneInputProps>(), FIELD_VALIDATION_DEFAULTS);

/**
 * Declared and re-emitted by hand: `country` is a prop here, and Vue does not let an
 * `onUpdate:country` listener fall through a component that declares the prop it belongs to.
 */
const emit = defineEmits<{ 'update:country': [country: string] }>();

const inner = ref<InstanceType<typeof PhoneInput> | null>(null);
const messages = useMessages(() => props.messages);
const providedLocale = useEldraUiLocale();

const defaultRule = phoneRule({
  // The country the field is on, which typing a `+` or picking from the list changes.
  country: () => inner.value?.country ?? props.country ?? props.defaultCountry,
  locale: () => props.locale ?? providedLocale.value,
  messages: () => messages.value,
});

const binding = reactive({
  ...toRefs(props),
  rules: computed(() => props.rules ?? defaultRule),
});

const { model, invalid, id, onBlur } = useFieldControl<string>(binding, { empty: '' });
const control = useControlProps(props, FIELD_ONLY);
</script>

<template>
  <PhoneInput
    ref="inner"
    v-bind="control"
    :id="id"
    v-model="model"
    :invalid="invalid"
    @blur="onBlur"
    @update:country="emit('update:country', $event)"
  >
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </PhoneInput>
</template>
