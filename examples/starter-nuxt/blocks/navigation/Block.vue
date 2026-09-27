<script setup lang="ts">
/**
 * Header (design spec 2, lines 76-238). apiId stays `navigation` (controller ruling: renaming it
 * would orphan every Studio page that uses it); `Header` is only the display name.
 *
 * Layout: a 4-column grid (`auto minmax(0,1fr) auto auto`) whose DOM order is always
 * `menuButton, brand, links, search, actions` — the same "DOM order stays sensible for screen
 * readers, CSS reorders visually" approach the pre-rebuild block used for its `centered` variant
 * (see its own comment, now generalised). Hiding the menu button at `@content:` (64rem of *block*
 * width, not viewport — every breakpoint here is a `@container` variant measured against
 * `Section`'s own `@container` root, which `as="header"` keeps) or hiding the links list below it
 * lets the grid's implicit auto-placement
 * produce the right column order for `default`/`minimal` with no explicit `col-start` at all;
 * `centered` needs explicit placement because its visual order (search, brand, actions, with links
 * on a second row) differs from DOM order.
 *
 * Mega-menus are theme-drawn disclosures (`<button aria-expanded aria-controls>` + a panel placed
 * right after the trigger in the DOM), not a package component — the design spec is explicit that
 * they are "non-modal disclosures, never dialogs" and the plan's "Uses" list for this block never
 * names a popover/select primitive. `menuLinks` (this starter's flattened form of the spec's
 * `links[].groups[].links`, needed because Core's composite nesting depth is 5 and
 * `links -> composite -> groups -> composite -> links` would be 5 already before `link` itself)
 * groups into columns by treating consecutive items that share `group` as one column, in order.
 */
import { computed, nextTick, onBeforeUnmount, ref, watchEffect } from 'vue';
import {
  Badge,
  Button,
  Container,
  Drawer,
  EditorPlaceholder,
  Link,
  Section,
  SearchBar,
  SearchModal,
} from '@eldrajs/ui';
import type { SearchResultItem, SearchResults } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import UiImage from '../../app/components/ui/UiImage.vue';
import { isInternalHref, safeHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import type { StorefrontSearchResponse } from '../../app/storefront/types';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

const t = useT();
const isEditing = useEditing();
const storefront = useStorefront();

type NavLink = NonNullable<EldraBlockData['navigation']['links']>[number];
type MenuLink = NonNullable<NavLink['menuLinks']>[number];

const variant = computed<'default' | 'centered' | 'minimal'>(() => data.value.variant ?? 'default');

// --- brand -----------------------------------------------------------------------------------

const brandLogoUrl = computed(() => data.value.brandLogo?.url);
const brandHref = '/';

// --- links + mega-menus ------------------------------------------------------------------------

const rawLinks = computed<NavLink[]>(() => data.value.links ?? []);

/** `safeHref`, normalised to `undefined` (never `null`) — the shape every `@eldrajs/ui` `href`
 *  prop takes. */
function toHref(value: unknown): string | undefined {
  return safeHref(value) ?? undefined;
}
function toLinkAs(href: string | undefined): typeof EldraRouterLink | undefined {
  return href !== undefined && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** Resolved links: `href` passed through `safeHref` (dropped if unsafe/absent), `as` set for a
 *  same-site destination. A link with `menuLinks` never navigates itself (spec: the trigger is a
 *  disclosure, not a link), so its own `href` is only kept for reference and never rendered. */
const links = computed(() =>
  rawLinks.value.map((link) => {
    const href = toHref(link.href);
    return {
      label: link.label,
      href,
      as: toLinkAs(href),
      groups: groupMenuLinks(link.menuLinks),
      features: (link.features ?? []).slice(0, 2).map((feature) => {
        const featureHref = toHref(feature.href);
        return {
          image: feature.image,
          label: feature.label,
          href: featureHref,
          as: toLinkAs(featureHref),
        };
      }),
    };
  })
);

interface MenuGroup {
  title?: string;
  links: Array<{ label: string; href: string | undefined; as?: typeof EldraRouterLink }>;
}

/** Consecutive `menuLinks` entries that share `group` become one column, in the order they were
 *  authored — the flattened form's own rule (block.json `links[].menuLinks` help text). */
function groupMenuLinks(menuLinks: MenuLink[] | undefined): MenuGroup[] {
  const groups: MenuGroup[] = [];
  for (const entry of menuLinks ?? []) {
    const href = toHref(entry.href);
    const row = { label: entry.label, href, as: toLinkAs(href) };
    const last = groups[groups.length - 1];
    if (last !== undefined && last.title === entry.group) {
      last.links.push(row);
    } else {
      groups.push({ title: entry.group, links: [row] });
    }
  }
  return groups;
}

const hasMegaMenu = (index: number): boolean => links.value[index]!.groups.length > 0;

// --- mega-menu open state (bar) -------------------------------------------------------------

const openMenuIndex = ref<number | null>(null);
const menuIds = computed(() =>
  links.value.map((_, index) => ({
    trigger: `${uid}-trigger-${index}`,
    panel: `${uid}-panel-${index}`,
  }))
);
const uid = useUiId();

let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function clearHoverTimer(): void {
  if (hoverTimer !== undefined) clearTimeout(hoverTimer);
  hoverTimer = undefined;
}
function toggleMenu(index: number): void {
  clearHoverTimer();
  openMenuIndex.value = openMenuIndex.value === index ? null : index;
}
function closeMenu(): void {
  clearHoverTimer();
  openMenuIndex.value = null;
}
/** "Hover may open a panel after 150ms" — never immediately, so a bare pointer pass-over never
 *  opens anything (spec: "nothing opens on hover alone"). */
function onTriggerMouseEnter(index: number): void {
  clearHoverTimer();
  hoverTimer = setTimeout(() => {
    openMenuIndex.value = index;
    hoverTimer = undefined;
  }, 150);
}
function onTriggerMouseLeave(): void {
  clearHoverTimer();
}
function onTriggerKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleMenu(index);
  } else if (event.key === 'Escape' && openMenuIndex.value === index) {
    event.preventDefault();
    closeMenuAndFocusTrigger(index);
  }
}
function onPanelKeydown(index: number, event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenuAndFocusTrigger(index);
  }
}
function closeMenuAndFocusTrigger(index: number): void {
  closeMenu();
  void nextTick(() => {
    document.getElementById(menuIds.value[index]!.trigger)?.focus();
  });
}

