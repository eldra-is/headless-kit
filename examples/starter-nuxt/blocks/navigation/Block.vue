<script setup lang="ts">
/**
 * Header/primary navigation. `variant`:
 *  - `default`: brand + inline desktop links + CTA, hamburger only below `md`.
 *  - `centered`: brand centered on a three-column row (links | brand | actions) at `md`+. The DOM
 *    order stays brand-first (sensible for screen readers), so each of the three children pins an
 *    explicit `md:col-start-*` **and** `md:row-start-1` — CSS Grid's sparse auto-placement cursor
 *    only ever advances forward through DOM order, so a `grid-column` alone (no `grid-row`) on
 *    out-of-order children pushes the later ones to a second row once the cursor can't go back for
 *    a lower column; pinning the row explicitly keeps all three on row 1 regardless of DOM order.
 *  - `minimal`: brand + hamburger only, at every width — links and CTA live only in the drawer.
 * The mobile drawer always lists the same links (+ CTA) regardless of variant.
 */
import { computed, ref } from 'vue';
import { useBlockData } from '../../app/composables/useBlockData';
import { useId } from '../../app/composables/useId';
import { useT } from '../../app/composables/useT';
import { safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import UiButton from '../../app/components/ui/UiButton.vue';
import UiContainer from '../../app/components/ui/UiContainer.vue';
import UiDrawer from '../../app/components/ui/UiDrawer.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import UiLink from '../../app/components/ui/UiLink.vue';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

const t = useT();
const drawerId = `nav-drawer-${useId()}`;
const drawerOpen = ref(false);

const variant = computed(() => data.value.variant ?? 'default');
const links = computed(() => data.value.links ?? []);
const ctaHref = computed(() => safeHref(data.value.ctaHref));

const linkClass = [focusRing, 'rounded-theme-sm text-sm font-medium text-text hover:text-primary'];
</script>

<template>
  <header
    class="border-border bg-background border-b"
    :class="data.sticky ? 'sticky top-0 z-40' : ''"
  >
    <UiContainer size="wide">
      <nav
        :aria-label="t('nav.primary')"
        class="flex items-center justify-between gap-4 py-4"
        :class="
          variant === 'centered'
            ? 'md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:justify-normal'
            : ''
        "
      >
        <UiLink
          href="/"
          :class="[
            focusRing,
            'rounded-theme-sm flex items-center gap-2',
            variant === 'centered' ? 'md:col-start-2 md:row-start-1 md:justify-self-center' : '',
          ]"
        >
          <UiImage v-if="data.logo" :src="data.logo.url" :alt="data.brand" class="h-8 w-auto" />
          <span v-else class="font-heading text-text text-lg font-semibold">{{ data.brand }}</span>
        </UiLink>

        <ul
          v-if="variant !== 'minimal' && links.length > 0"
          class="hidden items-center gap-6 md:flex"
          :class="
            variant === 'centered' ? 'md:col-start-1 md:row-start-1 md:justify-self-start' : ''
          "
        >
          <li v-for="(link, index) in links" :key="index">
            <UiLink v-if="safeHref(link.href)" :href="link.href" :class="linkClass">{{
              link.label
            }}</UiLink>
          </li>
        </ul>

        <div
          class="flex items-center gap-3"
          :class="variant === 'centered' ? 'md:col-start-3 md:row-start-1 md:justify-self-end' : ''"
        >
          <UiButton
            v-if="variant !== 'minimal' && data.ctaLabel && ctaHref"
            :href="ctaHref"
            size="sm"
            class="hidden md:inline-flex"
          >
            {{ data.ctaLabel }}
          </UiButton>
          <UiButton
            variant="ghost"
            size="sm"
            :class="variant === 'minimal' ? '' : 'md:hidden'"
            :aria-expanded="drawerOpen ? 'true' : 'false'"
            :aria-controls="drawerId"
            @click="drawerOpen = true"
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
            </svg>
            <span class="sr-only">{{ t('nav.menu') }}</span>
          </UiButton>
        </div>
      </nav>
    </UiContainer>

    <UiDrawer
      :id="drawerId"
      :open="drawerOpen"
      :title="t('nav.menu')"
      side="right"
      @update:open="drawerOpen = $event"
    >
      <nav :aria-label="t('nav.primary')" class="flex flex-col gap-1">
        <ul class="flex flex-col gap-1">
          <li v-for="(link, index) in links" :key="index">
            <UiLink
              v-if="safeHref(link.href)"
              :href="link.href"
              :class="[
                focusRing,
                'rounded-theme-sm text-text hover:text-primary block py-2 text-base font-medium',
              ]"
              @click="drawerOpen = false"
            >
              {{ link.label }}
            </UiLink>
          </li>
        </ul>
        <UiButton
          v-if="data.ctaLabel && ctaHref"
          :href="ctaHref"
          class="mt-4"
          @click="drawerOpen = false"
        >
          {{ data.ctaLabel }}
        </UiButton>
      </nav>
    </UiDrawer>
  </header>
</template>
