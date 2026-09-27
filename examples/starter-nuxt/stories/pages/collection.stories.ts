import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import fixture from '../../pages/collection.page.json';
import { pageBlockComponents, type PageFixture } from '../support/pageBlocks';

const page = fixture as unknown as PageFixture;

/**
 * Renders the collection sample page fixture (`pages/collection.page.json`) the same way a real
 * route would: the skip link from `app/app.vue` (copied here — stories cannot mount `app.vue`,
 * which is Nuxt-only) followed by every fixture block, in order, as a sibling inside
 * `<main id="main">`. The blocks read the same `EldraContext`/messages/locale/currency/icon
 * fetcher/demo storefront every other story gets from `.storybook/preview.ts`'s global
 * `withEldraContext` decorator (`.storybook/eldra.ts`).
 */
const CollectionPage = defineComponent({
  name: 'CollectionPageStory',
  setup() {
    const t = useT();
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
        h(
          'main',
          { id: 'main' },
          page.blocks.map((block) => {
            const component = pageBlockComponents[block.apiId];
            if (component === undefined) {
              throw new Error(
                `Pages/Collection story: no Block.vue registered for apiId "${block.apiId}" — add ` +
                  'an import and a map entry to stories/support/pageBlocks.ts.'
              );
            }
            return h(component, { key: block.id, entry: { id: block.id, data: block.data } });
          })
        ),
      ]);
  },
});

const meta: Meta<typeof CollectionPage> = {
  title: 'Pages/Collection',
  component: CollectionPage,
};
export default meta;

type Story = StoryObj<typeof CollectionPage>;

export const Default: Story = {};
