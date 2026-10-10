import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { expect } from 'vitest';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import { mountOptions } from './mountBlock';
import { STOREFRONT_KEY, type StorefrontSource } from '../../app/storefront/types';
// The apiId → Block.vue map lives in `stories/support/pageBlocks.ts`, shared with
// `stories/pages/*.stories.ts` — see that file's own doc comment for why it
// is not declared here directly (keeping `test/**` out of the shipped
// Storybook build) and not under `app/utils/` (keeping blocks' own template
// type errors out of `nuxi typecheck`).
import { renderPageFixtureRegions } from '../../stories/support/pageBlocks';

// One definition of the fixture shape, shared with the page stories (see `pageBlocks.ts`).
export type { PageFixture, PageFixtureBlock } from '../../stories/support/pageBlocks';
import type { PageFixture } from '../../stories/support/pageBlocks';

/**
 * Renders a `pages/<name>.page.json`-shaped fixture exactly as
 * `app/pages/[...slug].vue` renders a real page: the leading structure
 * blocks (`announcement-bar`, `navigation`) first, then every remaining
 * block in order inside one `<main id="main">`, then a trailing `footer` —
 * three sibling landmark regions (`banner` / `main` / `contentinfo`), which
 * is what makes `app/app.vue`'s "Skip to content" link actually skip the
 * navigation. The partition rule lives in `app/utils/pageStructure.ts` and
 * the rendering half in `stories/support/pageBlocks.ts`
 * (`renderPageFixtureRegions`), both shared with the route and the page
 * stories, so a page spec can never drift from the page's real shape.
 * Every block gets the same `EldraContext`/UI
 * messages/locale/currency a real page and `mountBlock.ts`'s `mountOptions`
 * already provide, so a page-level spec sees exactly what a single-block
 * spec does, just with several blocks rendered together.
 *
 * `options.attachTo` forwards to `mount()` — needed by any spec that asserts real focus movement
 * (`document.activeElement`), which jsdom only tracks for elements connected to `document`.
 *
 * `options.storefront`, when given, replaces the default `createDemoStorefront()` a block reads
 * through `useStorefront()` — for a page-level spec that needs a route/query seed
 * `mountOptions()`'s own default does not carry (e.g. `collectionHandle`/`productHandle`/`query`
 * seeded through `createDemoStorefront()`'s own options, or a hand-built stub). It only reaches a
 * block through `storefront.route`/`storefront.catalog`, etc.: a shopper-selected filter is the
 * block's own state, so a spec that needs an applied filter drives the real control instead.
 */
export async function mountPage(
  fixture: PageFixture,
  options: { attachTo?: Element; storefront?: StorefrontSource } = {}
): Promise<VueWrapper> {
  const Page = defineComponent({
    name: 'MountPageHarness',
    setup() {
      return () => renderPageFixtureRegions(fixture, 'mountPage');
    },
  });

  const { global } = mountOptions({ entry: { id: '', data: {} } });
  if (options.storefront !== undefined) {
    global.provide[STOREFRONT_KEY] = options.storefront;
  }
  const wrapper = mount(Page, { global, attachTo: options.attachTo });
  await nextTick();
  return wrapper;
}

/**
 * `app/app.vue`'s skip link, rendered ahead of the same three page regions `mountPage` renders.
 *
 * The skip link itself lives outside `pages/[...slug].vue` (it must reach the not-found and error
 * shells too), so `mountPage` alone never renders it. Every page spec needs it for one assertion —
 * that "Skip to content" is the first thing a visitor tabs to and that following it lands them
 * *past* the header — which is only meaningful now the header is a sibling of `<main>` rather than
 * its first child. The markup is copied verbatim from `app/app.vue` (that file is Nuxt-only:
 * `<NuxtPage />`), exactly as `stories/pages/*.stories.ts` copy it, for the same reason.
 *
 * Always attached to `document.body`: the assertions this exists for are about focus and document
 * order.
 */
export async function mountPageWithSkipLink(
  fixture: PageFixture,
  options: { storefront?: StorefrontSource } = {}
): Promise<VueWrapper> {
  const Page = defineComponent({
    name: 'MountPageWithSkipLinkHarness',
    setup() {
      const { t } = useI18n();
      return () => [
        h(
          Link,
          {
            href: '#main',
            as: EldraRouterLink,
            variant: 'standalone',
            classes: {
              root: 'bg-primary text-primary-contrast rounded-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
            },
          },
          () => t('nav.skipToContent')
        ),
        ...renderPageFixtureRegions(fixture, 'mountPageWithSkipLink'),
      ];
    },
  });

  const { global } = mountOptions({ entry: { id: '', data: {} } });
  if (options.storefront !== undefined) {
    global.provide[STOREFRONT_KEY] = options.storefront;
  }
  const wrapper = mount(Page, { global, attachTo: document.body });
  await nextTick();
  return wrapper;
}

/**
 * The same fixture with one link authored onto its header.
 *
 * The seeded header carries no links and no call to action — a theme cannot know an organisation's
 * own destinations, so it ships none (`pages/*.page.json`). With nothing to
 * put in the drawer the header draws no Menu button and no drawer at all
 * (`blocks/navigation/Block.vue`), so a page spec about the *mobile menu* has to author a header
 * first: the drawer is the mobile route to a header a merchant has filled in, and that is the state
 * worth asserting about. Everything else about the page is untouched.
 */
