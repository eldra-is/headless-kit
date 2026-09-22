<script setup lang="ts">
/**
 * `class`/other attrs forward to the `<input>` itself (not the wrapping
 * `<div>`) — this is a multi-element field (label, control, description,
 * error), and a consumer reaching for `class`/`maxlength`/`pattern`/etc.
 * means the control, matching `UiTextarea`/`UiSelect`/`UiCheckbox`.
 */
import { computed, useAttrs } from 'vue';
import { useId } from '../../composables/useId';
import { inputBase } from '../../utils/classes';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    /** Required; pair with `hideLabel` for a visually-hidden (but still
     * accessible) label, e.g. a search input where a placeholder suffices
     * visually. */
    label: string;
    hideLabel?: boolean;
    description?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url';
    placeholder?: string;
    autocomplete?: string;
  }>(),
  {
    modelValue: undefined,
    hideLabel: false,
    description: undefined,
    error: undefined,
    required: false,
    disabled: false,
    id: undefined,
    type: 'text',
    placeholder: undefined,
    autocomplete: undefined,
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const attrs = useAttrs();
const generatedId = useId();
const inputId = computed(() => props.id ?? `ui-input-${generatedId}`);
const descriptionId = computed(() =>
  props.description ? `${inputId.value}-description` : undefined
);
const errorId = computed(() => (props.error ? `${inputId.value}-error` : undefined));
const describedBy = computed(
  () => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined
);

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="inputId" :class="hideLabel ? 'sr-only' : 'text-text text-sm font-medium'">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <input
      :id="inputId"
      v-bind="attrs"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="inputBase"
      @input="onInput"
    />
    <p v-if="description" :id="descriptionId" class="text-muted text-sm">{{ description }}</p>
    <p v-if="error" :id="errorId" class="text-danger text-sm">{{ error }}</p>
  </div>
</template>
