<script setup lang="ts">
/**
 * Header (design spec 2, lines 76-238). apiId stays `navigation` (renaming it
 * would orphan every Studio page that uses it); `Header` is only the display name.
 *
 * Layout: a 4-column grid (`auto minmax(0,1fr) auto auto`) whose DOM order is always
 * `menuButton, brand, links, search, actions` (the menu button only while the drawer has something
 * to show — see `drawerHasContent`) — the same "DOM order stays sensible for screen
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
 * left-aligned at the same width instead of stretching to fill — inset from the panel's own edges
 * rather than flush against them, so the first group's text and the trailing "View all" each keep
 * a 32px margin from the edge the panel shares with the brand and the actions above it (24px on a
 * narrower container).
 *
 * Every destination is a `link` value — a collection, product, page or entry the platform knows,
 * or an external URL — resolved to an href by `useEldraLink()`. A row whose target has been
 * deleted, or that the site has no route for, resolves to no href and renders its label as plain
 * text rather than a dead anchor; a row with no label at all renders nothing.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
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
import { useMoney } from '../../app/storefront/money';
import type { StorefrontSearchResponse } from '../../app/storefront/types';
import { useMegaMenuKeys } from './useMegaMenuKeys';

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
/** The bar's own `<ul>`: the element `useMegaMenuKeys` walks to find the top-level items and the
 *  panels, so the keyboard model never keeps a second list of its own to fall out of step. */
const barLinkList = ref<HTMLElement | null>(null);

let hoverTimer: ReturnType<typeof setTimeout> | undefined;
/** Whether the open panel was opened by hover (then leaving it closes it) rather than by a click,
 *  Enter or Space (then only Esc, another trigger or an outside interaction closes it). */
let openedByHover = false;
function clearHoverTimer(): void {
  if (hoverTimer !== undefined) clearTimeout(hoverTimer);
  hoverTimer = undefined;
}
/** Opens one panel (closing any other) as a keyboard-owned one: hover never closes what a key
 *  opened. Every keyboard path into a panel goes through here. */
function openMenu(index: number): void {
  clearHoverTimer();
  openedByHover = false;
  openMenuIndex.value = index;
}
function toggleMenu(index: number): void {
  if (openMenuIndex.value === index) {
    closeMenu();
    return;
  }
  openMenu(index);
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
/** True while focus sits on the item's trigger or anywhere inside its panel. */
function focusWithinMenu(index: number): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement;
  const ids = menuIds.value[index];
  if (active === null || ids === undefined) return false;
  return (
    document.getElementById(ids.trigger)?.contains(active) === true ||
    document.getElementById(ids.panel)?.contains(active) === true
  );
}
/** Leaving the trigger or its panel: a pending hover-open is dropped, and a panel that hover opened
 *  closes after the same 150ms grace — long enough to cross the gap from the trigger into the
 *  panel (entering either clears the timer) but short enough that the panel never lingers once the
 *  pointer has moved on. A hover-opened panel that focus has since moved into is keyboard-owned
 *  from then on: closing it as the pointer wanders off would strand that focus on a hidden link,
 *  so the pointer's own grace period gives way and `onNavItemFocusOut` closes it instead. */
function onTriggerMouseLeave(): void {
  clearHoverTimer();
  if (openMenuIndex.value === null || !openedByHover) return;
  hoverTimer = setTimeout(() => {
    hoverTimer = undefined;
    const index = openMenuIndex.value;
    if (index === null || !openedByHover) return;
    if (focusWithinMenu(index)) return;
    closeMenu();
  }, 150);
}
/**
 * A disclosure closes as soon as focus leaves the trigger-and-panel pair, which is what the pattern
 * asks for and the one thing this block used to get wrong: `Tab` past the panel's last link,
 * `Shift+Tab` back before the trigger, or a click anywhere else all left the panel hanging open
 * under a bar whose focus had moved on. The `<li>` *is* the pair (the trigger, or plain link, and
 * that item's panel are its only children), so one `focusout` on it answers all three: a
 * `relatedTarget` still inside the `<li>` is movement within the menu, anything else — including
 * `null`, which is what a click on non-focusable page furniture gives — has left it. Focus itself is
 * never moved here; only the panel closes.
 *
 * `closeMenu()` also drops any pending hover-open, deliberately: focus leaving the header's menus is
 * the visitor saying they are done with them, so a panel the pointer happens to be resting over must
 * not spring open a moment later behind the keyboard's back. The pointer reopens it by moving.
 */
