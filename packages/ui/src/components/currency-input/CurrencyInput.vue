<script setup lang="ts">
/**
 * A money field: `UnitInput` with `isCurrency` always on — the same twenty-line wrapper the
 * private library ships, and a one-to-one port of it (see `UnitInput`'s own doc comment, and the
 * README's "Additions beyond the spec" for the deliberate departures).
 *
 * Everything else is `UnitInput`'s: the live formatting, the caret mapping, the drag handle, the
 * clear button, the field context and the parts. `currency` defaults to `USD` and `narrowSymbol`
 * to `true`, so `$` is shown rather than `US$` where a locale distinguishes the two.
 *
 * **Only props that were actually passed are forwarded.** Handing `UnitInput` every declared prop,
 * `undefined` included, would make it see a bound `modelValue` on a field nobody bound — and a
 * bound `modelValue` is a promise that the parent writes the value back, so an uncontrolled field
 * would clear itself one tick after every keystroke. The private wrapper spreads its props
 * wholesale and has exactly that edge; this one does not.
 */
import { computed } from 'vue';
import UnitInput from '../unit-input/UnitInput.vue';
import type { CurrencyInputProps } from './types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<CurrencyInputProps>(), {
  currency: 'USD',
  narrowSymbol: true,
});

const forwarded = computed(() => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
});
</script>

<template>
  <UnitInput v-bind="{ ...forwarded, ...$attrs }" is-currency>
    <template v-for="(_, slotName) in $slots" #[slotName]="scope">
      <slot :name="slotName" v-bind="scope ?? {}" />
    </template>
  </UnitInput>
</template>
