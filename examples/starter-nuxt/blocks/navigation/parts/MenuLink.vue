<script setup lang="ts">
import { computed } from 'vue';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { isInternalHref } from '../../../app/utils/links';

/** `NavMenu`'s `linkAs`: a same-site destination routes, anything else is a plain anchor. */
const props = defineProps<{ to: string }>();

const internal = computed(() => isInternalHref(props.to));
</script>

<template>
  <EldraRouterLink v-if="internal" :to="to"><slot /></EldraRouterLink>
  <a v-else :href="to"><slot /></a>
</template>
