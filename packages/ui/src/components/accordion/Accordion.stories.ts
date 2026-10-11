import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Accordion from './Accordion.vue';
import AccordionItem from './AccordionItem.vue';

/**
 * One story per state/variant of the design spec's Accordion section, named after what it shows.
 * `eldra-starter-spec/images/core/accordion.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Navigation/Accordion',
  component: Accordion,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A stack of disclosure rows built on native `<details>`/`<summary>`, for secondary',
          'detail the shopper can skip: product details, FAQs, footer link groups on mobile,',
          'nested menu levels in the mobile menu Drawer. Use Tabs when the sections are peers of',
          'equal weight and short labels, and keep price, stock and the add-to-cart button',
          'outside accordions. Never nest an accordion more than one level deep.',
          '',
          '**`Accordion`** (`multiple` default `true`, `name`) is a plain grouping wrapper — it',
          'renders no trigger or panel of its own, just the top divider (`data-part`: `root`).',
          '`multiple: false` puts every child `AccordionItem` in the same native `name` group',
          '(generated when not given), so the browser closes the previously open sibling itself —',
          'no JavaScript coordinates it.',
          '',
          '**`AccordionItem`** (`title`, `help`, `modelValue` two-way, `headingLevel`, `href`).',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the `<details>`),',
          '`summary`, `title`, `help`, `chevron`, `panel`. A link row (`href` set) renders only',
          '`root`, as a plain `<a>` — no `summary`, `chevron` or `panel`.',
          '',
          "**Two-way state, not the spec's own `open`.** Every stateful control in this package",
          'takes `v-model`/`modelValue`; `AccordionItem` is no exception, mirroring the native',
          '`open` attribute. The native `toggle` event still fires, and is what this component',
          "re-emits as its own `toggle` — see the README's Deviations for the reasoning.",
          '',
          '**The help text is part of the accessible name** — no extra wiring, because it is',
          'plain text inside the same `<summary>`, whose accessible name is its full text content',
          'by default.',
          '',
          '**Keyboard is entirely native.** `Tab`/`Shift+Tab` move between summaries and into an',
          "open panel's own controls; `Enter`/`Space` toggle the focused summary. This component",
          'adds no key handling of its own.',
          '',
          '**Motion**: the chevron rotates 180°, the panel fades in, and the panel height',
          'animates between `0` and its measured content height — all over `duration-base`, the',
          'fade and rotation `ease-out`, the height animation `ease-out` opening / `ease-in`',
          'closing (operator addition, 2026-09-26). Reduced motion makes all three instant. The',
          'height animation runs through the Web Animations API on a measured pixel height, never',
          'touching `display`, so closed-panel text stays findable — and re-openable — by the',
          "browser's own find-in-page; see the README's Deviations for the fuller account,",
          'including the one documented gap (an exclusive-group sibling closed by another item',
          'opening closes instantly, with no collapse animation of its own).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `multiple` (default): any number of items open at once, each an independent `<details>`. */
export const Multiple: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem title="Materials & care" :model-value="true">
          100% organic cotton, pre-shrunk and pre-washed. Machine wash cold, tumble dry low.
        </AccordionItem>
        <AccordionItem title="Size & fit">
          Runs true to size. See the size guide for a full measurement chart.
        </AccordionItem>
        <AccordionItem title="Shipping & returns">
          Free returns within 30 days. Orders ship within two business days.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/** `multiple="false"`: single-open, native exclusive group — opening one closes the others. */
export const Single: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion :multiple="false" class="max-w-xl">
        <AccordionItem title="Materials & care" :model-value="true">
          100% organic cotton, pre-shrunk and pre-washed. Machine wash cold, tumble dry low.
        </AccordionItem>
        <AccordionItem title="Size & fit">
          Runs true to size. See the size guide for a full measurement chart.
        </AccordionItem>
        <AccordionItem title="Shipping & returns">
          Free returns within 30 days. Orders ship within two business days.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/** Label and a second, `muted` help line stacked inside the summary — part of the accessible name. */
