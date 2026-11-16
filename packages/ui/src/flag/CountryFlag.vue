<!--
  One country's flag, 1.25 × 0.875rem (3:2), by its ISO 3166-1 alpha-2 code. Decorative unless it
  is given a `label`: beside a country's name (a select's row, the phone field's button) the name
  already says it. The same element before and after the artwork loads (see `./flags.ts`), so its
  box never changes; a code with no flag stays the empty box.
-->
<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useEldraScope } from '../composables/useEldraScope';
import { countryFlag, preloadCountryFlags } from './flags';

const props = defineProps<{
  /** ISO 3166-1 alpha-2 code, in either case (`IS`, `no`). */
  country: string;
  /** Names the flag for assistive technology. Leave it out where the country is named in text. */
  label?: string;
}>();

const eldra = useEldraScope();

onMounted(() => {
  void preloadCountryFlags();
});

const art = computed(() => countryFlag(props.country));
// Bound through an object, never `v-html`: Vue re-applies a `v-html` value on hydration.
const drawn = computed(() =>
  art.value === undefined ? {} : { viewBox: art.value.viewBox, innerHTML: art.value.body }
);
const named = computed(() =>
  props.label === undefined || props.label === ''
    ? { 'aria-hidden': 'true' as const }
    : { role: 'img', 'aria-label': props.label }
);
</script>

<template>
  <svg
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="flag"
    class="eldra:h-3.5 eldra:w-5 eldra:shrink-0 eldra:eldra-phone-flag"
    preserveAspectRatio="none"
    focusable="false"
    v-bind="{ ...named, ...drawn }"
  />
</template>
