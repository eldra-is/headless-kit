import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Image from './Image.vue';
import type { ImageMedia } from './types';

/**
 * One story per state of the design spec's Image section, named after the state it shows.
 * `eldra-starter-spec/images/core/image.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * A hand-drawn scene stands in for product photography, exactly as the spec's reference images
 * do — as a `data:` URI, because the screenshot harness runs offline and a broken external image
 * would be a worse baseline than no image at all. The subject (a "bowl" circle) sits off-centre
 * on purpose, so the `Focal`/`Zoom` stories actually show a crop moving rather than a colour swatch
 * that looks identical everywhere.
 */
const SCENE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect width="800" height="600" fill="#d7c9b8"/>
    <rect y="380" width="800" height="220" fill="#a9895f"/>
    <circle cx="620" cy="470" r="90" fill="#5b3f2b"/>
    <circle cx="620" cy="470" r="72" fill="#8a6a52"/>
    <circle cx="150" cy="120" r="46" fill="#f2d9a8"/>
  </svg>`
)}`;

const MEDIA: ImageMedia = {
  src: SCENE,
  alt: 'A ceramic bowl on a linen surface, lit from the upper left',
  width: 800,
  height: 600,
};

const meta = {
  title: 'Display/Image',
  component: Image,
  tags: ['autodocs'],
  args: { media: MEDIA },
  argTypes: {
    ratio: {
      control: 'inline-radio',
      options: ['auto', '1x1', '4x3', '3x2', '16x9', '3x4', '4x5'],
    },
    rounded: { control: 'inline-radio', options: ['none', 'lg', 'xl'] },
    decorative: { control: 'boolean' },
    priority: { control: 'boolean' },
    loading: { control: 'boolean' },
    zoom: { control: { type: 'range', min: 1, max: 2, step: 0.1 } },
    media: { table: { disable: true } },
    focal: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The responsive media frame every card and block builds on: a fixed aspect ratio that',
          'always crops (never stretches), focal-point and zoom framing, an optional caption, and a',
          'live "No image" placeholder when `media` is not set.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (`<figure>` when',
          '`caption` is set, otherwise a plain `<div>`), `frame`, `media`, `placeholder`,',
          '`caption`, `skeleton`.',
          '',
          "**`ratio`** sets the frame's `aspect-ratio` from `src/utils/ratio.ts`. `auto` uses",
          "`media.width`/`height`'s own ratio when both are given, or 4:3 when `media` is not set",
          'at all — never a guess.',
          '',
          '**`focal`/`zoom`** are a static crop, never animated: `focal` (0–100 on each axis) sets',
          '`object-position`; once `zoom` is above 1 the media also gets `transform: scale(zoom)`',
          'with `transform-origin` at the same focal point.',
          '',
          '**With no `media`**, the live site shows a hatched placeholder (`eldra-image-placeholder-',
          'hatch`) with a photo icon and "No image", `role="img"`/`aria-label="No image available"`',
          'unless `decorative` is set. In development, a console warning fires whenever `media` is',
          'set but neither `alt` nor `decorative` says anything about it (WCAG 1.1.1).',
          '',
          '**`priority`** is for the first hero image only: eager loading, `fetchpriority="high"`.',
          'Every other image defaults to `loading="lazy"`, `decoding="async"`.',
          '',
          '**Attribute forwarding.** `class`/`style` passed to `<Image>` land on the root (sizing,',
          'positioning); every other attribute — `data-testid`, `width`/`height`, a framing',
          "helper's `data-*` markers — forwards to the `<img>`/`<video>` element itself.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Image>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A regular image at the default `4x3` ratio, no crop. */
export const Default: Story = {};

/** Every fixed preset, plus `auto` at the media's own intrinsic ratio (16:9 here, from a wider
 * source image) — the spec's own reference row. */
export const Ratios: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({
      media: MEDIA,
      wide: { ...MEDIA, width: 1680, height: 720 },
    }),
    template: `
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="flex flex-col gap-1">
          <Image :media="wide" ratio="auto" />
          <p class="text-caption text-muted">auto (21:9)</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" />
          <p class="text-caption text-muted">1x1</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="4x3" />
          <p class="text-caption text-muted">4x3</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="3x2" />
          <p class="text-caption text-muted">3x2</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="16x9" />
          <p class="text-caption text-muted">16x9</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="3x4" />
          <p class="text-caption text-muted">3x4</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="4x5" />
          <p class="text-caption text-muted">4x5 (product cards)</p>
        </div>
      </div>
    `,
  }),
};