export const WithHelp: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem
          title="Materials & care"
          help="What it's made of and how to look after it"
          :model-value="true"
        >
          100% organic cotton, pre-shrunk and pre-washed. Machine wash cold, tumble dry low.
        </AccordionItem>
        <AccordionItem title="Shipping & returns" help="Delivery times and how to send something back">
          Free returns within 30 days. Orders ship within two business days.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/** `headingLevel` wraps the label in a real heading, for a page outline that needs one (an FAQ
 *  page, say) — plain text otherwise. */
export const WithHeadings: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem title="Do you ship internationally?" :heading-level="3" :model-value="true">
          Yes — see the shipping page for rates and estimated delivery by country.
        </AccordionItem>
        <AccordionItem title="Can I change my order after placing it?" :heading-level="3">
          Contact us within an hour of ordering and we will do our best to amend it.
        </AccordionItem>
        <AccordionItem title="Do you offer gift wrapping?" :heading-level="3">
          Yes, add it at checkout for a small fee.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/** `href`: a plain link styled as the same trigger row, for a menu entry with no children — no
 *  panel, no chevron. Mixed here with ordinary disclosure items, as a footer link group would. */
export const LinkRows: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem title="Shipping & returns">
          Free returns within 30 days. Orders ship within two business days.
        </AccordionItem>
        <AccordionItem title="Size guide" href="/pages/size-guide" />
        <AccordionItem title="Track my order" href="/pages/track-order" />
      </Accordion>
    `,
  }),
};

/** Long panel content stays inside the spec's 65ch measure, however wide the row is. */
export const LongContent: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-2xl">
        <AccordionItem title="Materials & care" :model-value="true">
          Hand-finished merino wool crew neck sweater in a relaxed fit with ribbed cuffs and hem,
          knitted from traceable New Zealand wool and finished by hand at our studio. Machine wash
          cold on a wool cycle, reshape while damp and dry flat away from direct heat. Avoid
          tumble drying and do not wring — the fibres relax when wet and can stretch permanently
          out of shape if twisted.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/** A 20rem container (1.4.10): long labels wrap, the chevron stays visible, nothing is cut off. */
export const Narrow: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <div class="w-80">
        <Accordion>
          <AccordionItem
            title="Hand-finished merino wool crew neck sweater in a relaxed fit"
            help="Machine wash cold on a wool cycle, reshape while damp"
            :model-value="true"
          >
            Knitted from traceable New Zealand wool.
          </AccordionItem>
          <AccordionItem title="Shipping & returns">
            Free returns within 30 days.
          </AccordionItem>
        </Accordion>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation: `duration-base` reads
 * `--eldra-duration-base`, which `tokens.css` zeroes under `prefers-reduced-motion`, so the
 * chevron snaps and the panel pops open instead of fading — this story renders identically to
 * `Multiple`'s first (open) row under that emulation, which is the point. The height animation
 * (`heightTransition.ts`) checks `prefers-reduced-motion` the same way `useCarousel`/`Tooltip` do
 * (`prefersReducedMotion()`), independently of the zeroed token, and skips outright rather than
 * playing a real 0ms animation — either way, nothing here moves.
 */
export const ReducedMotion: Story = {
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem title="Materials & care" :model-value="true">
          100% organic cotton, pre-shrunk and pre-washed. Machine wash cold, tumble dry low.
        </AccordionItem>
        <AccordionItem title="Size & fit">
          Runs true to size. See the size guide for a full measurement chart.
        </AccordionItem>
      </Accordion>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the dividers and the chevron stay real
 * borders/`currentColor` strokes, and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Accordion, AccordionItem },
    template: `
      <Accordion class="max-w-xl">
        <AccordionItem title="Materials & care" :model-value="true">
          100% organic cotton, pre-shrunk and pre-washed. Machine wash cold, tumble dry low.
        </AccordionItem>
        <AccordionItem title="Size & fit">
          Runs true to size. See the size guide for a full measurement chart.
        </AccordionItem>
        <AccordionItem title="Size guide" href="/pages/size-guide" />
      </Accordion>
    `,
  }),
};
