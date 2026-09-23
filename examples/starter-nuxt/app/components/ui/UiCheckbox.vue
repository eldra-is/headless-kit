<script setup lang="ts">
import { computed, useAttrs } from 'vue';
import { useUiId } from '../../composables/useUiId';
import { focusRing } from '../../utils/classes';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    label: string;
    hideLabel?: boolean;
    description?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
  }>(),
  {
    modelValue: false,
    hideLabel: false,
    description: undefined,
    error: undefined,
    required: false,
    disabled: false,
    id: undefined,
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const attrs = useAttrs();
const generatedId = useUiId();
const inputId = computed(() => props.id ?? `ui-checkbox-${generatedId}`);
const descriptionId = computed(() =>
  props.description ? `${inputId.value}-description` : undefined
);
const errorId = computed(() => (props.error ? `${inputId.value}-error` : undefined));
const describedBy = computed(
  () => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined
);

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).checked);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-start gap-2">
      <input
        :id="inputId"
        v-bind="attrs"
        type="checkbox"
        :checked="modelValue"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :class="[
          'rounded-theme-sm border-border text-primary mt-0.5 h-4 w-4 disabled:cursor-not-allowed disabled:opacity-50',
          focusRing,
        ]"
        @change="onChange"
      />
      <label :for="inputId" :class="hideLabel ? 'sr-only' : 'text-text text-sm'">
        {{ label }}<span v-if="required" aria-hidden="true"> *</span>
      </label>
    </div>
    <p v-if="description" :id="descriptionId" class="text-muted text-sm">{{ description }}</p>
    <p v-if="error" :id="errorId" class="text-danger text-sm">{{ error }}</p>
  </div>
</template>
