<script setup lang="ts">
import { provide, ref } from 'vue';
import { ACCORDION_KEY } from '../../composables/useAccordion';

const props = withDefaults(defineProps<{ single?: boolean }>(), { single: false });

const openId = ref<string | null>(null);

provide(ACCORDION_KEY, {
  single: props.single,
  openId,
  setOpen: (id: string | null) => {
    openId.value = id;
  },
});
</script>

<template>
  <div class="divide-border border-border rounded-theme-md divide-y border">
    <slot />
  </div>
</template>
