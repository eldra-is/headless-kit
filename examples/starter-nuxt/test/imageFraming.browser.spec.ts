// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { mount } from '@vue/test-utils';
import { imageFramingStyle, type ImageFraming } from '@eldrajs/theme-vue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import UiImage from '../app/components/ui/UiImage.vue';

// Studio previews a framing with theme-core's imageFramingStyle; UiImage must draw the same pixels, out-of-band framings too.

const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;
const PICTURE = 'https://picture.test/frame.png';

const FRAMINGS: Array<ImageFraming | null> = [
  null,
  { x: 0.5, y: 0.5, zoom: 1.6 },
  { x: 0.2, y: 0.6, zoom: 2 },
  { x: 0.05, y: 0.95, zoom: 3.5 },
  { x: 1, y: 0, zoom: 4 },
  { x: 0, y: 1, zoom: 2.5 },
];
const ASPECTS = ['16/9', '1/1', '4/5'];
const CASES = ASPECTS.flatMap((aspect) => FRAMINGS.map((framing) => ({ aspect, framing })));

const styleText = (style: Record<string, string>) =>
  Object.entries(style)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');

describe('a page-builder framing through UiImage, in a real browser', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const rendered = CASES.map(({ aspect, framing }) => {
      const wrapper = mount(UiImage, { props: { src: PICTURE, alt: '', aspect, framing } });
      const html = wrapper.html();
      wrapper.unmount();
      return html;
    });
    const candidates = [...rendered.join('').matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      match[1]!.split(/\s+/).filter(Boolean)
    );
    const compiler = await compile(readFileSync(`${assetsDir}main.css`, 'utf8'), {
      base: assetsDir,
      onDependency() {},
    });
    const css = compiler.build([...new Set(candidates)]);
    const columns = CASES.map(({ aspect, framing }, i) => {
      const reference =
        `<div class="ref" style="position:relative;overflow:hidden;aspect-ratio:${aspect}">` +
        `<img src="${PICTURE}" alt="" style="display:block;width:100%;height:100%;${styleText(imageFramingStyle(framing))}"></div>`;
      return `<div class="case">${rendered[i]}${reference}</div>`;
    });

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route(PICTURE, async (route) => {
      const png = await page.evaluate(() => {
        const canvas = Object.assign(document.createElement('canvas'), {
          width: 1600,
          height: 900,
        });
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 1600, 900);
        gradient.addColorStop(0, '#1d3557');
        gradient.addColorStop(0.5, '#e9c46a');
        gradient.addColorStop(1, '#e63946');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1600, 900);
        ctx.strokeStyle = '#fff';
        for (let x = 0; x < 1600; x += 37) ctx.strokeRect(x, (x * 7) % 900, 23, 23);
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await route.fulfill({ body: Buffer.from(png, 'base64'), contentType: 'image/png' });
    });
    await page.setContent(
      `<style>${css} body{margin:0} .case{display:flex;gap:20px;height:400px;align-items:flex-start}` +
        `.case>*{flex:none;width:300px}</style>` +
        `<main>${columns.join('')}</main>`
    );
    await page.evaluate(() =>
      Promise.all([...document.images].map((img) => ((img.loading = 'eager'), img.decode())))
    );
  }, 120_000);

  // theme-core prints percentages to 4 places and UiImage passes x * 100 as is, so an edge pixel can differ by a few levels.
  const largestDifference = (a: Buffer, b: Buffer) =>
    page.evaluate(
      async ([a, b]) => {
        const pixels = async (data: string) => {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${data}`)).blob()
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [pa, pb] = await Promise.all([pixels(a!), pixels(b!)]);
        if (pa.width !== pb.width || pa.height !== pb.height) return Number.POSITIVE_INFINITY;
        let largest = 0;
        for (let i = 0; i < pa.data.length; i++)
          largest = Math.max(largest, Math.abs(pa.data[i]! - pb.data[i]!));
        return largest;
      },
      [a.toString('base64'), b.toString('base64')]
    );

  afterAll(async () => {
    await browser?.close();
  });

  it.each(CASES.map((c, i) => [c.aspect, JSON.stringify(c.framing), i] as const))(
    'draws %s at %s exactly as Studio previews it',
    async (_aspect, _framing, i) => {
      const item = page.locator('.case').nth(i);
      const site = await item.locator('[data-part="frame"]').screenshot();
      const studio = await item.locator('.ref').screenshot();
      expect(await largestDifference(site, studio)).toBeLessThanOrEqual(8);
    }
  );
});
