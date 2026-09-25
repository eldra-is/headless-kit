import {
  IconArrowRight,
  IconHeart,
  IconLayoutGrid,
  IconList,
  IconShoppingBag,
  IconTrash,
  IconX,
} from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from './Button.vue';
import ButtonGroup from './ButtonGroup.vue';

/**
 * One story per state of the design spec's Button section, named after the state it shows.
 * `eldra-starter-spec/images/core/button.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Actions/Button',
  component: Button,
  tags: ['autodocs'],
  args: { variant: 'primary', size: 'md' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'outline', 'ghost', 'link', 'danger'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    type: { control: 'inline-radio', options: ['button', 'submit', 'reset'] },
    pressed: { control: 'boolean' },
    iconLeft: { table: { disable: true } },
    iconRight: { table: { disable: true } },
    icon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The one control for actions: Add to cart, Submit, Open a drawer, Remove item. Renders a',
          'native `<button>`, or an `<a href>` when `href` is set. For navigation that should not',
          'look like a button use `Link`; for an action that should read like text use this',
          "component's `link` variant.",
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `container`, `leadingIcon`,',
          '`label`, `trailingIcon`, `spinner`.',
          '',
          '**Slots**: `default` (the label), `leadingIcon`, `trailingIcon`.',
          '',
          '**CSS variables**: `--eldra-button-radius` (default `var(--eldra-radius-md)`),',
          '`--eldra-button-line-height` (default `1.2`) and `--eldra-button-font-size-lg` (default',
          '`1.0625rem`, the one button size with no type token of its own). Set them on any',
          'ancestor. Everything else — colours, heights, padding, motion — comes from the',
          '`--eldra-*` tokens, so a rebranded `primary` or `accent` carries the hover fills with it.',
          '',
          '**Messages**: none. Button renders no text of its own; the label comes from the default',
          'slot or the `label` prop, and the outcome of a loading action is announced by a `Toast`',
          '(`role="status"`), not by the button.',
          '',
          '**Form layout**: a Button inside a `FormLayout` that is submitting turns into a loading',
          'button when its `type` is `submit`, and is disabled otherwise.',
          '',
          '**Container queries**: an `md` **primary** button grows to the 2.75rem touch target when',
          'an ancestor is a container (`@container`) narrower than 48rem — `ButtonGroup`,',
          "`FormLayout` and the theme's `Section` all are. The spec grows the *primary action* only",
          '("Controls keep their height on mobile. Only primary action buttons grow to',
          '`target-touch`"), so a secondary, outline or ghost action in the same row keeps the',
          '2.5rem control height it shares with the inputs beside it. A Button dropped straight into',
          'a plain `<div>` has no container to measure, so it stays 2.5rem however narrow the page',
          'gets. The spec measures the block, not the viewport, which is what makes a narrow',
          'page-builder column behave like a phone.',
          '',
          '**On coloured sections**: the variant inversions apply to the live states only. A',
          'disabled button keeps its `surface-strong` fill and `muted` text on a `primary` or',
          '`accent` section, deliberately: the spec gives no inversion for the disabled row, and a',
          'disabled control is exempt from the contrast rules precisely because it should read as',
          'inert rather than as part of the section.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renders one Button from the story args, inside a container-query context. */
function single(label: string) {
  return (args: Record<string, unknown>) => ({
    components: { Button },
    setup: () => ({ args, label }),
    template: `<div class="@container"><Button v-bind="args">{{ label }}</Button></div>`,
  });
}

/** The one main action in a view. At most one per block. */
export const Primary: Story = { render: single('Add to cart') };

/** The accent fill, for promotions only. It competes with sale badges everywhere else. */
export const Secondary: Story = {
  args: { variant: 'secondary' },
  render: single('Shop the sale'),
};

/** The second action next to a primary. */
export const Outline: Story = { args: { variant: 'outline' }, render: single('View details') };

/** Low-emphasis actions in dense UI. */
export const Ghost: Story = { args: { variant: 'ghost' }, render: single('Save for later') };

/** An action that reads like text. Not a `Link`: this navigates nowhere. */
export const Link: Story = { args: { variant: 'link' }, render: single('Size guide') };

/** Destructive and hard to undo. Confirm anything irreversible in a Dialog. */
export const Danger: Story = {
  args: { variant: 'danger', iconLeft: IconTrash },
  render: single('Remove item'),
};

/** 2rem, 2.5rem and 3rem. An md *primary* button grows to 2.75rem when its container is under 48rem. */
export const Sizes: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args, sizes: ['sm', 'md', 'lg'] as const }),
    template: `
      <div class="@container flex flex-wrap items-center gap-3">
        <Button v-for="size in sizes" :key="size" v-bind="args" :size="size">
          {{ size === 'sm' ? 'Small' : size === 'md' ? 'Medium' : 'Large' }}
        </Button>
      </div>
    `,
  }),
};

/** A leading icon for the object, a trailing arrow for "this continues somewhere". */
export const WithIcons: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args, IconShoppingBag, IconArrowRight }),
    template: `
      <div class="@container flex flex-wrap items-center gap-3">
        <Button v-bind="args" :icon-left="IconShoppingBag">Add to cart</Button>
        <Button v-bind="args" variant="outline" :icon-right="IconArrowRight">
          Continue to checkout
        </Button>
      </div>
    `,
  }),
};

/**
 * Square, and named by `label` — the accessible name has to name the action *and* the object.
 * Without a `label` the component warns in development.
 */
