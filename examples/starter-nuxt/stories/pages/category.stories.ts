import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import fixture from '../../pages/category.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const page = fixture as unknown as PageFixture;

/**
 * Renders the category sample page fixture (`pages/category.page.json`) the same way a real
 * route would: the skip link from `app/app.vue` (copied here — stories cannot mount `app.vue`,
 * which is Nuxt-only) followed by the fixture's three landmark regions — the leading structure
 * blocks (`announcement-bar`/`navigation`) as the `banner`, every remaining block inside
 * `<main id="main">`, and the trailing `footer` as the `contentinfo`. The blocks read the same `EldraContext`/messages/locale/currency/icon
 * fetcher/demo storefront every other story gets from `.storybook/preview.ts`'s global
 * `withEldraContext` decorator (`.storybook/eldra.ts`).
 *
 * The one thing this story needs that the others do not: a demo route that **is** a category page.
 * `withEldraContext` seeds `categoryPath` for this title alone (`home/ceramics`, the demo tree's own
 * nested branch), which is what fills in the trail's ancestor crumbs, the strip of sibling
 * categories under the title and the grid's own subtree scope.
 */
const CategoryPage = defineComponent({
  name: 'CategoryPageStory',
  setup() {
    const { t } = useI18n();
    return () =>
      h('div', [
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
          { default: () => t('nav.skipToContent') }
        ),
        ...renderPageFixtureRegions(page, 'Pages/Category story'),
      ]);
  },
});

const meta: Meta<typeof CategoryPage> = {
  title: 'Pages/Category',
  component: CategoryPage,
};
export default meta;

type Story = StoryObj<typeof CategoryPage>;

export const Default: Story = {};
