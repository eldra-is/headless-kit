import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import NavMenu from './NavMenu.vue';
import type { NavMenuItem } from './types';

const SHOP: NavMenuItem[] = [
  {
    label: 'Shop',
    children: [
      {
        label: 'Sweaters',
        href: '#sweaters',
        group: 'Knitwear',
        description: 'Merino and lambswool',
      },
      { label: 'Cardigans', href: '#cardigans', group: 'Knitwear' },
      { label: 'Scarves', href: '#scarves', group: 'Knitwear', badge: 'New' },
      { label: 'Mugs', href: '#mugs', group: 'Ceramics' },
      { label: 'Bowls', href: '#bowls', group: 'Ceramics', description: 'Hand-thrown stoneware' },
      { label: 'Gift cards', href: '#gift-cards', group: 'More' },
    ],
  },
  {
    label: 'Journal',
    href: '#journal',
    children: [
      { label: 'Stories', href: '#stories' },
      { label: 'Makers', href: '#makers' },
      { label: 'Care guides', href: '#care' },
    ],
  },
  { label: 'Stockists', href: '#stockists' },
  { label: 'About', href: '#about' },
];

/** A resolved Studio link tree (`@eldrajs/theme-core`'s `resolveLink`), passed in unchanged. */
const STUDIO_TREE = [
  {
    href: null,
    label: 'Shop',
    newTab: false,
    group: null,
    children: [
      { href: '/sweaters', label: 'Sweaters', newTab: false, group: 'Knitwear', children: [] },
      { href: '/mugs', label: 'Mugs', newTab: false, group: 'Ceramics', children: [] },
      { href: null, label: null, newTab: false, group: 'Ceramics', children: [] },
    ],
  },
  { href: '/journal', label: 'Journal', newTab: false, group: null, children: [] },
  { href: 'https://instagram.com', label: 'Instagram', newTab: true, group: null, children: [] },
];