export function withAuthoredHeaderLink(fixture: PageFixture): PageFixture {
  return {
    ...fixture,
    blocks: fixture.blocks.map((block) =>
      block.apiId === 'navigation'
        ? {
            ...block,
            data: {
              ...block.data,
              links: [{ kind: 'url', url: '/journal', label: 'Journal' }],
            },
          }
        : block
    ),
  };
}

/**
 * Every block's own root element, in document order, flattened back across the three regions:
 * the header blocks, then `<main id="main">`'s children, then the footer block.
 *
 * A page spec's "block N sits on ground X / renders heading Y" assertions are written against the
 * fixture's own block order, which is exactly this list — `fixture.blocks[i]` renders
 * `pageBlockRoots(wrapper)[i]`. Reading it off `main.children` (which is what these specs did
 * while the route rendered everything inside `<main>`) would now silently drop the header and
 * footer.
 *
 * A block may render more than one element: the header renders its bar plus the box that holds the
 * flow the fixed bar is not in (`data-eldra-header-spacer`). Layout, not a block root — and here,
 * where the fixture mounts block components directly rather than inside the block zone's own
 * wrapper, it would otherwise shift every index after the header by one.
 */
export function pageBlockRoots(wrapper: VueWrapper): Element[] {
  const isBlockRoot = (element: Element): boolean =>
    !element.hasAttribute('data-eldra-header-spacer');
  const roots: Element[] = [];
  for (const child of wrapper.element.children) {
    if (child.tagName === 'MAIN') roots.push(...[...child.children].filter(isBlockRoot));
    // `A` is `mountPageWithSkipLink`'s own link, not a block.
    else if (child.tagName !== 'A' && isBlockRoot(child)) roots.push(child);
  }
  return roots;
}

/**
 * The three landmarks a scaffolded page must expose: exactly one `banner`, one `main` and one
 * `contentinfo`, in that document order.
 *
 * `<header>` and `<footer>` only carry the `banner`/`contentinfo` role while they are *not*
 * descendants of a sectioning element (HTML-AAM), so "there is a `<header>` element" is not the
 * assertion — "it is a sibling of `<main>`, not inside it" is. Shared by all four page specs
 * because it is the same invariant for every page, and it is the one the route template's
 * partition (`app/utils/pageStructure.ts`) exists to hold.
 */
export function expectPageLandmarks(wrapper: VueWrapper): void {
  const root = wrapper.element;

  const mains = root.querySelectorAll('main');
  expect(mains).toHaveLength(1);
  const main = mains[0]!;
  expect(main.id).toBe('main');

  const banners = [...root.querySelectorAll('header')].filter(
    (el) => el.closest('main, article, aside, nav, section') === null
  );
  expect(
    banners,
    'exactly one top-level <header> (the `banner` landmark) — a <header> inside <main> carries no ' +
      'landmark role at all, which is what `app/utils/pageStructure.ts` exists to prevent'
  ).toHaveLength(1);

  const contentinfos = [...root.querySelectorAll('footer')].filter(
    (el) => el.closest('main, article, aside, nav, section') === null
  );
  expect(contentinfos, 'exactly one top-level <footer> (the `contentinfo` landmark)').toHaveLength(
    1
  );

  // Document order: banner → main → contentinfo.
  expect(banners[0]!.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    main.compareDocumentPosition(contentinfos[0]!) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();

  // Neither is inside `<main>` — the exact regression this guards.
  expect(main.contains(banners[0]!)).toBe(false);
  expect(main.contains(contentinfos[0]!)).toBe(false);
}

/**
 * The skip link's contract: it is the first focusable element on the page, and following it lands
 * the visitor *after* the header — i.e. every focusable element inside the `banner` precedes
 * `#main` in document order, so "Skip to content" really does skip the navigation.
 *
 * Takes a wrapper from `mountPageWithSkipLink`.
 */
export function expectSkipLinkLandsAfterTheHeader(wrapper: VueWrapper): void {
  const root = wrapper.element;
  const focusable = [...root.querySelectorAll(FOCUSABLE_SELECTOR)];
  expect(focusable.length).toBeGreaterThan(1);

  const skipLink = focusable[0]!;
  expect(skipLink.textContent).toBe('Skip to content');
  expect(skipLink.getAttribute('href')).toBe('#main');

  const main = root.querySelector('main#main')!;
  const banner = [...root.querySelectorAll('header')].find(
    (el) => el.closest('main, article, aside, nav, section') === null
  )!;
  expect(banner).toBeDefined();
  expect(main.contains(banner)).toBe(false);

  const headerFocusable = [...banner.querySelectorAll(FOCUSABLE_SELECTOR)];
  expect(headerFocusable.length).toBeGreaterThan(0);
  for (const el of headerFocusable) {
    expect(
      el.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the skip link target must follow every focusable element in the header, or "Skip to ' +
        'content" lands the visitor before the navigation it exists to skip'
    ).toBeTruthy();
  }
}

/**
 * A focusable element by the same rule the package's own components rely on: no positive
 * `tabindex` appears anywhere in this starter (`global-constraints.md` "Focus"), so DOM order
 * among these is tab order.
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
