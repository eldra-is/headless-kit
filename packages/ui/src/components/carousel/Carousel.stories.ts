import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { onMounted, ref } from 'vue';
import ProductCard from '../product-card/ProductCard.vue';
import type { ProductCardProduct } from '../product-card/types';
import Carousel from './Carousel.vue';

/**
 * One story per state/variant of the design spec's Carousel section, named after what it shows.
 * `eldra-starter-spec/images/core/carousel-controls.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * A hand-drawn scene stands in for photography, exactly as `ProductCard`'s own stories do — a
 * `data:` URI, since the screenshot harness runs offline.
 */
function scene(fill: string, accent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800">
      <rect width="640" height="800" fill="${fill}"/>
      <rect x="120" y="180" width="400" height="480" rx="24" fill="${accent}"/>
      <circle cx="320" cy="300" r="70" fill="#ffffff" fill-opacity="0.35"/>
    </svg>`
  )}`;
}

const COLOURS: Array<[string, string]> = [
  ['#e7ded1', '#a9895f'],
  ['#2f2f2f', '#8c8c8c'],
  ['#4d5a45', '#8ba17e'],
  ['#8c3b2a', '#d98c6f'],
  ['#f2ede3', '#c9b9a3'],
  ['#dfe6e9', '#74b9ff'],
  ['#2d3436', '#636e72'],
];

const PRODUCTS: ProductCardProduct[] = [
  'Merino crew sweater',
  'Waxed canvas tote',
  'Ceramic pour-over set',
  'Linen table runner',
  'Cedar candle trio',
  'Wool throw blanket',
  'Hand-thrown mug',
].map((title, i) => {
  const [fill, accent] = COLOURS[i % COLOURS.length]!;
  return {
    title,
    url: `/products/${title.toLowerCase().replace(/\s+/g, '-')}`,
    featuredImage: { src: scene(fill, accent), alt: title, width: 640, height: 800 },
    price: { amount: 3200 + i * 400 },
    rating: { value: 4 + (i % 2) * 0.5, count: 12 + i * 9 },
    available: true,
  };
});

