import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import page from '../../pages/search.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = page as unknown as PageFixture;

/**
 * The seeded `/search` page (`pages/search.page.json`), rendered the way a real page renders it.
 * It replaces the `app/pages/search.vue` code route; the `search` block's node is seeded
 * `required`, so the destination every `SearchBar` submit and every "See all" link names cannot be
 * deleted out from under them.
 *
 * The block is in its idle state — the heading, the field and the popular searches — because one
 * prerendered file answers every `?q=`, and the query is read out of the URL after hydration.
 *
 * `renderPageFixtureRegions` (`stories/support/pageBlocks.ts`) is the same renderer
 * `test/support/mountPage.ts` and `app/pages/[...slug].vue` split a page with, so this story shows
 * exactly what the page-level spec (`test/pages/search.spec.ts`) exercises.
 */
const SearchPage = defineComponent({
  name: 'SearchPageStory',
  setup() {
    const t = useT();
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
      ...renderPageFixtureRegions(fixture, 'Pages/Search story'),
    ];
  },
});

const meta: Meta<typeof SearchPage> = {
  title: 'Pages/Search',
  component: SearchPage,
};
export default meta;

type Story = StoryObj<typeof SearchPage>;

export const Default: Story = {};
