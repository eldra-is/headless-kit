import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useT } from '../../app/composables/useT';
import { pageBlockComponents } from '../support/pageBlocks';
import fixture from '../../pages/home.page.json';

interface HomePageFixtureBlock {
  apiId: string;
  id: string;
  data: Record<string, unknown>;
}

const blocks = fixture.blocks as HomePageFixtureBlock[];

/**
 * Renders the `pages/home.page.json` fixture the same way a real page does: the skip link
 * (`app/app.vue`'s own markup, copied here — `app.vue` itself is Nuxt-only and cannot be mounted
 * under Storybook's plain Vite build) followed by every listed block, in order, inside one
 * `<main id="main">`. `pageBlockComponents` (`stories/support/pageBlocks.ts`) is the same static apiId →
 * `Block.vue` map `test/support/mountPage.ts` renders a page fixture through, so this story shows
 * exactly what the page-level spec (`test/pages/home.spec.ts`) exercises.
 */
const HomePage = defineComponent({
  name: 'HomePageStory',
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
      h(
        'main',
        { id: 'main' },
        blocks.map((block) => {
          const component = pageBlockComponents[block.apiId];
          if (component === undefined) {
            throw new Error(
              `Pages/Home story: no Block.vue registered for apiId "${block.apiId}" — add an ` +
                'import and a map entry to stories/support/pageBlocks.ts.'
            );
          }
          return h(component, {
            key: block.id,
            entry: { id: block.id, data: block.data },
          });
        })
      ),
    ];
  },
});

const meta: Meta<typeof HomePage> = {
  title: 'Pages/Home',
  component: HomePage,
};
export default meta;

type Story = StoryObj<typeof HomePage>;

export const Default: Story = {};
