import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Tab from './Tab.vue';
import TabPanel from './TabPanel.vue';
import Tabs from './Tabs.vue';
import type { TabsItem } from './types';

/**
 * One story per state of the design spec's Tabs section, named after the state it shows.
 * `eldra-starter-spec/images/core/tabs.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Navigation/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: { ariaLabel: 'Product information' },
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Switches between sibling panels of related content in place — product information, a',
          'featured-collection switcher — following the ARIA tabs pattern with automatic',
          'activation by default. Not for page navigation (use links) or required form steps;',
          'switch to an **Accordion** on narrow screens if labels get long, and use no more than',
          'five tabs.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `list`, `tab`,',
          '`indicator` and `panel`.',
          '',
          '**Two ways to build one.** `items` (`{ value, title, content? }`) renders the whole',
          'thing from data — the right shape for plain-text panels. For panel content richer than',
          'text, place `<Tab>`s in the `tabs` slot and `<TabPanel>`s in the default slot instead;',
          '`Tabs` renders `items` as exactly that `Tab`/`TabPanel` pair internally, so both APIs',
          'share one implementation and one `TABS_KEY` context (`src/components/tabs/context.ts`).',
          '',
          '**Roving tabindex.** Only the selected tab has `tabindex="0"`; the rest are `-1`, so',
          '`Tab` lands on the selected tab and the next `Tab` reaches the panel. `←`/`→` move',
          'between tabs, wrapping at the ends; `Home`/`End` jump to the first/last. Under the',
          'default `auto` activation, moving focus selects immediately; `activation="manual"`',
          'moves focus only, and `Enter`/`Space` — a real `<button>`’s own native activation —',
          'selects, which is when a slow-loading panel wants manual instead of automatic.',
          '',
          '**The indicator never slides.** Colour changes over `duration-fast`; with reduced',
          'motion, instantly. The underline variant’s bar and the pills variant’s fill are both',
          'drawn per-tab, never as one shared element animated between positions.',
          '',
          '**The panel focusability rule.** Every panel is `role="tabpanel"`, but only gets',
          '`tabindex="0"` when it holds nothing else to focus — a panel whose content already has',
          'a link or a button needs no second stop for the same thing.',
          '',
          '**The list scrolls, the page does not.** Past its container’s width the tab list',
          'scrolls horizontally with the scrollbar hidden (the new `eldra-scrollbar-hide`',
          'utility); it never wraps, and a focused tab scrolls into view.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own "Product information" tabs (spec "Tabs" → the section's own screenshot). */
const PRODUCT_INFO: TabsItem[] = [
  {
    value: 'description',
    title: 'Description',
    content:
      'A relaxed-fit crew neck sweater in heavyweight merino wool, hand-finished with ribbed cuffs and hem.',
  },
  {
    value: 'materials',
    title: 'Materials & care',
    content: '100% merino wool. Hand wash cold and dry flat; do not tumble dry.',
  },
  {
    value: 'shipping',
    title: 'Shipping & returns',
    content: 'Ships in 2–3 business days. Free returns within 30 days of delivery.',
  },
  {
    value: 'reviews',
    title: 'Reviews (48)',
    content: '4.8 out of 5, from 48 reviews. "Warm, and the fit is exactly true to size."',
  },
];

/** The spec's own collection switcher, above a product grid. */
const COLLECTIONS: TabsItem[] = [
  { value: 'knitwear', title: 'Knitwear', content: 'Merino crew sweaters, cardigans, beanies.' },
  { value: 'ceramics', title: 'Ceramics', content: 'Hand-thrown mugs, bowls and vases.' },
  { value: 'kitchen', title: 'Kitchen', content: 'Linen tea towels, boards and utensils.' },
];

/** The default variant: an underline bar under the selected tab, on the list's own hairline. */
export const Underline: Story = {
  render: () => ({
    components: { Tabs },
    setup: () => ({ items: PRODUCT_INFO, value: ref('description') }),
    template: `<Tabs v-model="value" aria-label="Product information" :items="items" class="max-w-xl" />`,
  }),
};

/** The pills variant: a filled, fully-rounded tab, for a collection switcher above a grid. */
export const Pills: Story = {
  render: () => ({
    components: { Tabs },
    setup: () => ({ items: COLLECTIONS, value: ref('knitwear') }),
    template: `<Tabs v-model="value" variant="pills" aria-label="Collections" :items="items" class="max-w-md" />`,
  }),
};

