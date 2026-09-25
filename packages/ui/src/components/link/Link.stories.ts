import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Link from './Link.vue';

/**
 * One story per state of the design spec's Link section, named after the state it shows.
 * `eldra-starter-spec/images/core/link.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Actions/Link',
  component: Link,
  tags: ['autodocs'],
  args: { variant: 'inline' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['inline', 'standalone'] },
    tone: { control: 'inline-radio', options: ['default', 'muted'] },
    arrow: { control: 'boolean' },
    external: { control: 'boolean' },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Text navigation to another page or anchor: inline inside copy, standalone with a',
          'trailing arrow, or external with an out-of-site icon. For actions, use `Button` (its',
          '`link` variant when it should read like text).',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `label`, `arrow`,',
          '`externalIcon`.',
          '',
          '**Slots**: `default` (the link text — it must make sense out of context).',
          '',
          "**CSS variables**: `--eldra-link-radius` (default `2px`), the focus ring's corner",
          'radius on every variant. Set it on any ancestor.',
          '',
          '**Messages**: `opensInNewTab` — the visually hidden text an `external` link appends.',
          '',
          '**No destination**: with no `href`, Link renders a `<span data-part="root">` with',
          'the same text and no link semantics at all, per the spec: "If no destination exists,',
          'render plain text instead of a link."',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Inside a sentence. The underline is always shown — colour alone never carries the affordance. */
export const Inline: Story = {
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `
      <p class="text-body max-w-prose">
        Every piece is thrown on the wheel in our Porto studio. Read how we
        <Link v-bind="args" href="/journal/care-for-stoneware">care for stoneware</Link>,
        or check our <Link v-bind="args" href="/policies/returns">30-day returns policy</Link>
        before you order.
      </p>
    `,
  }),
};

/** "Read the journal", a block-heading action — bold weight identifies it, no arrow. */
export const Standalone: Story = {
  args: { variant: 'standalone' },
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `<Link v-bind="args" href="/journal">Read the journal</Link>`,
  }),
};

/** "Shop all knitwear →" — bold weight plus the trailing arrow, which moves 2px right on hover. */
export const StandaloneArrow: Story = {
  args: { variant: 'standalone', arrow: true },
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `<Link v-bind="args" href="/collections/knitwear">Shop all knitwear</Link>`,
  }),
};

/** Leaves the store: always `target="_blank"`, `rel="noopener noreferrer"`, and the hidden text. */
export const External: Story = {
  args: { external: true },
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `
      <p class="text-body max-w-prose">
        Wool sourced from
        <Link v-bind="args" href="https://example.com/responsible-wool">
          certified Responsible Wool farms
        </Link>.
      </p>
    `,
  }),
};

/** Tertiary links in footers and meta lines: `muted` text, turning `text` on hover. */
export const Muted: Story = {
  args: { variant: 'standalone', tone: 'muted' },
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `<Link v-bind="args" href="/size-guide">Size guide</Link>`,
  }),
};

/**
 * No `href`. The spec: "If no destination exists, render plain text instead of a link" — a
 * `<span>` with no underline, colour or focus ring, not a disabled-looking link.
 */
export const NoHref: Story = {
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `
      <p class="text-body max-w-prose">
        Read how we <Link v-bind="args">care for stoneware</Link> in our Porto studio.
      </p>
    `,
  }),
};

/** Twice the example length. Links wrap naturally rather than clipping or forcing a scrollbar. */
export const LongContent: Story = {
  render: (args) => ({
    components: { Link },
    setup: () => ({ args }),
    template: `
      <p class="text-body max-w-prose">
        Every piece is thrown on the wheel in our Porto studio and finished entirely by hand.
        Read how we
        <Link v-bind="args" href="/journal/care-for-stoneware">
          care for stoneware, from the first pull on the wheel to the final glaze firing
        </Link>
        before you order.
      </p>
    `,
  }),
};

/** A 20rem container. Standalone stays a single line where it can; inline copy wraps. */
export const Narrow: Story = {
  render: () => ({
    components: { Link },
    template: `
      <div class="w-80 border border-border p-4 flex flex-col gap-3">
        <p class="text-body">
          Read how we <Link href="/journal/care-for-stoneware">care for stoneware</Link> in our
          Porto studio.
        </p>
        <Link variant="standalone" arrow href="/collections/knitwear">Shop all knitwear</Link>
      </div>
    `,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: the underline is a real text decoration
 * and the focus ring uses the system Highlight colour, so both variants stay visible.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Link },
    template: `
      <div class="flex flex-col gap-3">
        <p class="text-body">
          Read how we <Link href="/journal/care-for-stoneware">care for stoneware</Link>.
        </p>
        <Link variant="standalone" arrow href="/collections/knitwear">Shop all knitwear</Link>
      </div>
    `,
  }),
};
