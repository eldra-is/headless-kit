// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { Image } from '../../../index';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';
import type { ImageProps } from '../types';

const dist = fileURLToPath(new URL('../../../../dist/', import.meta.url));
const built = isBuilt(`${dist}style.css`);

const PICTURE = { width: 896, height: 500 };
const ORIGIN = 'http://picture.test';
const MAGENTA = [255, 0, 255];

interface Pixels {
  width: number;
  height: number;
  data: number[];
}

let browser: Browser;
let lab: Page;
let css = '';

beforeAll(async () => {
  browser = await chromium.launch();
  lab = await browser.newPage();
  if (built) css = readFileSync(`${dist}style.css`, 'utf8');
}, 60_000);

/** A picture whose every pixel says where it is: red across, green down, blue checks. */
async function gridPicture(marker?: { x: number; y: number }): Promise<Buffer> {
  const png = await lab.evaluate(
    ([{ width, height }, marker]) => {
      const canvas = Object.assign(document.createElement('canvas'), { width, height });
      const ctx = canvas.getContext('2d')!;
      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const near =
            marker &&
            x >= marker.x - 2 &&
            x < marker.x + 2 &&
            y >= marker.y - 2 &&
            y < marker.y + 2;
          image.data[i] = near ? 0 : 40 + Math.round((x / width) * 160);
          image.data[i + 1] = near ? 0 : 40 + Math.round((y / height) * 160);
          image.data[i + 2] = near ? 255 : ((x >> 5) + (y >> 5)) % 2 ? 90 : 30;
          image.data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1]!;
    },
    [PICTURE, marker] as const
  );
  return Buffer.from(png, 'base64');
}

