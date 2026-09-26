<script setup lang="ts">
/**
 * Site footer. `variant`: `default` (brand + description, link groups, an
 * optional `newsletter` slot, legal line) or `minimal` (brand + legal line
 * only — no groups, no newsletter zone). The `newsletter` slot is declared
 * in `block.json` for a future newsletter-signup block (project 2); this
 * block only renders the zone when a child is actually placed in it.
 *
 * Every group link is resolved once in `groups` below: `safeHref` drops an
 * unsafe destination (the link is then not rendered at all — the component no
 * longer sanitises for us), and a same-site path takes Nuxt's router through
 * `Link`'s `as` (see `EldraRouterLink`). `tone="muted"` is the spec's tertiary
 * link — `muted` turning `text` on hover — which is what this footer used to
 * write out by hand.
 */
import { computed, useSlots } from 'vue';
import { Container, Link, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'footer'> }>();
const { data } = useBlockData(props, 'footer');

const slots = useSlots();
const variant = computed(() => data.value.variant ?? 'default');

const groups = computed(() =>
  (data.value.groups ?? []).map((group) => ({
    title: group.title,
    links: (group.links ?? []).flatMap((link) => {
      const href = safeHref(link.href);
      if (href === null) return [];
      return [{ label: link.label, href, as: isInternalHref(href) ? EldraRouterLink : undefined }];
    }),
  }))
);
</script>

<template>
  <Section
    as="footer"
    background="surface"
    spacing="md"
    :classes="{ root: 'border-border border-t' }"
  >
    <Container width="wide">
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
            <li v-for="(link, linkIndex) in group.links" :key="linkIndex">
              <Link :href="link.href" :as="link.as" tone="muted" :classes="{ root: 'text-sm' }">{{
                link.label
              }}</Link>
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
    </Container>
  </Section>
</template>
