<script setup lang="ts">
/**
 * The header's language picker: the site's own locales, each named in its own language
 * ("íslenska (Ísland)"), and the page's locale as its value. It sits beside the currency picker
 * and is drawn the same way, so it takes the same `label`/`showLabel`/`size`/`placement`/`classes`
 * and the same `label`, `leading`, `value` and `optionContent` slots as `CurrencyPicker`.
 *
 * It renders nothing unless the organisation serves more than one locale: `supported` is empty on
 * a store that configures none and on every render outside a Nuxt site (a story, a unit mount), and
 * a list of one is not a choice.
 *
 * Choosing is a navigation (`select`), never local state, so the value is always the page's own
 * locale — the same rule as the footer's switcher. The names come from `useEldraLocale().name`,
 * resolved once on the server, so a prerendered header does not hydrate into different words.
 */
import { computed } from 'vue';
import { FieldWrapper, Select } from '@eldrajs/ui';
import type { SelectOption, SelectPart, SelectPlacement } from '@eldrajs/ui';
import { useEldraLocale } from '@eldrajs/theme-vue';

const props = withDefaults(
  defineProps<{
    label: string;
    showLabel?: boolean;
    size?: 'sm' | 'md';
    placement?: SelectPlacement;
    classes?: Partial<Record<SelectPart | 'root' | 'label', string>>;
  }>(),
  { showLabel: false, size: 'sm', placement: 'auto', classes: undefined }
);

const locales = useEldraLocale();

const options = computed<SelectOption[]>(() =>
  locales.supported.map((tag) => ({ value: tag, label: locales.name(tag) }))
);

const selected = computed<string>({
  get: () => locales.active ?? '',
  set: (tag) => {
    if (tag !== '' && tag !== locales.active) locales.select(tag);
  },
});

/** The language subtag, for a closed picker that shows a short code: `is-IS` → `IS`. */
function shortCode(tag: string): string {
  return (tag.split('-')[0] ?? tag).toUpperCase();
}

const rootClass = computed(() => props.classes?.root);
const labelClasses = computed(() =>
  props.showLabel ? { label: props.classes?.label } : { label: 'sr-only' }
);
const selectClasses = computed(() => {
  const { root: _root, label: _label, ...rest } = props.classes ?? {};
  return rest;
});
</script>

<template>
  <FieldWrapper
    v-if="options.length > 1"
    data-eldra-header-locale-picker
    :label="label"
    :classes="labelClasses"
    :class="rootClass"
  >
    <template v-if="$slots.label" #label><slot name="label" /></template>
    <!-- Not `searchable`: a store has a handful of locales, and a search field over three options
         is one more thing between a visitor and their language. An empty `placeholder`: the page
         always has a locale, and `Select` reserves the placeholder's width under its value, which
         would leave a gap after a two-letter "EN". -->
    <Select
      v-model="selected"
      :options="options"
      :placement="placement"
      :searchable="false"
      placeholder=""
      :size="size"
      :classes="selectClasses"
    >
      <template v-if="$slots.leading" #leading><slot name="leading" /></template>
      <template v-if="$slots.optionContent" #optionContent="{ option, selected: chosen }">
        <slot
          name="optionContent"
          :tag="option.value"
          :code="shortCode(option.value)"
          :label="option.label"
          :selected="chosen"
        />
      </template>
      <template #value="{ option }">
        <slot
          name="value"
          :tag="option.value"
          :code="shortCode(option.value)"
          :label="option.label"
          >{{ shortCode(option.value) }}</slot
        >
      </template>
    </Select>
  </FieldWrapper>
</template>
