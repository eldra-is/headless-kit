import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import page from '../../pages/cart.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = page as unknown as PageFixture;

/**
 * The seeded `/cart` page (`pages/cart.page.json`), rendered the way a real page renders it —
 * announcement bar and header as the `banner`, breadcrumbs + the `page`-variant `cart` block + a
 * recently-viewed carousel inside `<main id="main">`, the footer as the `contentinfo`. It replaces
 * the `app/pages/cart.vue` code route, which had no header, no footer and nothing an author could
 * place beside the cart; the cart block's own node is seeded `required`, so it is the one thing on
 * this page that cannot be removed.
 *
 * The cart is empty here, as it is in the prerendered file and in Storybook: the lines belong to a
 * shopper's session, and the demo storefront has none.
 *
 * `renderPageFixtureRegions` (`stories/support/pageBlocks.ts`) is the same renderer
 * `test/support/mountPage.ts` and `app/pages/[...slug].vue` split a page with, so this story shows
 * exactly what the page-level spec (`test/pages/cart.spec.ts`) exercises.
 */
const CartPage = defineComponent({
  name: 'CartPageStory',
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
      ...renderPageFixtureRegions(fixture, 'Pages/Cart story'),
    ];
  },
});

const meta: Meta<typeof CartPage> = {
  title: 'Pages/Cart',
  component: CartPage,
};
export default meta;

type Story = StoryObj<typeof CartPage>;

export const Default: Story = {};
