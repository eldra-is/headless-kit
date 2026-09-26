import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { IconLock, IconTruck } from '@tabler/icons-vue';
import { ref } from 'vue';
import Button from '../button/Button.vue';
import CheckboxGroup from '../checkbox/CheckboxGroup.vue';
import Price from '../price/Price.vue';
import QuantityStepper from '../quantity-stepper/QuantityStepper.vue';
import Drawer from './Drawer.vue';

/**
 * One story per state of the design spec's Drawer section, named after the state it shows.
 * `eldra-starter-spec/images/core/drawer.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story here starts **open** (`ref(true)`), the same reasoning `Dialog`'s own stories give:
 * a modal's whole visible subject is the box `showModal()` draws. Each still renders a real
 * trigger button beside it so the open → close → reopen cycle is exercised the normal way.
 */
const meta = {
  title: 'Overlays/Drawer',
  component: Drawer,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A modal side sheet for long content: the cart, filters and quick view slide in from',
          'the right; the mobile menu slides in from the left. Use a Dialog for a single short',
          'decision, and a Toast (not this) to confirm "Added to cart" unless the shopper asked to',
          'see the cart.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `panel`, `header`,',
          '`title`, `count`, `close`, `body`, `footer`. **Slots**: `default` (the scrolling body)',
          'and `footer` (the fixed footer, which never scrolls).',
          '',
          '**Built on `useDialog`**, the same contract `Dialog` uses — native `<dialog>` +',
          '`showModal()`, no custom focus trap, and the same single-modal slot (a `Dialog` and a',
          '`Drawer` cannot both be open at once). Unlike `Dialog`, there is no `dismissable` prop —',
          'a backdrop click always closes a Drawer.',
          '',
          '**Naming**: use either `title` (a visible `<h2>`, `aria-labelledby`) or `ariaLabel` (no',
          'visible heading — the menu drawer: `ariaLabel="Menu"`). `count` appends "(3)" in `muted`',
          'after the title. The close button names itself from whichever one is set ("Close cart",',
          '"Close menu").',
          '',
          '**Initial focus**: the right side (cart, filters, quick view) focuses the close button',
          'by default, unless a control inside is marked `autofocus`. The left side (the menu)',
          "focuses the first link — `Dialog`'s own rule (the first control that is not the close",
          'button), unchanged.',
          '',
          '**Width**: `width` sets `--eldra-drawer-width` (default `28rem`), always capped at the',
          "viewport. Below a 48rem **viewport** — not the drawer's own width — it covers the full",
          'screen instead, one of only two rules in the whole design spec measured on the viewport',
          'rather than a container.',
          '',
          '**Entrance**: slides in from its edge over `duration-slow` `ease-out`. Reduced motion',
          "drops the slide for a plain opacity fade over `duration-base`, linear (`Dialog`'s own",
          'reduced-motion fade, reused rather than duplicated). Exit is instant. **CSS variables**:',
          '`--eldra-drawer-title-size`/`-line`, `--eldra-drawer-width`.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

interface CartLine {
  id: string;
  name: string;
  variant: string;
  quantity: number;
  amount: number;
}

/** The spec's own cart drawer: right side, a footer with the subtotal and "Check out", a
 *  free-shipping line with an icon (never colour alone), and line items each with their own
 *  quantity stepper. */
export const Cart: Story = {
  args: { title: 'Your cart', count: 2 },
  render: (args) => ({
    components: { Drawer, Button, Price, QuantityStepper, IconTruck, IconLock },
    setup: () => {
      const open = ref(true);
      const lines = ref<CartLine[]>([
        {
          id: 'sweater',
          name: 'Merino crew sweater',
          variant: 'Oat, M',
          quantity: 1,
          amount: 8900,
        },
        { id: 'mug', name: 'Stoneware mug', variant: 'Clay', quantity: 1, amount: 2400 },
      ]);
      const subtotal = () =>
        lines.value.reduce((sum, line) => sum + line.amount * line.quantity, 0);
      return { args, open, lines, subtotal };
    },
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open cart</Button>
        <Drawer v-bind="args" v-model="open">
          <div class="mb-4 flex items-center gap-2 text-body-sm text-success">
            <IconTruck class="size-4" aria-hidden="true" />
            <span>Free shipping on orders over $75</span>
          </div>
          <ul class="flex flex-col gap-4">
            <li v-for="line in lines" :key="line.id" class="flex gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-body text-text">{{ line.name }}</p>
                <p class="text-body-sm text-muted">{{ line.variant }}</p>
                <QuantityStepper
                  v-model="line.quantity"
                  size="sm"
                  :item-name="line.name"
                  class="mt-2"
                />
              </div>
              <Price :amount="line.amount * line.quantity" size="sm" />
            </li>
          </ul>
          <template #footer>
            <div class="flex w-full flex-col gap-3">
              <div class="flex items-center justify-between text-body text-text">
                <span>Subtotal</span>
                <Price :amount="subtotal()" />
              </div>
              <p class="text-body-sm text-muted">Taxes and shipping calculated at checkout.</p>
              <Button variant="primary" size="lg" block :icon-left="IconLock" @click="open = false">
                Check out
              </Button>
            </div>
          </template>
        </Drawer>
      </div>
    `,
  }),
};

/** The spec's own mobile menu: left side, `ariaLabel` (no visible heading), a `<nav aria-label
 *  ="Main">` body, and a two-column footer ("Sign in" and the currency selector). */
export const Menu: Story = {
  args: { side: 'left', ariaLabel: 'Menu' },
  render: (args) => ({
    components: { Drawer, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open menu</Button>
        <Drawer v-bind="args" v-model="open">
          <nav aria-label="Main" class="flex flex-col gap-1">
            <a href="#" class="rounded-sm px-2 py-3 text-body text-text eldra-focus hover:bg-surface">Shop all</a>
            <a href="#" class="rounded-sm px-2 py-3 text-body text-text eldra-focus hover:bg-surface">Knitwear</a>
            <a href="#" class="rounded-sm px-2 py-3 text-body text-text eldra-focus hover:bg-surface">Ceramics</a>
            <a href="#" class="rounded-sm px-2 py-3 text-body text-text eldra-focus hover:bg-surface">Journal</a>
          </nav>
          <template #footer>
            <div class="flex w-full items-center justify-between">
              <Button variant="ghost" @click="open = false">Sign in</Button>
              <Button variant="ghost" @click="open = false">USD $</Button>
            </div>
          </template>
        </Drawer>
      </div>
    `,
  }),
};

/** A right-side filter panel: no count, a plain `title`, grouped checkbox facets in the scrolling
 *  body and a two-button footer. */
export const Filters: Story = {
  args: { title: 'Filters' },
  render: (args) => ({
    components: { Drawer, Button, CheckboxGroup },
    setup: () => ({
      args,
      open: ref(true),
      sizes: ref<string[]>([]),
      colours: ref<string[]>([]),
    }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open filters</Button>
        <Drawer v-bind="args" v-model="open">
          <div class="flex flex-col gap-6">
            <CheckboxGroup
              v-model="sizes"
              legend="Size"
              :options="[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Medium' },
                { value: 'l', label: 'Large' },
              ]"
            />
            <CheckboxGroup
              v-model="colours"
              legend="Colour"
              layout="row"
              :options="[
                { value: 'oat', label: 'Oat' },
                { value: 'clay', label: 'Clay' },
                { value: 'moss', label: 'Moss' },
              ]"
            />
          </div>
          <template #footer>
            <Button variant="ghost" @click="sizes = []; colours = []">Clear all</Button>
            <Button variant="primary" @click="open = false">Show results</Button>
          </template>
        </Drawer>
      </div>
    `,
  }),
};

/** Content taller than the viewport scrolls inside the body; the header and footer stay put. */
export const LongContent: Story = {
  args: { title: 'Your cart', count: 8 },
  render: (args) => ({
    components: { Drawer, Button, Price },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open cart</Button>
        <Drawer v-bind="args" v-model="open">
          <ul class="flex flex-col gap-4">
            <li v-for="n in 8" :key="n" class="flex items-center justify-between gap-3">
              <span class="text-body text-text">Line item {{ n }}</span>
              <Price :amount="1900 * n" size="sm" />
            </li>
          </ul>
          <template #footer>
            <Button variant="primary" size="lg" block @click="open = false">Check out</Button>
          </template>
        </Drawer>
      </div>
    `,
  }),
};

