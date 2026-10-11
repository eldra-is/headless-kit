// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import RangeSlider from '../RangeSlider.vue';

/**
 * **Does a focused thumb's ring fit inside the control, and is the touch target really 44px?**
 *
 * Two things no class or declaration assertion can see, both of them geometry:
 *
 * 1. A thumb is centred on its value, so the minimum thumb at `min` has half its own width hanging
 *    past the start of the track — and its focus ring hangs a further `--eldra-focus-offset` +
 *    `--eldra-focus-width` past that. The group reserves that room as a `padding-inline` computed
 *    from those same variables (`eldra-range-gutter`). Reserve half a thumb and no more (the
 *    obvious version) and the ring is cut off by whatever clips the control — a 15rem filter
 *    sidebar, a scrolling drawer — on the one thumb most likely to be focused first. Raise either
 *    ring token (a `Carousel` sets `--eldra-focus-offset: 4px` for its slides, and a plain custom
 *    property inherits into everything inside it) and a literal reservation is wrong again.
 * 2. The 2.5.8 target is a **container-query** switch: `target-touch` below the tablet width,
 *    `target-min` from it, on the rail and on each thumb's own hit area (a `::after` box that
 *    paints nothing). A `@container` rule whose breakpoint or container context is wrong compiles
 *    to silence — no error, no rule — and the control simply has 24px targets on a phone.
 *
 * So, modelled on `tabs/__tests__/tabsRing.browser.spec.ts`:
 *
 * - the markup is the real component's, rendered by Vue, not a hand-written stand-in;
 * - the stylesheet is this package's real Tailwind build over exactly those classes;
 * - focus is reached with a **real `Tab` press** from the top of the document, never
 *   `element.focus()` — `:focus-visible` is the whole question, and `eldra-focus` always declares
 *   its two-tone `box-shadow`; what moves is `--eldra-focus-alpha`, which leaves `0` only under
 *   `:focus-visible`;
 * - and the assertions are geometry **plus pixels**: the ring's band is sampled outside each edge
 *   of the focused thumb, so a reservation that exists in the cascade without holding the ring
 *   open still fails.
 *
 * Chromium comes from `@playwright/test`, the same dependency and the same one-off
 * `pnpm exec playwright install --with-deps chromium` the kit's other browser specs need.
 */

/** Narrow enough to be below the 48rem tablet edge, wide enough to drag in. */
const NARROW_WIDTH = 320;
/** Comfortably past 48rem (768px), so the same markup takes the other branch. */
const WIDE_WIDTH = 900;

const stylesDir = fileURLToPath(new URL('../../../styles/', import.meta.url));

/**
 * The real component's HTML, with the minimum thumb at the very start of the track — the position
 * whose ring has the least room, and the one a single `Tab` press lands on.
 *
 * Rendered through Vue's own server renderer, in a `node` environment, rather than mounted into a
 * DOM: the spec needs the component's real markup and a *browser*, and nothing in between.
 * `environment: node` is also what keeps Playwright's driver connection intact — under this
 * package's default happy-dom, closing the browser raises an unhandled `ECONNRESET` that vitest
 * reports as a worker crash rather than a test result.
 */
async function render(value: [number, number] = [0, 60]): Promise<string> {
  return renderToString(
    createSSRApp(() =>
      h(RangeSlider, { label: 'Price', modelValue: value, min: 0, max: 100, inputs: true })
    )
  );
}

/**
 * A 1x1 PNG, which is all a pixel sample needs — and at one pixel every PNG filter type reduces to
 * the raw bytes, so this is the whole decoder: find `IDAT`, inflate, skip the scanline's filter
 * byte. The same decoder `tabsRing.browser.spec.ts` carries, for the same reason.
 */
function decodeBrightness(png: Buffer): number {
  let pos = 8;
  let channels = 4;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') channels = data[9] === 6 ? 4 : 3;
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < 1 + channels) throw new Error('screenshot carried no pixel');
  return (raw[1]! + raw[2]! + raw[3]!) / 3;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Measured {
  /** Which thumb a real `Tab` press reached. */
  focusedLabel: string;
  focusVisible: boolean;
  /** `1` only under `:focus-visible` — see the file comment. */
  alpha: string;
  /** `--eldra-focus-offset` + `--eldra-focus-width`, as the focused thumb resolves them. */
  reach: number;
  /** How much room is left between the ring's outer edge and the control's own box, per side. */
  slack: { left: number; right: number };
  thumb: Box;
  /** The thumb's own pointer target (its `::after` box), per 2.5.8. */
  target: { width: string; height: string };
  /** The rail's own height — the band a press lands in. */
  railHeight: number;
}

