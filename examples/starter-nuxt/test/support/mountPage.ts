import { defineComponent, h, nextTick, type Component } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { mountOptions } from './mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../server/utils/tablerIcon';

// A static map, not `import.meta.glob`/dynamic `import()`: a sample-page
// fixture's blocks must be available synchronously at `mount()` time (no
// `await` between resolving each apiId and rendering it), and
// `test/deps.spec.ts` scans this file's import specifiers statically — see
// task-2-brief.md step 6. `test/mocks/blocks.ts` (the `virtual:eldra/blocks`
// mock `EldraBlockZone` consumes) globs lazily on purpose, mirroring a real
// site's code-split block loading; this map exists for a different job —
// rendering a fixed, known page fixture — so it stays a plain object a
// later page task extends by adding one import + one entry per block it
// introduces (`test/support/mountPage.ts` is a Task 2 + 36–39 shared file,
// see the design doc's file-structure table).
import Article from '../../blocks/article/Block.vue';
import Cta from '../../blocks/cta/Block.vue';
import Faq from '../../blocks/faq/Block.vue';
import FeatureGrid from '../../blocks/feature-grid/Block.vue';
import Footer from '../../blocks/footer/Block.vue';
import Gallery from '../../blocks/gallery/Block.vue';
import Hero from '../../blocks/hero/Block.vue';
import ImageBlock from '../../blocks/image/Block.vue';
import Navigation from '../../blocks/navigation/Block.vue';
import Testimonials from '../../blocks/testimonials/Block.vue';

const blockComponents: Record<string, Component> = {
  article: Article,
  cta: Cta,
  faq: Faq,
  'feature-grid': FeatureGrid,
  footer: Footer,
  gallery: Gallery,
  hero: Hero,
  image: ImageBlock,
  navigation: Navigation,
  testimonials: Testimonials,
};

export interface PageFixtureBlock {
  apiId: string;
  id: string;
  data: Record<string, unknown>;
}

export interface PageFixture {
  blocks: PageFixtureBlock[];
}

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
 */
export async function mountPage(fixture: PageFixture): Promise<VueWrapper> {
  const Page = defineComponent({
    name: 'MountPageHarness',
    setup() {
      return () =>
        h(
          'main',
          { id: 'main' },
          fixture.blocks.map((block) => {
            const component = blockComponents[block.apiId];
            if (component === undefined) {
              throw new Error(
                `mountPage: no Block.vue registered for apiId "${block.apiId}" — add an import ` +
                  'and a map entry to test/support/mountPage.ts.'
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
  const wrapper = mount(Page, { global });
  await nextTick();
  return wrapper;
}
