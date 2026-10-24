import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import NavMenu from './NavMenu.vue';
import type { NavMenuItem } from './types';

const ITEMS: NavMenuItem[] = [
  {
    label: 'Shop',
    href: '#shop',
    children: [
      { label: 'Sweaters', href: '#sweaters', group: 'Knitwear' },
      { label: 'Cardigans', href: '#cardigans', group: 'Knitwear' },
      { label: 'Scarves', href: '#scarves', group: 'Knitwear', badge: 'New' },
      { label: 'Mugs', href: '#mugs', group: 'Ceramics' },
      { label: 'Bowls', href: '#bowls', group: 'Ceramics' },
    ],
  },
  {
    label: 'Journal',
    children: [
      { label: 'Stories', href: '#stories' },
      { label: 'Makers', href: '#makers' },
      { label: 'Care guides', href: '#care' },
    ],
  },
  { label: 'Stockists', href: '#stockists' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

/** The same menu for phones: the shop's two category pages instead of every product type. */
const PHONE_ITEMS: NavMenuItem[] = [
  {
    label: 'Shop',
    href: '#shop',
    children: [
      { label: 'Knitwear', href: '#knitwear' },
      { label: 'Ceramics', href: '#ceramics' },
    ],
  },
  ...ITEMS.slice(1),
];

const meta = {
  title: 'Navigation/NavMenu/Phone menu',
  component: NavMenu,
  args: { items: ITEMS, drawerOpen: true, collapseBelow: 'always' },
  argTypes: { items: { table: { disable: true } }, drawerItems: { table: { disable: true } } },
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  parameters: {
    docs: {
      description: {
        component: [
          'The menu button and drawer `NavMenu` becomes on narrow screens. Two layouts:',
          '`accordion` (default), each panel a row that opens with its links indented beneath, and',
          '`sections`, every panel listed open under a heading row with its links indented beneath.',
          'Top-level links are rows of the same height and type as the panel rows, so every entry of',
          'the top level reads as one level. A panel whose entry has its own page links to it: the',
          'first row of an opened accordion panel, or the section heading itself.',
        ].join('\n'),
      },
    },
  },
  render: (args) => ({
    components: { NavMenu, Button },
    setup: () => ({ args }),
    template: `
      <header class="flex h-16 items-center gap-4 border-b border-border bg-background px-4">
        <a href="#top" class="me-auto text-h4 text-text">Northwind</a>
        <NavMenu v-bind="args">
          <template #drawerHeader="{ close }">
            <div class="flex items-center gap-3">
              <a href="#top" class="me-auto text-h4 text-text" @click="close">Northwind</a>
              <Button variant="primary" size="sm" href="#contact" @click="close">Contact us</Button>
            </div>
          </template>
        </NavMenu>
      </header>
    `,
  }),
} satisfies Meta<typeof NavMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `accordion`, the default: each panel a row that opens. */
export const Accordion: Story = {};

/** `sections`: every panel open under a heading row; «Shop» has a page, so its heading is the link. */
export const Sections: Story = { args: { drawerLayout: 'sections' } };

/** `drawerItems`: phones get a shorter menu, the category pages instead of every product type. */
export const FewerEntriesOnPhones: Story = {
  args: { drawerLayout: 'sections', drawerItems: PHONE_ITEMS },
};

/** Restyled through CSS variables alone: taller rows, a deeper indent, a wider gutter and header. */
export const RestyledThroughVariables: Story = {
  args: { drawerLayout: 'sections' },
  decorators: [
    () => ({
      template:
        '<div style="--eldra-nav-menu-drawer-row-height: 4rem; --eldra-nav-menu-drawer-indent: 1.5rem; --eldra-drawer-gutter: 1.25rem; --eldra-drawer-header-height: 4.5rem"><story /></div>',
    }),
  ],
};
