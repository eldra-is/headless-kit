<script setup lang="ts">
import { computed, provide } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { ACCORDION_KEY, type AccordionContext } from './context';
import type { AccordionProps } from './types';

const props = withDefaults(defineProps<AccordionProps>(), {
  multiple: true,
  name: undefined,
  classes: undefined,
});

/**
 * Spec "Accordion" → Properties, `name` row: "generated" when `multiple` is `false` and no `name`
 * is given. Called unconditionally — `useUiId` is a Vue composable and must run every `setup()`,
 * even on a `multiple` group where the id it produces goes unused.
 */
const generatedName = useUiId('accordion', () => props.name);

const context = computed<AccordionContext>(() => ({
  multiple: props.multiple,
  name: props.multiple ? undefined : generatedName.value,
}));

provide(ACCORDION_KEY, context);

/**
 * Spec "Accordion" → Sizes, "Dividers" row: "1px `border` above the list and below every item."
 * This is the "above the list" half; each `AccordionItem`'s own `border-b` supplies the rest,
 * including the line below the last item, so the list needs no bottom border of its own here.
 */
const rootClass = computed(() =>
  partClass(cx('flex flex-col border-t border-border'), props.classes, 'root')
);
</script>

<template>
  <div data-part="root" :class="rootClass">
    <slot />
  </div>
</template>
