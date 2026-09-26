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
 *
 * Links are `@eldrajs/ui`'s `Link`, resolved once in `links` below: `safeHref`
 * drops an unsafe destination and a same-site path routes through Nuxt's
 * router via `as` (see `EldraRouterLink`). The hamburger is an icon-only
 * `Button` whose accessible name is its `label`, so the `sr-only` span the
 * hand-rolled button needed is gone.
 *
 * The mobile menu is `@eldrajs/ui`'s `Drawer`, `side="left"` — the package's own convention for a
 * menu drawer (`right` is for a cart/filters/quick-view sheet). Its own doc comment (`Drawer.vue`)
 * puts initial focus on the first focusable element for a left-side drawer, which is exactly this
 * menu's own first link, so no `autofocus` override is needed here. `drawerId` still exists only
 * so the hamburger's `aria-controls` can name it — `id` reaches the drawer's root `<dialog>`
 * through Vue's own single-root attribute fallthrough, the same as it did on the old hand-rolled
 * `UiDrawer`.
 */
import { computed, ref } from 'vue';
import { Button, Container, Drawer, Link, Section } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useUiId } from '../../app/composables/useUiId';
import { useT } from '../../app/composables/useT';
import { isInternalHref, safeHref } from '../../app/utils/links';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

const t = useT();
const drawerId = `nav-drawer-${useUiId()}`;
const drawerOpen = ref(false);

const variant = computed(() => data.value.variant ?? 'default');
const ctaHref = computed(() => safeHref(data.value.ctaHref));
/**
 * Only a same-site destination routes through the router — see `EldraRouterLink`. `Button` takes
 * the same `as` as `Link` does, so the header's call to action and the drawer's copy of it route
 * instead of reloading the document, exactly as the nav links beside them already do (`links`
 * above) and as the hero and cta blocks do.
 */
const ctaLinkAs = computed(() =>
  ctaHref.value !== null && isInternalHref(ctaHref.value) ? EldraRouterLink : undefined
);
const links = computed(() =>
  (data.value.links ?? []).flatMap((link) => {
    const href = safeHref(link.href);
    if (href === null) return [];
    return [{ label: link.label, href, as: isInternalHref(href) ? EldraRouterLink : undefined }];
  })
);
</script>

<template>
  <Section
    as="header"
    background="none"
    spacing="none"
    :classes="{
      root: ['border-border border-b', data.sticky ? 'sticky top-0 z-40' : ''].join(' '),
    }"
  >
    <Container width="wide">
      <nav
        :aria-label="t('nav.primary')"
        class="flex items-center justify-between gap-4 py-4"
        :class="
          variant === 'centered'
            ? 'md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:justify-normal'
            : ''
        "
      >
        <Link
          href="/"
          :as="EldraRouterLink"
          variant="standalone"
          :classes="{
            root: [
              'flex items-center gap-2 hover:no-underline active:no-underline',
              variant === 'centered' ? 'md:col-start-2 md:row-start-1 md:justify-self-center' : '',
            ].join(' '),
          }"
        >
          <img
            v-if="data.logo"
            :src="data.logo.url"
            :alt="data.brand"
            class="h-8 w-auto"
            loading="eager"
            decoding="async"
          />
          <span v-else class="font-heading text-text text-lg font-semibold">{{ data.brand }}</span>
        </Link>

        <ul
          v-if="variant !== 'minimal' && links.length > 0"
          class="hidden items-center gap-6 md:flex"
          :class="
            variant === 'centered' ? 'md:col-start-1 md:row-start-1 md:justify-self-start' : ''
          "
        >
          <li v-for="(link, index) in links" :key="index">
            <Link
              :href="link.href"
              :as="link.as"
              variant="standalone"
              :classes="{ root: 'text-sm font-medium' }"
              >{{ link.label }}</Link
            >
          </li>
        </ul>

        <div
          class="flex items-center gap-3"
          :class="variant === 'centered' ? 'md:col-start-3 md:row-start-1 md:justify-self-end' : ''"
        >
          <Button
            v-if="variant !== 'minimal' && data.ctaLabel && ctaHref"
            :href="ctaHref"
            :as="ctaLinkAs"
            size="sm"
            variant="primary"
            :classes="{ container: 'hidden md:inline-flex' }"
          >
            {{ data.ctaLabel }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :label="t('nav.menu')"
            :classes="{ container: variant === 'minimal' ? '' : 'md:hidden' }"
            :aria-expanded="drawerOpen ? 'true' : 'false'"
            :aria-controls="drawerId"
            @click="drawerOpen = true"
          >
            <template #leadingIcon>
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
              </svg>
            </template>
          </Button>
        </div>
      </nav>
    </Container>

    <Drawer :id="drawerId" v-model="drawerOpen" :title="t('nav.menu')" side="left">
      <nav :aria-label="t('nav.primary')" class="flex flex-col gap-1">
        <ul class="flex flex-col gap-1">
          <li v-for="(link, index) in links" :key="index">
            <Link
              :href="link.href"
              :as="link.as"
              variant="standalone"
              :classes="{ root: 'block py-2 text-base font-medium' }"
              @click="drawerOpen = false"
            >
              {{ link.label }}
            </Link>
          </li>
        </ul>
        <Button
          v-if="data.ctaLabel && ctaHref"
          :href="ctaHref"
          :as="ctaLinkAs"
          variant="primary"
          :classes="{ container: 'mt-4' }"
          @click="drawerOpen = false"
        >
          {{ data.ctaLabel }}
        </Button>
      </nav>
    </Drawer>
  </Section>
</template>
