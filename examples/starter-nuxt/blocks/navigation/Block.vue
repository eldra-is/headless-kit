<script setup lang="ts">
/**
 * Header (design spec 2, lines 76-238). apiId stays `navigation` (renaming it
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
 * names a popover/select primitive. A link's own `children` are its mega-menu, and consecutive
 * children sharing a `group` become one column, in order.
 *
 * An open panel spans the header's own content container rather than hanging under the trigger at
 * some width of its own: it is positioned against the `<nav>`, which *is* that container (the box
 * inside `Container`'s max-width and gutters), so `left-0 right-0` lands its edges exactly on the
 * brand's left edge and the actions' right edge whichever item opened it — the same box on every
 * variant, since each one lays its bar out inside the same `Container`. Its columns are a plain
 * 12-column grid, three columns per group, so four groups fill the row and one to three sit
 * left-aligned at the same width instead of stretching to fill.
 *
 * Every destination is a `link` value — a collection, product, page or entry the platform knows,
 * or an external URL — resolved to an href by `useEldraLink()`. A row whose target has been
 * deleted, or that the site has no route for, resolves to no href and renders its label as plain
 * text rather than a dead anchor; a row with no label at all renders nothing.
 */
import { computed, nextTick, onBeforeUnmount, ref, watchEffect } from 'vue';
import { useEldraLink } from '@eldrajs/theme-vue';
import type { ResolvedLink } from '@eldrajs/theme-vue';
import {
  Badge,
  Button,
  Container,
  Drawer,
  EditorPlaceholder,
  Link,
  SearchBar,
  SearchModal,
} from '@eldrajs/ui';
import type { SearchResultItem, SearchResults } from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useT } from '../../app/composables/useT';
import { useUiId } from '../../app/composables/useUiId';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref } from '../../app/utils/links';
import { focusRing } from '../../app/utils/classes';
import { formatMoney } from '../../app/storefront/money';
import type { StorefrontSearchResponse } from '../../app/storefront/types';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

const t = useT();
const isEditing = useEditing();
const storefront = useStorefront();

const variant = computed<'default' | 'centered' | 'minimal'>(() => data.value.variant ?? 'default');

// --- brand -----------------------------------------------------------------------------------

const brandLogoUrl = computed(() => data.value.brandLogo?.url);
const brandHref = '/';

// --- links + mega-menus ------------------------------------------------------------------------

const rawLinks = computed(() => data.value.links ?? []);

/** The site's own route authority: a `link` value in, `{ href, label, group, children }` out. */
const resolveLink = useEldraLink();

function toLinkAs(href: string | undefined): typeof EldraRouterLink | undefined {
  return href !== undefined && isInternalHref(href) ? EldraRouterLink : undefined;
}

interface NavRow {
  label: string;
  href: string | undefined;
  as?: typeof EldraRouterLink;
}

/** Resolved links. A row with no label has nothing to show and is dropped; a row whose target no
 *  longer exists keeps its label and loses its `href`, and the template renders it as plain text.
 *  A link with children never navigates itself (spec: the trigger is a disclosure, not a link), so
 *  its own href never sits on the trigger — a parent that *has* a destination (anything but a
 *  `kind: "none"` heading, which resolves to no href at all) offers it inside the panel instead, as
 *  the "View all" row. */
const links = computed(() =>
  rawLinks.value.flatMap((item) => {
    const resolved = resolveLink(item);
    if (resolved === null || resolved.label === null) return [];
    return [{ ...toRow(resolved), groups: groupChildren(resolved.children) }];
  })
);

interface MenuGroup {
  title?: string;
  links: NavRow[];
}

function toRow(resolved: ResolvedLink): NavRow {
  const href = resolved.href ?? undefined;
  return { label: resolved.label ?? '', href, as: toLinkAs(href) };
}

/** Consecutive children that share a `group` become one column, in the order they were authored —
 *  the field's own rule (block.json `links` help text). */
