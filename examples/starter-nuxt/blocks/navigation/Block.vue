<script setup lang="ts">
/** Header (design spec 2); apiId stays `navigation`. Layout: docs/starter-kit.md, "The header". */
import { computed, onMounted, ref, watchEffect } from 'vue';
import { useEldraLink, useEldraLocale } from '@eldrajs/theme-vue';
import type { ResolvedLink, ResolvedSection } from '@eldrajs/theme-vue';
import {
  Badge,
  Button,
  Container,
  CurrencyPicker,
  EditorPlaceholder,
  Link,
  NavMenu,
  SearchBar,
  SearchModal,
} from '@eldrajs/ui';
import type {
  NavMenuItem,
  NavMenuLink,
  NavMenuPart,
  NavMenuSection,
  NavMenuTone,
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
import { isInternalHref, safeHref, SEARCH_PATH } from '../../app/utils/links';
import { useMoney } from '../../app/storefront/money';
import type { StorefrontSearchResponse } from '../../app/storefront/types';
import MenuLink from './parts/MenuLink.vue';

import blockJson from './block.json';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const { data } = useBlockData(props, 'navigation');

/** Currency names are words in the page's language; prices follow the regional format instead. */
const { t, locale: contentLocale } = useI18n();
const isEditing = useEditing();
const storefront = useStorefront();

const variant = computed<'default' | 'centered' | 'minimal'>(() => data.value.variant ?? 'default');

// --- container-query stages ----------------------------------------------------------------------
//
// The bar gives up width in stages, each measured against the header's own `@container` (so the
// stages follow the block's width, not the window's):
//
//  - from 80rem (`@wide:`): brand, inline links, a "Search the shop" pill and the labelled tools;
//  - 68.8125rem–80rem (1101–1279px): the pill becomes a labelled Search button;
//  - below 68.8125rem (≤1100px): the links move into the Menu drawer; Menu and Search sit at the
//    start, the brand in the middle of a symmetric grid, Saved and Cart at the end;
//  - below 47.5625rem (≤760px): a shorter bar and narrower tools, and the info strip keeps only its
//    first item;
//  - below 25.0625rem (≤400px): a square mark stands in for the logo or the wordmark;
//  - below 22.5rem (<360px): a text-only wordmark wraps onto two centred lines.
//
// Tailwind only generates a class it can read in the source, so every stage is spelled out in full
// at each use (`@min-[68.8125rem]:…`, `@max-[47.5625rem]:…`) rather than assembled from a prefix.

// --- brand -----------------------------------------------------------------------------------

const brandLogo = computed(() => data.value.brandLogo);
const brandLogoUrl = computed(() => brandLogo.value?.url);
const brandMarkUrl = computed(() => data.value.brandMark?.url);
const brandHref = '/';
/** Named once on the link, so whichever of the mark, the logo and the wordmark a width shows, the
 *  brand link reads the same; the pictures inside it are decorative (`alt=""`). It starts with the
 *  visible wordmark (WCAG 2.5.3). */
const brandName = computed(() => t('header.home', { brand: data.value.brandText ?? '' }));

/**
 * A logo wider than about 4:1 is unreadably small at a phone's 2rem height, so with no square mark
 * to fall back on, phones below 400px print the store name instead. The shape is the image's own
 * stored width and height (Studio stores both); a logo without them is never judged too wide.
 */
const LOGO_TOO_WIDE = 4;
const logoTooWide = computed(() => {
  const width = Number(brandLogo.value?.width);
  const height = Number(brandLogo.value?.height);
  return width > 0 && height > 0 && width / height > LOGO_TOO_WIDE;
});

/** The mark: always beside the wordmark when there is no logo; only on small phones with one. */
const brandMarkClass = computed(() =>
  [
    'block size-8 shrink-0 @max-[47.5625rem]:size-7 @max-[25.0625rem]:size-9',
    brandLogoUrl.value ? 'hidden @max-[25.0625rem]:block' : '',
  ]
    .filter(Boolean)
    .join(' ')
);
/** Sized by height and capped in width, so a wider logo gets smaller rather than pushing the links
 *  and the tools around: 2.25rem tall at most 15rem wide, 12rem below 80rem, the brand column's
 *  own width once it sits centred, and 2rem tall on a phone. */
const brandLogoClass = computed(() =>
  [
    'block h-9 w-auto min-w-0 max-w-60 object-contain object-left',
    '@max-[80rem]:max-w-48 @max-[68.8125rem]:max-w-full @max-[68.8125rem]:object-center',
    '@max-[47.5625rem]:h-auto @max-[47.5625rem]:max-h-8',
    brandMarkUrl.value || logoTooWide.value ? '@max-[25.0625rem]:hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')
);
/** `null` when the wordmark is never drawn: a logo that is not too wide, with no mark. */
const brandTextClass = computed(() => {
  const base =
    'font-heading overflow-hidden text-ellipsis whitespace-nowrap text-[1.375rem] leading-tight font-medium tracking-[-0.01em] @max-[47.5625rem]:text-[1.0625rem]';
  if (brandLogoUrl.value) {
    if (!logoTooWide.value || brandMarkUrl.value) return null;
    return `${base} hidden @max-[25.0625rem]:block @max-[25.0625rem]:max-w-[8.5rem] @max-[25.0625rem]:whitespace-normal @max-[25.0625rem]:text-center @max-[25.0625rem]:text-base @max-[25.0625rem]:leading-[1.1]`;
  }
  if (brandMarkUrl.value) return `${base} @max-[25.0625rem]:hidden`;
  return `${base} @max-[22.5rem]:max-w-[5.75rem] @max-[22.5rem]:whitespace-normal @max-[22.5rem]:text-center @max-[22.5rem]:leading-[1.05]`;
});

// --- links + mega-menus ------------------------------------------------------------------------

const rawLinks = computed(() => data.value.links ?? []);

/** The site's own route authority: a `link` value in, `{ href, label, group, children }` out. */
const resolveLink = useEldraLink();

function toLinkAs(href: string | undefined): typeof EldraRouterLink | undefined {
  return href !== undefined && isInternalHref(href) ? EldraRouterLink : undefined;
}

/** A row with no label has nothing to show; one whose target is gone keeps its label as text. The
 *  stored value rides along for `linkExtras` below. */
const linkEntries = computed(() =>
  rawLinks.value.flatMap((item) => {
    const resolved = resolveLink(item);
    return resolved === null || resolved.label === null ? [] : [{ resolved, raw: item as unknown }];
  })
);
const links = computed(() => linkEntries.value.map((entry) => entry.resolved));

/**
 * A section link's `badge` ("New") and `description` (a dropdown's second line), which `NavMenu`
 * draws but the resolved link does not carry: `@eldrajs/theme-core`'s link value has no such keys,
 * so Studio's link editor cannot set them yet and they only ever arrive as extra keys on the stored
 * value (the demo content does this). They are read straight off that value, matched to the
 * resolved links by position — and only when the resolver dropped nothing in that section, so a
 * badge can never land on the wrong link.
 */
interface LinkExtras {
  badge?: string;
  description?: string;
}
function plainString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.trim() !== '' ? field : undefined;
}
function rawList(value: unknown, key: string): unknown[] {
  if (value === null || typeof value !== 'object') return [];
  const list = (value as Record<string, unknown>)[key];
  return Array.isArray(list) ? list : [];
}
function sectionExtras(raw: unknown, sections: ResolvedSection[]): LinkExtras[][] {
  const rawSections = rawList(raw, 'sections');
  return sections.map((section, index) => {
    const rawLinks = rawList(rawSections[index], 'links');
    if (rawSections.length !== sections.length || rawLinks.length !== section.links.length) {
      return [];
    }
    return rawLinks.map((link) => ({
      badge: plainString(link, 'badge'),
      description: plainString(link, 'description'),
    }));
  });
}