onBeforeUnmount(clearHoverTimer);

// --- drawer (mobile menu) --------------------------------------------------------------------

const drawerOpen = ref(false);
const drawerId = `${uid}-drawer`;
const drawerExpanded = ref<Set<number>>(new Set());
function toggleDrawerGroup(index: number): void {
  const next = new Set(drawerExpanded.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  drawerExpanded.value = next;
}

function onMenuButtonClick(): void {
  drawerOpen.value = true;
}

// --- call to action ----------------------------------------------------------------------------

const ctaHref = computed(() => toHref(data.value.ctaHref));
const ctaLinkAs = computed(() => toLinkAs(ctaHref.value));
const hasCta = computed(() => Boolean(data.value.ctaLabel && ctaHref.value));

// --- search ------------------------------------------------------------------------------------

const showSearch = computed(() => data.value.showSearch !== false);
/** `inline` only ever applies to `centered`; otherwise it falls back to `icon` (spec: "inline:
 *  centered variant only"). */
const searchStyle = computed<'icon' | 'field' | 'inline'>(() => {
  const style = data.value.searchStyle ?? 'icon';
  return style === 'inline' && variant.value !== 'centered' ? 'icon' : style;
});

const searchOpen = ref(false);
const searchQuery = ref('');
const searchResult = storefront.search.run(searchQuery);

function formatSearchPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function toSearchResults(response: StorefrontSearchResponse | null): SearchResults | undefined {
  if (response === null) return undefined;
  const products: SearchResultItem[] = response.products.map((product) => ({
    id: product.variantId,
    title: product.title,
    href: product.url,
    price: formatSearchPrice(product.price.amount),
    image: product.featuredImage?.src,
    imageAlt: product.featuredImage?.alt,
  }));
  const articles: SearchResultItem[] = response.articles.map((article, index) => ({
    id: `article-${index}`,
    title: article.title,
    href: article.href,
    image: article.image?.src,
    imageAlt: article.image?.alt,
  }));
  const pages: SearchResultItem[] = response.pages.map((page, index) => ({
    id: `page-${index}`,
    title: page.title,
    href: page.href,
  }));
  return { products, collections: [], articles, pages, total: response.total };
}

const searchResults = computed(() => toSearchResults(searchResult.data.value));

function openSearch(): void {
  searchOpen.value = true;
}

// --- account -----------------------------------------------------------------------------------

const showAccount = computed(() => data.value.showAccount !== false);
const accountHref = '/account';

// --- cart --------------------------------------------------------------------------------------

const cartCount = computed(() => storefront.cart.count.value);
const cartDrawerAvailable = computed(() => storefront.cart.drawerAvailable.value);
const cartHref = computed(() => (cartDrawerAvailable.value ? undefined : '/cart'));
const cartAccessibleName = computed(() => {
  const count = cartCount.value;
  if (count === 0) return t('header.cartEmpty');
  if (count === 1) return t('header.cartOne');
  return t('header.cartMany', { count });
});
const cartBadgeLabel = computed(() => (cartCount.value > 99 ? '99+' : String(cartCount.value)));

function onCartClick(): void {
  if (cartDrawerAvailable.value)
    storefront.cart.drawerOpen.value = !storefront.cart.drawerOpen.value;
}

// --- current page ------------------------------------------------------------------------------

/**
 * `window.location` (a plain browser API, not a Nuxt global — `useRoute()` is what the starter's
 * "no Nuxt globals in blocks" rule forbids) is the only way a block can tell which link is
 * "current" without reading the router. `popstate` catches back/forward navigation; a same-site
 * `Link`/`Button` click elsewhere on the page (pushed via the router, not a full reload) does not
 * fire it, so the highlighted link can go stale until the next popstate/reload — a known
 * limitation of staying router-free, not something this block can close without one.
 */
const currentPath = ref(typeof window === 'undefined' ? '' : window.location.pathname);
watchEffect((onCleanup) => {
  const onPopState = (): void => {
    currentPath.value = window.location.pathname;
  };
  window.addEventListener('popstate', onPopState);
  onCleanup(() => window.removeEventListener('popstate', onPopState));
});
function isCurrent(href: string | undefined): boolean {
  return href !== undefined && href === currentPath.value;
}

// --- sticky, scroll padding and scrolled shadow -----------------------------------------------

const sticky = computed(() => data.value.sticky !== false);
const scrolled = ref(false);
function onScroll(): void {
  scrolled.value = window.scrollY > 0;
}
watchEffect((onCleanup) => {
  window.addEventListener('scroll', onScroll, { passive: true });
  onCleanup(() => window.removeEventListener('scroll', onScroll));
});
/** Spec "Header" → Accessibility, "Sticky header and focus": scroll padding equal to the sticky
 *  bar's height (2.4.11), so a focused/anchored target is never hidden under it. */
watchEffect((onCleanup) => {
  if (!sticky.value) return;
  document.documentElement.style.setProperty('scroll-padding-top', '5rem');
  onCleanup(() => document.documentElement.style.removeProperty('scroll-padding-top'));
});

// --- transparent-over-hero -----------------------------------------------------------------------

/**
 * The block reads only its own field: it has no way to see the next block on the page (blocks
 * never inspect siblings or the DOM outside themselves — see `docs/starter-kit.md`). `sticky`'s
 * own effect (2.4.11) is unconditional; the "only when the next block really is a Hero
 * `image-background`" half of the spec's rule is a page-composition concern outside a single
 * block's own `__tests__/Block.spec.ts` — proven at the page level once a page fixture pairs the
 * two (design doc §"Sample-page templates"). `data-eldra-transparent` is the hook that pairing
 * reads/sets; this block turns the visual state on whenever `transparentOverHero` is on and the
 * bar hasn't already turned solid on its own (scrolled, or a menu open).
 */
const transparentOverHero = computed(() => data.value.transparentOverHero === true);
const isTransparent = computed(
  () =>
    transparentOverHero.value &&
    !scrolled.value &&
    openMenuIndex.value === null &&
    !drawerOpen.value
);

/**
 * `@eldrajs/ui`'s `classes` prop takes a plain string per part (`Partial<Record<Part, string>>`),
 * never an array — `Section`'s own `partClass`/`cx` treats a non-string, non-falsy value as the
 * `Record<string, boolean>` branch of its `ClassValue` union, which for a plain array reads its
 * numeric indices as "class names" and their truthy values as "on": an empty-string entry at index
 * 3 (falsy) got dropped and the three truthy entries before it came back out as the class string
 * `"0 1 2"` — every real utility class silently lost. Every conditional class list handed to a
 * `classes` prop in this file is therefore joined into one string with `[...].filter(Boolean).join(' ')`,
 * never left as an array.
 */
const barRootClasses = computed(() =>
  [
    '@container',
    sticky.value ? 'sticky top-0 z-40' : '',
    isTransparent.value
      ? 'bg-transparent text-primary-contrast'
      : 'bg-background text-text border-b border-border',
    scrolled.value && !isTransparent.value ? 'shadow-sm' : '',
  ]
    .filter(Boolean)
    .join(' ')
);

const hairlineClass = computed(() =>
  isTransparent.value ? 'border-primary-contrast/24' : 'border-border'
);

// --- menu button visibility ----------------------------------------------------------------------

const menuButtonHiddenClass = computed(() =>
  variant.value === 'minimal' ? '' : '@content:hidden'
);
const linksVisible = computed(() => variant.value !== 'minimal' && links.value.length > 0);

const brandPositionClass = computed(() =>
  variant.value === 'centered'
    ? '@content:col-start-2 @content:row-start-1 @content:justify-self-center'
    : ''
);
const linksPositionClass = computed(() =>
  variant.value === 'centered'
    ? `hidden @content:flex @content:col-start-1 @content:col-span-4 @content:row-start-2 @content:justify-center @content:border-t ${hairlineClass.value} @content:pt-3 @content:mt-1`
    : 'hidden @content:flex @content:col-start-2 @content:row-start-1'
);
const searchPositionClass = computed(() =>
  variant.value === 'centered' ? '@content:col-start-1 @content:row-start-1' : ''
);
const actionsPositionClass = computed(() =>
  variant.value === 'centered' ? '@content:col-start-4 @content:row-start-1' : ''
);
</script>

<template>
  <Section
    as="header"
    background="none"
    spacing="none"
    :data-eldra-transparent="isTransparent ? 'true' : undefined"
    :classes="{ root: barRootClasses }"
  >
    <Container width="wide">
      <nav
        :aria-label="t('header.primary')"
        class="@tablet:h-16 @tablet:gap-4 @content:h-[4.5rem] grid h-16 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1"
      >
        <Button
          :classes="{ container: menuButtonHiddenClass }"
          variant="ghost"
          size="sm"
          :icon-only="variant !== 'minimal'"
          :label="t('header.openMenu')"
          aria-haspopup="dialog"
          :aria-expanded="drawerOpen ? 'true' : 'false'"
          :aria-controls="drawerId"
          @click="onMenuButtonClick"
        >
          <template #leadingIcon>
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </template>
          <template v-if="variant === 'minimal'">{{ t('header.menu') }}</template>
        </Button>

        <Link
          :href="brandHref"
          :as="EldraRouterLink"
          variant="standalone"
          :underline="false"
          data-eldra-header-focus
          :classes="{
            root: `flex min-h-11 min-w-0 items-center gap-2 rounded-sm px-1 font-heading text-lg font-bold tracking-tight ${brandPositionClass}`,
          }"
        >
          <img
            v-if="brandLogoUrl"
            :src="brandLogoUrl"
            :alt="data.brandText"
            class="h-8 w-auto max-w-40 object-contain"
            loading="eager"
            decoding="async"
          />
          <!-- The spec keeps the wordmark from ever wrapping (block.json's own 20-character
               maxLength keeps it fitting in the ordinary case); `min-w-0` on the root above stops
               a CSS Grid item's default intrinsic min-width from blowing the brand column out
               into its neighbours on very narrow viewports, and this span's own truncation is the
               graceful fallback for the rare case that still doesn't leave enough room. -->
          <span v-else class="overflow-hidden text-ellipsis whitespace-nowrap">{{
            data.brandText
          }}</span>
        </Link>

        <ul v-if="linksVisible" :class="['list-none items-center gap-1', linksPositionClass]">
          <li v-for="(link, index) in links" :key="index" class="relative">
            <button
              v-if="hasMegaMenu(index)"
              :id="menuIds[index]!.trigger"
              type="button"
              :class="[
                focusRing,
                'inline-flex h-10 items-center gap-1 rounded-sm px-3 text-sm font-medium',
                openMenuIndex === index ? 'font-semibold underline underline-offset-4' : '',
              ]"
              :aria-expanded="openMenuIndex === index ? 'true' : 'false'"
              :aria-controls="menuIds[index]!.panel"
              @click="toggleMenu(index)"
              @keydown="onTriggerKeydown(index, $event)"
              @mouseenter="onTriggerMouseEnter(index)"
              @mouseleave="onTriggerMouseLeave"
            >
              {{ link.label }}
              <svg
                class="size-3.5 transition-transform motion-reduce:transition-none"
                :class="openMenuIndex === index ? 'rotate-180' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 9l6 6l6 -6" />
              </svg>
            </button>
            <Link
              v-else
              :href="link.href"
              :as="link.as"
              variant="standalone"
              :underline="false"
              :aria-current="isCurrent(link.href) ? 'page' : undefined"
              :classes="{
                root: `inline-flex h-10 items-center px-3 text-sm font-medium ${isCurrent(link.href) ? 'font-semibold underline underline-offset-4' : ''}`,
              }"
            >
              {{ link.label }}
            </Link>

            <div
              v-if="hasMegaMenu(index)"
              v-show="openMenuIndex === index"
              :id="menuIds[index]!.panel"
              class="border-border bg-background absolute top-full left-0 z-30 grid w-screen max-w-4xl grid-cols-[minmax(0,1fr)_auto] gap-12 border-t border-b p-8 shadow-md"
              @keydown="onPanelKeydown(index, $event)"
              @mouseenter="clearHoverTimer"
              @mouseleave="onTriggerMouseLeave"
            >
              <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-8">
                <div v-for="(group, groupIndex) in link.groups" :key="groupIndex">
                  <p
                    :id="`${menuIds[index]!.panel}-g${groupIndex}`"
                    class="text-muted mb-3 text-xs font-semibold tracking-[0.12em] uppercase"
                  >
                    {{ group.title }}
                  </p>
                  <ul
                    :aria-labelledby="`${menuIds[index]!.panel}-g${groupIndex}`"
                    class="flex list-none flex-col"
                  >
                    <li v-for="(row, rowIndex) in group.links" :key="rowIndex">
                      <Link
                        :href="row.href"
                        :as="row.as"
                        variant="standalone"
                        :underline="false"
                        :classes="{ root: 'text-text flex min-h-9 items-center text-sm' }"
                      >
                        {{ row.label }}
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
              <div v-if="link.features.length > 0" class="grid grid-cols-2 gap-6">
                <Link
                  v-for="(feature, featureIndex) in link.features"
                  :key="featureIndex"
                  :href="feature.href"
                  :as="feature.as"
                  variant="standalone"
                  :underline="false"
                  :classes="{ root: 'block w-60' }"
                >
                  <UiImage
                    v-if="feature.image"
                    :src="feature.image.url"
                    :alt="feature.image.altText ?? ''"
                    aspect="4/3"
                    rounded="lg"
                  />
                  <span class="mt-3 flex items-center gap-1 text-sm font-semibold">
                    {{ feature.label }}
                    <svg
                      class="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M5 12h14M13 6l6 6l-6 6" />
                    </svg>
                  </span>
                </Link>
              </div>
            </div>
          </li>
        </ul>
        <EditorPlaceholder
          v-else-if="isEditing && variant !== 'minimal' && links.length === 0"
          inline
          :label="t('editor.addLink')"
          :classes="{ root: linksPositionClass }"
        />

        <div :class="['flex items-center', searchPositionClass]">
          <template v-if="showSearch">
            <Button
              v-if="searchStyle === 'icon'"
              variant="ghost"
              size="sm"
              icon-only
              :label="t('header.search')"
              aria-haspopup="dialog"
              @click="openSearch"
            >
              <template #leadingIcon>
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
                  <path d="M21 21l-6 -6" />
                </svg>
              </template>
            </Button>
            <template v-else-if="searchStyle === 'field'">
              <Button
                variant="outline"
                size="sm"
                aria-haspopup="dialog"
                :classes="{ container: 'hidden rounded-full @content:inline-flex' }"
                @click="openSearch"
              >
                {{ t('header.searchField') }}
                <span class="text-muted ml-2 text-xs">⌘K</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon-only
                :label="t('header.search')"
                aria-haspopup="dialog"
                :classes="{ container: '@content:hidden' }"
                @click="openSearch"
              >
                <template #leadingIcon>
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
                    <path d="M21 21l-6 -6" />
                  </svg>
                </template>
              </Button>
            </template>
            <template v-else>
              <SearchBar
                v-model="searchQuery"
                size="md"
                pill
                :label="t('header.searchField')"
                :results="searchResults"
                :loading="searchResult.pending.value"
                :classes="{ root: 'hidden w-64 @content:block' }"
              />
              <Button
                variant="ghost"
                size="sm"
                icon-only
                :label="t('header.search')"
                aria-haspopup="dialog"
                :classes="{ container: '@content:hidden' }"
                @click="openSearch"
              >
                <template #leadingIcon>
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
                    <path d="M21 21l-6 -6" />
                  </svg>
                </template>
              </Button>
            </template>
          </template>
        </div>

        <div :class="['flex items-center gap-1', actionsPositionClass]">
          <Button
            v-if="showAccount && variant !== 'minimal'"
            variant="ghost"
            size="sm"
            icon-only
            :label="t('header.account')"
            :href="accountHref"
            :classes="{ container: 'hidden @content:inline-flex' }"
            :as="EldraRouterLink"
          >
            <template #leadingIcon>
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
              </svg>
            </template>
          </Button>

          <span class="relative inline-flex">
            <Button
              variant="ghost"
              size="sm"
              icon-only
              :label="cartAccessibleName"
              :href="cartHref"
              :as="toLinkAs(cartHref)"
              @click="onCartClick"
            >
              <template #leadingIcon>
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z"
                  />
                  <path d="M9 11v-5a3 3 0 0 1 6 0v5" />
                </svg>
              </template>
            </Button>
            <Badge
              v-if="cartCount > 0"
              aria-hidden="true"
              tone="primary"
              pill
              :label="cartBadgeLabel"
              :classes="{
                root: 'absolute -top-0.5 -right-0.5 min-w-5 justify-center px-1 text-[0.6875rem] leading-4',
                label: 'tabular-nums',
              }"
            />
          </span>

          <Button
            v-if="hasCta && variant !== 'minimal'"
            variant="primary"
            size="sm"
            :href="ctaHref"
            :as="ctaLinkAs"
            :classes="{ container: 'hidden @content:inline-flex' }"
          >
            {{ data.ctaLabel }}
          </Button>
        </div>
      </nav>
    </Container>

    <Drawer :id="drawerId" v-model="drawerOpen" side="left" :aria-label="t('header.menu')">
      <div>
        <ul class="list-none">
          <li v-for="(link, index) in links" :key="index" class="border-border border-b">
            <button
              v-if="hasMegaMenu(index)"
              type="button"
              :class="[
                focusRing,
                'font-heading flex min-h-14 w-full items-center justify-between text-xl font-semibold',
              ]"
              :aria-expanded="drawerExpanded.has(index) ? 'true' : 'false'"
              :aria-controls="`${uid}-drawer-panel-${index}`"
              @click="toggleDrawerGroup(index)"
            >
              {{ link.label }}
              <svg
                class="size-4 transition-transform motion-reduce:transition-none"
                :class="drawerExpanded.has(index) ? 'rotate-180' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 9l6 6l6 -6" />
              </svg>
            </button>
            <Link
              v-else
              :href="link.href"
              :as="link.as"
              variant="standalone"
              :underline="false"
              :aria-current="isCurrent(link.href) ? 'page' : undefined"
              :classes="{
                root: 'flex min-h-14 w-full items-center font-heading text-xl font-semibold',
              }"
              @click="drawerOpen = false"
            >
              {{ link.label }}
            </Link>

            <div
              v-if="hasMegaMenu(index)"
              v-show="drawerExpanded.has(index)"
              :id="`${uid}-drawer-panel-${index}`"
              class="grid gap-5 pb-5"
            >
              <div v-for="(group, groupIndex) in link.groups" :key="groupIndex">
                <p class="text-muted mb-1 text-xs font-semibold tracking-[0.12em] uppercase">
                  {{ group.title }}
                </p>
                <ul class="list-none">
                  <li v-for="(row, rowIndex) in group.links" :key="rowIndex">
                    <Link
                      :href="row.href"
                      :as="row.as"
                      variant="standalone"
                      :underline="false"
                      :classes="{ root: 'flex min-h-11 items-center text-sm' }"
                      @click="drawerOpen = false"
                    >
                      {{ row.label }}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <template #footer>
        <Button
          v-if="hasCta"
          variant="primary"
          block
          :href="ctaHref"
          :as="ctaLinkAs"
          @click="drawerOpen = false"
        >
          {{ data.ctaLabel }}
        </Button>
        <Link
          v-if="showAccount"
          :href="accountHref"
          :as="EldraRouterLink"
          variant="standalone"
          :underline="false"
          :classes="{ root: 'flex min-h-11 items-center gap-2 text-sm font-medium' }"
          @click="drawerOpen = false"
        >
          {{ t('header.account') }}
        </Link>
      </template>
    </Drawer>

    <SearchModal
      v-model="searchOpen"
      v-model:query="searchQuery"
      :results="searchResults"
      :loading="searchResult.pending.value"
    />
  </Section>
</template>
