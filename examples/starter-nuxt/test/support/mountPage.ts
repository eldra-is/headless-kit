import { defineComponent, h, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { mountOptions } from './mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../server/utils/tablerIcon';
import { STOREFRONT_KEY, type StorefrontSource } from '../../app/storefront/types';
// The apiId → Block.vue map lives in `stories/support/pageBlocks.ts`, shared with
// `stories/pages/*.stories.ts` — see that file's own doc comment for why it
// is not declared here directly (keeping `test/**` out of the shipped
// Storybook build) and not under `app/utils/` (keeping blocks' own template
// type errors out of `nuxi typecheck`).
import { pageBlockComponents } from '../../stories/support/pageBlocks';

// One definition of the fixture shape, shared with the page stories (see `pageBlocks.ts`).
export type { PageFixture, PageFixtureBlock } from '../../stories/support/pageBlocks';
import type { PageFixture } from '../../stories/support/pageBlocks';

/**
 * `EldraIcon` (`app/components/EldraIcon.vue`) resolves a Tabler icon name through
 * `useEldraIcon`, which calls Nuxt's `useFetch` outside an injected `ICON_FETCHER_KEY` — see
 * `feature-grid`'s own block spec for the same pattern. A page fixture is not run inside a real
 * Nuxt app, so any registered block that renders an icon by name (the footer's social links, for
 * one) needs this same synchronous, network-free stub; wiring it in here once means a future
 * page fixture never has to remember it per block.
 */
const stubIconFetcher: IconFetcher = async (name) => tablerIconSvg(name);

/**
 * Renders a `pages/<name>.page.json`-shaped fixture as `EldraLayout` would
 * on a real page: each listed block, in order, as a sibling inside one
 * `<main id="main">` — the landmark the blocks spec's skip link ("Skip to
 * content") and page-level accessibility gate (`test/pages/*.spec.ts` in
 * Tasks 36–39) both target. Every block gets the same `EldraContext`/UI
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
      return () =>
        h(
          'main',
          { id: 'main' },
          fixture.blocks.map((block) => {
            const component = pageBlockComponents[block.apiId];
            if (component === undefined) {
              throw new Error(
                `mountPage: no Block.vue registered for apiId "${block.apiId}" — add an import ` +
                  'and a map entry to stories/support/pageBlocks.ts.'
              );
            }
            return h(component, {
              key: block.id,
              entry: { id: block.id, data: block.data },
            });
          })
        );
    },
  });

  const { global } = mountOptions({ entry: { id: '', data: {} } });
  global.provide[ICON_FETCHER_KEY] = stubIconFetcher;
  if (options.storefront !== undefined) {
    global.provide[STOREFRONT_KEY] = options.storefront;
  }
  const wrapper = mount(Page, { global, attachTo: options.attachTo });
  await nextTick();
  return wrapper;
}