/** A screenshot's pixels, decoded by the browser. */
const decode = (png: Buffer): Promise<Pixels> =>
  lab.evaluate(async (data) => {
    const bitmap = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${data}`)).blob()
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { width, height, data: rgba } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width, height, data: [...rgba] };
  }, png.toString('base64'));

afterAll(async () => {
  await browser?.close();
}, 60_000);

interface Shot {
  page: Page;
  requests: string[];
}

/** Server-renders each Image into its own 300 px column on a page `viewport` wide. */
async function render(viewport: number, images: ImageProps[], picture?: Buffer) {
  const body = picture ?? (await gridPicture());
  const markup = await Promise.all(
    images.map((props) => renderToString(createSSRApp({ render: () => h(Image, props) })))
  );
  const page = await browser.newPage({ viewport: { width: viewport, height: 900 } });
  const requests: string[] = [];
  await page.route(`${ORIGIN}/**`, (route) => {
    requests.push(route.request().url());
    return route.fulfill({ body, contentType: 'image/png' });
  });
  await page.setContent(
    `<style>${css} body{margin:0} .col{width:300px;margin:8px;--eldra-color-surface-strong:rgb(${MAGENTA})}</style>` +
      markup.map((html) => `<div class="col">${html}</div>`).join('')
  );
  await page.evaluate(() =>
    Promise.all([...document.images].map((img) => ((img.loading = 'eager'), img.decode())))
  );
  return { page, requests } satisfies Shot;
}

async function frames(page: Page) {
  const shots = [];
  for (const frame of await page.locator('[data-part="frame"]').all()) {
    shots.push(await decode(await frame.screenshot({ animations: 'disabled' })));
  }
  return shots;
}

const pixelsDiffering = (a: Pixels, b: Pixels) => {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    )
      count++;
  }
  return count;
};

/** Magenta pixels inside each frame, counted in the browser from one screenshot of the page. */
async function magentaPerFrame(page: Page) {
  const boxes = await page.locator('[data-part="frame"]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY].map(
        (edge, i) => (i < 2 ? Math.ceil(edge) : Math.floor(edge))
      );
    })
  );
  const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
  return lab.evaluate(
    async ([data, boxes]) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${data}`)).blob()
      );
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      return boxes.map(([x0, y0, x1, y1]) => {
        const { data: rgba } = ctx.getImageData(x0!, y0!, x1! - x0!, y1! - y0!);
        let count = 0;
        for (let i = 0; i < rgba.length; i += 4)
          if (rgba[i]! > 200 && rgba[i + 1]! < 60 && rgba[i + 2]! > 200) count++;
        return count;
      });
    },
    [png.toString('base64'), boxes] as const
  );
}

/** Where the picture's blue marker is drawn in the frame, as fractions of the frame. */
const markerAt = (shot: Pixels) => {
  let [sx, sy, n] = [0, 0, 0];
  for (let y = 0; y < shot.height; y++) {
    for (let x = 0; x < shot.width; x++) {
      const i = (y * shot.width + x) * 4;
      if (shot.data[i]! < 30 && shot.data[i + 1]! < 30 && shot.data[i + 2]! > 220) {
        sx += x + 0.5;
        sy += y + 0.5;
        n++;
      }
    }
  }
  return n ? { x: sx / n / shot.width, y: sy / n / shot.height } : undefined;
};

const media = { src: `${ORIGIN}/picture.png`, ...PICTURE };

describe('Image crops in a real browser', () => {
  it.runIf(built)(
    "'focal' keeps the frame covered with the focal point at any edge and any zoom",
    async () => {
      const cases: ImageProps[] = [];
      for (const ratio of ['1x1', '16x9', '3x4'] as const)
        for (const zoom of [1.01, 2, 5.2])
          for (const [x, y] of [
            [0, 0],
            [100, 0],
            [0, 100],
            [100, 100],
          ] as const)
            cases.push({ media, alt: '', ratio, zoom, focal: { x, y }, zoomOrigin: 'focal' });
      const { page } = await render(1440, cases);
      await page.addStyleTag({
        content: `.col{display:inline-block;vertical-align:top} [data-part="frame"]{background:rgb(${MAGENTA})}`,
      });
      const counts = await magentaPerFrame(page);
      await page.close();
      expect(counts).toEqual(cases.map(() => 0));
    },
    60_000
  );

  it.runIf(built)(
    "'focal' draws the picture's focal point at the same point of the frame at every zoom",
    async () => {
      const focal = { x: 12.5, y: 88 };
      const marker = {
        x: Math.round((focal.x / 100) * PICTURE.width),
        y: Math.round((focal.y / 100) * PICTURE.height),
      };
      const zooms = [1, 2, 3.48, 5.2];
      const { page } = await render(
        1440,
        [
          ...zooms.map((zoom) => ({
            media,
            alt: '',
            ratio: 6 / 5,
            zoom,
            focal,
            zoomOrigin: 'focal' as const,
          })),
          { media, alt: '', ratio: 6 / 5, zoom: 3.48, focal },
        ],
        await gridPicture(marker)
      );
      const found = (await frames(page)).map(markerAt);
      await page.close();
      // Within a pixel: the cover's offset here is a fraction of one, which a browser rounds.
      for (const at of found.slice(0, zooms.length)) {
        expect(Math.abs(at!.x - focal.x / 100) * 300).toBeLessThan(1);
        expect(Math.abs(at!.y - focal.y / 100) * 250).toBeLessThan(1);
      }
      // The default band moves a zoomed origin off an edge, so the same point lands elsewhere.
      expect(found.at(-1)?.y ?? 2).not.toBeCloseTo(focal.y / 100, 1);
    },
    60_000
  );

  const CROPPED: ImageProps = {
    media,
    alt: '',
    ratio: '4x3',
    focal: { x: 60, y: 40 },
    zoom: 1.8,
    zoomOrigin: 'focal',
    sizes: '300px',
    crops: [
      { media: '(max-width: 640px)', ratio: '16x9', focal: { x: 20, y: 70 }, zoom: 2.5 },
      { media: '(max-width: 1000px)', ratio: 6 / 5, focal: { x: 90, y: 10 }, zoom: 3 },
    ],
  };
  const alone = (crop: Partial<ImageProps>): ImageProps => ({
    ...CROPPED,
    crops: [],
    ...crop,
  });

  it.runIf(built).each([
    [390, alone({ ratio: '16x9', focal: { x: 20, y: 70 }, zoom: 2.5 })],
    [800, alone({ ratio: 6 / 5, focal: { x: 90, y: 10 }, zoom: 3 })],
    [1440, alone({})],
  ])(
    'at %i px draws the first matching crop exactly as an Image of that crop alone, from one request',
    async (viewport, reference) => {
      const cropped = await render(viewport, [CROPPED]);
      const [shot] = await frames(cropped.page);
      const single = await render(viewport, [reference]);
      const [expected] = await frames(single.page);
      await cropped.page.close();
      await single.page.close();
      expect([shot!.width, shot!.height]).toEqual([expected!.width, expected!.height]);
      expect(pixelsDiffering(shot!, expected!)).toBe(0);
      expect(cropped.requests).toHaveLength(1);
    },
    60_000
  );

  it.runIf(built).each([
    [390, 1, 'calc(100vw * 2.5)'],
    [390, 2, 'calc(100vw * 2.5)'],
    [800, 2, 'calc(300px * 3)'],
    [1440, 1, 'calc(300px * 1.8)'],
    [1440, 2, 'calc(300px * 1.8)'],
  ])(
    'at %i px and %ix fetches the candidate the matching crop’s own sizes pick (%s)',
    async (viewport, scale, ownSizes) => {
      const srcset = Array.from(
        { length: 30 },
        (_, i) => `${ORIGIN}/w${(i + 1) * 100}.png ${(i + 1) * 100}w`
      ).join(', ');
      const props: ImageProps = {
        ...CROPPED,
        media: { ...media, srcset },
        crops: [{ ...CROPPED.crops![0]!, sizes: '100vw' }, CROPPED.crops![1]!],
      };
      const picture = await gridPicture();
      const picks = async (markup: string) => {
        const page = await browser.newPage({
          viewport: { width: viewport, height: 900 },
          deviceScaleFactor: scale,
        });
        const requests: string[] = [];
        await page.route(`${ORIGIN}/**`, (route) => {
          requests.push(route.request().url());
          return route.fulfill({ body: picture, contentType: 'image/png' });
        });
        await page.setContent(`<style>${css}</style>${markup}`);
        await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
        await page.close();
        return requests;
      };
      const fromImage = await picks(
        await renderToString(createSSRApp({ render: () => h(Image, props) }))
      );
      const fromOwnSizes = await picks(
        `<img src="${media.src}" srcset="${srcset}" sizes="${ownSizes}" alt="" style="width:300px">`
      );
      expect(fromImage).toHaveLength(1);
      expect(fromImage).toEqual(fromOwnSizes);
    },
    60_000
  );

  itFailsWithoutDist(built);
});
