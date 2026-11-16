<!--
  One country's flag, 1.25 × 0.875rem (3:2). Decorative wherever `PhoneInput` draws it: the country
  is named by the button's label and by the row's text. The same element before and after the
  artwork loads (see `./flags.ts`), so its box never changes.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useEldraScope } from '../composables/useEldraScope';
import { phoneFlag } from './flags';

const props = defineProps<{ country: string }>();

const eldra = useEldraScope();

const art = computed(() => phoneFlag(props.country));
// Bound through an object, never `v-html`: Vue re-applies a `v-html` value on hydration.
const drawn = computed(() =>
  art.value === undefined ? {} : { viewBox: art.value.viewBox, innerHTML: art.value.body }
);
</script>

<template>
  <svg
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="flag"
    class="eldra:h-3.5 eldra:w-5 eldra:shrink-0 eldra:eldra-phone-flag"
    preserveAspectRatio="none"
    aria-hidden="true"
    focusable="false"
    v-bind="drawn"
  />
</template>