export const IconOnly: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args, IconHeart, IconX }),
    template: `
      <div class="@container flex flex-wrap items-center gap-3">
        <Button
          v-bind="args"
          variant="outline"
          icon-only
          :icon="IconHeart"
          label="Add Merino crew sweater to wishlist"
        />
        <Button v-bind="args" variant="ghost" icon-only :icon="IconX" label="Close" />
      </div>
    `,
  }),
};

/**
 * The label and icons keep their space, so the width never jumps; the spinner is centred over
 * them, the name becomes the loading label and focus stays on the button.
 */
export const Loading: Story = {
  args: { loading: true, label: 'Adding to cart', iconLeft: IconShoppingBag },
  render: single('Add to cart'),
};

/**
 * Disabled buttons cannot be focused, so a screen-reader user can miss them. For a sold-out item,
 * keep the disabled button *and* say why beside it.
 */
export const Disabled: Story = {
  render: (args) => ({
    components: { Button },
    setup: () => ({ args, variants: ['primary', 'outline', 'ghost', 'link'] as const }),
    template: `
      <div class="@container flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <Button v-for="v in variants" :key="v" v-bind="args" :variant="v" disabled>
            Sold out
          </Button>
        </div>
        <p class="text-body-sm text-muted">Sold out in Oat / M</p>
      </div>
    `,
  }),
};

/** A toggle pair. The pressed one is filled, so the state is never carried by colour alone. */
export const Pressed: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    setup: () => ({ IconLayoutGrid, IconList }),
    template: `
      <ButtonGroup attached aria-label="View">
        <Button variant="outline" :pressed="true" :icon-left="IconLayoutGrid">Grid</Button>
        <Button variant="outline" :pressed="false" :icon-left="IconList">List</Button>
      </ButtonGroup>
    `,
  }),
};

/** Full width of its container — how actions stack on a narrow screen. */
export const Block: Story = { args: { block: true, size: 'lg' }, render: single('Checkout') };

/** The layout helper: a wrapping row with a `space-3` gap, primary action first. */
export const Group: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <ButtonGroup>
        <Button variant="primary">Shop knitwear</Button>
        <Button variant="outline">Our story</Button>
      </ButtonGroup>
    `,
  }),
};

/**
 * A segmented control: no gap, square inner corners, neighbours overlapping by 1px, and the
 * focused button raised so its ring is never covered.
 */
export const AttachedGroup: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <ButtonGroup attached aria-label="View">
        <Button variant="outline" :pressed="true">Grid</Button>
        <Button variant="outline" :pressed="false">List</Button>
        <Button variant="outline" :pressed="false">Compact</Button>
      </ButtonGroup>
    `,
  }),
};

/**
 * On a `primary` section the primary button inverts, outline draws in `currentColor`, and ghost
 * and link inherit the section's text colour. The focus ring does not change.
 */
export const OnPrimarySection: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <div class="group/section bg-primary text-primary-contrast p-6" data-section="primary">
        <ButtonGroup>
          <Button variant="primary">Add to cart</Button>
          <Button variant="outline">Our story</Button>
          <Button variant="ghost">Save for later</Button>
          <Button variant="link">Size guide</Button>
        </ButtonGroup>
      </div>
    `,
  }),
};

/** The same on an `accent` section, where the secondary button loses its fill too. */
export const OnAccentSection: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <div class="group/section bg-accent text-accent-contrast p-6" data-section="accent">
        <ButtonGroup>
          <Button variant="primary">Add to cart</Button>
          <Button variant="secondary">Shop the sale</Button>
          <Button variant="outline">Our story</Button>
          <Button variant="ghost">Save for later</Button>
        </ButtonGroup>
      </div>
    `,
  }),
};

/** Twice the example length. The label never wraps — shorten the copy instead. */
export const LongContent: Story = {
  render: single('Add the Merino crew sweater in Oat to your cart and keep shopping'),
};

/**
 * A 20rem container. The group wraps, and the md *primary* button grows to the 2.75rem touch target
 * because the container query measures the block, not the viewport; the outline action beside it
 * keeps the 2.5rem control height, which is the spec's "only primary action buttons grow".
 */
export const Narrow: Story = {
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <div class="w-80 border border-border p-4">
        <ButtonGroup>
          <Button variant="primary" block>Add to cart</Button>
          <Button variant="outline" block>Our story</Button>
        </ButtonGroup>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in `--reduced-motion`
 * with Playwright's `reducedMotion: 'reduce'` emulation: every transition runs in 0ms and the
 * spinner pulses at 60-100% opacity instead of turning.
 */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  render: () => ({
    components: { Button },
    setup: () => ({ IconShoppingBag }),
    template: `
      <div class="@container flex flex-wrap items-center gap-3">
        <Button variant="primary" loading label="Adding to cart" :icon-left="IconShoppingBag">
          Add to cart
        </Button>
        <Button variant="outline">Our story</Button>
      </div>
    `,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: the 1px border is a real border on every
 * variant, so each button keeps a visible boundary when the fills are replaced.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Button, ButtonGroup },
    template: `
      <ButtonGroup>
        <Button variant="primary">Add to cart</Button>
        <Button variant="outline">Our story</Button>
        <Button variant="ghost">Save for later</Button>
        <Button variant="danger">Remove item</Button>
      </ButtonGroup>
    `,
  }),
};
