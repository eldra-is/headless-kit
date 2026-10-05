// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import Tabs from '../Tabs.vue';

/**
 * **Is the focused tab's ring actually inside the scrolling tab list, and does it paint?**
 *
 * The list is `overflow-x-auto`, which forces `overflow-y` to compute `auto` as well — a scroll
 * container cannot mix `visible` with a non-`visible` axis — so it clips anything a tab paints
 * outside its own border box, on every side. A pills tab's `eldra-focus` ring is exactly that, and
 * the reservation that used to hold it open was the literal `p-1`/`-m-1`: `4px`, which is precisely
 * what the two ring tokens add up to by default, so the ring sat flush against the clip edge with
 * no slack at all. Raise either token — a consumer restyling the indicator, or this package's own
 * `Carousel` track, which sets `[--eldra-focus-offset:4px]` for its slides and whose value every
 * descendant inherits — and the ring is cut off flat by the difference on every edge. The fix sizes
 * the reservation from the tokens themselves; this is what measures it.
 *
 * No class or declaration assertion can see any of this, so, modelled on the starter's own
 * `carouselRing.browser.spec.ts`:
 *
 * - the markup is the real component's, rendered by Vue, not a hand-written stand-in;
 * - the stylesheet is this package's real Tailwind build over exactly those classes;
 * - focus is reached with a **real `Tab` press** from the top of the document, never
 *   `element.focus()` — `:focus-visible` is the whole question, and `eldra-focus` always declares
 *   its two-tone `box-shadow`; what moves is `--eldra-focus-alpha`, which leaves `0` only under
 *   `:focus-visible`, so reading the computed shadow proves nothing about what a visitor sees;
 * - and the assertions are geometry **plus pixels**: the ring's own band is sampled outside each
 *   edge of the focused tab, so a reservation that merely exists in the cascade without holding the
 *   ring open still fails.
 *
 * Chromium comes from `@playwright/test`, the same dependency and the same one-off
 * `pnpm exec playwright install --with-deps chromium` the kit's other browser specs need.
 */

/** Wide enough labels and a narrow enough host that the list really scrolls. */
const ITEMS = [
  { value: 'knitwear', title: 'Knitwear', content: 'Knitwear panel' },
  { value: 'ceramics', title: 'Ceramics', content: 'Ceramics panel' },
  { value: 'kitchen', title: 'Kitchen', content: 'Kitchen panel' },
  { value: 'glassware', title: 'Glassware', content: 'Glassware panel' },
  { value: 'lighting', title: 'Lighting', content: 'Lighting panel' },
];
const HOST_WIDTH = 320;

const stylesDir = fileURLToPath(new URL('../../../styles/', import.meta.url));

/**
 * The real component's HTML for one variant with one tab selected. `modelValue` rather than a click:
 * the roving tabindex is what decides where a `Tab` press lands, and it follows the selection.
 *
 * Rendered through Vue's own server renderer, in a `node` environment, rather than mounted into a
 * DOM — the spec needs the component's real markup and a *browser*, and nothing in between.
 * `environment: node` is also what keeps Playwright's driver connection intact: under this
 * package's default happy-dom environment, closing the browser raises an unhandled `ECONNRESET` on
 * that connection, which vitest reports as a worker crash rather than a test result.
 */
async function render(variant: 'pills' | 'underline', selected: string): Promise<string> {
  return renderToString(
    createSSRApp(() =>
      h(Tabs, { items: ITEMS, variant, modelValue: selected, ariaLabel: 'Collections' })
    )
  );
}

/**
 * A 1x1 PNG, which is all a pixel sample needs — and at one pixel every PNG filter type reduces to
 * the raw bytes (Sub/Up/Average/Paeth all read neighbours that do not exist and are therefore 0),
 * so this is the whole decoder: find `IDAT`, inflate, skip the scanline's filter byte. The same
 * decoder the starter's `carouselRing.browser.spec.ts` carries, for the same reason.
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
  /** Was the tab a real `Tab` press reached the one the roving tabindex points at? */
  focusedLabel: string;
  focusVisible: boolean;
  /** `1` only under `:focus-visible` — see the file comment. */
  alpha: string;
  /** `--eldra-focus-offset` + `--eldra-focus-width`, as the focused tab resolves them. */
  reach: number;
  /** How much room is left between the ring's outer edge and the list's clip edge, per side. */
  slack: { left: number; right: number; top: number; bottom: number };
  tab: Box;
  listPaddingBlock: string[];
  /** The list's own 1px hairline, for the underline variant: where it sits relative to the tabs. */
  hairlineGap: number;
}

let browser: Browser;
let css: string;

