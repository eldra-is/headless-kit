import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import page from '../../pages/wishlist.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = page as unknown as PageFixture;

/**
 * The seeded `/wishlist` page (`pages/wishlist.page.json`), rendered the way a real page renders
 * it. It replaces the `app/pages/wishlist.vue` code route; the `wishlist` block's node is seeded
 * `required`, so the page cannot lose the list the header's heart sends shoppers to.
 *
 * The grid is empty here for the same reason it is empty in the prerendered file: the saved list
 * lives in the visitor's own browser, and Storybook's has nothing in it.
 *
 * `renderPageFixtureRegions` (`stories/support/pageBlocks.ts`) is the same renderer
 * `test/support/mountPage.ts` and `app/pages/[...slug].vue` split a page with, so this story shows
 * exactly what the page-level spec (`test/pages/wishlist.spec.ts`) exercises.
 */
const WishlistPage = defineComponent({
  name: 'WishlistPageStory',
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
      ...renderPageFixtureRegions(fixture, 'Pages/Wishlist story'),
    ];
  },
});

const meta: Meta<typeof WishlistPage> = {
  title: 'Pages/Wishlist',
  component: WishlistPage,
};
export default meta;

type Story = StoryObj<typeof WishlistPage>;

export const Default: Story = {};