function onNavItemFocusOut(index: number, event: FocusEvent): void {
  if (openMenuIndex.value !== index) return;
  const pair = event.currentTarget;
  const next = event.relatedTarget;
  if (!(pair instanceof HTMLElement)) return;
  if (next instanceof Node && pair.contains(next)) return;
  closeMenu();
}
function closeMenuAndFocusTrigger(index: number): void {
  closeMenu();
  void nextTick(() => {
    document.getElementById(menuIds.value[index]!.trigger)?.focus();
  });
}
/** Arrow keys, Home/End, Enter/Space and Escape across the bar and its panels — the APG's
 *  disclosure-navigation pattern, in `useMegaMenuKeys.ts` with the reasoning for each key. */
const { onTriggerKeydown, onPanelKeydown, onBarLinkKeydown } = useMegaMenuKeys({
  list: barLinkList,
  openIndex: openMenuIndex,
  hasPanel: hasMegaMenu,
  open: openMenu,
  toggle: toggleMenu,
  close: closeMenu,
  closeAndFocusTrigger: closeMenuAndFocusTrigger,
});

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
/** The store's own currency and the page's locale — never a currency guessed from either. */
const money = useMoney();

function toSearchResults(response: StorefrontSearchResponse | null): SearchResults | undefined {
  if (response === null) return undefined;
  const products: SearchResultItem[] = response.products.map((product) => ({
    id: product.productId,
    title: product.title,
    href: product.url,
    // Optional on `SearchResultItem`, and `null` on a product the storefront could not price: the
    // row keeps the product and drops the price rather than printing the store's own "$0.00"
    // (`StorefrontSearchProduct`).
    price: product.price === null ? undefined : money.format(product.price.amount),
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

/**
 * The response for the query that is **in the field right now**, or `null` while the read for it is
 * still in flight.
 *
 * `searchResult.data` keeps the last answer it got until the next one lands — which is what a page
 * showing prerendered products wants, and exactly wrong for a search panel. The very first thing
 * `search.run()` answers is the empty query's own `{ total: 0 }`, so without this check the panel
 * read "No results for “bowl”" (a `results` object with a zero total is `SearchModal`'s "none"
 * view) for the whole time the request for "bowl" was in flight, and then popped the results in.
 * `StorefrontSearchResponse.query` is the query its own answer is about, so the two can be compared
 * directly rather than tracked alongside.
 */
const searchAnswer = computed(() => {
  const answer = searchResult.data.value;
  return answer !== null && answer.query === searchQuery.value ? answer : null;
});
/** `undefined` while there is no answer for this query — which is how both `SearchBar` and
 *  `SearchModal` are told "nothing yet", as opposed to "nothing found". */
const searchResults = computed(() => toSearchResults(searchAnswer.value));
/**
 * `loading`, not `pending`: `pending` is the skeleton flag and means "a read in flight with nothing
 * to show yet", so it is false for every search after the first one (`data` still holds the
 * previous answer) and the panel never reached its loading view. `loading` is "a read is in
 * flight", which is the question being asked here — narrowed to the reads this panel has no answer
 * for, so a background refresh of an answer already on screen does not blank it.
 */
const searchLoading = computed(() => searchAnswer.value === null && searchResult.loading.value);

function openSearch(): void {
  searchOpen.value = true;
}

// --- account -----------------------------------------------------------------------------------

/** `=== true`, not `!== false`: `showAccount`'s declared default in `block.json` is `false`, so an
 *  entry that carries no value for it must read as off — a store has no customer accounts until it
 *  says it does, and an account icon that leads nowhere is worse than none. */
const showAccount = computed(() => data.value.showAccount === true);
const accountHref = '/account';

// --- cart --------------------------------------------------------------------------------------

/**
 * The count is a shopper's own state, restored from their browser after the page is up, so the
 * server never knows it: the prerendered bag always reads "Cart, empty" with no pill. Reading the
 * store before mount would let the client's first render disagree with that HTML on every reload
 * that restores a cart (a hydration mismatch, with the bag re-rendered from scratch); gating it on
 * mount makes the first client render match the server's and the count arrive as an ordinary update.
 */
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const cartCount = computed(() => (mounted.value ? storefront.cart.count.value : 0));
/**
 * The theme mounts one cart drawer in its app shell, so on a live page this is true and the bag is a
 * `<button>` that opens it without leaving the route; in the prerendered HTML it is still false and
 * the bag is an `<a href="/cart">`. Both halves, and why, are documented on `CartStore` in
 * `app/storefront/cart.ts`.
 */
const cartDrawerAvailable = computed(() => storefront.cart.drawerAvailable.value);
const cartHref = computed(() => (cartDrawerAvailable.value ? undefined : '/cart'));
/** Only the button form is a dialog trigger (spec "Cart": "It opens from the header bag button
 *  (`aria-haspopup="dialog"`)"), like the Menu and search triggers above. The link form must not
 *  claim it: in the prerendered HTML the bag goes to `/cart`, and nothing pops up. */
const cartPopupType = computed(() => (cartDrawerAvailable.value ? 'dialog' : undefined));
const cartAccessibleName = computed(() => {
  const count = cartCount.value;
  if (count === 0) return t('header.cartEmpty');
  if (count === 1) return t('header.cartOne');
  return t('header.cartMany', { count });
});
const cartBadgeLabel = computed(() => (cartCount.value > 99 ? '99+' : String(cartCount.value)));

function onCartClick(): void {
  // A no-op in Studio's editor. The theme overlay only prevents a click that carries an `href`
  // (`@eldrajs/theme-core`'s navigation guard), so with the drawer available the bag is a button whose
  // click it cannot intercept — and a modal `<dialog>` over the canvas makes the rest of the page
  // inert and unscrollable until the author finds Escape. An author inspecting the header is not
  // shopping, so the bag simply does nothing there.
  if (isEditing.value) return;
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
 *
 * The bar that does this is `position: fixed`, not `position: sticky`, and the spacer below it
 * (`barSpacerClasses`) reserves the room it no longer takes in the flow. A sticky box is clamped to
 * its own containing block, and a block's containing block is the single-block wrapper rendered
 * around it — a `<div data-eldra-block>` from the block zone, or that same wrapper nested in a
 * layout node's container. That box is exactly the bar's own height, so a sticky bar inside it has
 * nowhere to travel: it stays at the top of the *page*, scrolls out of view with it and never
 * returns, however the state machine below sets its classes. Measured against the viewport instead,
 * the bar travels — and the spacer keeps the page's own flow, where the hero starts and what the
 * block occupies, byte for byte what it was while the bar was in it.
 */
const hiddenByScroll = ref(false);
/**
 * True only while focus inside the bar is `:focus-visible`: a plain mouse click on the bag or
 * search button focuses it too, and the drawer/dialog it opens restores focus there on close, so
 * counting any focus would pin the bar open for the rest of the page view instead of just for the
 * keyboard visitor 2.4.7 protects.
 */
const focusWithinBar = ref(false);
/**
 * The bar's height, named once: the bar sets it on its own `<nav>` and the spacer reserves the very
 * same box. Two literals would drift the first time a breakpoint moved, and a spacer that drifts
 * from the bar is a page that jumps. `@content:` is a container query, so it is only ever as true
 * as the container it is measured in — which is why both boxes sit inside an `@container` of the
 * block's own width.
 */
const BAR_HEIGHT_CLASS = 'h-16 @content:h-[4.5rem]';
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
function onBarFocusIn(event: FocusEvent): void {
  const target = event.target;
  // `:focus-visible` is the browser's own keyboard-vs-pointer call, re-read on every focusin —
  // including a dialog's programmatic `.focus()` back onto its opener, which the browser attributes
  // to whatever closed the dialog: a mouse on the close button or backdrop does not match, Escape
  // does, and that pin lasts only until focus leaves the bar. An engine that can't evaluate the
  // selector can't tell the two apart; it is treated as keyboard, the conservative 2.4.7 default.
  try {
    focusWithinBar.value = target instanceof Element ? target.matches(':focus-visible') : true;
  } catch {
    focusWithinBar.value = true;
  }
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
/** The same measurement, in pixels, for the spacer below the fixed bar to reserve. */
const barHeight = ref<number | null>(null);
watchEffect((onCleanup) => {
  // Server render has no `document` at all; nothing to publish or clear there.
  if (typeof document === 'undefined') return;
  if (!sticky.value || typeof ResizeObserver === 'undefined' || barRoot.value === null) {
    document.documentElement.style.removeProperty('--eldra-header-height');
    barHeight.value = null;
    return;
  }
  const el = barRoot.value;
  const publish = (): void => {
    const height = el.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--eldra-header-height', `${height}px`);
    // The same measurement the spacer reserves, so the two can never disagree.
    barHeight.value = height;
  };
  const observer = new ResizeObserver(publish);
  observer.observe(el);
  publish();
  onCleanup(() => {
    observer.disconnect();
    document.documentElement.style.removeProperty('--eldra-header-height');
    barHeight.value = null;
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

// --- the surface the bar and an open panel share ------------------------------------------------

/**
 * One source of truth for the colour the header paints, published on the bar itself as
 * `--eldra-header-surface` and read by an open mega-menu panel as its own ground.
 *
 * The panel used to name a ground token of its own (`bg-background`, the same one the bar names).
 * The two read identically today and would drift the moment either side's ground changed — and a
 * sheet hanging off the bar in a *slightly* different colour is the one thing an open panel must
 * never look like. The bar now publishes what it paints and the panel takes it, so there is nothing
 * left to keep in step by hand.
 *
 * `bg-background` is the only ground the bar ever has. The transparent-over-hero state is not an
 * exception: `isTransparent` is false whenever a panel is open (a panel must never float on a
 * transparent bar — it is also what gives the panel the full-bleed hairline along its top edge), so
 * by the time anything reads this variable the bar has already turned solid. The value is written as
 * the Tailwind namespace variable `bg-background` itself resolves to, so a theme whose `background`
 * token Studio is editing live moves the bar and the panel together, in the same frame.
 */
const HEADER_SURFACE_VAR = '--eldra-header-surface';
const barSurfaceStyle = { [HEADER_SURFACE_VAR]: 'var(--color-background)' };
const panelSurfaceStyle = { background: `var(${HEADER_SURFACE_VAR})` };

/**
 * A panel eases in and out rather than appearing and vanishing: opacity 0→1 with a 4px rise over
 * 150ms on the way in, and the same 4px back out over a slightly quicker 120ms on the way out, so
 * closing never feels slower than opening. A Vue `<Transition>` rather than a CSS class on the panel
 * itself, because only a `<Transition>` holds the element long enough for the leave half to play at
 * all — `v-show` alone would cut it to `display: none` in the same frame the panel closed.
 *
 * The panel stays mounted either way (`v-show`, never `v-if`): `aria-expanded` and the panel's
 * presence must never disagree, and nothing here delays the element past the attribute flip.
 * `pointer-events-none` while it leaves keeps a pointer crossing the fading panel from clearing the
 * close timer and pulling it back open.
 *
 * Under `prefers-reduced-motion: reduce` the rise is dropped — `motion-safe:` carries it — and only
 * the fade is left.
 */
const panelTransition = {
  enterFromClass: 'opacity-0 motion-safe:-translate-y-1',
  enterActiveClass: 'transition-[opacity,transform] duration-[150ms] ease-out',
  enterToClass: 'opacity-100',
  leaveFromClass: 'opacity-100',
  leaveActiveClass: 'pointer-events-none transition-[opacity,transform] duration-[120ms] ease-in',
  leaveToClass: 'opacity-0 motion-safe:-translate-y-1',
};

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
      ? 'fixed inset-x-0 top-0 z-40 motion-safe:transition-transform motion-safe:duration-base'
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

/**
 * The room the fixed bar is no longer in the flow to claim: an empty box of the bar's own height,
 * rendered only when the bar is fixed, so a non-sticky header still occupies its space itself.
 *
 * The height classes are what the first paint of a prerendered page has, before the bar has been
 * measured at all — a spacer that started at zero would drop the page by the bar's height and lift
 * it again on hydration. They carry the `@content:` breakpoint, so they need a container of the
 * block's own width to be measured in: the bar has one (its own `@container` root), and the spacer
 * is one, which is why the box that holds the height is a child rather than the spacer itself.
 * `barHeight` takes over the moment the `ResizeObserver` above has a real number, and from then on
 * the spacer is the bar's measured height to the pixel, whatever either box's width does.
 *
 * The two boxes mirror the bar's own two: the outer one carries the hairline, as the `<header>`
 * carries `border-b`, and the inner one the height, as the `<nav>` does. Which is also the only way
 * the pixel lands: everything here is `border-box`, so a border on the box that *has* the height
 * eats into it rather than adding to it. `border-transparent` contributes nothing but that pixel,
 * and only while the bar has it — the solid bar draws `border-b` and the transparent-over-hero bar
 * does not, so without this the page would shift by 1px the moment the bar turned solid.
 */
const barSpacerClasses = computed(() =>
  ['@container', isTransparent.value ? '' : 'border-b border-transparent'].filter(Boolean).join(' ')
);
const barSpacerStyle = computed(() =>
  barHeight.value === null ? undefined : { height: `${barHeight.value}px` }
);

const hairlineClass = computed(() =>
  isTransparent.value ? 'border-primary-contrast/24' : 'border-border'
);

// --- menu button visibility ----------------------------------------------------------------------

const menuButtonHiddenClass = computed(() =>
  variant.value === 'minimal' ? '' : '@content:hidden'
);
const linksVisible = computed(() => variant.value !== 'minimal' && links.value.length > 0);
/**
 * The drawer holds the links, the call to action and the account row — nothing else. A header with
 * no links, no CTA and accounts off (the shape this theme seeds a fresh store with) therefore has
 * an empty drawer, and a Menu button that opens one is a control that does nothing: the bar renders
 * brand and actions only, and the button goes with the drawer it has nothing to show from.
 */
const drawerHasContent = computed(
  () => links.value.length > 0 || hasCta.value || showAccount.value
);

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
    :style="barSurfaceStyle"
    @focusin="onBarFocusIn"
    @focusout="onBarFocusOut"
  >
    <Container width="wide">
      <!-- `relative` is what an open mega-menu panel measures itself against: this element is the
           header's content box (inside `Container`'s max-width and gutters), so a panel pinned to
           `left-0 right-0` here spans exactly the bar's own container. -->
      <nav
        :aria-label="t('header.primary')"
        :class="[
          BAR_HEIGHT_CLASS,
          '@tablet:gap-4 relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1',
        ]"
      >
        <Button
          v-if="drawerHasContent"
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

        <ul
          v-if="linksVisible"
          ref="barLinkList"
          :class="['list-none items-center gap-1', linksPositionClass]"
        >
          <!-- One `<li>` per link, trigger (or plain link) then that item's panel: the pair the
               disclosure pattern closes on focus leaving, and the reading order the arrow keys
               walk. -->
          <li
            v-for="(link, index) in links"
            :key="index"
            @focusout="onNavItemFocusOut(index, $event)"
          >
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
              @keydown="onBarLinkKeydown(index, $event)"
            >
              {{ link.label }}
            </Link>
            <span v-else class="inline-flex h-10 items-center px-3 text-sm font-medium">
              {{ link.label }}
            </span>

            <!-- The panel spans the bar's own container (`left-0 right-0` against the `relative`
                 `<nav>` above) and sits directly under it. The hairline along its top edge is the
                 bar's own full-bleed `border-b` — the bar is never transparent while a panel is
                 open — so the panel takes no top border of its own (`border-t-0`); the other three
                 sides carry the border token and the bottom corners are rounded, which is what
                 makes the open panel read as a sheet hanging off the bar rather than as a slab of
                 background with content loose on it. Its columns are a 12-column grid at three
                 columns each: four groups fill the row, fewer stay left-aligned at that same width
                 rather than stretching, and a fifth group wraps to a second row — all of it inset
                 from the panel's edges (32px, 24px below the `wide` container edge), so no text
                 ever sits flush against the panel's own boundary. `rounded-b-lg` is this theme's
                 12px step: `radius-lg` is 0.75rem here, `radius-xl` 1rem.

                 Its ground is the bar's own, read from the variable the bar publishes rather than
                 named again here, and it eases in and out — see `barSurfaceStyle` and
                 `panelTransition` above. -->
            <Transition v-bind="panelTransition">
              <div
                v-if="hasMegaMenu(index)"
                v-show="openMenuIndex === index"
                :id="menuIds[index]!.panel"
                data-eldra-mega-panel
                class="border-border shadow-float @wide:p-8 absolute top-full right-0 left-0 z-30 grid grid-cols-12 gap-6 rounded-b-lg border border-t-0 p-6"
                :style="panelSurfaceStyle"
                @keydown="onPanelKeydown(index, $event)"
                @mouseenter="clearHoverTimer"
                @mouseleave="onTriggerMouseLeave"
              >
                <div
                  v-for="(group, groupIndex) in link.groups"
                  :key="groupIndex"
                  class="col-span-3"
                >
                  <p
                    :id="`${menuIds[index]!.panel}-g${groupIndex}`"
                    class="text-muted mb-3 text-[11px] font-semibold tracking-wide uppercase"
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
                        :classes="{
                          root: 'text-text flex min-h-9 items-center text-[15px] font-medium hover:underline-offset-4',
                        }"
                      >
                        {{ row.label }}
                      </Link>
                      <span
                        v-else
                        class="text-text flex min-h-9 items-center text-[15px] font-medium"
                      >
                        {{ row.label }}
                      </span>
                    </li>
                  </ul>
                </div>
                <!-- The parent's own destination, which the trigger gave up when it became a
                     disclosure. A `kind: "none"` heading resolves to no href and therefore offers
                     nothing here. A rule across the full content width separates it from the groups,
                     and `arrow` gives it the same trailing arrow-right every other "view all" in the
                     theme carries — the package draws it outside the label, so the underline runs
                     under the words only. -->
                <div
                  v-if="link.href"
                  class="border-border col-span-12 flex justify-end border-t pt-4"
                >
                  <Link
                    :href="link.href"
                    :as="link.as"
                    variant="standalone"
                    arrow
                    data-eldra-mega-view-all
                    :aria-label="t('header.viewAllOf', { label: link.label })"
                    :classes="{ root: 'text-sm' }"
                  >
                    {{ t('header.viewAll') }}
                  </Link>
                </div>
              </div>
            </Transition>
          </li>
        </ul>
        <EditorPlaceholder
          v-else-if="isEditing && variant !== 'minimal' && links.length === 0"
          inline
          :label="t('editor.addLink')"
          :classes="{ root: linksPositionClass }"
        />

        <!-- `justify-end` matters in exactly one case and is inert in every other: with no Menu
             button in the grid (nothing to put in the drawer), the search control auto-places into
             the `minmax(0,1fr)` column the brand usually takes, and left-aligned it would sit
             against the wordmark with the cart stranded across the bar. Everywhere else this
             wrapper lands in an `auto` column, which is content-sized, so the rule does nothing. -->
        <div :class="['flex items-center justify-end', searchPositionClass]">
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
                :loading="searchLoading"
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
              :aria-haspopup="cartPopupType"
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
                root: 'pointer-events-none absolute -top-0.5 -right-0.5 min-w-5 justify-center px-1 text-[0.6875rem] leading-4',
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

    <Drawer
      v-if="drawerHasContent"
      :id="drawerId"
      v-model="drawerOpen"
      side="left"
      :aria-label="t('header.menu')"
    >
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
      :loading="searchLoading"
    />
  </header>
  <!-- The flow the fixed bar left behind — see `barSpacerClasses`. Empty and unlabelled: it is
       layout, with nothing in it for a screen reader or the tab order to reach. The outer box is the
       `<header>`'s counterpart (the `@container` the height is measured in, and the hairline) and the
       inner one the `<nav>`'s (the height itself). -->
  <div
    v-if="sticky"
    data-eldra-header-spacer
    aria-hidden="true"
    :class="barSpacerClasses"
    :style="barSpacerStyle"
  >
    <div :class="BAR_HEIGHT_CLASS" />
  </div>
</template>
