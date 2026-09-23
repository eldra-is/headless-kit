<script setup lang="ts">
/**
 * Native `<select>`; options come from the default slot as plain
 * `<option>`/`<optgroup>` elements (same philosophy as `UiAccordion`'s
 * `<details>`/`<summary>` and `UiDialog`'s `<dialog>` — native semantics
 * over a re-implemented listbox), so a consumer writes
 * `<UiSelect v-model="x" label="Country"><option value="is">Iceland</option>…</UiSelect>`.
 */
import { computed, useAttrs } from 'vue';
import { useUiId } from '../../composables/useUiId';
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
  }
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const attrs = useAttrs();
const generatedId = useUiId();
const inputId = computed(() => props.id ?? `ui-select-${generatedId}`);
const descriptionId = computed(() =>
  props.description ? `${inputId.value}-description` : undefined
);
const errorId = computed(() => (props.error ? `${inputId.value}-error` : undefined));
const describedBy = computed(
  () => [descriptionId.value, errorId.value].filter(Boolean).join(' ') || undefined
);

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="inputId" :class="hideLabel ? 'sr-only' : 'text-text text-sm font-medium'">
      {{ label }}<span v-if="required" aria-hidden="true"> *</span>
    </label>
    <div class="relative">
      <select
        :id="inputId"
        v-bind="attrs"
        :value="modelValue"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        :class="[inputBase, 'appearance-none pr-8']"
        @change="onChange"
      >
        <option v-if="placeholder" value="" disabled hidden>{{ placeholder }}</option>
        <slot />
      </select>
      <svg
        class="text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <p v-if="description" :id="descriptionId" class="text-muted text-sm">{{ description }}</p>
    <p v-if="error" :id="errorId" class="text-danger text-sm">{{ error }}</p>
  </div>
</template>