/** `focal` moves the crop anchor: a square crop of the same wide scene keeps the bowl in frame
 * either by centring it or by anchoring the top-left corner instead of the default centre. */
export const Focal: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({ media: MEDIA }),
    template: `
      <div class="grid grid-cols-3 gap-4">
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 50, y: 50 }" />
          <p class="text-caption text-muted">Centred (default)</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 78, y: 78 }" />
          <p class="text-caption text-muted">Focal 78% 78% — the bowl</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 19, y: 20 }" />
          <p class="text-caption text-muted">Focal 19% 20% — the light</p>
        </div>
      </div>
    `,
  }),
};

/** `zoom` (1–2) scales the media around its `focal` point, a static crop rather than a hover
 * effect. */
export const Zoom: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({ media: MEDIA }),
    template: `
      <div class="grid grid-cols-3 gap-4">
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 78, y: 78 }" :zoom="1" />
          <p class="text-caption text-muted">zoom 1</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 78, y: 78 }" :zoom="1.4" />
          <p class="text-caption text-muted">zoom 1.4</p>
        </div>
        <div class="flex flex-col gap-1">
          <Image :media="media" ratio="1x1" :focal="{ x: 78, y: 78 }" :zoom="2" />
          <p class="text-caption text-muted">zoom 2</p>
        </div>
      </div>
    `,
  }),
};

/** Frame corner radius: `none` (default), `lg` (`radius-lg`), `xl` (`radius-xl`). */
export const Rounded: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({ media: MEDIA }),
    template: `
      <div class="grid grid-cols-3 gap-4">
        <Image :media="media" ratio="1x1" rounded="none" />
        <Image :media="media" ratio="1x1" rounded="lg" />
        <Image :media="media" ratio="1x1" rounded="xl" />
      </div>
    `,
  }),
};

/** `caption` renders a `<figcaption>` under the frame and makes the root a `<figure>`. */
export const Caption: Story = {
  args: { media: MEDIA, ratio: '3x2', caption: 'A ceramic bowl, hand-thrown and glazed in-house.' },
};

/** No `media`: a hatched `surface` fill, photo icon and "No image" — the state a live storefront
 * shows for a product with no image set, keeping the grid aligned. */
export const Placeholder: Story = {
  render: () => ({
    components: { Image },
    template: `
      <div class="grid grid-cols-3 gap-4">
        <Image ratio="1x1" />
        <Image ratio="4x3" />
        <Image ratio="16x9" />
      </div>
    `,
  }),
};

/** The first hero image: eager loading, `fetchpriority="high"` — inspect the rendered `<img>`'s
 * attributes in the DOM to see them. */
export const Priority: Story = {
  args: { media: MEDIA, ratio: '16x9', priority: true },
};

/** A skeleton at the frame's own ratio, in place of `media` or the placeholder, while a page waits
 * on the real image. */
export const Loading: Story = { args: { ratio: '4x3', loading: true } };

/** A 20rem container. The frame scales with its column at any width (1.4.10) instead of
 * overflowing or clipping oddly. */
export const Narrow: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({ media: MEDIA }),
    template: `
      <div class="w-80 border border-border p-4">
        <Image :media="media" ratio="4x3" caption="A ceramic bowl, hand-thrown in-house." />
      </div>
    `,
  }),
};

/**
 * Forced colours. The placeholder's hatching and photo icon are decorative fills/strokes that
 * forced-colours mode can flatten; the caption and "No image" text stay real text, and the frame
 * itself carries no colour-only meaning.
 */
export const ForcedColors: Story = {
  render: () => ({
    components: { Image },
    setup: () => ({ media: MEDIA }),
    template: `
      <div class="grid grid-cols-2 gap-4">
        <Image :media="media" ratio="1x1" caption="A ceramic bowl." />
        <Image ratio="1x1" />
      </div>
    `,
  }),
};
