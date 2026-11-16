// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { compile } from '@tailwindcss/node';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileKitCss } from '../../test/kitCss';

/**
 * **Does a consumer's `shadow-*` keep the focus ring?**
 *
 * Every Tailwind `shadow-*` utility writes the whole `box-shadow` list and fills only its own
 * variable. `eldra-focus` draws through the same list, its infill in `--tw-ring-offset-shadow` and
 * its ring in `--tw-ring-shadow`, so a consumer's `shadow-md` from its own, later `utilities` layer
 * rewrites the list and still paints the ring, with the shadow under it. When the ring declared a
 * `box-shadow` of its own, that same utility replaced it and a focused link card showed nothing.
 *
 * The kit's real stylesheet, a separate consumer Tailwind build appended after it, a real `Tab`
 * press, and a pixel sampled in the ring's band. Chromium comes from `@playwright/test`, as for
 * the kit's other browser specs.
 */

const base = fileURLToPath(new NodeURL('../', import.meta.url));

/** The consumer's own Tailwind: its `utilities` layer comes after the kit's `components` layer. */
async function consumerCss(candidates: string[]): Promise<string> {
  const compiler = await compile(`@import 'tailwindcss';`, { base, onDependency() {} });
  return compiler.build(candidates);
}

/** Brightness of a 1x1 PNG (see `tabsRing.browser.spec.ts` for why this is the whole decoder). */
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

let browser: Browser;
let css: string;

beforeAll(async () => {
  browser = await chromium.launch();
  css =
    (await compileKitCss(['eldra:eldra-focus'])) + (await consumerCss(['shadow-md', 'shadow-xs']));
});

afterAll(async () => {
  await browser?.close();
});

async function open(classes: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 400, height: 200 },
    reducedMotion: 'reduce',
  });
  await page.setContent(
    `<style>${css}</style><main style="padding:40px;background:#fff">` +
      `<a href="#" class="eldra:eldra-focus ${classes}" style="display:block;width:200px;height:40px;background:#fff">Card</a></main>`,
    { waitUntil: 'domcontentloaded' }
  );
  await page.keyboard.press('Tab');
  return page;
}

async function read(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      focusVisible: el.matches(':focus-visible'),
      boxShadow: style.boxShadow,
      reach:
        parseFloat(style.getPropertyValue('--eldra-focus-offset')) +
        parseFloat(style.getPropertyValue('--eldra-focus-width')),
      box: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
}

describe('the focus ring beside a consumer shadow-* utility', () => {
  for (const shadow of ['shadow-md', 'shadow-xs']) {
    it(`keeps the ring and draws the ${shadow} under it`, async () => {
      const page = await open(shadow);
      const m = await read(page);
      expect(m.tag).toBe('A');
      expect(m.focusVisible).toBe(true);

      // The ring's band (4px spread by default) and the consumer's own offset shadow, in one list.
      expect(m.boxShadow).toMatch(/0px 0px 0px 4px/);
      expect(m.boxShadow).toMatch(/0px [1-9]\d*px [1-9]\d*px/);

      // And it paints: one pixel inside the ring's outer edge, left of the card, is the dark ring.
      const at = m.reach - 1;
      const png = await page.screenshot({
        clip: {
          x: Math.round(m.box.x) - at,
          y: Math.round(m.box.y + m.box.height / 2),
          width: 1,
          height: 1,
        },
      });
      expect(decodeBrightness(png)).toBeLessThan(128);
      await page.close();
    });
  }
});