/**
 * Opened from a 20rem-wide ancestor — the drawer keeps its own width regardless: a modal's box
 * has no relationship to whatever container its trigger sits in, and its full-screen breakpoint
 * measures the viewport, never that ancestor.
 */
export const Narrow: Story = {
  args: { title: 'Filters' },
  render: (args) => ({
    components: { Drawer, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div class="w-80">
        <Button variant="outline" @click="open = true">Open filters</Button>
        <Drawer v-bind="args" v-model="open">
          <p class="text-body text-muted">
            A drawer opened from a narrow ancestor keeps its own width clamp.
          </p>
          <template #footer>
            <Button variant="primary" @click="open = false">Show results</Button>
          </template>
        </Drawer>
      </div>
    `,
  }),
};

/** Reduced motion: a plain opacity fade over `duration-base`, no slide. The screenshot harness
 *  captures this one with `prefers-reduced-motion: reduce` emulated. */
export const ReducedMotion: Story = {
  args: { title: 'Your cart', count: 2 },
  parameters: { eldra: { reducedMotion: true } },
  render: (args) => ({
    components: { Drawer, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <Drawer v-bind="args" v-model="open">
        <p class="text-body text-muted">Reduced motion: a plain opacity fade, no slide.</p>
        <template #footer>
          <Button variant="primary" size="lg" block @click="open = false">Check out</Button>
        </template>
      </Drawer>
    `,
  }),
};

/** Forced colours: the panel's inner-edge border and the focus ring are real borders/outlines, so
 *  the drawer stays legible with every fill replaced by the system canvas. */
export const ForcedColors: Story = {
  args: { title: 'Your cart', count: 2 },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Drawer, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <Drawer v-bind="args" v-model="open">
        <p class="text-body text-muted">Forced colours: real borders and outlines throughout.</p>
        <template #footer>
          <Button variant="primary" size="lg" block @click="open = false">Check out</Button>
        </template>
      </Drawer>
    `,
  }),
};
