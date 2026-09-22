<script setup lang="ts">
/**
 * Site footer. `variant`: `default` (brand + description, link groups, an
 * optional `newsletter` slot, legal line) or `minimal` (brand + legal line
 * only — no groups, no newsletter zone). The `newsletter` slot is declared
 * in `block.json` for a future newsletter-signup block (project 2); this
 * block only renders the zone when a child is actually placed in it.
 */
import { computed, useSlots } from 'vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { focusRing } from '../../app/utils/classes';
import UiContainer from '../../app/components/ui/UiContainer.vue';
import UiLink from '../../app/components/ui/UiLink.vue';

const props = defineProps<{ entry: EldraBlockEntry<'footer'> }>();
const { data } = useBlockData(props, 'footer');

const slots = useSlots();
const variant = computed(() => data.value.variant ?? 'default');
const groups = computed(() => data.value.groups ?? []);
const linkClass = [focusRing, 'rounded-theme-sm text-sm text-muted hover:text-text'];
</script>

<template>
  <footer class="border-border bg-surface border-t">
    <UiContainer size="wide" class="py-section">
      <div
        v-if="variant === 'default'"
        class="grid gap-10 md:grid-cols-[2fr_repeat(4,minmax(0,1fr))]"
      >
        <div>
          <p class="font-heading text-text text-lg font-semibold">{{ data.brand }}</p>
          <p v-if="data.description" class="text-muted mt-2 max-w-sm text-sm">
            {{ data.description }}
          </p>
        </div>
        <div v-for="(group, index) in groups" :key="index">
          <h2 class="text-text text-sm font-semibold">{{ group.title }}</h2>
          <ul class="mt-3 space-y-2">
            <li v-for="(link, linkIndex) in group.links ?? []" :key="linkIndex">
              <UiLink v-if="link.href" :href="link.href" :class="linkClass">{{
                link.label
              }}</UiLink>
            </li>
          </ul>
        </div>
      </div>
      <div v-else class="text-center">
        <p class="font-heading text-text text-lg font-semibold">{{ data.brand }}</p>
      </div>

      <div v-if="slots.newsletter" class="border-border mt-10 border-t pt-8">
        <slot name="newsletter" />
      </div>

      <div
        class="border-border text-muted mt-10 flex flex-col gap-4 border-t pt-6 text-sm"
        :class="
          variant === 'default'
            ? 'md:flex-row md:items-center md:justify-between'
            : 'items-center text-center'
        "
      >
        <p>{{ data.legal }}</p>
      </div>
    </UiContainer>
  </footer>
</template>
