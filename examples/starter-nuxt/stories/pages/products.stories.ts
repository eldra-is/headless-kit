import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import page from '../../pages/products.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = page as unknown as PageFixture;

/**
 * The seeded `/products` page (`pages/products.page.json`) — the store's whole catalogue, filtered and
 * paged by the same `collection-grid` a collection page uses, with its `scope` field set to
 * `catalogue` instead of naming a collection. It is the destination every category crumb points at
 * (`/products?category=<slug>`), and the one grid in the theme where the Collection filter group
 * really filters: a collection's own product list has no `collectionId` parameter, the catalogue-wide
 * list does.
 *
 * The grid's node is seeded `required` — a catalogue page without the catalogue is not a page a
 * merchant should be able to empty by accident — and the page's `h1` comes from the
 * `collection-header` above it, because the grid's own heading is a visually hidden `h2` naming the
 * list of cards.
 *
 * `renderPageFixtureRegions` (`stories/support/pageBlocks.ts`) is the same renderer
 * `test/support/mountPage.ts` and `app/pages/[...slug].vue` split a page with, so this story shows
 * exactly what the page-level spec (`test/pages/seededPages.spec.ts`) exercises.
 */
const ProductsPage = defineComponent({
  name: 'ProductsPageStory',
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
      ...renderPageFixtureRegions(fixture, 'Pages/Products story'),
    ];
  },
});

const meta: Meta<typeof ProductsPage> = {
  title: 'Pages/Products',
  component: ProductsPage,
};
export default meta;

type Story = StoryObj<typeof ProductsPage>;

export const Default: Story = {};