/**
 * Manual activation: arrow keys move focus without changing the panel; `Enter`/`Space` selects.
 * Reach for it only when a panel is slow to load — here, a description that "loads" a moment
 * after being selected, the spec's own reason to prefer `manual` over the `auto` default.
 */
export const Manual: Story = {
  render: () => ({
    components: { Tab, TabPanel, Tabs },
    setup: () => ({ value: ref('description') }),
    template: `
      <Tabs v-model="value" activation="manual" aria-label="Product information" class="max-w-xl">
        <template #tabs>
          <Tab value="description">Description</Tab>
          <Tab value="materials">Materials & care</Tab>
          <Tab value="shipping">Shipping & returns</Tab>
        </template>
        <TabPanel value="description">A relaxed-fit crew neck sweater in heavyweight merino wool.</TabPanel>
        <TabPanel value="materials">100% merino wool. Hand wash cold and dry flat.</TabPanel>
        <TabPanel value="shipping">Ships in 2–3 business days. Free returns within 30 days.</TabPanel>
      </Tabs>
    `,
  }),
};

/** More tabs than fit a typical column — the list scrolls horizontally rather than wrapping. */
export const ManyTabs: Story = {
  render: () => ({
    components: { Tabs },
    setup: () => {
      const items: TabsItem[] = Array.from({ length: 9 }, (_, index) => ({
        value: `section-${index}`,
        title: `Section ${index + 1}`,
        content: `The content of section ${index + 1}.`,
      }));
      return { items, value: ref('section-0') };
    },
    template: `<Tabs v-model="value" aria-label="Sections" :items="items" class="max-w-md" />`,
  }),
};

/** A panel with several paragraphs and a link — the panel's own `pt-6` and, since the content
 *  already holds a focusable link, no second `tabindex="0"` stop for the same thing. */
export const LongContent: Story = {
  render: () => ({
    components: { Tab, TabPanel, Tabs },
    setup: () => ({ value: ref('description') }),
    template: `
      <Tabs aria-label="Product information" v-model="value" class="max-w-xl">
        <template #tabs>
          <Tab value="description">Description</Tab>
          <Tab value="materials">Materials & care</Tab>
        </template>
        <TabPanel value="description">
          <p class="text-body text-text">
            A relaxed-fit crew neck sweater in heavyweight merino wool, hand-finished with ribbed
            cuffs and hem. Cut a little longer at the back, so it layers well under a coat without
            riding up.
          </p>
          <p class="text-body text-muted mt-3">
            Modelled in size M on a 182cm frame. See the
            <a class="text-text underline" href="#size-guide">size guide</a> for the full chart.
          </p>
        </TabPanel>
        <TabPanel value="materials">100% merino wool. Hand wash cold and dry flat.</TabPanel>
      </Tabs>
    `,
  }),
};

/** A 20rem container: the list scrolls inside itself without scrolling the page. */
export const Narrow: Story = {
  render: () => ({
    components: { Tabs },
    setup: () => ({ items: PRODUCT_INFO, value: ref('description') }),
    template: `
      <div class="border-border w-80 border p-4">
        <Tabs v-model="value" aria-label="Product information" :items="items" />
      </div>
    `,
  }),
};

/**
 * Reduced motion. Captured with Playwright's `reducedMotion: 'reduce'` emulation: the indicator
 * and hover colours change instantly, with no transition at all.
 */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  render: () => ({
    components: { Tabs },
    setup: () => ({ items: PRODUCT_INFO, value: ref('materials') }),
    template: `<Tabs v-model="value" aria-label="Product information" :items="items" class="max-w-xl" />`,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: the underline tab's inset ring and the
 * pill's own 1px outline both stay real borders, so selection reads without relying on fill alone.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Tabs },
    setup: () => ({
      productInfo: PRODUCT_INFO,
      collections: COLLECTIONS,
      underlineValue: ref('description'),
      pillsValue: ref('knitwear'),
    }),
    template: `
      <div class="flex flex-col gap-8">
        <Tabs v-model="underlineValue" aria-label="Product information" :items="productInfo" class="max-w-xl" />
        <Tabs v-model="pillsValue" variant="pills" aria-label="Collections" :items="collections" class="max-w-md" />
      </div>
    `,
  }),
};
