import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { defineComponent, h } from 'vue';
import { Link } from '@eldrajs/ui';
import EldraRouterLink from '../../app/components/EldraRouterLink.vue';
import { useI18n } from 'vue-i18n';
import homePage from '../../pages/home.page.json';
import { renderPageFixtureRegions, type PageFixture } from '../support/pageBlocks';

const fixture = homePage as unknown as PageFixture;

/**
 * Renders the `pages/home.page.json` fixture the same way a real page does: the skip link
 * (`app/app.vue`'s own markup, copied here — `app.vue` itself is Nuxt-only and cannot be mounted
 * under Storybook's plain Vite build) followed by the fixture's three landmark regions —
 * `announcement-bar` + `navigation` (the `banner`), then every remaining block inside
 * `<main id="main">`, then the `footer` (the `contentinfo`). `renderPageFixtureRegions`
 * (`stories/support/pageBlocks.ts`) is the same renderer `test/support/mountPage.ts` and
 * `app/pages/[...slug].vue` split a page with, so this story shows exactly what the page-level
 * spec (`test/pages/home.spec.ts`) exercises.
 */
const HomePage = defineComponent({
  name: 'HomePageStory',
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
      ...renderPageFixtureRegions(fixture, 'Pages/Home story'),
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
