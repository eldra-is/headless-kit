import type { Meta, StoryObj } from '@storybook/vue3-vite';
import LogoItem from './LogoItem.vue';
import type { ImageMedia } from '../image/types';

/**
 * One story per state of the design spec's Logo item section, named after the state it shows.
 * `eldra-starter-spec/images/core/logo-item.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Inline `data:` SVG stand-ins for uploaded logo files — the spec's own reference image does the
 * same ("wordmarks stand in for uploaded logo files") — because the screenshot harness runs
 * offline and a broken external image would be a worse baseline than the wordmark fallback.
 */
/** SVG text content is XML, not HTML — an unescaped `&` (as in "Northern & Co.") breaks the parser
 * and renders as a broken image, silently, so every label goes through this first. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgLogo(label: string, width: number): ImageMedia {
  const height = 48;
  return {
    src: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
          font-family="Georgia, serif" font-size="26" font-weight="700" fill="#1a1a1a">${escapeXml(label)}</text>
      </svg>`
    )}`,
    width,
    height,
  };
}

const KILN_STREET = svgLogo('Kiln Street', 220);
const NORTHERN = svgLogo('Northern & Co.', 260);

const meta = {
  title: 'Display/LogoItem',
  component: LogoItem,
  tags: ['autodocs'],
  args: { name: 'Kiln Street' },
  argTypes: {
    logo: { table: { disable: true } },
    href: { control: 'text' },
    linkContext: { control: 'text' },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'One logo in a logo cloud (stockists, press, partners): a centred `<li>` cell shown in a',
          'calm monochrome treatment, optionally linked. Falls back to a text wordmark when no',
          '`logo` is given, never an empty cell. For people use `Avatar`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the `<li>` itself',
          'unlinked, or the `<a>`/`as` cell inside it when linked — see the component doc comment',
          'for why the outer `<li>` always exists but only sometimes carries `root`), `image`,',
          '`wordmark`, `srText`.',
          '',
          '**Always render inside `<ul role="list">`.** A logo cloud is a real list — that role is',
          'what keeps assistive tech announcing the count once list markers are removed — and `<li>`',
          'is never valid outside one, so every story here wraps its item(s) in one.',
          '',
          '**No `external` prop.** Unlike `Link`, whether the hidden `" (stockist site)"` context',
          'appears is judged from `href` itself (an absolute URL, or `//`) — an on-site stockist',
          'page link gets no extra context. `linkContext` overrides the judgement either way.',
          '',
          '**Messages**: `stockistSite` — the default hidden context on an external link.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof LogoItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An uploaded logo file: greyscale, 75% opacity, contained within 2.5rem × 9rem. */
export const Logo: Story = {
  args: { logo: KILN_STREET },
  render: (args) => ({
    components: { LogoItem },
    setup: () => ({ args }),
    template: `<ul role="list" class="flex"><LogoItem v-bind="args" /></ul>`,
  }),
};

/** No `logo` file: the wordmark renders instead, never an empty cell. */
export const Wordmark: Story = {
  render: (args) => ({
    components: { LogoItem },
    setup: () => ({ args }),
    template: `<ul role="list" class="flex"><LogoItem v-bind="args" /></ul>`,
  }),
};

/** Linked, off-site: single tab stop, `eldra-focus` ring with `radius-md` corners, and the hidden
 * `" (stockist site)"` context judged automatically from the absolute `href`. Hover raises the
 * image to full opacity and the wordmark from `muted` to `text`. */
export const Linked: Story = {
  args: { logo: KILN_STREET, href: 'https://kilnstreet.example' },
  render: (args) => ({
    components: { LogoItem },
    setup: () => ({ args }),
    template: `<ul role="list" class="flex"><LogoItem v-bind="args" /></ul>`,
  }),
};

/** A press/stockist row: a heading introduces what the logos are (spec: "hover is not the only
 * affordance"), a mix of uploaded logos and wordmark fallbacks, linked and unlinked, on a
 * `surface` section. */
export const Row: Story = {
  render: () => ({
    components: { LogoItem },
    setup: () => ({ kilnStreet: KILN_STREET, northern: NORTHERN }),
    template: `
      <div class="bg-surface p-6">
        <p class="text-overline text-muted mb-4">As seen in</p>
        <ul role="list" class="grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          <LogoItem name="Kiln Street" :logo="kilnStreet" href="https://kilnstreet.example" />
          <LogoItem name="The Porto Journal" href="/press/the-porto-journal" />
          <LogoItem name="Northern & Co." :logo="northern" />
          <LogoItem name="Atelier Home" />
        </ul>
      </div>
    `,
  }),
};

/** A 20rem container. A long stockist name wraps (balanced) rather than overflowing. */
export const Narrow: Story = {
  render: () => ({
    components: { LogoItem },
    template: `
      <div class="w-80 border border-border p-4">
        <ul role="list" class="grid grid-cols-2 gap-x-2">
          <LogoItem name="The Northern Ceramics and Homeware Collective" href="/stockists/northern" />
          <LogoItem name="Atelier Home" />
        </ul>
      </div>
    `,
  }),
};

/** Forced colours. Captured with `forcedColors: 'active'`: the linked cell's focus ring uses the
 * system Highlight colour and stays visible even though the monochrome image treatment (a CSS
 * `filter`) is dropped by the user agent. */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { LogoItem },
    setup: () => ({ kilnStreet: KILN_STREET }),
    template: `
      <ul role="list" class="flex">
        <LogoItem name="Kiln Street" :logo="kilnStreet" href="https://kilnstreet.example" />
        <LogoItem name="Atelier Home" />
      </ul>
    `,
  }),
};
