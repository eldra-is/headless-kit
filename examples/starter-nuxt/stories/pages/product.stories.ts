// The product sample page (`pages/product.page.json`), rendered exactly the way `app/app.vue` +
// `app/pages/[...slug].vue` render a real page: the skip link first (`app/app.vue`'s own markup,
// copied here — that file is Nuxt-only and cannot be mounted in Storybook), then every fixture
// block, in order, as a sibling inside one `<main id="main">`. `stories/support/pageBlocks.ts`
// carries the static apiId → Block.vue map (mirroring `test/support/mountPage.ts`, which pulls in
// `@vue/test-utils` and so is not something a Storybook bundle should import).
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import productPage from '../../pages/product.page.json';
import { pageBlockComponents, type PageFixture } from '../support/pageBlocks';

const fixture = productPage as unknown as PageFixture;

const SKIP_LINK_CLASSES = {
  root: 'bg-primary text-primary-contrast rounded-md sr-only px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50',
};

const ProductPage = defineComponent({
  name: 'ProductPageStory',
  setup() {
    const t = useT();
    return () => [
      h(
        Link,
        { href: '#main', as: EldraRouterLink, variant: 'standalone', classes: SKIP_LINK_CLASSES },
        { default: () => t('nav.skipToContent') }
      ),
      h(
        'main',
        { id: 'main' },
        fixture.blocks.map((block) => {
          const component = pageBlockComponents[block.apiId];
          if (component === undefined) {
            throw new Error(
              `Pages/Product story: no Block.vue registered for apiId "${block.apiId}" — add an ` +
                'import and a map entry to stories/support/pageBlocks.ts.'
            );
          }
          return h(component, { key: block.id, entry: { id: block.id, data: block.data } });
        })
      ),
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