let browser: Browser;
let css: string;

/** One page per case; the caller closes it. A fresh document is the only way to press `Tab` from
 *  the top of the tab order again. */
async function openWith(width: number, rootStyle = ''): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 500 },
    reducedMotion: 'reduce',
  });
  await page.setContent(
    `<style>${css}</style><main style="padding:40px"><div style="width:${width}px;${rootStyle}">${await render()}</div></main>`,
    { waitUntil: 'domcontentloaded' }
  );
  return page;
}

/**
 * The same markup at a real 320px viewport with **no page padding at all** — the narrowest reflow
 * WCAG 1.4.10 asks about, and the filter drawer's own width on a phone. `openWith`'s 40px of
 * `<main>` padding would absorb exactly the overflow this measures.
 */
async function openFullWidth(width: number, value: [number, number] = [0, 100]): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width, height: 500 },
    reducedMotion: 'reduce',
  });
  await page.setContent(
    `<style>${css}\nhtml,body{margin:0;padding:0}</style>${await render(value)}`,
    { waitUntil: 'domcontentloaded' }
  );
  return page;
}

async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-part="root"]') as HTMLElement;
    const rail = document.querySelector('[data-part="rail"]') as HTMLElement;
    const active = document.activeElement as HTMLElement;
    const activeStyle = getComputedStyle(active);
    const after = getComputedStyle(active, '::after');
    const reach =
      parseFloat(activeStyle.getPropertyValue('--eldra-focus-offset')) +
      parseFloat(activeStyle.getPropertyValue('--eldra-focus-width'));
    const rootBox = root.getBoundingClientRect();
    const thumbBox = active.getBoundingClientRect();
    return {
      focusedLabel: active.getAttribute('aria-label') ?? '',
      focusVisible: active.matches(':focus-visible'),
      alpha: activeStyle.getPropertyValue('--eldra-focus-alpha').trim(),
      reach,
      slack: {
        left: +(thumbBox.x - reach - rootBox.x).toFixed(2),
        right: +(rootBox.x + rootBox.width - (thumbBox.x + thumbBox.width + reach)).toFixed(2),
      },
      thumb: { x: thumbBox.x, y: thumbBox.y, width: thumbBox.width, height: thumbBox.height },
      target: { width: after.width, height: after.height },
      railHeight: rail.getBoundingClientRect().height,
    };
  });
}

/** The ring's own outer band, one pixel in from its outside edge, on each side of the thumb. */
async function ringPixels(
  page: Page,
  { thumb, reach }: { thumb: Box; reach: number }
): Promise<Record<'left' | 'right' | 'top' | 'bottom', number>> {
  const at = reach - 1;
  const midX = Math.round(thumb.x + thumb.width / 2);
  const midY = Math.round(thumb.y + thumb.height / 2);
  const sample = async (x: number, y: number): Promise<number> =>
    decodeBrightness(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return {
    left: await sample(Math.round(thumb.x) - at, midY),
    right: await sample(Math.round(thumb.x + thumb.width) + at - 1, midY),
    top: await sample(midX, Math.round(thumb.y) - at),
    bottom: await sample(midX, Math.round(thumb.y + thumb.height) + at - 1),
  };
}

/** The minimum thumb's own box with nothing focused — `document.activeElement` is `<body>` then,
 *  whose rect is the whole page. */
async function restingThumb(page: Page): Promise<{ thumb: Box; reach: number }> {
  return page.evaluate(() => {
    const thumb = document.querySelector('[data-thumb="min"]') as HTMLElement;
    const style = getComputedStyle(thumb);
    const box = thumb.getBoundingClientRect();
    return {
      thumb: { x: box.x, y: box.y, width: box.width, height: box.height },
      reach:
        parseFloat(style.getPropertyValue('--eldra-focus-offset')) +
        parseFloat(style.getPropertyValue('--eldra-focus-width')),
    };
  });
}

/** Near-black `--eldra-color-focus` against a near-white page: one number tells them apart. */
const RING = 128;
/**
 * The side of each thumb that the **filled range** lies against: `primary`, as dark as the ring
 * itself, focused or not. A pixel there says nothing about a ring, so each thumb is sampled on its
 * other three edges — the minimum thumb proves the left flank and the maximum thumb the right one,
 * and the ring's geometry on the excluded side is covered by the `slack` assertions instead.
 */
const AGAINST_THE_FILL = { min: 'right', max: 'left' } as const;

/** The three edges of one thumb a ring pixel can actually be read from. */
function ringEdges(pixels: Record<string, number>, thumb: 'min' | 'max'): Array<[string, number]> {
  return Object.entries(pixels).filter(([edge]) => edge !== AGAINST_THE_FILL[thumb]);
}
/** `--eldra-target-touch` and `--eldra-target-min` at a 16px root. */
const TOUCH = '44px';
const MIN_TARGET = '24px';

beforeAll(async () => {
  // The package's real Tailwind entry — `@theme`, the `--eldra-*` tokens it imports, the
  // `eldra-focus` ring and the range slider's own utilities — compiled over exactly the classes
  // this markup uses.
  const candidates = new Set<string>();
  const html = await render();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
  }
  const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';\n`, {
    base: stylesDir,
    onDependency() {},
  });
  css = compiler.build([...candidates]);
  browser = await chromium.launch();
}, 120_000);