/**
 * A top-level link the merchant marked `tone: "accent"` — the design's "Sale" — is drawn in the
 * accent colour, in the bar and as a drawer row (`NavMenuLink.tone`). It is the link's own
 * setting rather than a rule about a label or a position, so it survives a translation, a rename
 * and a reorder. Like `badge` and `description` it rides on the stored link value as an extra key
 * (Studio's link editor has no field for it yet), and is read straight off the item it is on.
 */
function linkTone(raw: unknown): NavMenuTone | undefined {
  return plainString(raw, 'tone') === 'accent' ? 'accent' : undefined;
}

/**
 * The picture crop of a menu card: the `aspect` this block's own `links` field declares in
 * `cards`, so the declaration and the drawing cannot drift. `NavMenu` falls back to 4:3 on a
 * value that is not `width:height`.
 */
const cardAspect = (
  blockJson.fields.find((field) => field.fieldId === 'links') as
    | {
        metadata?: {
          item?: { metadata?: { tree?: { cards?: { aspect?: string } } } };
        };
      }
    | undefined
)?.metadata?.item?.metadata?.tree?.cards?.aspect;

/** A resolved link as the menu draws it, `display` and `card` (child and section links only) kept. */
function toNavLink(link: ResolvedLink, extras: LinkExtras = {}): NavMenuLink {
  return {
    label: link.label,
    href: link.href,
    newTab: link.newTab,
    group: link.group,
    current: isCurrent(link.href),
    display: link.display,
    card: link.card,
    badge: extras.badge,
    description: extras.description,
  };
}

function toNavSection(section: ResolvedSection, extras: LinkExtras[] = []): NavMenuSection {
  return {
    heading: section.heading,
    headingLink: section.headingLink === null ? null : toNavLink(section.headingLink),
    display: section.display,
    links: section.links.map((link, index) => toNavLink(link, extras[index])),
    seeAll: section.seeAll === null ? null : toNavLink(section.seeAll),
  };
}

/**
 * A panel that is one column with no heading and no cards — a short list of links, each perhaps
 * with a line of description, like the Journal's — hangs under its own trigger as a compact
 * dropdown. Anything with columns, headings or cards is a full-width mega panel.
 */
function isDropdown(sections: ResolvedSection[]): boolean {
  const [only] = sections;
  return (
    sections.length === 1 &&
    only !== undefined &&
    only.heading === null &&
    !only.links.some((link) => link.card !== undefined)
  );
}

/**
 * A parent with a panel is a disclosure, so its own destination moves to the panel's "View all". The
 * panel is its `sections` when the site served them (this block declares them), else its `children`
 * grouped by their `group`, which is what a menu stored before sections existed still is.
 */
const navItems = computed<NavMenuItem[]>(() =>
  linkEntries.value.map(({ resolved: link, raw }) => {
    const sections = link.sections ?? [];
    const children = link.children.filter((child) => child.label !== null);
    const tone = linkTone(raw);
    if (sections.length === 0 && children.length === 0) {
      return {
        label: link.label,
        href: link.href,
        newTab: link.newTab,
        current: isCurrent(link.href),
        tone,
      };
    }
    if (sections.length === 0) {
      return {
        label: link.label,
        layout: 'mega',
        tone,
        children: children.map((c) => toNavLink(c)),
      };
    }
    const extras = sectionExtras(raw, sections);
    return {
      label: link.label,
      tone,
      layout: isDropdown(sections) ? 'dropdown' : 'mega',
      sections: sections.map((section, index) => toNavSection(section, extras[index])),
    };
  })
);

/**
 * The panel's own "View all" footer, for a menu stored before sections existed: a panel of
 * `children` has no headings to link from, so the parent's own page is offered under it. A panel of
 * sections has none (the design's Shop and Ceramics panels end on their columns): its headings and
 * "see all" links are how an author points at a department's page.
 */
