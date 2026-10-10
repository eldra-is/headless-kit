// The product sample page (`pages/product.page.json`), rendered exactly the way `app/app.vue` +
// `app/pages/[...slug].vue` render a real page: the skip link first (`app/app.vue`'s own markup,
// copied here — that file is Nuxt-only and cannot be mounted in Storybook), then every fixture
// block split into the same three landmark regions the route renders — the leading structure
// blocks (`announcement-bar`/`navigation`) as the `banner`, everything else inside
// `<main id="main">`, the trailing `footer` as the `contentinfo`.
// `stories/support/pageBlocks.ts` carries both the static apiId → Block.vue map and that split
// (mirroring `test/support/mountPage.ts`, which pulls in `@vue/test-utils` and so is not
// something a Storybook bundle should import).
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import productPage from '../../pages/product.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = productPage as unknown as PageFixture;

const SKIP_LINK_CLASSES = {
  root: 'bg-primary text-primary-contrast rounded-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
};

const ProductPage = defineComponent({
  name: 'ProductPageStory',
  setup() {
    const { t } = useI18n();
    return () => [
      h(
        Link,
        { href: '#main', as: EldraRouterLink, variant: 'standalone', classes: SKIP_LINK_CLASSES },
        { default: () => t('nav.skipToContent') }
      ),
      ...renderPageFixtureRegions(fixture, 'Pages/Product story'),
    ];
  },
});

const meta: Meta<typeof ProductPage> = {
  title: 'Pages/Product',
  component: ProductPage,
};
export default meta;

type Story = StoryObj<typeof ProductPage>;

export const Default: Story = {};