// Generous, and deliberately not the default 10s: this runs alongside the kit's other browser
// specs in one `pnpm test`, and tearing a browser down while other Chromiums and 250 workers are
// competing for the machine is not a 10s operation.
afterAll(async () => {
  await browser?.close();
}, 60_000);

describe('a focused range-slider thumb', () => {
  /**
   * Four things, in the order they have to hold:
   *
   * 1. with nothing focused, no ring is painted around the thumb — `eldra-focus` declares its
   *    shadow at all times, so this is what says the rest is measuring focus;
   * 2. one `Tab` press reaches the minimum thumb and it is `:focus-visible` with the alpha at `1`;
   * 3. the ring's box is inside the control's own box on both sides — including the left, where the
   *    thumb sits at `min` with half of itself already outside the track;
   * 4. and the ring's band is really painted outside all four edges.
   */
  it('keeps its ring inside the control at the start of the track', async () => {
    const page = await openWith(NARROW_WIDTH);
    try {
      const resting = await ringPixels(page, await restingThumb(page));
      for (const [edge, brightness] of ringEdges(resting, 'min')) {
        expect(`${edge} at rest: ${brightness > RING}`).toBe(`${edge} at rest: true`);
      }

      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.focusedLabel).toBe('Minimum Price');
      expect(state.focusVisible).toBe(true);
      expect(state.alpha).toBe('1');

      for (const [edge, slack] of Object.entries(state.slack)) {
        expect(`${edge} slack: ${slack >= 0}`).toBe(`${edge} slack: true`);
      }
      const pixels = await ringPixels(page, state);
      for (const [edge, brightness] of ringEdges(pixels, 'min')) {
        expect(`${edge} pixel: ${brightness < RING}`).toBe(`${edge} pixel: true`);
      }
    } finally {
      await page.close();
    }
  });

  /**
   * **The reservation itself.** `--eldra-focus-offset: 4px` is not a hypothetical: it is what
   * `Carousel`'s own track sets for its slides, and a plain custom property inherits, so a slider
   * anywhere inside one resolves a 6px reach. Proven by mutation: with the gutter at half a thumb
   * and no ring allowance (`padding-inline: calc(var(--eldra-range-thumb-size, 1.25rem) / 2)`),
   * both this case and the one above fail on the left edge.
   */
  it('holds the ring inside the control when the ring tokens are raised', async () => {
    const page = await openWith(NARROW_WIDTH, '--eldra-focus-offset:4px');
    try {
      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.reach).toBe(6);
      for (const [edge, slack] of Object.entries(state.slack)) {
        expect(`${edge} slack: ${slack >= 0}`).toBe(`${edge} slack: true`);
      }
      const pixels = await ringPixels(page, state);
      for (const [edge, brightness] of ringEdges(pixels, 'min')) {
        expect(`${edge} pixel: ${brightness < RING}`).toBe(`${edge} pixel: true`);
      }
    } finally {
      await page.close();
    }
  });

  /** Both ends are reachable by keyboard, and the second one draws the same ring. */
  it('reaches the maximum thumb with a second Tab press, ringed the same way', async () => {
    const page = await openWith(NARROW_WIDTH);
    try {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.focusedLabel).toBe('Maximum Price');
      expect(state.focusVisible).toBe(true);
      const pixels = await ringPixels(page, state);
      for (const [edge, brightness] of ringEdges(pixels, 'max')) {
        expect(`${edge} pixel: ${brightness < RING}`).toBe(`${edge} pixel: true`);
      }
      // ...and the typed field is the next stop after the two thumbs.
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('data-input'))).toBe(
        'min'
      );
    } finally {
      await page.close();
    }
  });
});

