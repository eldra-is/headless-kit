<script setup lang="ts">
import { computed } from 'vue';
import { useT } from '../../composables/useT';

const props = withDefaults(
  defineProps<{
    amount: number;
    currency: string;
    compareAt?: number;
    locale?: string;
  }>(),
  { compareAt: undefined, locale: 'en-US' }
);

const t = useT();

const formatter = computed(
  () => new Intl.NumberFormat(props.locale, { style: 'currency', currency: props.currency })
);
const formattedAmount = computed(() => formatter.value.format(props.amount));
const formattedCompareAt = computed(() =>
  props.compareAt !== undefined ? formatter.value.format(props.compareAt) : null
);
const onSale = computed(() => props.compareAt !== undefined && props.compareAt > props.amount);
</script>

<template>
  <span class="inline-flex items-baseline gap-2">
    <template v-if="onSale">
      <span class="sr-only">{{ t('price.was') }}</span>
      <s class="text-muted">{{ formattedCompareAt }}</s>
      <span class="sr-only">{{ t('price.now') }}</span>
      <span class="font-semibold">{{ formattedAmount }}</span>
    </template>
    <span v-else class="font-semibold">{{ formattedAmount }}</span>
  </span>
</template>