function viewAllHref(index: number): string | undefined {
  const link = links.value[index];
  if ((link?.sections?.length ?? 0) > 0) return undefined;
  return link?.href ?? undefined;
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

// --- account -----------------------------------------------------------------------------------

/** The Account button: only when the merchant links it somewhere. The theme has no account page of
 *  its own, so there is nothing to point it at by default. */
const accountLink = computed(() => resolveLink(data.value.account));
const accountHref = computed(() => accountLink.value?.href ?? undefined);
const accountLinkAs = computed(() => toLinkAs(accountHref.value));

// --- info strip --------------------------------------------------------------------------------

/**
 * The thin strip above the bar: delivery, returns and hours at the start, help links and a phone
 * number at the end. Absent or empty, there is no strip at all. Phones keep only the first item;
 * the end of the strip moves into the drawer's footer with the links (it would not fit beside the
 * start below 68.8125rem), unless the strip has nothing at its start.
 */
interface InfoEntry {
  text: string;
  icon?: string;
  /** Through `safeHref`: a `javascript:` value is no link at all. */
  href?: string;
  linkAs?: typeof EldraRouterLink;
}
const infoItems = computed(() =>
  (data.value.infoItems ?? []).flatMap((item) => {
    if ((item.text ?? '').trim() === '') return [];
    const href = safeHref(item.href) ?? undefined;
    const entry: InfoEntry & { end: boolean } = {
      text: item.text,
      icon: item.icon || undefined,
      href,
      linkAs: toLinkAs(href),
      end: item.placement === 'end',
    };
    return [entry];
  })
);
const infoStart = computed(() => infoItems.value.filter((item) => !item.end));
const infoEnd = computed(() => infoItems.value.filter((item) => item.end));
const hasInfo = computed(() => infoItems.value.length > 0);
/** With nothing at the start, the end of the strip takes its place on every width. */
const infoEndClass = computed(() => (infoStart.value.length > 0 ? '@max-[68.8125rem]:hidden' : ''));
/** The end items the drawer repeats while the strip hides them: the ones with somewhere to go. */
const infoEndLinks = computed(() =>
  infoStart.value.length > 0 ? infoEnd.value.filter((item) => item.href !== undefined) : []
);
/** Phones keep only the strip's very first item. */
function infoItemClass(index: number): string {
  return index === 0 ? '' : '@max-[47.5625rem]:hidden';
}

// --- search ------------------------------------------------------------------------------------

const showSearch = computed(() => data.value.showSearch !== false);
/** `inline` only ever applies to `centered`; otherwise it falls back to `icon` (spec: "inline:
 *  centered variant only"). */
const searchStyle = computed<'icon' | 'field' | 'inline'>(() => {
  const style = data.value.searchStyle ?? 'icon';
  if (style === 'inline' && variant.value !== 'centered') return 'icon';
  // `minimal` is a tool row at every width, and its brand is centred by the two sides matching:
  // a pill field on one side would push it off the middle.
  if (style === 'field' && variant.value === 'minimal') return 'icon';
  return style;
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
    price:
      product.price === null || product.price.soldInCurrency === false
        ? undefined
        : money.format(product.price.amount, product.price.currency),
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
 * A count pill is a corner badge on a labelled tool: 1.125rem tall (`min-w` so "99+" still widens
 * it), `0.6875rem` bold tabular figures, `accent` fill and `accent-contrast` text (both from the
 * `tone="accent"` prop, not this constant), sitting at the tool's top-right — `top-0.5 right-1.5`,
 * `right-0.5` on a phone's narrower tool — so it rides the icon's corner and leaves the label under
 * it clear. No ring: a ring's whole job is separating a pill from what sits *beside* it, and a
 * corner badge sits *on* the icon by design. `countPill.browser.spec.ts` measures the pill's height
 * and its overlap with the icon's real `<svg>` box in a real browser. The same override styles
 * both the cart and the saved-items pill, so it is one constant rather than two copies that could
 * drift.
 *
 * `Badge`'s own root carries `min-h-6` and `text-badge` (1.5rem min height, the package's own
 * type-style utility); passed as the Badge's `class`, these app utilities outrank its `eldra:`
 * classes by cascade layer, with no `!important` and no need for a `size` prop (`Badge` has none).
 */
const COUNT_PILL_CLASSES =
  'pointer-events-none absolute top-0.5 right-1.5 @max-[47.5625rem]:right-0.5 h-[1.125rem] ' +
  'min-h-[1.125rem] min-w-[1.125rem] justify-center px-1 text-[0.6875rem] font-bold tabular-nums leading-none';

/**
 * A tool: an icon with its name printed under it (the design's labelled header buttons), one fixed
 * width per stage. The width is fixed, not a minimum, because below 68.8125rem the bar is a
 * symmetric grid — Menu and Search on one side, Saved and Cart on the other — and the brand is only
 * truly centred when the two sides are the same width. `@eldrajs/ui`'s `Button` draws it; these
 * app classes outrank its own size classes by cascade layer.
 */
const TOOL_WIDTH_CLASSES = 'w-14 @max-[47.5625rem]:w-11 @max-[22.5rem]:w-10';
const TOOL_CLASSES =
  `${TOOL_WIDTH_CLASSES} h-auto min-h-12 flex-col justify-center gap-0.5 px-1 py-1 ` +
  'text-xs leading-[1.1] font-medium @max-[47.5625rem]:px-0 @max-[47.5625rem]:text-[0.6875rem]';
/** The tool's icon, 1.375rem. */
const TOOL_ICON_CLASSES = 'size-[1.375rem]';

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
  // A cart that could not be read has no count to say.
  if (mounted.value && storefront.cart.loadFailed.value) return t('header.cart');
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
 * **It does render at mobile widths**, unlike the call to action, which only shows from 68.8125rem.
 * Deliberate, and the bag's own rule: a shopper who saved something on a phone has no other way
 * back to it, where the call to action has a drawer row.
 */
const wishlist = useWishlist();
const wishlistCount = wishlist.count;
const wishlistHref = '/wishlist';
/** The bag's three forms, with a plainer empty one: nothing saved reads as just "Saved" — the
 *  tool's own visible label, no count to read out — where the bag says "Cart, empty", which is worth
 *  saying about a bag a visitor may have just filled and says nothing about a list they have never
 *  used. Every form starts with the visible label (WCAG 2.5.3). A number appears only once there is
 *  one, so the name in a prerendered file is the same for every visitor. */
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
 * from the bar is a page that jumps. The stage is a container query, so it is only ever as true
 * as the container it is measured in — which is why both boxes sit inside an `@container` of the
 * block's own width.
 */
const BAR_HEIGHT_CLASS = 'min-h-[4.5rem] @max-[47.5625rem]:min-h-[3.75rem]';
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
/** Spec "Header" → Accessibility, "Sticky header and focus": scroll padding at least the sticky
 *  header's height (2.4.11), so a focused/anchored target is never hidden under it. A constant, not
 *  the measured `--eldra-header-height`: where the browser scrolls a focused field must not depend
 *  on when the bar was last measured, or a draft preview session (which focuses under its veil, before
 *  the live page would have) lands a field at a different scroll position than the live page does
 *  (`test/previewParity.browser.spec.ts`, "/focus-mid"). 7rem covers the tallest header: the 4.5rem
 *  bar plus the info strip. */
watchEffect((onCleanup) => {
  if (typeof document === 'undefined') return;
  if (!sticky.value) return;
  document.documentElement.style.setProperty('scroll-padding-top', '7rem');
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
 * `sticky`/`variant`/`searchStyle` and the mobile/tablet/desktop breakpoint — or 0 while the bar
 * is slid out of view (the effect after this one). The property is
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
    // The same measurement the spacer reserves, so the two can never disagree; the effect below
    // publishes it.
    barHeight.value = el.getBoundingClientRect().height;
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
/**
 * What is published is the bar's **visible** height: its measured height while it shows, `0px`
 * while it is slid out of view (`barHidden`). A reader offsets a sticky box by it to sit under the
 * bar, and a bar that has slid away covers nothing — publishing its full height then left every
 * such box (the collection grid's filter rail and filter bar, `faq`'s head column) hanging a
 * header's height below the viewport's top over an empty strip (WS-1277). The spacer keeps
 * reserving the full `barHeight`, since the page's flow never changes as the bar slides. `sync`,
 * so a resize is published in the observer's own callback, as it was when that callback wrote it.
 */
watchEffect(
  () => {
    if (typeof document === 'undefined' || barHeight.value === null) return;
    const visible = barHidden.value ? 0 : barHeight.value;
    document.documentElement.style.setProperty('--eldra-header-height', `${visible}px`);
  },
  { flush: 'sync' }
);

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
 * never an array, so every conditional class list handed to a `classes` prop in this file is
 * joined into one string with `[...].filter(Boolean).join(' ')`.
 */
/**
 * Spec "Header" → Container/Section line: "Section background default `background` … Section
 * spacing none (the bar sets its own height)". This root is a plain `<header>`, never
 * `@eldrajs/ui`'s `Section`: `Section` marks every ground (including `none`) with
 * `data-section-bg` so its own adjacent-same-background CSS rule can drop the *next* sibling's
 * top padding, and the header must never trigger that rule against the block that follows it (a
 * Hero, most often) — the header is fixed chrome that always sits at the page's own ground, not a
 * coloured band the padding-collapse rule is meant to read as one continuous band with its
 * neighbour. It also never needs `Section`'s `data-section` colour-inversion machinery: `background`
 * is always `none` here, and transparent-over-hero mode is handled entirely by `barRootClasses`
 * above, not by `Section`'s `primary`/`accent` invert. `@container` is kept directly on this root so
 * `Container` and every `@content:`/`@tablet:` variant below still measure the header's own width.
 */
const barRootClasses = computed(() =>
  [
    '@container',
    // Fixed, the bar is as wide as the viewport, and `@eldrajs/ui` takes the page's scrollbar away
    // while a Dialog, Drawer, Lightbox or SearchModal is open — so the viewport widens by the
    // scrollbar and the bar with it, shifting every tool sideways under the overlay. The package
    // publishes the width it took as `--eldra-scrollbar-width` on `<html>` for exactly this; padding
    // the bar by it keeps its content box (and so every container-query stage) where it was.
    // Not fixed, the header is still the positioning box a full-width mega panel spans.
    sticky.value
      ? 'fixed inset-x-0 top-0 z-40 pr-(--eldra-scrollbar-width,0px) motion-safe:transition-transform motion-safe:duration-base'
      : 'relative',
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
 * it again on hydration. They carry the phone stage (`@max-[47.5625rem]:`), so they need a container of the
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
/** How the drawer shows a panel: folded rows (default) or every panel open under its heading. */
const drawerLayout = computed<'accordion' | 'sections'>(() =>
  data.value.drawerLayout === 'sections' ? 'sections' : 'accordion'
);
/** More than one currency to shop in. On a phone the picker sits in the menu when there is one. */
const currency = storefront.currency;
const hasCurrencies = computed(() => currency.offered.value.length > 1);
/**
 * With an info strip the picker sits at its end, "Prices in ISK", from 47.625rem up: a setting next
 * to Help and Order status rather than a boxed control among the tools. Phones have no room in the
 * strip, so there it is in the drawer's footer (or in the bar, with no drawer).
 */
const stripPicker = computed(() => hasInfo.value && hasCurrencies.value);
/**
 * The divider before it, wherever the strip's end items show beside it: a hairline 1.25rem before
 * the button, pulled 0.25rem back towards the links so the gap either side of the rule reads even.
 */
const stripPickerClass = computed(() => {
  if (infoEnd.value.length === 0) return '';
  const divider = isTransparent.value ? 'border-primary-contrast/24' : 'border-border';
  return infoStart.value.length > 0
    ? `@min-[68.8125rem]:-ms-1 @min-[68.8125rem]:border-l @min-[68.8125rem]:ps-5 ${divider}`
    : `-ms-1 border-l ps-5 ${divider}`;
});
/**
 * A picker's list is teleported out of the header, so it lifts itself over the fixed bar's own
 * `z-40` (a popover's `z-popover`, 30, sits under it).
 */
const PICKER_PANEL_LIFT = 'z-41';
/**
 * The strip's picker reads as a setting in the strip, not as a field: no box, the strip's own size,
 * the words in `text` with the code bold, an underline under the words on hover. Its list is a
 * 17rem card under the button's end: each row the currency's name, its code muted beside it and
 * the check, the chosen row on `surface-strong`.
 */
const stripPickerClasses = computed(() => ({
  trigger: [
    'h-9 min-h-9 w-auto gap-1.5 rounded-sm border-0 bg-transparent px-1 text-[0.8125rem] shadow-none hover:bg-transparent',
    isTransparent.value ? 'text-current' : 'text-text',
    '[&:hover_[data-eldra-header-currency-words]]:underline underline-offset-[0.2em]',
    // Open from a pointer it is a setting, not a field: no ring. A keyboard keeps its ring.
    'aria-expanded:not-focus-visible:[--eldra-focus-alpha:0]',
  ].join(' '),
  leadingIcon: 'size-4',
  value: 'overflow-visible',
  chevron:
    'size-3.5 text-current motion-safe:transition-[rotate] motion-safe:duration-fast [[aria-expanded=true]_&]:rotate-180',
  panel: `${PICKER_PANEL_LIFT} w-68 rounded-lg border-border bg-background px-2 pt-3 pb-2 text-[0.9375rem] shadow-md`,
  option:
    'min-h-11 gap-3 rounded-md px-3 text-[0.9375rem] hover:bg-surface aria-selected:bg-surface-strong aria-selected:font-semibold',
  optionCheck: 'size-5 text-primary',
}));
/**
 * The bar's picker: without a strip, only where the links are inline (with a drawer it lives in the
 * drawer's footer); with a strip, only on a phone with no drawer to hold it.
 */
const barPickerClass = computed(() => {
  if (stripPicker.value) return drawerHasContent.value ? 'hidden' : 'ml-1 @min-[47.625rem]:hidden';
  if (!drawerHasContent.value) return 'ml-1';
  return variant.value === 'minimal' ? 'hidden' : '@min-[68.8125rem]:block ml-1 hidden';
});
const showLinksPlaceholder = computed(
  () => isEditing.value && variant.value !== 'minimal' && links.value.length === 0
);

/** The Menu tool's accessible name is its visible label (WCAG 2.5.3): Menu, and Close while the
 *  menu is open under the bar. */
const navMenuMessages = computed<Partial<UiMessages>>(() => ({
  navMenuOpen: t('header.menu'),
  navMenuDrawer: t('header.menu'),
  close: t('header.close'),
}));

/** A drawer footer row's icon: its own, else a phone for a `tel:` number. */
function footerIcon(item: InfoEntry): string | undefined {
  if (item.icon) return item.icon;
  return item.href?.startsWith('tel:') === true ? 'phone' : undefined;
}

/**
 * The bar's grid. Below 68.8125rem (and at every width in `minimal`) it is six tracks —
 * `Menu | Search | 1fr | brand | 1fr | Saved+Cart` — and because the tools are one fixed width and the
 * actions row's gap equals the grid's, the two sides are the same width and the brand sits in the
 * exact middle (spacers stand in for a missing Menu or Search tool, or `minimal`'s missing Saved).
 * The brand's own track is `minmax(0,auto)` so a wide logo shrinks into it rather than pushing the
 * tools off the bar. From 68.8125rem `default` is `brand | links | search | actions` and `centered`
 * is `search | brand | actions` over a second row of links.
 */
const barGridClass = computed(() => {
  const drawer =
    'grid grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-x-0.5';
  if (variant.value === 'minimal') return drawer;
  if (variant.value === 'centered') {
    return `${drawer} @min-[68.8125rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[68.8125rem]:gap-x-4 @min-[68.8125rem]:pt-1`;
  }
  return `${drawer} @min-[68.8125rem]:grid-cols-[auto_minmax(0,1fr)_auto_auto] @min-[68.8125rem]:gap-x-1`;
});

const brandPositionClass = computed(() => {
  const drawer = 'col-start-4 row-start-1 justify-self-center';
  if (variant.value === 'minimal') return drawer;
  if (variant.value === 'centered') return `${drawer} @min-[68.8125rem]:col-start-2`;
  return `${drawer} @min-[68.8125rem]:col-start-1 @min-[68.8125rem]:justify-self-start`;
});
const linksPositionClass = computed(() =>
  variant.value === 'centered'
    ? `@min-[68.8125rem]:col-start-1 @min-[68.8125rem]:col-end-4 @min-[68.8125rem]:row-start-2 @min-[68.8125rem]:border-t ${hairlineClass.value} @min-[68.8125rem]:py-1`
    : '@min-[68.8125rem]:col-start-2 @min-[68.8125rem]:row-start-1 @min-[68.8125rem]:mx-5 @wide:mx-8'
);
const searchPositionClass = computed(() => {
  const drawer = 'col-start-2 row-start-1';
  if (variant.value === 'minimal') return drawer;
  if (variant.value === 'centered') {
    return `${drawer} @min-[68.8125rem]:col-start-1 @min-[68.8125rem]:justify-self-start`;
  }
  return `${drawer} @min-[68.8125rem]:col-start-3`;
});
const actionsPositionClass = computed(() => {
  const drawer = 'col-start-6 row-start-1 justify-self-end';
  if (variant.value === 'minimal') return drawer;
  if (variant.value === 'centered') return `${drawer} @min-[68.8125rem]:col-start-3`;
  return `${drawer} @min-[68.8125rem]:col-start-4`;
});
/** A placeholder the width of one tool, so a missing Menu or Search keeps the brand centred. Only
 *  in the drawer layout; from 68.8125rem the default and centered bars do not need one. */
const toolSpacerClass = computed(() =>
  variant.value === 'minimal'
    ? TOOL_WIDTH_CLASSES
    : `${TOOL_WIDTH_CLASSES} @min-[68.8125rem]:hidden`
);

/**
 * Dropdown panels and mega panels share `NavMenu`'s `panel` and `content` parts, each marked with
 * its `data-layout`; a link inside one is styled through `in-data-[layout=…]:`. Every rule below
 * that differs between the two is written once per layout, so no element carries two values for
 * one property — and written out in full, since Tailwind only generates a class it can read.
 */
/** What this header draws differently from `NavMenu`'s own look, part by part. */
const navMenuClasses = computed<Partial<Record<NavMenuPart, string>>>(() => ({
  nav: `@max-[68.8125rem]:hidden self-stretch ${linksPositionClass.value}`,
  list:
    variant.value === 'centered'
      ? 'h-full flex-nowrap justify-center gap-0.5'
      : 'h-full flex-nowrap gap-0.5',
  // The design's pill entries: 2.75rem tall, full radius, `surface` on hover and while open, the
  // current page on `surface-strong`. The pill marks the current page, so the package's underline
  // for it is turned off here, as on `trigger`. An accent entry (`tone`) keeps its colour.
  link: 'min-h-11 rounded-full px-3 text-base font-medium hover:bg-surface aria-[current=page]:no-underline aria-[current=page]:bg-surface-strong',
  trigger:
    'min-h-11 rounded-full px-3 text-base font-medium hover:bg-surface aria-expanded:bg-surface data-current:no-underline data-current:bg-surface-strong',
  // The Menu tool: shown below 68.8125rem (the package hides it from `@content`), a labelled tool
  // like its neighbours.
  toggle: `${TOOL_CLASSES} @max-[68.8125rem]:inline-flex col-start-1 row-start-1 max-md:size-auto rounded-md`,
  // A mega panel hangs from the whole header (its positioning box), full-bleed, flush under the
  // bar; a dropdown hangs 0.5rem under its trigger — padding, not a margin, so the pointer crossing
  // the gap is still over the menu.
  panel: `data-[layout=mega]:pt-0 data-[layout=dropdown]:pt-2`,
  content: [
    // The design's panel shadow is a deep, soft one under the sheet: the theme's `md` shadow.
    'border-border bg-(--eldra-header-surface) shadow-md',
    // Mega: a square sheet with a bottom rule, 2rem above and below, the page's gutters at the sides.
    `data-[layout=mega]:rounded-none data-[layout=mega]:border-0 data-[layout=mega]:border-b data-[layout=mega]:py-8`,
    `data-[layout=mega]:px-(--eldra-gutter-mobile) data-[layout=mega]:@tablet:px-(--eldra-gutter-tablet) data-[layout=mega]:@content:px-(--eldra-gutter-desktop)`,
    // Dropdown: a 21rem rounded card, 0.5rem inside (0.75rem at the foot).
    `data-[layout=dropdown]:w-[21rem] data-[layout=dropdown]:rounded-lg data-[layout=dropdown]:border data-[layout=dropdown]:px-2 data-[layout=dropdown]:pt-2 data-[layout=dropdown]:pb-3`,
  ].join(' '),
  // Link columns in equal tracks; a column of cards spans two of them. Inside the wide container.
  columns:
    'mx-auto w-full max-w-[calc(var(--eldra-container-wide)-2*var(--eldra-gutter-desktop))] grid-cols-12 gap-8 data-cards:grid-flow-col data-cards:auto-cols-fr data-cards:grid-cols-none',
  group: 'col-span-3 [[data-cards]>&]:col-span-1 [[data-cards]>&[data-cards]]:col-span-2',
  // Serif column headings, linked or plain.
  groupHeading:
    'font-heading px-0 pb-3 text-xl leading-tight font-medium tracking-normal normal-case text-text',
  groupLink: 'text-text no-underline hover:underline underline-offset-[0.2em]',
  // Two cards side by side, 1rem apart; a column of links nearly touching; a dropdown's rows flush.
  panelList: `gap-0.5 [[data-cards]>&]:gap-4 in-data-[layout=dropdown]:gap-0`,
  panelLink: [
    // Mega: quiet links that underline on hover; a card's link underlines only its title.
    `in-data-[layout=mega]:px-0 in-data-[layout=mega]:py-1.5 in-data-[layout=mega]:text-muted in-data-[layout=mega]:hover:bg-transparent in-data-[layout=mega]:hover:text-text`,
    `in-data-[layout=mega]:hover:underline underline-offset-[0.2em] has-data-[part=card]:py-0 has-data-[part=card]:hover:no-underline`,
    // Dropdown: padded rows, the title in `text`, `surface` on hover.
    `in-data-[layout=dropdown]:px-3 in-data-[layout=dropdown]:py-2.5 in-data-[layout=dropdown]:text-text in-data-[layout=dropdown]:hover:bg-surface`,
    // The column's "see all": primary, semibold, with an arrow.
    'data-see-all:mt-2 data-see-all:text-[0.9375rem] data-see-all:font-semibold data-see-all:text-primary',
    // In a dropdown it lines up with the rows' text, a 2.25rem line under them that underlines.
    `in-data-[layout=dropdown]:data-see-all:mt-1 in-data-[layout=dropdown]:data-see-all:min-h-9 in-data-[layout=dropdown]:data-see-all:justify-center in-data-[layout=dropdown]:data-see-all:py-0`,
    `in-data-[layout=dropdown]:data-see-all:hover:bg-transparent in-data-[layout=dropdown]:data-see-all:hover:underline`,
  ].join(' '),
  panelLabel: `gap-x-2 text-base font-normal in-data-[layout=dropdown]:font-semibold in-data-see-all:text-[0.9375rem] in-data-see-all:font-semibold in-data-see-all:after:content-['→']`,
  description: 'text-sm leading-[1.4]',
  badge:
    'min-h-0 rounded-sm bg-accent px-1.5 py-0 text-[0.6875rem] leading-[1.4] font-bold tracking-[0.04em] text-accent-contrast',
  // Cards: the picture (rounded, on `surface` while it loads), a semibold title and the price
  // under it in `muted`.
  card: 'gap-2',
  cardImage: 'rounded-lg',
  cardTitle: 'text-base leading-[1.3] font-semibold [a:hover_&]:underline underline-offset-[0.2em]',
  cardPrice: 'mt-0.5 text-[0.9375rem]',
  footer:
    'mx-auto w-full max-w-[calc(var(--eldra-container-wide)-2*var(--eldra-gutter-desktop))] justify-end border-0 pt-2',
  // The inline drawer: serif rows with chevrons, section headings as small capitals, links at body
  // size; from 37.5rem its columns sit two abreast and a column of cards spans both, four across.
  drawerBody: 'px-0 pt-0',
  drawerLink: 'font-heading min-h-14 px-4 text-xl font-normal',
  drawerTrigger:
    'min-h-14 px-4 py-3 hover:no-underline [&_[data-part=title]]:font-heading [&_[data-part=title]]:text-xl [&_[data-part=title]]:font-normal [&_[data-part=title]]:no-underline',
  // A section's heading row links to its page, with an arrow at the end in place of a chevron.
  drawerSectionHeading:
    "font-heading min-h-14 px-4 py-0 text-xl font-normal after:ms-auto after:font-body after:text-muted after:content-['→']",
  drawerItem: 'pb-0',
  drawerPanel: 'pb-0',
  drawerNest: 'ms-0 border-s-0 px-4 pt-1 pb-5',
  drawerColumns: 'gap-5 @min-[37.5rem]:grid @min-[37.5rem]:grid-cols-2 @min-[37.5rem]:gap-x-8',
  drawerGroup: '@min-[37.5rem]:data-cards:col-span-full',
  drawerGroupHeading: 'px-0 pb-1 text-xs font-bold tracking-[0.12em] uppercase text-muted',
  drawerGroupLink: 'text-muted no-underline hover:underline',
  drawerPanelList: '[[data-cards]>&]:gap-3 @min-[37.5rem]:[[data-cards]>&]:grid-cols-4',
  // Links at 1.0625rem with 0.5rem above and below; the "see all" smaller, tucked under them.
  drawerPanelLink: 'py-2 data-see-all:mt-0 data-see-all:py-1 data-see-all:text-primary',
  drawerPanelLabel: `text-[1.0625rem] font-normal in-data-see-all:text-[0.9375rem] in-data-see-all:font-semibold in-data-see-all:after:content-['→']`,
  drawerBadge:
    'min-h-0 rounded-sm bg-accent px-1.5 py-0 text-[0.6875rem] leading-[1.4] font-bold tracking-[0.04em] text-accent-contrast',
  // Square pictures in the drawer, whatever the bar's crop.
  drawerCardImage: 'rounded-lg aspect-square',
  drawerCardTitle: 'font-semibold',
  // The foot, on `surface`: account, saved items, the strip's own links and the currency.
  drawerFooter: 'gap-3 px-4 py-5 text-[0.9375rem]',
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
    <!-- The info strip: absent with no items. Phones keep its first item; below 68.8125rem the
         end of it moves into the drawer's footer. -->
    <div
      v-if="hasInfo"
      data-eldra-header-info
      role="region"
      :aria-label="t('header.info')"
      :class="[
        'text-[0.8125rem]',
        isTransparent
          ? 'border-primary-contrast/24 border-b bg-transparent'
          : 'bg-surface text-muted border-border border-b',
      ]"
    >
      <Container
        width="wide"
        class="flex min-h-9 items-center justify-between gap-4 @max-[47.5625rem]:justify-center"
      >
        <ul v-if="infoStart.length > 0" class="m-0 flex list-none gap-6 p-0">
          <li
            v-for="(item, index) in infoStart"
            :key="`start-${index}`"
            :class="['inline-flex items-center gap-1.5', infoItemClass(index)]"
          >
            <EldraIcon
              v-if="item.icon"
              :name="item.icon"
              size="sm"
              :class="['size-4', isTransparent ? '' : 'text-primary']"
            />
            <Link
              v-if="item.href"
              :href="item.href"
              :as="item.linkAs"
              variant="standalone"
              :underline="false"
              :class="['font-normal', isTransparent ? 'text-current' : 'text-text']"
              >{{ item.text }}</Link
            >
            <span v-else>{{ item.text }}</span>
          </li>
        </ul>
        <div
          v-if="infoEnd.length > 0 || stripPicker"
          data-eldra-header-info-end
          class="flex items-center gap-4"
        >
          <ul v-if="infoEnd.length > 0" :class="['m-0 flex list-none gap-6 p-0', infoEndClass]">
            <li
              v-for="(item, index) in infoEnd"
              :key="`end-${index}`"
              :class="[
                'inline-flex items-center gap-1.5',
                infoStart.length > 0 ? '' : infoItemClass(index),
              ]"
            >
              <EldraIcon
                v-if="item.icon"
                :name="item.icon"
                size="sm"
                :class="['size-4', isTransparent ? '' : 'text-primary']"
              />
              <Link
                v-if="item.href"
                :href="item.href"
                :as="item.linkAs"
                variant="standalone"
                :underline="false"
                :class="['font-normal', isTransparent ? 'text-current' : 'text-text']"
                >{{ item.text }}</Link
              >
              <span v-else>{{ item.text }}</span>
            </li>
          </ul>
          <div
            v-if="stripPicker"
            data-eldra-header-currency
            :class="['flex items-center @max-[47.5625rem]:hidden', stripPickerClass]"
          >
            <CurrencyPicker
              :locale="contentLocale"
              :currencies="currency.offered.value"
              :model-value="currency.active.value"
              :busy="currency.busy.value"
              :label="t('header.pricesIn')"
              :classes="stripPickerClasses"
              @update:model-value="currency.choose"
            >
              <template #leading
                ><EldraIcon
                  name="world"
                  size="sm"
                  :class="['size-4', isTransparent ? '' : 'text-primary']"
              /></template>
              <template #value="{ code }"
                ><span data-eldra-header-currency-words
                  >{{ t('header.pricesIn') }}&nbsp;<b class="font-semibold">{{ code }}</b></span
                ></template
              >
              <template #optionContent="{ code, currencyName }">
                <span class="min-w-0 flex-1">{{ currencyName }}</span>
                <small class="text-muted text-[0.8125rem] font-medium tracking-[0.04em]">{{
                  code
                }}</small>
              </template>
            </CurrencyPicker>
          </div>
        </div>
      </Container>
    </div>

    <Container width="wide">
      <div data-eldra-header-bar :class="[BAR_HEIGHT_CLASS, barGridClass]">
        <Link
          :href="brandHref"
          :as="EldraRouterLink"
          variant="standalone"
          :underline="false"
          :aria-label="brandName"
          data-eldra-header-focus
          data-eldra-header-brand
          :class="`flex max-w-full min-w-0 rounded-sm text-current hover:no-underline ${brandPositionClass}`"
          :classes="{
            label: 'flex min-w-0 max-w-full items-center gap-2.5 @max-[47.5625rem]:gap-2',
          }"
        >
          <img
            v-if="brandMarkUrl"
            :src="brandMarkUrl"
            alt=""
            :class="brandMarkClass"
            loading="eager"
            decoding="async"
          />
          <img
            v-if="brandLogoUrl"
            :src="brandLogoUrl"
            alt=""
            :class="brandLogoClass"
            loading="eager"
            decoding="async"
          />
          <!-- The wordmark never wraps on a wider screen (block.json's own 20-character maxLength
               keeps it fitting); `min-w-0` on the link and this span's ellipsis are the fallback for
               the rare case that still doesn't leave enough room. Below 360px a text-only wordmark
               wraps onto two centred lines instead. -->
          <span v-if="brandTextClass !== null" :class="brandTextClass">{{ data.brandText }}</span>
        </Link>

        <!-- `NavMenu` collapses at its nearest stage, `@content` (64rem); the `nav` and `toggle`
             classes below move that to the design's 68.8125rem (1100px) from this side. -->
        <NavMenu
          v-if="drawerHasContent"
          v-model="openMenuIndex"
          v-model:drawer-open="drawerOpen"
          :items="navItems"
          :aria-label="t('header.primary')"
          :collapse-below="variant === 'minimal' ? 'always' : '@content'"
          :drawer-layout="drawerLayout"
          drawer-mode="inline"
          open-on-hover
          :link-as="MenuLink"
          :card-aspect="cardAspect"
          :messages="navMenuMessages"
          class="static contents"
          :classes="navMenuClasses"
        >
          <!-- Menu, and Close with an × while the menu is open under the bar. -->
          <template #toggle="{ open }">
            <EldraIcon :name="open ? 'x' : 'menu-2'" size="md" :class="TOOL_ICON_CLASSES" />
            <span class="whitespace-nowrap">{{ open ? t('header.close') : t('header.menu') }}</span>
          </template>
          <template #panelFooter="{ item, index }">
            <Link
              v-if="viewAllHref(index)"
              :href="viewAllHref(index)"
              :as="toLinkAs(viewAllHref(index))"
              variant="standalone"
              arrow
              data-eldra-mega-view-all
              :underline="false"
              :aria-label="t('header.viewAllOf', { label: item.label ?? '' })"
              class="text-primary text-[0.9375rem] font-semibold"
            >
              {{ t('header.viewAll') }}
            </Link>
          </template>
          <!-- The foot, on `surface`: Account, Saved items, the strip's own links (its phone line
               among them) and, under a rule, the currency as a labelled select. -->
          <template #drawerFooter="{ close }">
            <ul
              v-if="accountHref || variant !== 'minimal' || infoEndLinks.length > 0"
              data-eldra-header-drawer-links
              class="m-0 grid list-none gap-3 p-0"
            >
              <li v-if="accountHref">
                <Link
                  :href="accountHref"
                  :as="accountLinkAs"
                  variant="standalone"
                  :underline="false"
                  class="text-text font-medium"
                  :classes="{ label: 'inline-flex items-center gap-2' }"
                  @click="close"
                >
                  <EldraIcon name="user" size="md" />{{ t('header.account') }}
                </Link>
              </li>
              <li v-if="variant !== 'minimal'">
                <Link
                  :href="wishlistHref"
                  :as="EldraRouterLink"
                  variant="standalone"
                  :underline="false"
                  class="text-text font-medium"
                  :classes="{ label: 'inline-flex items-center gap-2' }"
                  @click="close"
                >
                  <EldraIcon name="heart" size="md" />{{ t('header.savedItems') }}
                </Link>
              </li>
              <li v-for="(item, index) in infoEndLinks" :key="`drawer-info-${index}`">
                <Link
                  :href="item.href"
                  :as="item.linkAs"
                  variant="standalone"
                  :underline="false"
                  class="text-text font-medium"
                  :classes="{ label: 'inline-flex items-center gap-2' }"
                  @click="close"
                >
                  <EldraIcon v-if="footerIcon(item)" :name="footerIcon(item)!" size="md" />{{
                    item.text
                  }}
                </Link>
              </li>
            </ul>
            <div
              v-if="hasCurrencies"
              data-eldra-header-drawer-currency
              :class="[
                'grid gap-1.5',
                accountHref || variant !== 'minimal' || infoEndLinks.length > 0
                  ? 'border-border border-t pt-3'
                  : '',
              ]"
            >
              <CurrencyPicker
                :locale="contentLocale"
                :currencies="currency.offered.value"
                :model-value="currency.active.value"
                :busy="currency.busy.value"
                :label="t('header.pricesIn')"
                show-label
                size="md"
                placement="above"
                class="w-full"
                :classes="{
                  label: 'text-text mb-0 inline-flex items-center gap-2 font-medium',
                  panel: PICKER_PANEL_LIFT,
                }"
                @update:model-value="currency.choose"
              >
                <template #label
                  ><EldraIcon name="world" size="md" class="text-primary" />{{
                    t('header.pricesIn')
                  }}</template
                >
                <template #value="{ label }">{{ label }}</template>
              </CurrencyPicker>
            </div>
            <Button
              v-if="hasCta"
              variant="primary"
              block
              :href="ctaHref"
              :as="ctaLinkAs"
              @click="close"
            >
              {{ ctaLabel }}
            </Button>
          </template>
        </NavMenu>
        <span
          v-else
          aria-hidden="true"
          data-eldra-header-spacer-tool
          :class="['col-start-1 row-start-1', toolSpacerClass]"
        />
        <EditorPlaceholder
          v-if="showLinksPlaceholder"
          inline
          :label="t('editor.addLink')"
          :class="`hidden @min-[68.8125rem]:flex ${linksPositionClass}`"
        />

        <div :class="['flex items-center', searchPositionClass]">
          <template v-if="showSearch">
            <!-- `field`: the "Search the shop" pill from 80rem, the labelled Search tool below.
                 `inline`: the live search bar, centered variant only, from 68.8125rem. `icon`: the
                 labelled tool at every width. All but the live bar open the search overlay. -->
            <Button
              v-if="searchStyle === 'field'"
              variant="ghost"
              size="md"
              aria-haspopup="dialog"
              class="bg-surface text-muted hover:border-border-strong hover:bg-surface @wide:inline-flex hidden w-60 justify-start gap-2.5 rounded-full border border-transparent px-3.5 font-normal"
              :classes="{ label: 'text-base' }"
              @click="openSearch"
            >
              <template #leadingIcon>
                <EldraIcon name="search" size="md" class="size-[1.125rem]" />
              </template>
              {{ t('header.searchField') }}
            </Button>
            <SearchBar
              v-else-if="searchStyle === 'inline'"
              v-model="searchQuery"
              size="md"
              pill
              :action="searchAction"
              :label="t('header.searchField')"
              :results="searchResults"
              :loading="searchLoading"
              class="hidden w-64 @min-[68.8125rem]:block"
            />
            <Button
              variant="ghost"
              size="sm"
              aria-haspopup="dialog"
              :class="[
                TOOL_CLASSES,
                searchStyle === 'field'
                  ? '@wide:hidden'
                  : searchStyle === 'inline'
                    ? '@min-[68.8125rem]:hidden'
                    : '',
              ]"
              @click="openSearch"
            >
              <template #leadingIcon>
                <EldraIcon name="search" size="md" :class="TOOL_ICON_CLASSES" />
              </template>
              {{ t('header.search') }}
            </Button>
          </template>
          <span v-else aria-hidden="true" data-eldra-header-spacer-tool :class="toolSpacerClass" />
        </div>

        <div data-eldra-header-actions :class="['flex items-center gap-0.5', actionsPositionClass]">
          <Button
            v-if="accountHref"
            variant="ghost"
            size="sm"
            :href="accountHref"
            :as="accountLinkAs"
            :class="[TOOL_CLASSES, '@max-[68.8125rem]:hidden']"
          >
            <template #leadingIcon>
              <EldraIcon name="user" size="md" :class="TOOL_ICON_CLASSES" />
            </template>
            {{ t('header.account') }}
          </Button>

          <!-- In every header but `minimal`, prerendered ones included: see `wishlist` in the
               script above. `EldraRouterLink` because `/wishlist` is this theme's own route — it
               should route, not reload the document. -->
          <span v-if="variant !== 'minimal'" class="relative inline-flex">
            <Button
              variant="ghost"
              size="sm"
              :aria-label="wishlistAccessibleName"
              :href="wishlistHref"
              :as="EldraRouterLink"
              :class="TOOL_CLASSES"
            >
              <template #leadingIcon>
                <EldraIcon name="heart" size="md" :class="TOOL_ICON_CLASSES" />
              </template>
              {{ t('header.saved') }}
            </Button>
            <!-- The bag's own two rules: no badge at zero, and `pointer-events-none`, because the
                 count is decorative (the button's accessible name carries it) and must not swallow
                 a click meant for the link. -->
            <Badge
              v-if="wishlistCount > 0"
              aria-hidden="true"
              tone="accent"
              pill
              :label="wishlistBadgeLabel"
              :class="COUNT_PILL_CLASSES"
            />
          </span>
          <!-- `minimal` has no Saved tool; this keeps its two sides the same width. -->
          <span
            v-else
            aria-hidden="true"
            data-eldra-header-spacer-tool
            :class="TOOL_WIDTH_CLASSES"
          />

          <span class="relative inline-flex">
            <Button
              variant="ghost"
              size="sm"
              :aria-label="cartAccessibleName"
              :href="cartHref"
              :as="toLinkAs(cartHref)"
              :aria-haspopup="cartPopupType"
              :class="TOOL_CLASSES"
              @click="onCartClick"
            >
              <template #leadingIcon>
                <EldraIcon name="shopping-bag" size="md" :class="TOOL_ICON_CLASSES" />
              </template>
              {{ t('header.cart') }}
            </Button>
            <Badge
              v-if="cartCount > 0"
              aria-hidden="true"
              tone="accent"
              pill
              :label="cartBadgeLabel"
              :class="COUNT_PILL_CLASSES"
            />
          </span>

          <CurrencyPicker
            :locale="contentLocale"
            :currencies="currency.offered.value"
            :model-value="currency.active.value"
            :busy="currency.busy.value"
            :classes="{ panel: PICKER_PANEL_LIFT }"
            :class="barPickerClass"
            @update:model-value="currency.choose"
          />
          <!-- The call to action sits 0.75rem after the cart where the links are inline: 0.125rem of
               that is the actions row's own gap, `ml-2.5` the rest. In the drawer below. -->
          <Button
            v-if="hasCta && variant !== 'minimal'"
            variant="primary"
            size="sm"
            :href="ctaHref"
            :as="ctaLinkAs"
            class="ml-2.5 hidden @min-[68.8125rem]:inline-flex"
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
       inner ones the info strip's and the bar grid's (the height itself). The info strip's box
       keeps its hairline outside the height, as the strip's own `border-b` sits outside its
       `min-h-9` container: one box with both would be a pixel short of the bar until measured. -->
  <div
    v-if="sticky"
    data-eldra-header-spacer
    aria-hidden="true"
    :class="barSpacerClasses"
    :style="barSpacerStyle"
  >
    <div v-if="hasInfo" class="border-b border-transparent"><div class="min-h-9" /></div>
    <div :class="BAR_HEIGHT_CLASS" />
  </div>
</template>