/**
 * One page per case: a fresh document is the only way to press `Tab` from the top again. They are
 * closed together by `browser.close()` in `afterAll` rather than one at a time — closing a page
 * while its own last screenshot request is still in flight raises an unhandled `ECONNRESET` on the
 * driver connection, which vitest reports as a worker crash rather than a test failure.
 */
async function openWith(variant: 'pills' | 'underline', selected: string, rootStyle = '') {
  const page = await browser.newPage({
    viewport: { width: 800, height: 400 },
    reducedMotion: 'reduce',
  });
  await page.setContent(
    `<style>${css}</style><main style="padding:40px"><div style="width:${HOST_WIDTH}px;${rootStyle}">${await render(variant, selected)}</div></main>`,
    { waitUntil: 'domcontentloaded' }
  );
  return page;
}

async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const list = document.querySelector('[data-part="list"]') as HTMLElement;
    const active = document.activeElement as HTMLElement;
    const activeStyle = getComputedStyle(active);
    const listStyle = getComputedStyle(list);
    const reach =
      parseFloat(activeStyle.getPropertyValue('--eldra-focus-offset')) +
      parseFloat(activeStyle.getPropertyValue('--eldra-focus-width'));
    // The list has no border in either variant's own classes, so its border box *is* the box that
    // clips: a scroll container clips its overflow at the padding box.
    const listBox = list.getBoundingClientRect();
    const tabBox = active.getBoundingClientRect();
    return {
      focusedLabel: active.textContent?.trim() ?? '',
      focusVisible: active.matches(':focus-visible'),
      alpha: activeStyle.getPropertyValue('--eldra-focus-alpha').trim(),
      reach,
      slack: {
        left: +(tabBox.x - reach - listBox.x).toFixed(2),
        right: +(listBox.x + listBox.width - (tabBox.x + tabBox.width + reach)).toFixed(2),
        top: +(tabBox.y - reach - listBox.y).toFixed(2),
        bottom: +(listBox.y + listBox.height - (tabBox.y + tabBox.height + reach)).toFixed(2),
      },
      tab: { x: tabBox.x, y: tabBox.y, width: tabBox.width, height: tabBox.height },
      listPaddingBlock: [listStyle.paddingTop, listStyle.paddingBottom],
      // The hairline is the list's own bottom border; this is how far below the tabs it draws.
      hairlineGap: +(listBox.y + listBox.height - (tabBox.y + tabBox.height)).toFixed(2),
    };
  });
}

/** The ring's own outer band, one pixel in from its outside edge, on each side of the focused tab. */
async function ringPixels(
  page: Page,
  { tab, reach }: { tab: Box; reach: number }
): Promise<Record<'left' | 'right' | 'top' | 'bottom', number>> {
  const at = reach - 1;
  const midX = Math.round(tab.x + tab.width / 2);
  const midY = Math.round(tab.y + tab.height / 2);
  const sample = async (x: number, y: number): Promise<number> =>
    decodeBrightness(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return {
    left: await sample(Math.round(tab.x) - at, midY),
    right: await sample(Math.round(tab.x + tab.width) + at - 1, midY),
    top: await sample(midX, Math.round(tab.y) - at),
    bottom: await sample(midX, Math.round(tab.y + tab.height) + at - 1),
  };
}

/** The selected tab's own box and ring reach, with nothing focused — `document.activeElement` is
 *  `<body>` then, whose rect is the whole page. */
async function restingTab(page: Page): Promise<{ tab: Box; reach: number }> {
  return page.evaluate(() => {
    const tab = document.querySelector('[data-part="tab"]') as HTMLElement;
    const style = getComputedStyle(tab);
    const box = tab.getBoundingClientRect();
    return {
      tab: { x: box.x, y: box.y, width: box.width, height: box.height },
      reach:
        parseFloat(style.getPropertyValue('--eldra-focus-offset')) +
        parseFloat(style.getPropertyValue('--eldra-focus-width')),
    };
  });
}

/** Near-black `--eldra-color-focus` against a near-white page: one number tells them apart. */
const RING = 128;

beforeAll(async () => {
  // The package's real Tailwind entry — `@theme`, the `--eldra-*` tokens it imports and the
  // `eldra-focus` utility itself — compiled over exactly the classes this markup uses.
  const candidates = new Set<string>();
  for (const html of [await render('pills', 'knitwear'), await render('underline', 'knitwear')]) {
    for (const match of html.matchAll(/class="([^"]*)"/g)) {
      for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
    }
  }
  const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';\n`, {
    base: stylesDir,
    onDependency() {},
  });
  css = compiler.build([...candidates]);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