const meta = {
  title: 'Navigation/NavMenu',
  component: NavMenu,
  tags: ['autodocs'],
  args: { items: SHOP },
  argTypes: {
    items: { table: { disable: true } },
    linkAs: { table: { disable: true } },
    messages: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The site header navigation: top-level links, and buttons that open a panel of links.',
          'A disclosure pattern, not an ARIA menu: `Enter`/`Space` open, `Tab` walks through the',
          'panel, `Escape` closes it and returns focus to its button, and a click outside or focus',
          'leaving closes it. One panel is open at a time. The arrow keys move along the bar and',
          'through a panel (`↓` on a button opens it), `Home`/`End` reach the ends, nothing wraps.',
          '',
          '**Data**: `items`, one level of `children`. Children sharing a `group` form a column',
          'under that heading, and grouped children make a `mega` panel spanning the menu; plain',
          'children make a `dropdown` under their button. Entries take `description`, `badge`,',
          '`current` and `newTab`; an entry without `href` is text. A resolved Studio link tree',
          'fits as it is. `groups` gives a column heading its own page (`{ label, href }`), so the',
          'heading is a link in the bar and the drawer, with no slot.',
          '',
          "**Variants**: `ghost` (default) fills an entry on hover and while open, as `Button`'s",
          'ghost does; `muted` is muted text turning the text colour on hover, while open and on the',
          "current page, with no fill, as `Link`'s muted tone. The drawer looks the same in both.",
          '',
          '**Parts** (`data-part`, and the keys of `classes`): `root`, `nav`, `list`, `item`,',
          '`link`, `trigger`, `triggerIcon`, `panel`, `content`, `overview`, `columns`, `group`,',
          '`groupHeading`, `groupLink`, `panelList`, `panelItem`, `panelLink`, `panelLabel`, `description`,',
          '`badge`, `footer`, `toggle`, `toggleIcon`, `drawerRoot`, `drawer`, `drawerHeader`,',
          '`drawerClose`, `drawerBody`, `drawerList`, `drawerItem`, `drawerLink`, `drawerTrigger`,',
          '`drawerPanel`, `drawerSectionHeading`, `drawerFooter`, and in the drawer each panel part',
          'again with a `drawer` prefix (`drawerPanelLink`, `drawerGroupHeading`…), so the bar and the',
          'drawer are styled apart. **Slots**: `panelItem` and `groupHeading` (told their',
          '`placement`, `bar` or `drawer`), `panelFooter`, `triggerIcon`, `toggle`, `drawerHeader`,',
          '`drawerFooter`.',
          '',
          '**Narrow screens**: below `collapseBelow` (default `lg`; `@content` and the other `@`',
          'values measure the nearest container; `always` shows only the button) the bar becomes a',
          'menu button opening a `Drawer`. `drawerLayout` is `accordion` (default: each panel a row',
          'that opens, its links indented beneath) or `sections` (each panel listed open under a',
          'heading row, a link when the entry has a page, its links indented beneath); `drawerItems`',
          'gives the drawer entries of its own. **CSS variables**: `--eldra-nav-menu-offset`,',
          '`--eldra-nav-menu-dropdown-min`/`-max`, `--eldra-nav-menu-column-min`, and for the drawer',
          '`--eldra-nav-menu-drawer-row-height`, `--eldra-nav-menu-drawer-indent` and the',
          "`Drawer`'s own `--eldra-drawer-header-height` and `--eldra-drawer-gutter`.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof NavMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

const frame = (body: string) => `<div class="min-h-96 p-6">${body}</div>`;

/** Closed: two panel buttons and two links. */
export const Default: Story = {
  render: (args) => ({
    components: { NavMenu },
    setup: () => ({ args }),
    template: frame('<NavMenu v-bind="args" />'),
  }),
};

/** The grouped panel, open: columns with headings, descriptions and a badge. */
export const MegaOpen: Story = {
  args: { modelValue: 0 },
  render: Default.render,
};

/** The plain panel, open under its button, led by the item's own page. */
export const DropdownOpen: Story = {
  args: { modelValue: 1 },
  render: Default.render,
};

/** `variant="muted"`: header text links, muted until hovered, open or current. */
export const Muted: Story = {
  args: { variant: 'muted' },
  render: Default.render,
};

/** The muted variant with the grouped panel open: its links are quiet too, with no fill. */
export const MutedOpen: Story = {
  args: { variant: 'muted', modelValue: 0 },
  render: Default.render,
};

/** `openOnHover`: a resting mouse opens a panel and leaving the menu closes it again. */
export const OpenOnHover: Story = {
  args: { openOnHover: true },
  render: Default.render,
};

/** A resolved Studio link tree, unchanged: a heading with grouped children, a new-tab link. */
export const StudioLinkTree: Story = {
  args: { items: STUDIO_TREE, modelValue: 0 },
  render: Default.render,
};

/** The narrow-screen drawer, open: each panel an accordion row. */
export const DrawerOpen: Story = {
  args: { drawerOpen: true, collapseBelow: 'xl' },
  render: (args) => ({
    components: { NavMenu, Button },
    setup: () => ({ args }),
    template: frame(`
      <NavMenu v-bind="args">
        <template #drawerFooter="{ close }">
          <Button variant="primary" block @click="close">Visit the shop</Button>
        </template>
      </NavMenu>
    `),
  }),
};

/** `drawerLayout="sections"`: every panel listed open under its heading, group headings kept. */
export const DrawerSections: Story = {
  args: { drawerOpen: true, collapseBelow: 'xl', drawerLayout: 'sections' },
  render: DrawerOpen.render,
};

/** `groups`: column headings with a page of their own are links, in the bar and in the drawer. */
export const LinkedColumnHeadings: Story = {
  args: {
    modelValue: 0,
    items: [
      {
        ...SHOP[0]!,
        groups: [
          { label: 'Knitwear', href: '#knitwear' },
          { label: 'Ceramics', href: '#ceramics' },
        ],
      },
      ...SHOP.slice(1),
    ],
  },
  render: Default.render,
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the panel border and the focus ring stay.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  args: { modelValue: 0 },
  render: Default.render,
};
