<script setup lang="ts">
import { computed, provide } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { CHIP_GROUP_KEY, type ChipGroupContext } from './context';
import type { ChipGroupProps } from './types';

const props = withDefaults(defineProps<ChipGroupProps>(), {
  disabled: false,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [values: string[]];
}>();

function isSelected(value: string): boolean {
  return props.modelValue.includes(value);
}

/** Toggles `value` in `modelValue` and emits a new array — never the one it was given, the same
 *  rule `CheckboxGroup`'s own `toggle` follows, so a parent holding the old array in `v-model` is
 *  never mutated under it. */
function toggle(value: string): void {
  if (props.disabled) return;
  const next = isSelected(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value];
  emit('update:modelValue', next);
}

/**
 * This is the group's whole contribution to a child `Chip`: it does not render its children — a
 * consumer places `<Chip value="…" selectable>`s in the default slot, the same shape
 * `ButtonGroup` uses — so this is the only channel a member chip has to its selected state and a
 * way to flip it. See `context.ts`.
 */
const context = computed<ChipGroupContext>(() => ({
  isSelected,
  toggle,
  disabled: props.disabled,
}));
provide(CHIP_GROUP_KEY, context);

/**
 * `tokens.json`'s `space-2` token (spec "Spacing and layout" table) is described explicitly as
 * "Gap between button icon and label, **chip gaps**, dropdown trigger icon gap" — the wrap gap a
 * group of chips uses, distinct from `space-3`'s "gap inside control groups" (`ButtonGroup`'s own
 * loose `gap-3`), which is a wider gap for a row of whole controls rather than a row of chips.
 */
const rootClass = computed(() => partClass(cx('flex flex-wrap gap-2'), props.classes, 'root'));
</script>

<template>
  <div
    data-part="root"
    role="group"
    :aria-label="label"
    :aria-disabled="disabled ? 'true' : undefined"
    :class="rootClass"
  >
    <slot />
  </div>
</template>