function groupChildren(children: ResolvedLink[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  for (const child of children) {
    if (child.label === null) continue;
    const title = child.group ?? undefined;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.title === title) {
      last.links.push(toRow(child));
    } else {
      groups.push({ title, links: [toRow(child)] });
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
/** Whether the open panel was opened by hover (then leaving it closes it) rather than by a click,
 *  Enter or Space (then only Esc, another trigger or an outside interaction closes it). */
let openedByHover = false;
function clearHoverTimer(): void {
  if (hoverTimer !== undefined) clearTimeout(hoverTimer);
  hoverTimer = undefined;
}
function toggleMenu(index: number): void {
  clearHoverTimer();
  openedByHover = false;
  openMenuIndex.value = openMenuIndex.value === index ? null : index;
}
function closeMenu(): void {
  clearHoverTimer();
  openedByHover = false;
  openMenuIndex.value = null;
}
/** "Hover may open a panel after 150ms" — never immediately, so a bare pointer pass-over never
 *  opens anything (spec: "nothing opens on hover alone"). */
function onTriggerMouseEnter(index: number): void {
  clearHoverTimer();
  if (openMenuIndex.value === index) return;
  hoverTimer = setTimeout(() => {
    openMenuIndex.value = index;
    openedByHover = true;
    hoverTimer = undefined;
  }, 150);
}
/** Leaving the trigger or its panel: a pending hover-open is dropped, and a panel that hover opened
 *  closes after the same 150ms grace — long enough to cross the gap from the trigger into the
 *  panel (entering either clears the timer) but short enough that the panel never lingers once the
 *  pointer has moved on. */
function onTriggerMouseLeave(): void {
  clearHoverTimer();
  if (openMenuIndex.value === null || !openedByHover) return;
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined;
    if (openedByHover) closeMenu();
  }, 150);
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

const ctaLink = computed(() => resolveLink(data.value.cta));
const ctaHref = computed(() => ctaLink.value?.href ?? undefined);
const ctaLinkAs = computed(() => toLinkAs(ctaHref.value));
/** The button keeps its own label field; the link's own label is the fallback, so a CTA converted
 *  from the old label/href pair reads the same either way. */
const ctaLabel = computed(() => data.value.ctaLabel ?? ctaLink.value?.label ?? '');
const hasCta = computed(() => Boolean(ctaLabel.value && ctaHref.value));

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

function toSearchResults(response: StorefrontSearchResponse | null): SearchResults | undefined {
  if (response === null) return undefined;
  const products: SearchResultItem[] = response.products.map((product) => ({
    id: product.variantId,
    title: product.title,
    href: product.url,
    price: formatMoney(product.price.amount),
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
 *
 * Every `watchEffect` below opens with `if (typeof window === 'undefined') return;`. That is not
 * defensive padding: a `flush: 'pre'` effect with no callback runs its body *immediately*, during
 * `setup()`, and `setup()` runs on the server too — so an unguarded `window.addEventListener`
 * here throws `ReferenceError: window is not defined` on every server render of any page that
 * carries the header (i.e. every page), which `nuxi generate` turns into a failed prerender when
 * `nitro.prerender.failOnError` is on. `__tests__/ssr.spec.ts` server-renders this block to keep
 * the guards honest.
 */
const currentPath = ref(typeof window === 'undefined' ? '' : window.location.pathname);
watchEffect((onCleanup) => {
  if (typeof window === 'undefined') return;
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
/**
 * A sticky bar that stayed pinned would cover the top of every screen for the whole visit; instead
 * it slides away while the visitor scrolls down and comes back the moment they scroll up (or reach
 * the top), the way most storefront headers behave. Small jitters (under 4px, a trackpad settling)
 * never toggle it, and it stays put while the visitor is *using* it: an open mega-menu, the mobile
 * drawer, the search overlay, or keyboard focus anywhere inside the bar (a hidden bar would strand
 * a focused control off-screen — 2.4.7). Non-sticky headers scroll away with the page and never
 * hide.
 */
const hiddenByScroll = ref(false);
const focusWithinBar = ref(false);
let lastScrollY = 0;
const SCROLL_JITTER = 4;
function onScroll(): void {
  const y = window.scrollY;
  scrolled.value = y > 0;
  const delta = y - lastScrollY;
  lastScrollY = y;
  if (!sticky.value) return;
  const barHeight = barRoot.value?.offsetHeight ?? 0;
  if (y <= barHeight) {
    hiddenByScroll.value = false;
  } else if (delta > SCROLL_JITTER) {
    hiddenByScroll.value = true;
  } else if (delta < -SCROLL_JITTER) {
    hiddenByScroll.value = false;
  }
}
const barHidden = computed(
  () =>
    sticky.value &&
    hiddenByScroll.value &&
    openMenuIndex.value === null &&
    !drawerOpen.value &&
    !searchOpen.value &&
    !focusWithinBar.value
);
watchEffect((onCleanup) => {
  if (typeof window === 'undefined') return;
  window.addEventListener('scroll', onScroll, { passive: true });
  onCleanup(() => window.removeEventListener('scroll', onScroll));
});
function onBarFocusIn(): void {
  focusWithinBar.value = true;
}
function onBarFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  focusWithinBar.value = next instanceof Node && (barRoot.value?.contains(next) ?? false);
}
/** Spec "Header" → Accessibility, "Sticky header and focus": scroll padding equal to the sticky
 *  bar's height (2.4.11), so a focused/anchored target is never hidden under it. */
watchEffect((onCleanup) => {
  if (typeof document === 'undefined') return;
  if (!sticky.value) return;
  document.documentElement.style.setProperty('scroll-padding-top', '5rem');
  onCleanup(() => document.documentElement.style.removeProperty('scroll-padding-top'));
});

// --- published header height (--eldra-header-height) ------------------------------------------

/**
 * `faq`'s two-column sticky head column and `collection-grid`'s sticky filter rail both read
 * `var(--eldra-header-height,0px)` for the extra offset a *sticky* header needs added to their own
 * "N rem from the top" value (see either block's own module doc comment) — otherwise their sticky
 * content would settle directly under the viewport edge and slide underneath this bar. This is the
 * one place that variable is ever written: a `ResizeObserver` (guarded for an environment with
 * none, e.g. jsdom under Vitest — the same guard `trust-strip`'s own list-overflow measurement
 * uses) keeps the published value equal to the bar's real rendered height, which changes with
 * `sticky`/`variant`/`searchStyle` and the mobile/tablet/desktop breakpoint. The property is
 * removed — not just left stale — the moment `sticky` turns off, so a non-sticky header never
 * claims space it doesn't occupy in the page's fixed flow, and on unmount (`onCleanup`), so it
 * never survives past this instance of the block.
 */
const barRoot = ref<HTMLElement | null>(null);
watchEffect((onCleanup) => {
  // Server render has no `document` at all; nothing to publish or clear there.
  if (typeof document === 'undefined') return;
  if (!sticky.value || typeof ResizeObserver === 'undefined' || barRoot.value === null) {
    document.documentElement.style.removeProperty('--eldra-header-height');
    return;
  }
  const el = barRoot.value;
  const publish = (): void => {
    document.documentElement.style.setProperty(
      '--eldra-header-height',
      `${el.getBoundingClientRect().height}px`
    );
  };
  const observer = new ResizeObserver(publish);
  observer.observe(el);
  publish();
  onCleanup(() => {
    observer.disconnect();
    document.documentElement.style.removeProperty('--eldra-header-height');
  });
});

// --- transparent-over-hero -----------------------------------------------------------------------

/**
 * The block reads only its own field: it has no way to see the next block on the page (blocks
 * never inspect siblings or the DOM outside themselves — see `docs/starter-kit.md`). `sticky`'s
 * own effect (2.4.11) is unconditional; the "only when the next block really is a Hero
 * `image-background`" half of the spec's rule is a page-composition concern outside a single
 * block's own `__tests__/Block.spec.ts` — proven at the page level once a page fixture pairs the
 * two. `data-eldra-transparent` is the hook that pairing
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
/**
 * Spec "Header" → Container/Section line: "Section background default `background` … Section
 * spacing none (the bar sets its own height)". This root is a plain `<header>`, never
 * `@eldrajs/ui`'s `Section`: `Section` marks every ground (including `none`) with
 * `data-section-bg` so its own adjacent-same-background CSS rule can drop the *next* sibling's
 * top padding, and the header must never trigger that rule against the block that follows it (a
 * Hero, most often) — the header is fixed chrome that always sits at the page's own ground, not a
 * coloured band the padding-collapse rule is meant to read as one continuous band with its
 * neighbour. It also never needs `Section`'s `group/section` colour-inversion machinery: `background`
 * is always `none` here, and transparent-over-hero mode is handled entirely by `barRootClasses`
 * above, not by `Section`'s `primary`/`accent` invert. `@container` is kept directly on this root so
 * `Container` and every `@content:`/`@tablet:` variant below still measure the header's own width.
 */
const barRootClasses = computed(() =>
  [
    '@container',
    sticky.value
      ? 'sticky top-0 z-40 motion-safe:transition-transform motion-safe:duration-base'
      : '',
    barHidden.value ? '-translate-y-full' : '',
    isTransparent.value
      ? 'bg-transparent text-primary-contrast'
      : 'bg-background text-text border-b border-border',
    scrolled.value && !isTransparent.value ? 'shadow-float' : '',
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
  <header
    ref="barRoot"
    :data-eldra-transparent="isTransparent ? 'true' : undefined"
    :class="barRootClasses"
    @focusin="onBarFocusIn"
    @focusout="onBarFocusOut"
  >
    <Container width="wide">
      <!-- `relative` is what an open mega-menu panel measures itself against: this element is the
           header's content box (inside `Container`'s max-width and gutters), so a panel pinned to
           `left-0 right-0` here spans exactly the bar's own container. -->
      <nav
        :aria-label="t('header.primary')"
        class="@tablet:h-16 @tablet:gap-4 @content:h-[4.5rem] relative grid h-16 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1"
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
            <EldraIcon name="menu-2" size="md" />
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
          <li v-for="(link, index) in links" :key="index">
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
              <EldraIcon
                name="chevron-down"
                size="sm"
                class="transition-transform motion-reduce:transition-none"
                :class="openMenuIndex === index ? 'rotate-180' : ''"
              />
            </button>
            <Link
              v-else-if="link.href"
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
            <span v-else class="inline-flex h-10 items-center px-3 text-sm font-medium">
              {{ link.label }}
            </span>

            <!-- The panel spans the bar's own container (`left-0 right-0` against the `relative`
                 `<nav>` above) and sits directly under it. The hairline along its top edge is the
                 bar's own full-bleed `border-b` — the bar is never transparent while a panel is
                 open — so the panel draws no border of its own, only its ground and a soft shadow
                 below it. Its columns are a 12-column grid at three columns each: four groups fill
                 the row, fewer stay left-aligned at that same width rather than stretching, and a
                 fifth group wraps to a second row. -->
            <div
              v-if="hasMegaMenu(index)"
              v-show="openMenuIndex === index"
              :id="menuIds[index]!.panel"
              data-eldra-mega-panel
              class="bg-background shadow-float absolute top-full right-0 left-0 z-30 grid grid-cols-12 gap-6 py-8"
              @keydown="onPanelKeydown(index, $event)"
              @mouseenter="clearHoverTimer"
              @mouseleave="onTriggerMouseLeave"
            >
              <div v-for="(group, groupIndex) in link.groups" :key="groupIndex" class="col-span-3">
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
                      v-if="row.href"
                      :href="row.href"
                      :as="row.as"
                      variant="standalone"
                      :underline="false"
                      :classes="{ root: 'text-text flex min-h-9 items-center text-sm' }"
                    >
                      {{ row.label }}
                    </Link>
                    <span v-else class="text-text flex min-h-9 items-center text-sm">
                      {{ row.label }}
                    </span>
                  </li>
                </ul>
              </div>
              <!-- The parent's own destination, which the trigger gave up when it became a
                   disclosure. A `kind: "none"` heading resolves to no href and therefore offers
                   nothing here. -->
              <div v-if="link.href" class="col-span-12 flex justify-end">
                <Link
                  :href="link.href"
                  :as="link.as"
                  variant="standalone"
                  data-eldra-mega-view-all
                  :aria-label="t('header.viewAllOf', { label: link.label })"
                  :classes="{ root: 'text-sm' }"
                >
                  {{ t('header.viewAll') }}
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
                <EldraIcon name="search" size="md" />
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
                  <EldraIcon name="search" size="md" />
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
                  <EldraIcon name="search" size="md" />
                </template>
              </Button>
            </template>
          </template>
        </div>

        <div data-eldra-header-actions :class="['flex items-center gap-1', actionsPositionClass]">
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
              <EldraIcon name="user" size="md" />
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
                <EldraIcon name="shopping-bag" size="md" />
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
            {{ ctaLabel }}
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
              <EldraIcon
                name="chevron-down"
                size="sm"
                class="transition-transform motion-reduce:transition-none"
                :class="drawerExpanded.has(index) ? 'rotate-180' : ''"
              />
            </button>
            <Link
              v-else-if="link.href"
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
            <span
              v-else
              class="font-heading flex min-h-14 w-full items-center text-xl font-semibold"
            >
              {{ link.label }}
            </span>

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
                      v-if="row.href"
                      :href="row.href"
                      :as="row.as"
                      variant="standalone"
                      :underline="false"
                      :classes="{ root: 'flex min-h-11 items-center text-sm' }"
                      @click="drawerOpen = false"
                    >
                      {{ row.label }}
                    </Link>
                    <span v-else class="flex min-h-11 items-center text-sm">{{ row.label }}</span>
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
          {{ ctaLabel }}
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
  </header>
</template>
