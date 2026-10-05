import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Button from '../button/Button.vue';
import Lightbox from './Lightbox.vue';
import type { LightboxImage } from './types';

/**
 * One story per state of the design spec's Lightbox section, named after the state it shows.
 * `eldra-starter-spec/images/core/lightbox.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Hand-drawn scenes stand in for product photography, exactly as `Image.stories.ts` does — plain
 * `data:` URIs, because the screenshot harness runs offline. Two are landscape and two portrait, so
 * the "keeps its aspect ratio (contain)" rule actually shows something: a portrait photo never
 * stretches to the stage's own (landscape) shape.
 */
function scene(fill: string, accent: string, width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${fill}"/>
      <circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) / 3}" fill="${accent}"/>
    </svg>`
  )}`;
}

const IMAGES: LightboxImage[] = [
  {
    src: scene('#d7c9b8', '#5b3f2b', 1600, 1067),
    alt: 'Oatmeal-coloured merino crew sweater, folded flat',
    caption: 'Oatmeal, folded. Knitted in Biella from extra-fine merino.',
    width: 1600,
    height: 1067,
  },
  {
    src: scene('#c8b7a6', '#8a6a52', 1200, 1600),
    alt: 'Model wearing the merino crew sweater in oatmeal',
    caption: 'Worn with the Clay stoneware mug, for scale.',
    width: 1200,
    height: 1600,
  },
  {
    src: scene('#e4dccd', '#a9895f', 1600, 1067),
    alt: 'Close-up of the merino crew sweater’s ribbed cuff',
    width: 1600,
    height: 1067,
  },
  {
    src: scene('#b7a68f', '#3f2d1e', 900, 1600),
    alt: 'The merino crew sweater on a wooden hanger',
    caption: 'Moss, on a Douglas fir hanger.',
    width: 900,
    height: 1600,
  },
];

const meta = {
  title: 'Overlays/Lightbox',
  component: Lightbox,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A full-screen modal image viewer for product galleries: counter, close, previous/next',
          'and a caption around a one-image-per-view Carousel track. Use it for zooming into',
          "product photos; don't use it for a single small image that's already readable, and",
          'never put buy actions in it.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `panel`, `close`,',
          '`track`, `slide`, `image`, `caption`, `prev`, `next`, `counter`, `thumbnails`,',
          '`thumbnail`.',
          '',
          '**Built on `useDialog` and `useCarousel`**, unchanged — the same shared modal stack',
          '`Dialog`/`Drawer` share (nested modals allowed; Esc and a backdrop click act only on',
          'the topmost one), and the same index tracking, edge detection and `←`/`→` stepping',
          '`Carousel` uses for its own track. Always full screen, at every width; there is no',
          'backdrop click of its own (the viewer’s own ground covers it entirely).',
          '',
          '**Opens at `index`** (two-way, like `modelValue`) with no scroll animation — moving',
          'the track there instantly rather than sweeping across every image in between. Moving',
          'between images afterwards (arrows, `←`/`→` from anywhere in the viewer, or a',
          'thumbnail) scrolls smoothly, unless reduced motion is on.',
          '',
          '**Initial focus** is the close button (the opposite of a plain `Dialog`’s own rule),',
          'and it returns to the opener on close.',
          '',
          '**Draggable** (operator decision, inherited from `useCarousel` unchanged): grabbing the',
          'image stage with a mouse or pen changes pages the same way `Carousel`’s own track',
          'drags, snapping to the nearest image on release and biased one further by a fast flick.',
          'Thumbnails sit outside the stage and are unaffected.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Lightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own gallery variant: counter, arrows and captions, no thumbnails. */
export const Default: Story = {
  args: { ariaLabel: 'Merino crew sweater, images', images: IMAGES },
  render: (args) => ({
    components: { Lightbox, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Zoom image</Button>
        <Lightbox v-bind="args" v-model="open" />
      </div>
    `,
  }),
};

/** Spec "Variants" → "With thumbnails": a small-image strip under the caption, each named "Go to
 *  image n", `aria-current` on the one showing. */
export const WithThumbnails: Story = {
  args: { ariaLabel: 'Merino crew sweater, images', images: IMAGES, thumbnails: true, index: 1 },
  render: (args) => ({
    components: { Lightbox, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Zoom image</Button>
        <Lightbox v-bind="args" v-model="open" />
      </div>
    `,
  }),
};

/** Spec "Variants" → "Single image": no arrows and no counter — there is nothing to move between. */
export const SingleImage: Story = {
  args: { ariaLabel: 'Stoneware mug, image', images: [IMAGES[0] as LightboxImage] },
  render: (args) => ({
    components: { Lightbox, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Zoom image</Button>
        <Lightbox v-bind="args" v-model="open" />
      </div>
    `,
  }),
};

/**
 * Opened from a 20rem-wide ancestor — the viewer fills the real viewport regardless: a modal's box
 * has no relationship to whatever container its trigger sits in.
 */
export const Narrow: Story = {
  args: { ariaLabel: 'Merino crew sweater, images', images: IMAGES, thumbnails: true },
  render: (args) => ({
    components: { Lightbox, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div class="w-80">
        <Button variant="outline" @click="open = true">Zoom image</Button>
        <Lightbox v-bind="args" v-model="open" />
      </div>
    `,
  }),
};

/** Reduced motion: the viewer fades in over `duration-base` with no movement; image changes are
 *  instant. The screenshot harness captures this one with `prefers-reduced-motion: reduce`
 *  emulated. */
export const ReducedMotion: Story = {
  args: { ariaLabel: 'Merino crew sweater, images', images: IMAGES },
  parameters: { eldra: { reducedMotion: true } },
  render: (args) => ({
    components: { Lightbox },
    setup: () => ({ args, open: ref(true) }),
    template: `<Lightbox v-bind="args" v-model="open" />`,
  }),
};

/** Forced colours: the arrow outline and the focus ring are real borders/outlines, so the viewer
 *  stays legible with every fill replaced by the system canvas. */
export const ForcedColors: Story = {
  args: { ariaLabel: 'Merino crew sweater, images', images: IMAGES, thumbnails: true },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Lightbox },
    setup: () => ({ args, open: ref(true) }),
    template: `<Lightbox v-bind="args" v-model="open" />`,
  }),
};