describe('the range slider pointer target', () => {
  it('is 44px below the tablet width, on the rail and on the thumb itself', async () => {
    const page = await openWith(NARROW_WIDTH);
    try {
      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.target).toEqual({ width: TOUCH, height: TOUCH });
      expect(state.railHeight).toBeGreaterThanOrEqual(44);
      // The thumb itself stays the spec's 1.25rem circle: the target is the invisible box around it.
      expect(state.thumb.width).toBe(20);
      expect(state.thumb.height).toBe(20);
    } finally {
      await page.close();
    }
  });

  /**
   * The other side of the container query, which is what proves it is a query at all: the same
   * markup in a wide container takes the `target-min` branch. A `@container` rule with the wrong
   * breakpoint, or with no container context to measure against, compiles to silence — so without
   * this case a stuck-at-44px (or stuck-at-24px) control passes the case above either way.
   */
  it('is the 24px floor from the tablet width up', async () => {
    const page = await openWith(WIDE_WIDTH);
    try {
      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.target).toEqual({ width: MIN_TARGET, height: MIN_TARGET });
      expect(state.railHeight).toBeGreaterThanOrEqual(24);
      expect(state.railHeight).toBeLessThan(44);
    } finally {
      await page.close();
    }
  });
});

describe('the range slider at a 320px viewport', () => {
  /**
   * **Reflow (1.4.10), and the section's own acceptance line.** Each thumb's pointer target is a
   * `::after` box centred on the thumb, so below the tablet width it reaches
   * `--eldra-target-touch / 2` = 22px past the end of the track — further than the focus ring's own
   * 4px. The gutter has to reserve whichever of the two is larger, per side, or the maximum thumb at
   * `max` pushes the difference out of the document and a phone gains a horizontal scrollbar with
   * nothing to pan to.
   *
   * Both thumbs sit at a bound here (`[0, 100]`, the default a freshly rendered filter has): the
   * minimum thumb's target overhangs the start, which is not scrollable in a left-to-right document,
   * and the maximum thumb's overhangs the end, which is. Only the second one shows up in
   * `scrollWidth`, so the case that would catch this has to put a thumb at `max`.
   *
   * Measured as the document's own overflow rather than as a slack number: that is the condition
   * the success criterion states, and it is what the ring-slack assertions above could not see.
   * Proven by mutation: with the gutter at the ring's reach alone
   * (`max()` dropped, leaving `calc(thumb/2 + offset + width)`), `scrollWidth` is 328 against a
   * `clientWidth` of 320, and hiding only `[data-part="thumb"]::after` accounts for all 8px.
   */
  it('fits with no horizontal scroll, thumb targets included', async () => {
    const page = await openFullWidth(320);
    try {
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          // The widest box in the tree, for a failure that says which part is responsible.
          widest: Math.max(
            ...[...document.querySelectorAll('*')].map((el) => el.getBoundingClientRect().right)
          ),
        };
      });
      expect(`scrollWidth ${overflow.scrollWidth} / clientWidth ${overflow.clientWidth}`).toBe(
        `scrollWidth ${overflow.clientWidth} / clientWidth ${overflow.clientWidth}`
      );
      expect(overflow.widest).toBeLessThanOrEqual(overflow.clientWidth);
    } finally {
      await page.close();
    }
  });

  /** And the thumb target is still the full 44px there — the gutter grew, the target did not shrink. */
  it('keeps the 44px thumb target while it fits', async () => {
    const page = await openFullWidth(320);
    try {
      await page.keyboard.press('Tab');
      const state = await measure(page);
      expect(state.target).toEqual({ width: TOUCH, height: TOUCH });
      expect(state.railHeight).toBeGreaterThanOrEqual(44);
    } finally {
      await page.close();
    }
  });
});
