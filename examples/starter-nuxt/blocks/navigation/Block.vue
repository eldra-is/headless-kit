<script setup lang="ts">
/** Header (design spec 2); apiId stays `navigation`. Layout: docs/starter-kit.md, "The header". */
import { computed, onMounted, ref, watchEffect } from 'vue';
import { useEldraLink, useEldraLocale } from '@eldrajs/theme-vue';
import {
  Badge,
  Button,
  Container,
  EditorPlaceholder,
  Link,
  NavMenu,
  SearchBar,
  SearchModal,
} from '@eldrajs/ui';
import type {
  NavMenuItem,
  NavMenuPart,
  SearchResultItem,
  SearchResults,
  UiMessages,
} from '@eldrajs/ui';
import { useBlockData } from '../../app/composables/useBlockData';
import { useEditing } from '../../app/composables/useEditing';
import { useStorefront } from '../../app/composables/useStorefront';
import { useWishlist } from '../../app/composables/useWishlist';
import { useI18n } from 'vue-i18n';
import EldraIcon from '../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { isInternalHref, SEARCH_PATH } from '../../app/utils/links';
import { useMoney } from '../../app/storefront/money';
import type { StorefrontSearchResponse } from '../../app/storefront/types';
import MenuLink from './parts/MenuLink.vue';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

const { t } = useI18n();
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

/** A row with no label has nothing to show; one whose target is gone keeps its label as text. */
const links = computed(() =>
  rawLinks.value.flatMap((item) => {
    const resolved = resolveLink(item);
    return resolved === null || resolved.label === null ? [] : [resolved];
  })
);

/** A parent with children is a disclosure, so its own destination moves to the panel's "View all". */
const navItems = computed<NavMenuItem[]>(() =>
  links.value.map((link) => {
    const children = link.children.filter((child) => child.label !== null);
    if (children.length === 0) {
      return {
        label: link.label,
        href: link.href,
        newTab: link.newTab,
        current: isCurrent(link.href),
      };
    }
    return {
      label: link.label,
      layout: 'mega',
      children: children.map((child) => ({
        label: child.label,
        href: child.href,
        newTab: child.newTab,
        group: child.group,
        current: isCurrent(child.href),
      })),
    };
  })
);

function viewAllHref(index: number): string | undefined {
  return links.value[index]?.href ?? undefined;
}

const openMenuIndex = ref<number | null>(null);
const drawerOpen = ref(false);

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

/**
 * **The header's search has to stay in the page's language, and nothing else puts it there.**
 *
 * Three destinations, none of which `EldraRouterLink` can reach:
 *
 *  1. `SearchBar`/`SearchModal` render a real `<form role="search" method="get" :action>`, so
 *     pressing Enter with no active option is a native document submit. Left to its default the
 *     action is `/search`, and a shopper searching from `/is-IS/products/x` lands on the **English**
 *     results page.
 *  2. The overlay's "See all N results" row is built by `SearchModal` as `${action}?q=…`, so it
 *     follows from the same prop — one value fixes both.
 *  3. Every result row's href comes off the storefront (`/products/<slug>`, `/journal/…`,
 *     `/pages/…`) and is rendered as a plain `<a>` inside the library's results panel, which takes
 *     no `linkAs`. So `toSearchResults` below prefixes each one itself.
 *
 * The path is `app/utils/links.ts`'s `SEARCH_PATH`, shared with `blocks/search/Block.vue`, which
 * points at the same page and prefixes it the same way. `path()` is idempotent and is the identity
 * on a single-locale site, so a row whose href already carries a prefix, and every store with one
 * locale, are untouched.
 */
const activeLocale = useEldraLocale();
const searchAction = computed(() => activeLocale.path(SEARCH_PATH));

