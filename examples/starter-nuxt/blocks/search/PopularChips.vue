<script setup lang="ts">
/**
 * The `search` block's popular-search chips — a heading and a row of pill links back into the
 * results page. Two places on the results page show them, so they are written once here: the idle
 * state (no query yet, which is what `/search` with no `?q=` renders and what its prerendered HTML
 * says) and the no-results state's own `role="status"` stack. Not a block of its own (no
 * `block.json`): a plain colocated component, the same shape `TypeSection.vue` has.
 *
 * Every chip arrives with its href already built, by the one `searchHref()` in `Block.vue` — a
 * second place writing `?q=` is a second place for it to be written differently.
 */
import type { Component } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraIcon from '../../app/components/EldraIcon.vue';

defineProps<{
  heading: string;
  items: Array<{ label: string; href: string }>;
  /** `EldraRouterLink` when the results page is a path this site routes — resolved once by
   *  `Block.vue` rather than per chip here. */
  linkAs?: Component;
}>();

const CHIP_CLASS =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-4 ' +
  'text-body-sm font-medium text-text hover:border-text ' +
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] @tablet:min-h-9';
</script>

<template>
  <p class="text-body-sm text-text font-semibold">{{ heading }}</p>
  <ul class="flex flex-wrap gap-2">
    <li v-for="item in items" :key="item.label">
      <Link :href="item.href" :as="linkAs" :underline="false" :classes="{ root: CHIP_CLASS }">
        <EldraIcon name="search" size="sm" />
        {{ item.label }}
      </Link>
    </li>
  </ul>
</template>
