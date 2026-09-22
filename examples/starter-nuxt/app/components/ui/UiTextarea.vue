<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { useId } from '../../composables/useId';
import { inputBase } from '../../utils/classes';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label: string;
    hideLabel?: boolean;
    description?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
    placeholder?: string;
    rows?: number;
  }>(),
  {
    modelValue: undefined,
    hideLabel: false,
    description: undefined,
    error: undefined,
    required: false,
    disabled: false,
    id: undefined,
    placeholder: undefined,
    rows: 4,
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const attrs = useAttrs();
const generatedId = useId();
const inputId = computed(() => props.id ?? `ui-textarea-${generatedId}`);
const descriptionId = computed(() =>
  props.description ? `${inputId.value}-description` : undefined
);
const errorId = computed(() => (props.error ? `${inputId.value}-error` : undefined));
const describedBy = computed(
  () => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined
);

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="inputId" :class="hideLabel ? 'sr-only' : 'text-text text-sm font-medium'">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <textarea
      :id="inputId"
      v-bind="attrs"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :rows="rows"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="inputBase"
      @input="onInput"
    />
    <p v-if="description" :id="descriptionId" class="text-muted text-sm">{{ description }}</p>
    <p v-if="error" :id="errorId" class="text-danger text-sm">{{ error }}</p>
  </div>
</template>