describe('a focused pill in a scrolling tab list', () => {
  it('paints no ring until something is focused', async () => {
    const page = await openWith('pills', 'knitwear');
    const pixels = await ringPixels(page, await restingTab(page));
    // Page colour on every side: `eldra-focus` declares its shadow at all times, so this is what
    // says the ring assertions below are measuring focus rather than something always painted.
    expect(Math.min(...Object.values(pixels))).toBeGreaterThan(RING);
  });

  /**
   * `Tab`, never `.focus()`. The roving tabindex gives the list exactly one entry point — the
   * selected tab — so one press from the top of the document lands on it, wherever in the row it is
   * and however far the browser has to scroll the list to show it.
   */
  it.each([
    ['the first pill', 'knitwear'],
    ['the last pill', 'lighting'],
  ])('reaches %s with one real Tab press, and it takes a visible ring', async (_label, value) => {
    const page = await openWith('pills', value);
    await page.keyboard.press('Tab');
    const state = await measure(page);
    expect(state.focusedLabel).toBe(ITEMS.find((item) => item.value === value)!.title);
    expect(state.focusVisible).toBe(true);
    expect(state.alpha).toBe('1');
  });

  /**
   * The geometry: every edge of the ring's box has to be inside the box that clips it. `0` is a
   * pass — the reservation is exactly the ring's reach, by construction — and the pixel assertions
   * below are what keep "exactly flush" honest.
   */
  it.each([
    ['at the start of the scroll', 'knitwear'],
    ['at the end of the scroll', 'lighting'],
  ])('keeps the ring box inside the list, %s', async (_label, value) => {
    const page = await openWith('pills', value);
    await page.keyboard.press('Tab');
    const state = await measure(page);
    for (const [edge, slack] of Object.entries(state.slack)) {
      expect(`${edge}: ${slack >= 0}`).toBe(`${edge}: true`);
    }
  });

  it.each([
    ['at the start of the scroll', 'knitwear'],
    ['at the end of the scroll', 'lighting'],
  ])('draws ring pixels outside every edge of the focused pill, %s', async (_label, value) => {
    const page = await openWith('pills', value);
    await page.keyboard.press('Tab');
    const pixels = await ringPixels(page, await measure(page));
    for (const [edge, brightness] of Object.entries(pixels)) {
      expect(`${edge}: ${brightness < RING}`).toBe(`${edge}: true`);
    }
  });

  /**
   * **The regression itself.** `--eldra-focus-offset: 4px` is not a hypothetical: it is what
   * `Carousel`'s own track sets for its slides, and a plain custom property inherits, so a `Tabs`
   * anywhere inside one resolves a 6px reach. Against the old literal `p-1` that is a 2px band of
   * page colour where the ring should be, on three edges at once. Proven by mutation: putting
   * `gap-2 -m-1 p-1` back on the list fails this case (and only this case) on exactly those edges.
   */
  it.each([
    ['at the start of the scroll', 'knitwear'],
    ['at the end of the scroll', 'lighting'],
  ])('holds the ring open when the ring tokens are raised, %s', async (_label, value) => {
    const page = await openWith('pills', value, '--eldra-focus-offset:4px');
    await page.keyboard.press('Tab');
    const state = await measure(page);
    expect(state.reach).toBe(6);
    for (const [edge, slack] of Object.entries(state.slack)) {
      expect(`${edge} slack: ${slack >= 0}`).toBe(`${edge} slack: true`);
    }
    const pixels = await ringPixels(page, state);
    for (const [edge, brightness] of Object.entries(pixels)) {
      expect(`${edge} pixel: ${brightness < RING}`).toBe(`${edge} pixel: true`);
    }
  });
});

describe('a focused tab in the underline variant', () => {
  /**
   * The underline tab draws `eldra-focus-inset` — the spec's own answer for this list ("inset focus
   * ring … so the scrolling list never clips it") — so there is nothing outside the tab for the
   * list to clip, and the list gets no block-axis reservation at all. That is deliberate: padding
   * the list vertically would push its 1px hairline away from the tabs it underlines. Both halves
   * are asserted together, because the only reason not to reserve is that the ring is inside.
   */
  it('keeps the hairline against the tabs, and rings inside the tab', async () => {
    const page = await openWith('underline', 'knitwear');
    await page.keyboard.press('Tab');
    const state = await measure(page);
    expect(state.focusVisible).toBe(true);
    expect(state.alpha).toBe('1');
    expect(state.listPaddingBlock).toEqual(['0px', '0px']);
    // 1px of hairline and nothing else between the tab's bottom edge and the list's.
    expect(state.hairlineGap).toBe(1);
    // And the ring is painted inside the tab: the pixel just *outside* its edge is page colour.
    const outside = await ringPixels(page, state);
    expect(outside.top).toBeGreaterThan(RING);
  });
});
