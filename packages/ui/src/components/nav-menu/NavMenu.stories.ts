import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { isIS } from '../../messages/is-IS';
import Button from '../button/Button.vue';
import Link from '../link/Link.vue';
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
          'leaving closes it. One panel is open at a time.',
          '',
          '**Data**: `items`, one level of `children`. Children sharing a `group` form a column',
          'under that heading, and grouped children make a `mega` panel spanning the menu; plain',
          'children make a `dropdown` under their button. Entries take `description`, `badge`,',
          '`current` and `newTab`; an entry without `href` is text. A resolved Studio link tree',
          'fits as it is.',
          '',
          "**Variants**: `ghost` (default) fills an entry on hover and while open, as `Button`'s",
          'ghost does; `muted` is muted text turning the text colour on hover, while open and on the',
          "current page, with no fill, as `Link`'s muted tone. The drawer looks the same in both.",
          '',
          '**Parts** (`data-part`, and the keys of `classes`): `root`, `nav`, `list`, `item`,',
          '`link`, `trigger`, `triggerIcon`, `panel`, `content`, `overview`, `columns`, `group`,',
          '`groupHeading`, `panelList`, `panelItem`, `panelLink`, `panelLabel`, `description`,',
          '`badge`, `footer`, `toggle`, `toggleIcon`, `drawer`, `drawerList`, `drawerItem`,',
          '`drawerLink`, `drawerTrigger`, `drawerPanel`, `drawerFooter`. **Slots**: `panelItem`,',
          '`groupHeading`, `panelFooter`, `toggle`, `drawerFooter`.',
          '',
          '**Narrow screens**: below `collapseBelow` (default `lg`) the bar becomes a menu button',
          'opening a `Drawer`, panels becoming accordion rows. **CSS variables**:',
          '`--eldra-nav-menu-offset`, `--eldra-nav-menu-dropdown-min`/`-max`,',
          '`--eldra-nav-menu-column-min`.',
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

/** The narrow-screen drawer, open. */
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

const SOON = 'Á leiðinni';

/** The eldra.is header: «Kerfið» and «Lausnir» panels, plain links, a call to action. */
const ELDRA_IS: NavMenuItem[] = [
  {
    label: 'Kerfið',
    children: [
      { label: 'Heimasíða og vefumsjón', href: '#heimasida', group: 'Fólk finnur þig' },
      { label: 'Tölvupóstur og markaðsmál', href: '#markadsmal', group: 'Fólk finnur þig' },
      { label: 'Kassakerfi', href: '#kassakerfi', group: 'Salan' },
      { label: 'Vefverslun', href: '#vefverslun', group: 'Salan' },
      { label: 'Bókanir', href: '#bokanir', group: 'Salan' },
      { label: 'Sölupantanir og sölureikningar', href: '#solupantanir', group: 'Salan' },
      { label: 'Birgðir', href: '#birgdir', group: 'Vörurnar' },
      { label: 'Sendingar', href: '#sendingar', group: 'Vörurnar' },
      { label: 'Innkaup', href: '#innkaup', group: 'Vörurnar', badge: SOON },
      { label: 'Viðskiptavinir', href: '#vidskiptavinir', group: 'Viðskiptavinirnir' },
      { label: 'Póstlistar', href: '#postlistar', group: 'Viðskiptavinirnir' },
      { label: 'Fréttabréf', href: '#frettabref', group: 'Viðskiptavinirnir', badge: SOON },
      { label: 'Reikningar', href: '#reikningar', group: 'Peningarnir' },
      { label: 'Skýrslur', href: '#skyrslur', group: 'Peningarnir' },
      { label: 'Bókhaldstenging', href: '#bokhald', group: 'Peningarnir' },
      { label: 'Bókhald Eldra', href: '#bokhald-eldra', group: 'Peningarnir', badge: SOON },
    ],
  },
  {
    label: 'Lausnir',
    children: [
      {
        label: 'Bara vefur',
        href: '#bara-vefur',
        description: 'Heimasíða með vefumsjón, án alls hins.',
      },
      {
        label: 'Fyrir verslanir',
        href: '#verslanir',
        description: 'Búðin og vefverslunin með sama lager.',
      },
      {
        label: 'Fyrir heildsölu',
        href: '#heildsala',
        description: 'Sölupantanir, sölureikningar og viðskiptavinir.',
      },
      {
        label: 'Fyrir bókanir',
        href: '#bokanir-lausn',
        description: 'Námskeið, tímar og ferðir, bókuð og greidd á vefnum.',
      },
    ],
  },
  { label: 'Búnaður', href: '#bunadur' },
  { label: 'Sagan', href: '#sagan' },
];

const AREA_PAGES: Record<string, string> = {
  'Fólk finnur þig': '#folk-finnur-thig',
  Salan: '#salan',
  Vörurnar: '#vorurnar',
  Viðskiptavinirnir: '#vidskiptavinirnir',
  Peningarnir: '#peningarnir',
};

/**
 * The reference header: the `muted` variant, a static root so the «Kerfið» panel spans the header,
 * five columns, a rule under each column heading, linked headings through the `groupHeading` slot
 * and a panel foot through `panelFooter`.
 */
export const EldraIsHeader: Story = {
  args: {
    items: ELDRA_IS,
    variant: 'muted',
    messages: isIS,
    openOnHover: true,
    modelValue: 0,
    classes: {
      root: 'static flex-1 justify-end',
      columns: 'grid-cols-5',
      content: 'rounded-xl',
      groupHeading: 'mb-2 border-b border-border pb-2 text-body text-text',
    },
  },
  render: (args) => ({
    components: { NavMenu, Button, Link },
    setup: () => ({ args, AREA_PAGES }),
    template: `
      <div class="min-h-144 bg-surface">
        <header class="relative flex h-16 items-center gap-6 bg-background px-6 shadow-sm">
          <a href="#top" class="text-h4 text-text">Eldra</a>
          <NavMenu v-bind="args">
            <template #groupHeading="{ group }">
              <a :href="AREA_PAGES[group]" class="font-semibold hover:text-primary">{{ group }}</a>
            </template>
            <template #panelFooter="{ index }">
              <template v-if="index === 0">
                <Link href="#skipta" variant="standalone" arrow>Sjáðu allt kerfið í húsinu</Link>
                <Link href="#forritarar" tone="muted" :underline="false">Fyrir forritara · SDK, MCP og webhooks</Link>
              </template>
            </template>
            <template #drawerFooter="{ close }">
              <Button variant="primary" block href="#samband" @click="close">Heyrðu í okkur</Button>
            </template>
          </NavMenu>
          <Button variant="primary" size="sm" href="#samband" class="max-lg:hidden">Heyrðu í okkur</Button>
        </header>
      </div>
    `,
  }),
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