function toSearchResults(response: StorefrontSearchResponse | null): SearchResults | undefined {
  if (response === null) return undefined;
  const products: SearchResultItem[] = response.products.map((product) => ({
    id: product.productId,
    title: product.title,
    href: activeLocale.path(product.url),
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
    href: activeLocale.path(article.href),
    image: article.image?.src,
    imageAlt: article.image?.alt,
  }));
  const pages: SearchResultItem[] = response.pages.map((page, index) => ({
    id: `page-${index}`,
    title: page.title,
    href: activeLocale.path(page.href),
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

// --- cart + wishlist count pills --------------------------------------------------------------

/**
 * A count pill is a corner badge: small, and sitting on the icon's own corner, so it reads as an
 * annotation *on* the glyph rather than a second control beside it. The spec's "1.25rem pill,
 * flush right with a ring" line was written for 2.75rem buttons; on this theme's 2rem ghost icon
 * buttons it put the pill beside the icon as a detached blob, so the badge is sized and placed
 * for the icon instead.
 *
 * 0.875rem square (`h-3.5`/`min-w-3.5`, `min-w` so "99+" still widens it), `0.625rem` bold tabular
 * figures, `primary` fill, `primary-contrast` text (both from the `tone="primary"` prop, not this
 * constant). No ring: a ring's whole job is separating a pill from what sits *beside* it, and a
 * corner badge sits *on* the icon by design — a ring here would just push it back off the corner.
 * `-top-0.5 -right-0.5` sits it at the button's own top-right corner, nudged slightly outside it
 * (2px past the 2rem button's own edge on each side) rather than tucked inside — `top-0.5
 * right-0.5` was tried first and measured worse: with real padding and a real glyph the pill is
 * wider than its 0.875rem floor, so pulled inside the button it still buried roughly a third of
 * the icon's area under it. Pushed just outside instead, it lands mostly over the button's own
 * padding and clears the icon by a wide margin. `countPill.browser.spec.ts` measures the overlap
 * against the icon's real `<svg>` box (not an assumed one) and keeps it well under a quarter of
 * the icon's area. The same override styles both the cart and the wishlist pill (spec: "the cart
 * button and its count badge" — the wishlist one is drawn identically), so it is one constant
 * rather than two copies that could drift.
 *
 * `Badge`'s own root carries `min-h-6` and `text-badge` (1.5rem min height, the package's own
 * type-style utility); both are stock Tailwind class groups (`min-h`, `font-size`) that
 * `tailwind-merge` already recognises, so passing this through `classes.root` replaces them
 * outright — the later class in the merged string always wins a group, with no `!important` and
 * no need for a `size` prop (`Badge` has none).
 */
const COUNT_PILL_CLASSES =
  'pointer-events-none absolute -top-0.5 -right-0.5 min-h-3.5 min-w-3.5 h-3.5 justify-center ' +
  'px-1 text-[0.625rem] font-bold tabular-nums leading-none';

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

// --- wishlist ----------------------------------------------------------------------------------

/**
 * The saved-for-later heart, beside the bag. **It is in every header but `minimal`, saved list or
 * not** — the way into `/wishlist` is part of the bar exactly as the bag is, and a shopper who has
 * saved nothing is precisely the shopper who has never been shown that the list exists. The heart
 * gated itself on `wishlistCount > 0` first, and that made it a control you could only find once
 * you had already found it.
 *
 * **The count badge is the only shopper state here**, and it keeps the after-mount gate: `items` is
 * empty until `onMounted` (`useWishlist()`, the same gate `cartCount` above is written up under),
 * so a count can never reach a prerendered file and the browser's first render of that file agrees
 * with it. The heart itself carries nothing of the visitor's, which is why it may render on the
 * server — one header, identical for everyone, with the badge arriving a moment later for whoever
 * has one.
 *
 * No field configures it. A `showWishlist` field would be a merchant promising a feature the theme
 * either has or does not: `/wishlist` is this theme's own route, prerendered in every build, so it
 * always exists and the heart never leads nowhere.
 *
 * **Not in `minimal`.** That variant's whole definition is brand, search, cart and a Menu button
 * (spec "Header" → Variants: "Links … and call to action live only in the drawer"), which is why
 * the call to action carries the same `variant !== 'minimal'` guard below — a third icon there
 * would be the theme deciding the variant means something else. The drawer gets no wishlist row
 * either, so the variant stays consistent in both directions.
 *
 * **It does render at mobile widths**, unlike the call to action, which is `@content:` only.
 * Deliberate, and the bag's own rule: a shopper who saved something on a phone has no other way
 * back to it, where the call to action has a drawer row.
 */
const wishlist = useWishlist();
const wishlistCount = wishlist.count;
const wishlistHref = '/wishlist';
/** The bag's three forms, with a plainer empty one: nothing saved reads as just "Wishlist" — the
 *  control's own name, no count to read out — where the bag says "Cart, empty", which is worth
 *  saying about a bag a visitor may have just filled and says nothing about a list they have never
 *  used. A number appears only once there is one, so the name in a prerendered file is the same for
 *  every visitor. */
const wishlistAccessibleName = computed(() => {
  const count = wishlistCount.value;
  if (count === 0) return t('header.wishlistEmpty');
  if (count === 1) return t('header.wishlistOne');
  return t('header.wishlistMany', { count });
});
/** The bag's own rule: three digits would widen the pill past the icon it sits on. */
const wishlistBadgeLabel = computed(() =>
  wishlistCount.value > 99 ? '99+' : String(wishlistCount.value)
);

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
function isCurrent(href: string | null | undefined): boolean {
  return typeof href === 'string' && href === currentPath.value;
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
 * The bar's height, named once: the bar sets it on its own grid and the spacer reserves the very
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
 * carries `border-b`, and the inner one the height, as the bar's grid does. Which is also the only way
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

// --- the menu in the bar -----------------------------------------------------------------------

/** The drawer holds the links and the call to action; with neither there is no Menu button either. */
const drawerHasContent = computed(() => links.value.length > 0 || hasCta.value);
const showLinksPlaceholder = computed(
  () => isEditing.value && variant.value !== 'minimal' && links.value.length === 0
);

const navMenuMessages = computed<Partial<UiMessages>>(() => ({
  navMenuOpen: t('header.openMenu'),
  navMenuDrawer: t('header.menu'),
}));

/** Below `@content` the Menu button holds the first column, so the brand takes the second. */
const brandPositionClass = computed(() => {
  const besideToggle = drawerHasContent.value ? 'col-start-2 row-start-1' : '';
  if (variant.value === 'minimal') return besideToggle;
  if (variant.value === 'centered') {
    return `${besideToggle} @content:col-start-2 @content:row-start-1 @content:justify-self-center`;
  }
  return drawerHasContent.value ? `${besideToggle} @content:col-start-1` : '';
});
const linksPositionClass = computed(() =>
  variant.value === 'centered'
    ? `@content:col-start-1 @content:col-span-4 @content:row-start-2 @content:justify-center @content:border-t ${hairlineClass.value} @content:pt-3 @content:mt-1`
    : '@content:col-start-2 @content:row-start-1'
);
const searchPositionClass = computed(() =>
  variant.value === 'centered' ? '@content:col-start-1 @content:row-start-1' : ''
);
const actionsPositionClass = computed(() =>
  variant.value === 'centered' ? '@content:col-start-4 @content:row-start-1' : ''
);

/** What this header draws differently from `NavMenu`'s own look, part by part. */
const navMenuClasses = computed<Partial<Record<NavMenuPart, string>>>(() => ({
  // `contents`: the bar and the Menu button become cells of the grid, which then positions panels.
  root: 'static contents',
  nav: `self-stretch ${linksPositionClass.value}`,
  list: variant.value === 'centered' ? 'h-full flex-nowrap justify-center' : 'h-full flex-nowrap',
  link: 'text-sm',
  trigger: 'text-sm',
  toggle:
    variant.value === 'minimal'
      ? 'col-start-1 row-start-1 size-auto min-h-10 max-md:size-auto max-md:min-h-11 gap-2 px-3 text-sm font-medium'
      : 'col-start-1 row-start-1',
  panel: 'pt-0',
  content:
    'rounded-none rounded-b-lg border-t-0 bg-(--eldra-header-surface) shadow-(--eldra-shadow-float) @wide:p-8',
  columns: 'grid-cols-12 gap-6',
  group: 'col-span-3',
  footer: 'justify-end',
  drawerLink: 'font-heading text-xl font-semibold',
  drawerTrigger: 'font-heading text-xl font-semibold',
}));
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
      <!-- One `gap-1` at every width (spec "Header" -> Layout); the call to action adds its own
           margin below. -->
      <div
        data-eldra-header-bar
        :class="[
          BAR_HEIGHT_CLASS,
          'relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1',
        ]"
      >
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

        <NavMenu
          v-if="drawerHasContent"
          v-model="openMenuIndex"
          v-model:drawer-open="drawerOpen"
          :items="navItems"
          :aria-label="t('header.primary')"
          :collapse-below="variant === 'minimal' ? 'always' : '@content'"
          open-on-hover
          :link-as="MenuLink"
          :messages="navMenuMessages"
          :classes="navMenuClasses"
        >
          <template #toggle>
            <EldraIcon name="menu-2" size="md" />
            <span v-if="variant === 'minimal'">{{ t('header.menu') }}</span>
          </template>
          <template #panelFooter="{ item, index }">
            <Link
              v-if="viewAllHref(index)"
              :href="viewAllHref(index)"
              :as="toLinkAs(viewAllHref(index))"
              variant="standalone"
              arrow
              data-eldra-mega-view-all
              :aria-label="t('header.viewAllOf', { label: item.label ?? '' })"
              :classes="{ root: 'text-sm' }"
            >
              {{ t('header.viewAll') }}
            </Link>
          </template>
          <template v-if="hasCta" #drawerFooter="{ close }">
            <Button variant="primary" block :href="ctaHref" :as="ctaLinkAs" @click="close">
              {{ ctaLabel }}
            </Button>
          </template>
        </NavMenu>
        <EditorPlaceholder
          v-if="showLinksPlaceholder"
          inline
          :label="t('editor.addLink')"
          :classes="{ root: `hidden @content:flex ${linksPositionClass}` }"
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
                :action="searchAction"
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
          <!-- In every header but `minimal`, prerendered ones included: see `wishlist` in the
               script above. `EldraRouterLink` because `/wishlist` is this theme's own route — it
               should route, not reload the document. -->
          <span v-if="variant !== 'minimal'" class="relative inline-flex">
            <Button
              variant="ghost"
              size="sm"
              icon-only
              :label="wishlistAccessibleName"
              :href="wishlistHref"
              :as="EldraRouterLink"
            >
              <template #leadingIcon>
                <EldraIcon name="heart" size="md" />
              </template>
            </Button>
            <!-- The bag's own two rules: no badge at zero, and `pointer-events-none`, because the
                 count is decorative (the button's accessible name carries it) and must not swallow
                 a click meant for the link. -->
            <Badge
              v-if="wishlistCount > 0"
              aria-hidden="true"
              tone="primary"
              pill
              :label="wishlistBadgeLabel"
              :classes="{ root: COUNT_PILL_CLASSES }"
            />
          </span>

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
              :classes="{ root: COUNT_PILL_CLASSES }"
            />
          </span>

          <!-- Spec Header -> Layout, From 64rem: the call to action sits 0.75rem after the cart.
               0.25rem of that is already the actions row's own gap-1; @content:ml-2 (0.5rem) makes
               up the rest, so it reads as its own button rather than a fourth icon in the row. -->
          <Button
            v-if="hasCta && variant !== 'minimal'"
            variant="primary"
            size="sm"
            :href="ctaHref"
            :as="ctaLinkAs"
            :classes="{ container: 'hidden @content:inline-flex @content:ml-2' }"
          >
            {{ ctaLabel }}
          </Button>
        </div>
      </div>
    </Container>

    <SearchModal
      v-model="searchOpen"
      v-model:query="searchQuery"
      :action="searchAction"
      :results="searchResults"
      :loading="searchLoading"
    />
  </header>
  <!-- The flow the fixed bar left behind — see `barSpacerClasses`. Empty and unlabelled: it is
       layout, with nothing in it for a screen reader or the tab order to reach. The outer box is the
       `<header>`'s counterpart (the `@container` the height is measured in, and the hairline) and the
       inner one the bar grid's (the height itself). -->
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