const meta = {
  title: 'Navigation/Carousel',
  component: Carousel,
  tags: ['autodocs'],
  args: { ariaLabel: 'Carousel' },
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A native scroll-snap track with arrows, optional dots, an optional counter and',
          'optional autoplay — product rows and single-slide image galleries. Every slide is',
          'reachable by plain scrolling, touch and trackpad; the controls are an extra. The',
          'Lightbox reuses the same track (`useCarousel`, exported alongside this component).',
          '',
          "**Properties**: `ariaLabel` (required, the region's accessible name — package",
          'convention: an accessible-name-only prop is `ariaLabel`, never `label`), `perView`',
          '(a number or `{ base, md, lg }`, default `1.25`), `controls` (`"header"` default or',
          '`"below"`), `dots`, `counter`, `autoplay` (ms; any non-zero value always renders the',
          'Pause/Play button, WCAG 2.2.2).',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `header`,',
          '`instructions`, `track`, `slide`, `prev`, `next`, `dots`, `dot`, `counter`, `pause`.',
          '`slide` is not an element',
          "this component renders itself — `useCarousel` annotates the default slot's own",
          'top-level children directly (`role="group"`, `aria-roledescription="slide"`, an',
          '"n of total" `aria-label`, and the `eldra-carousel-slide` sizing class) rather than',
          "wrapping them, so a consumer's own `<li>`/`<figure>`/component root becomes the slide.",
          '',
          '**One tab stop, decided by the slides.** A carousel whose slides hold their own links',
          'or buttons gives the whole row a single entry point on the **active** slide: `Tab` and',
          "`Shift+Tab` move through that card's own controls in DOM order and then leave the",
          'carousel (never into the next card), `←`/`→` move between slides from anywhere inside',
          'one, `Home`/`End` jump to the ends, and `Enter`/`Space` stay with the focused control.',
          'The track carries no `tabindex` in that model. A carousel whose slides hold nothing',
          'focusable — a single-slide image gallery, the Lightbox stage — keeps the track itself',
          'as the one stop with `←`/`→` stepping it. No prop chooses between them; the content',
          "does. The `instructions` part is the visually hidden sentence the root's own",
          '`aria-describedby` points at in the first model, so the pattern is announced once on',
          'entering the carousel. See `KeyboardFocus` below and the README.',
          '',
          '**Never loops.** Arrows and dots disable at the ends; only autoplay wraps from the',
          'last slide back to the first. If the focused arrow becomes disabled, focus moves to',
          'the other one.',
          '',
          '**Autoplay never starts under reduced motion** (the Pause/Play button shows "Play"),',
          'and always pauses while the pointer is over the carousel, while focus is inside it, or',
          'while the tab is hidden — resuming afterwards unless the button itself paused it.',
          '',
          '**Draggable** (`draggable`, default `true`, operator decision): touch already swipes the',
          'track natively; grabbing it with a mouse or pen (`cursor-grab`/`cursor-grabbing`) does',
          'the same, snapping to the nearest slide on release, biased one slide further by a fast',
          "flick. Starting the drag on a slide's own link/button is left alone, so its click still",
          'works regardless of how far the pointer moves. Autoplay pauses for the drag and resumes',
          'after, without flipping the Pause/Play label.',
          '',
          "**Deviations** (recorded in full in the README): every slide gets the spec's gallery",
          '`role="group"`/`aria-label` treatment, including product rows (the spec reserves it for',
          'galleries and calls product-row slides plain list items) — one consistent rule for the',
          'shared track. The track\'s own accessible name is the fixed word "Slides" rather than',
          "switching between the spec's two literal examples. The Pause/Play button's accessible",
          'name is the same as its visible text ("Pause"/"Play"), not a longer "Pause slideshow".',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default `controls: "header"` variant: arrows beside the block heading, many cards per
 *  view, no dots or counter, never autoplaying. */
export const ProductRow: Story = {
  render: () => ({
    components: { Carousel, ProductCard },
    setup: () => ({ products: PRODUCTS.slice(0, 5) }),
    template: `
      <Carousel aria-label="Bestsellers" :per-view="{ base: 1.25, md: 3, lg: 4 }" class="max-w-4xl">
        <template #header>
          <h2 class="text-h3 text-text">Bestsellers</h2>
        </template>
        <li v-for="product in products" :key="product.url" class="list-none">
          <ProductCard :product="product" />
        </li>
      </Carousel>
    `,
  }),
};

/**
 * The keyboard, with cards in the slides (the model the roving focus exists for). The first three
 * cards hold two controls each — a link and a secondary button — so the story shows both halves of
 * the rule at once: `Tab` from the active card's link reaches its "Save" button and then leaves the
 * carousel entirely, while `←`/`→` move between cards and `Home`/`End` jump to the ends. Only the
 * active card's controls are in the tab sequence; the rest sit at `tabindex="-1"` until the arrows
 * (or an arrow button, a dot, a drag or a plain scroll) make their card the active one.
 *
 * The **last card holds no control at all**, which is the other half of the rule: a slide with
 * nothing to land on becomes the tab stop itself (`tabindex="0"` while it is active) and carries
 * the package's own `eldra-focus` ring, so arrowing onto it shows the same ring every control
 * shows. A hero's unlinked figure beside linked ones is the real-world shape of it.
 *
 * Deliberately plain markup rather than `ProductCard`, so what is tabbable is visible in the
 * story's own source: the parked `tabindex`es are applied in place by `useCarousel`, to whatever
 * the default slot renders.
 */
export const KeyboardFocus: Story = {
  render: () => ({
    components: { Carousel },
    setup: () => ({ titles: ['Merino crew', 'Lambswool throw', 'Latte mug'] }),
    template: `
      <Carousel aria-label="Bestsellers" :per-view="{ base: 1.25, md: 3 }" class="max-w-2xl">
        <template #header>
          <h2 class="text-h4 text-text">Bestsellers</h2>
        </template>
        <li
          v-for="title in titles"
          :key="title"
          class="list-none rounded-lg border border-border bg-surface p-4"
        >
          <a :href="'#' + title" class="text-body text-text eldra-focus block font-semibold">{{ title }}</a>
          <button type="button" class="text-body-sm text-muted eldra-focus mt-3 cursor-pointer underline">
            Save
          </button>
        </li>
        <li class="list-none rounded-lg border border-border bg-surface p-4">
          <p class="text-body text-text font-semibold">Gift card</p>
          <p class="text-body-sm text-muted mt-3">Back in stock soon</p>
        </li>
      </Carousel>
    `,
  }),
};

/** `controls: "below"`, `dots` and `counter`: the single-slide gallery variant. */
export const Gallery: Story = {
  render: () => ({
    components: { Carousel },
    setup: () => ({ images: COLOURS.slice(0, 4) }),
    template: `
      <Carousel aria-label="Photo gallery" controls="below" dots counter :per-view="1" class="max-w-md">
        <figure
          v-for="([fill, accent], i) in images"
          :key="i"
          class="m-0 aspect-4/3 w-full overflow-hidden rounded-lg"
          :style="{ background: fill }"
        >
          <div class="flex h-full w-full items-center justify-center" :style="{ color: accent }">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        </figure>
      </Carousel>
    `,
  }),
};

/**
 * Autoplay, opt-in (spec "Carousel" → Variants, "Autoplay"): the single-slide gallery plus a
 * mandatory Pause/Play button. Paused immediately on mount (`carousel.value?.pause()`) so
 * `scripts/screenshots.mjs` never captures it mid-transition — a running interval would land the
 * shutter on whichever slide the fixed settle delay happened to catch, which is not a stable
 * baseline. The Pause/Play button still renders exactly as it would mid-playback.
 */
export const Autoplay: Story = {
  render: () => ({
    components: { Carousel },
    setup: () => {
      const carousel = ref<InstanceType<typeof Carousel> | null>(null);
      onMounted(() => carousel.value?.pause());
      return { carousel, images: COLOURS.slice(0, 4) };
    },
    template: `
      <Carousel
        ref="carousel"
        aria-label="Photo gallery"
        controls="below"
        dots
        counter
        :autoplay="6000"
        :per-view="1"
        class="max-w-md"
      >
        <figure
          v-for="([fill, accent], i) in images"
          :key="i"
          class="m-0 aspect-4/3 w-full overflow-hidden rounded-lg"
          :style="{ background: fill }"
        >
          <div class="flex h-full w-full items-center justify-center" :style="{ color: accent }">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        </figure>
      </Carousel>
    `,
  }),
};

/** Long slide content — a testimonial-shaped card wider than its own slide — stays inside the
 *  track's own scroll-snap box rather than pushing it wider. */
export const LongContent: Story = {
  render: () => ({
    components: { Carousel },
    setup: () => ({
      quotes: [
        'The merino sweater is the softest thing I own, and it still looks new after a whole winter of daily wear.',
        'Fast shipping and the packaging alone made it feel like a gift. Would order again in every colour.',
        'I was skeptical about buying homeware online, but the ceramic set is even better in person than in photos.',
      ],
    }),
    template: `
      <Carousel aria-label="Customer quotes" controls="below" dots counter :per-view="1" class="max-w-md">
        <figure v-for="(quote, i) in quotes" :key="i" class="m-0 rounded-lg border border-border bg-surface p-6">
          <blockquote class="text-body text-text">“{{ quote }}”</blockquote>
        </figure>
      </Carousel>
    `,
  }),
};

/** A 20rem container (1.4.10): the track scrolls inside itself, nothing overflows the page, and a
 *  peek of the next card shows at the default `perView`. */
export const Narrow: Story = {
  render: () => ({
    components: { Carousel, ProductCard },
    setup: () => ({ products: PRODUCTS.slice(0, 4) }),
    template: `
      <div class="w-80">
        <Carousel aria-label="Bestsellers">
          <template #header>
            <h2 class="text-h4 text-text">Bestsellers</h2>
          </template>
          <li v-for="product in products" :key="product.url" class="list-none">
            <ProductCard :product="product" />
          </li>
        </Carousel>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation: the track's own
 * `motion-reduce:scroll-auto` swaps in for `scroll-smooth`, and `useCarousel`'s own
 * `prefersReducedMotion()` check means a programmatic scroll (an arrow, a dot) jumps instead of
 * animating. Renders identically to `Gallery` under that emulation, which is the point.
 */
export const ReducedMotion: Story = {
  render: () => ({
    components: { Carousel },
    setup: () => ({ images: COLOURS.slice(0, 4) }),
    template: `
      <Carousel aria-label="Photo gallery" controls="below" dots counter :per-view="1" class="max-w-md">
        <figure
          v-for="([fill, accent], i) in images"
          :key="i"
          class="m-0 aspect-4/3 w-full overflow-hidden rounded-lg"
          :style="{ background: fill }"
        >
          <div class="flex h-full w-full items-center justify-center" :style="{ color: accent }">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        </figure>
      </Carousel>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the arrow and dot rings stay real borders,
 * the current dot's fill switches to `CanvasText` (see `tailwind.css`'s own forced-colours rule
 * for `eldra-carousel-dot`), and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Carousel },
    setup: () => ({ images: COLOURS.slice(0, 4) }),
    template: `
      <Carousel aria-label="Photo gallery" controls="below" dots counter :per-view="1" class="max-w-md">
        <figure
          v-for="([fill, accent], i) in images"
          :key="i"
          class="m-0 aspect-4/3 w-full overflow-hidden rounded-lg"
          :style="{ background: fill }"
        >
          <div class="flex h-full w-full items-center justify-center" :style="{ color: accent }">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
        </figure>
      </Carousel>
    `,
  }),
};
