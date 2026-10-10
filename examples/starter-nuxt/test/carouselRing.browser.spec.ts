// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { flushPromises, mount } from '@vue/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Block from '../blocks/product-carousel/Block.vue';
import mock from '../blocks/product-carousel/mock.json';
import { mountOptions } from './support/mountBlock';

/**
 * **Does the focused card's ring actually paint, and is any edge of it still clipped?**
 *
 * Every other spec for this answers a question about classes or about declarations. Neither can see
 * the two defects this one exists for, and both were live on a deployed preview at once:
 *
 *  1. The first card's ring was cut off flat down its **left** edge while the top and right edges
 *     drew — the carousel track clips its slides' rings (`overflow-x-auto` forces `overflow-y` to
 *     compute `auto` as well), and the block's own bleed utilities had taken the inline half of the
 *     track's ring reservation away in the cascade.
 *  2. A probe that reported the ring "computed but invisible". `eldra-focus` always declares its
 *     two-tone `box-shadow`; what moves is `--eldra-focus-alpha`, and it only leaves 0 under
 *     `:focus-visible`. Focus moved by script (`element.focus()`) is not `:focus-visible` on a link,
 *     so reading the computed shadow proves nothing about what a shopper sees.
 *
 * So the markup is the real block's, the stylesheet is the theme's real Tailwind build, focus is
 * reached with **real `Tab` presses** from the top of the document, and the assertion is about
 * **pixels**: the same point 5px outside the card is sampled before and after focus, so the ring
 * has to actually change the screen. No Nuxt build is involved — `test/prerenderRefresh.browser.
 * spec.ts` is the spec that needs one; this one needs a browser's cascade, focus model and painter.
 *
 * Chromium comes from `@playwright/test`, the same dependency and the same one-off
 * `pnpm exec playwright install --with-deps chromium` the starter's other browser spec needs.
 */

/** The ring, from `tokens.css`: a 4px `focus-inner` gap, then 2px of `focus` colour. */
const RING_OUTER_AT = 5;
const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;

/**
 * A 1x1 PNG, which is all a pixel sample needs — and at one pixel every PNG filter type reduces to
 * the raw bytes (Sub/Up/Average/Paeth all read neighbours that do not exist and are therefore 0),
 * so this is the whole decoder: find `IDAT`, inflate, skip the scanline's filter byte.
 */
function decodePixel(png: Buffer): { r: number; g: number; b: number } {
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
  return { r: raw[1]!, g: raw[2]!, b: raw[3]! };
}

async function samplePixel(
  page: Page,
  x: number,
  y: number
): Promise<{ r: number; g: number; b: number }> {
  return decodePixel(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
}

/** Near-black `--eldra-color-focus` against a near-white page: one number tells them apart. */
function brightness({ r, g, b }: { r: number; g: number; b: number }): number {
  return (r + g + b) / 3;
}

describe('a focused card in the product carousel', () => {
  let browser: Browser;
  let page: Page;
  /** The card that holds the first slide's own entry point, as the browser laid it out. */
  let card: { x: number; y: number; width: number; height: number };

  beforeAll(async () => {
    // The real block, mounted the way every other block spec mounts one — so the markup carries the
    // tab-index parking and the ring classes `useCarousel` writes, not a hand-written stand-in.
    const wrapper = mount(Block, mountOptions({ entry: { id: 'ring', data: mock } }));
    await flushPromises();
    const html = wrapper.html();
    wrapper.unmount();

    // The theme's real stylesheet, built over exactly the classes this markup uses.
    const candidates = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      match[1]!.split(/\s+/).filter(Boolean)
    );
    const compiler = await compile(readFileSync(`${assetsDir}main.css`, 'utf8'), {
      base: assetsDir,
      onDependency() {},
    });
    const css = compiler.build([...new Set(candidates)]);

    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    // Nothing is fetched: the demo imagery is remote, and the ring owes nothing to it. Reduced
    // motion above is what makes the ring's own alpha transition land before the screenshot.
    await page.route('**', (route) => route.abort());
    await page.setContent(`<style>${css}</style><main>${html}</main>`, {
      waitUntil: 'domcontentloaded',
    });

    const box = await page
      .locator('[data-part="slide"]')
      .first()
      .locator('article')
      .first()
      .boundingBox();
    if (!box) throw new Error('the first card never laid out');
    card = box;
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('paints no ring until something is focused', async () => {
    const left = await samplePixel(
      page,
      Math.round(card.x) - RING_OUTER_AT,
      Math.round(card.y) + 40
    );
    expect(brightness(left)).toBeGreaterThan(200);
  });

  /**
   * Tab, never `.focus()` — `:focus-visible` is the whole question. The roving focus model gives the
   * carousel one entry point, so a handful of presses reaches the first card's own link.
   */
  it('reaches the first card with the keyboard, and the card itself takes the ring', async () => {
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () =>
          document.activeElement?.closest('[data-part="slide"]')?.matches(':first-child') === true
      );
      if (inside) break;
    }
    const state = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      const ringed = active.closest('.eldra-focus') as HTMLElement | null;
      return {
        focusedTag: active.tagName,
        focusVisible: active.matches(':focus-visible'),
        // The ring is on the card, not on the focused link inside it: `eldra-focus-proxy`'s
        // `:has(:focus-visible)` is what lights it from the link's own focus.
        ringedPart: ringed?.getAttribute('data-part'),
        ringedProxy: ringed?.classList.contains('eldra-focus-proxy'),
        alpha: ringed
          ? getComputedStyle(ringed).getPropertyValue('--eldra-focus-alpha').trim()
          : null,
      };
    });
    expect(state.focusedTag).toBe('A');
    expect(state.focusVisible).toBe(true);
    expect(state.ringedPart).toBe('root');
    expect(state.ringedProxy).toBe(true);
    expect(state.alpha).toBe('1');
  });

  /**
   * The pixels. `left` is the edge that was clipped on the deployed site and the reason this file
   * exists; `top` and `right` drew even then, and are here so a regression that loses the ring
   * everywhere reads differently from one that loses an axis. Proven by mutation: putting the old
   * `px-[gutter] … @tablet:px-0` bleed back on the track turns `left` back into the page colour
   * while `top` and `right` stay dark.
   */
  it('draws ring pixels outside every edge of the focused card', async () => {
    const y = Math.round(card.y) + 40;
    const x = Math.round(card.x) + 40;
    const left = await samplePixel(page, Math.round(card.x) - RING_OUTER_AT, y);
    const top = await samplePixel(page, x, Math.round(card.y) - RING_OUTER_AT);
    const right = await samplePixel(page, Math.round(card.x + card.width) + RING_OUTER_AT - 1, y);
    for (const [edge, pixel] of [
      ['left', left],
      ['top', top],
      ['right', right],
    ] as const) {
      expect(`${edge}: ${brightness(pixel) < 128}`).toBe(`${edge}: true`);
    }
  });
});
