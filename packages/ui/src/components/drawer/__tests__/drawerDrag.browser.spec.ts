// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import vue from '@vitejs/plugin-vue';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';

/**
 * **Does the drawer move, close and spring back under a real pointer?**
 *
 * The drag reads the panel's real size, pointer timing and the viewport's width, none of which a
 * DOM emulation has, so this mounts the real `Drawer` in Chromium over the built stylesheet and
 * drives it with real mouse and touch input: a side drawer swiped by its header, with the dead
 * zone before anything moves; a `mobileSheet` dragged down by its handle and, once its body is
 * scrolled to the top, by its body; and the backdrop fading with the distance.
 */

const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const drawerPath = fileURLToPath(new URL('../Drawer.vue', import.meta.url));
const stylePath = `${packageRoot}dist/style.css`;
const built = isBuilt(stylePath);

const ENTRY = `
import { createApp, h, ref } from 'vue';
import Drawer from ${JSON.stringify(drawerPath)};
const options = window.drawerOptions ?? {};
window.closes = [];
const open = ref(true);
window.reopen = () => { open.value = true; };
const rows = Array.from({ length: options.rows ?? 4 }, (_, i) => h('p', { style: 'margin:0 0 16px' }, 'Row ' + (i + 1)));
createApp({
  render: () =>
    h(
      Drawer,
      {
        title: 'Edit option',
        modelValue: open.value,
        'onUpdate:modelValue': (value) => { open.value = value; },
        onClose: (reason) => window.closes.push(reason),
        ...options.props,
      },
      { default: () => rows, footer: () => h('button', { type: 'button' }, 'Done') }
    ),
}).mount('#app');
`;

async function bundle(): Promise<string> {
  const output = (await build({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [
      vue(),
      {
        name: 'drawer-entry',
        resolveId: (id) => (id === 'drawer-entry' ? '\0drawer-entry' : undefined),
        load: (id) => (id === '\0drawer-entry' ? ENTRY : undefined),
      },
    ],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: 'drawer-entry', output: { format: 'iife' } },
    },
  })) as Rollup.RollupOutput[] | Rollup.RollupOutput;
  const outputs = Array.isArray(output) ? output : [output];
  const chunk = outputs[0]!.output.find((item) => item.type === 'chunk');
  return (chunk as Rollup.OutputChunk).code;
}

let browser: Browser;
let css: string;
let script: string;

beforeAll(async () => {
  if (!built) return;
  browser = await chromium.launch();
  css = readFileSync(stylePath, 'utf8');
  script = await bundle();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

interface Options {
  props?: Record<string, unknown>;
  rows?: number;
}

async function open(width: number, options: Options = {}, touch = false): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width, height: 800 },
    reducedMotion: 'reduce',
    hasTouch: touch,
  });
  await page.setContent(
    `<style>${css}</style><main style="padding:24px"><h1>Page</h1></main><div id="app"></div>`
  );
  await page.evaluate((value) => {
    (window as unknown as { drawerOptions: Options }).drawerOptions = value;
  }, options);
  await page.addScriptTag({ content: script });
  await page.waitForSelector('dialog[open]');
  return page;
}

const box = (page: Page, part: string) =>
  page.evaluate((name) => {
    const r = document.querySelector(`dialog [data-part="${name}"]`)!.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }, part);

/** The panel's offset along an axis, from its inline `translate` ("93px" or "0px 58.6px"). */
const offset = (translate: string, axis: 'x' | 'y') =>
  parseFloat(translate.split(' ')[axis === 'x' ? 0 : 1] ?? '0') || 0;

/** The native `close` event fires a task after `close()`; wait for it before reading reasons. */
const closed = (page: Page) =>
  page.waitForFunction(() => (window as unknown as { closes: string[] }).closes.length > 0);

const state = (page: Page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog')!;
    const panel = dialog.querySelector<HTMLElement>('[data-part="panel"]')!;
    return {
      open: dialog.open,
      translate: panel.style.translate,
      drag: Number(dialog.style.getPropertyValue('--eldra-drawer-drag') || 0),
      backdrop: Number(getComputedStyle(dialog, '::backdrop').opacity),
      closes: (window as unknown as { closes: string[] }).closes,
    };
  });

/** Moves the mouse in small steps with a pause between each, so the release is not a flick. */
async function slowMove(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(25);
  }
}

describe('Drawer drag in a browser', () => {
  itFailsWithoutDist(built);

  it.runIf(built)('a side drawer ignores a mouse drag shorter than the dead zone', async () => {
    const page = await open(1280);
    const header = await box(page, 'header');
    const start = { x: header.x + 60, y: header.y + header.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, start, 20, 0);
    expect((await state(page)).translate).toBe('');
    await page.mouse.up();
    expect((await state(page)).open).toBe(true);
    await page.close();
  });

  it.runIf(built)(
    'a side drawer follows the mouse past the dead zone, from 0, and fades its backdrop',
    async () => {
      const page = await open(1280);
      const header = await box(page, 'header');
      const start = { x: header.x + 60, y: header.y + header.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await slowMove(page, start, 124, 0);
      const mid = await state(page);
      // It follows from where it engaged, the first move past the 24px dead zone (31px here, in
      // 10px steps), so it is 93px along, never 124: no jump when it starts.
      expect(offset(mid.translate, 'x')).toBeGreaterThan(124 - 24 - 11);
      expect(offset(mid.translate, 'x')).toBeLessThanOrEqual(124 - 24);
      expect(mid.drag).toBeGreaterThan(0);
      expect(mid.backdrop).toBeLessThan(1);
      await page.waitForTimeout(120);
      await page.mouse.up();
      // Under a third of the panel and not a flick: it springs back and stays open.
      const after = await state(page);
      expect(after.open).toBe(true);
      expect(after.translate).toBe('');
      expect(after.drag).toBe(0);
      await page.close();
    }
  );

  it.runIf(built)(
    'a side drawer swiped past a third of its width closes with "swipe"',
    async () => {
      const page = await open(1280);
      const header = await box(page, 'header');
      const panel = await box(page, 'panel');
      const start = { x: header.x + 40, y: header.y + header.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await slowMove(page, start, panel.width * 0.5, 0);
      await page.mouse.up();
      await closed(page);
      const after = await state(page);
      expect(after.open).toBe(false);
      expect(after.closes).toEqual(['swipe']);
      await page.close();
    }
  );

  it.runIf(built)('a left drawer swipes left; dragging it right moves nothing', async () => {
    const page = await open(1280, { props: { side: 'left' } });
    const header = await box(page, 'header');
    const start = { x: header.x + 200, y: header.y + header.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, start, 120, 0);
    expect((await state(page)).translate).toBe('');
    await page.mouse.up();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, start, -300, 0);
    await page.mouse.up();
    await closed(page);
    expect((await state(page)).closes).toEqual(['swipe']);
    await page.close();
  });

  it.runIf(built)(
    'a mouse drag in the body selects text instead of moving the drawer',
    async () => {
      const page = await open(1280);
      const body = await box(page, 'body');
      const start = { x: body.x + 30, y: body.y + 10 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await slowMove(page, start, 200, 0);
      expect((await state(page)).translate).toBe('');
      await page.mouse.up();
      expect((await state(page)).open).toBe(true);
      await page.close();
    }
  );

  it.runIf(built)('swipe=false turns the gesture off', async () => {
    const page = await open(1280, { props: { swipe: false } });
    const header = await box(page, 'header');
    const start = { x: header.x + 40, y: header.y + header.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, start, 300, 0);
    expect((await state(page)).translate).toBe('');
    await page.mouse.up();
    expect((await state(page)).open).toBe(true);
    await page.close();
  });

  it.runIf(built)(
    'without mobileSheet a phone gets the full-screen drawer, no handle',
    async () => {
      const page = await open(375);
      const panel = await box(page, 'panel');
      expect(panel).toMatchObject({ x: 0, y: 0, width: 375, height: 800 });
      expect(await page.locator('[data-part="handle"]').count()).toBe(0);
      await page.close();
    }
  );

  it.runIf(built)(
    'mobileSheet on a phone is a bottom sheet that fits its content, with a handle',
    async () => {
      const page = await open(375, { props: { mobileSheet: true } });
      const panel = await box(page, 'panel');
      expect(panel.x).toBe(0);
      expect(panel.width).toBe(375);
      expect(panel.bottom).toBe(800);
      expect(panel.y).toBeGreaterThan(48);
      expect(await page.locator('[data-part="handle"]').isVisible()).toBe(true);
      expect(await page.locator('[data-part="handle"]').getAttribute('aria-hidden')).toBe('true');
      await page.close();
    }
  );

  it.runIf(built)('a long sheet stops short of the top and scrolls its body', async () => {
    const page = await open(375, { props: { mobileSheet: true }, rows: 80 });
    const panel = await box(page, 'panel');
    // `--eldra-drawer-sheet-gap` (3rem) of page stays in view above it.
    expect(panel.y).toBe(48);
    const scrolls = await page.evaluate(() => {
      const body = document.querySelector('dialog [data-part="body"]')!;
      return body.scrollHeight > body.clientHeight;
    });
    expect(scrolls).toBe(true);
    await page.close();
  });

  it.runIf(built)('mobileSheet on a wide screen is the usual side drawer, no handle', async () => {
    const page = await open(1280, { props: { mobileSheet: true } });
    const panel = await box(page, 'panel');
    expect(panel.y).toBe(0);
    expect(panel.right).toBe(1280);
    expect(await page.locator('[data-part="handle"]').isVisible()).toBe(false);
    await page.close();
  });

  it.runIf(built)(
    'a sheet dragged down by its handle follows it, fades the backdrop, and closes',
    async () => {
      const page = await open(375, { props: { mobileSheet: true } });
      const handle = await box(page, 'handle');
      const panel = await box(page, 'panel');
      const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await slowMove(page, start, 0, 64);
      const mid = await state(page);
      // A 4px dead zone on the handle, engaged at the first 5.3px step: just under 60px down.
      const down = offset(mid.translate, 'y');
      expect(down).toBeGreaterThan(54);
      expect(down).toBeLessThanOrEqual(60);
      expect(mid.backdrop).toBeCloseTo(1 - down / panel.height, 2);
      await slowMove(page, { x: start.x, y: start.y + 64 }, 0, panel.height * 0.4);
      await page.mouse.up();
      await closed(page);
      const after = await state(page);
      expect(after.open).toBe(false);
      expect(after.closes).toEqual(['swipe']);
      await page.close();
    }
  );

  it.runIf(built)('a side drawer dragged back past its resting position stays there', async () => {
    const page = await open(1280);
    const header = await box(page, 'header');
    const panel = await box(page, 'panel');
    const start = { x: header.x + 60, y: header.y + header.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, start, 80, 0);
    await slowMove(page, { x: start.x + 80, y: start.y }, -300, 0);
    expect(offset((await state(page)).translate, 'x')).toBe(0);
    expect((await box(page, 'panel')).x).toBe(panel.x);
    await page.waitForTimeout(120);
    await page.mouse.up();
    expect(await state(page)).toMatchObject({ open: true, translate: '' });
    await page.close();
  });

  it.runIf(built)('a sheet pulled up past its resting position stays there', async () => {
    const page = await open(375, { props: { mobileSheet: true } });
    const handle = await box(page, 'handle');
    const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await slowMove(page, { x: start.x, y: start.y }, 0, 8);
    await slowMove(page, { x: start.x, y: start.y + 8 }, 0, -300);
    expect(offset((await state(page)).translate, 'y')).toBe(0);
    expect((await box(page, 'handle')).y).toBe(handle.y);
    await page.waitForTimeout(120);
    await page.mouse.up();
    expect(await state(page)).toMatchObject({ open: true, translate: '' });
    await page.close();
  });

  describe('touch on a sheet body', () => {
    async function swipeBody(page: Page, dy: number): Promise<void> {
      const cdp = await page.context().newCDPSession(page);
      const body = await box(page, 'body');
      const x = body.x + body.width / 2;
      const y = body.y + 20;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: y + (dy * i) / 12 }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }

    it.runIf(built)('pulled down at the top of its scroll, closes the sheet', async () => {
      const page = await open(375, { props: { mobileSheet: true }, rows: 80 }, true);
      await swipeBody(page, 400);
      await closed(page);
      expect(await state(page)).toMatchObject({ open: false, closes: ['swipe'] });
      await page.close();
    });

    it.runIf(built)('pulled down while scrolled, scrolls instead', async () => {
      const page = await open(375, { props: { mobileSheet: true }, rows: 80 }, true);
      await page.evaluate(() => {
        document.querySelector('dialog [data-part="body"]')!.scrollTop = 300;
      });
      await swipeBody(page, 200);
      const after = await state(page);
      expect(after.open).toBe(true);
      expect(after.closes).toEqual([]);
      await page.close();
    });
  });
});

describe('Drawer motion in a browser', () => {
  itFailsWithoutDist(built);

  it.runIf(built)(
    'enters and leaves by transition, toward its own edge, and stays painted until gone',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.setContent(`<style>${css}</style><div id="app"></div>`);
      await page.addScriptTag({ content: script });
      await page.waitForSelector('dialog[open]');
      const entering = await page.evaluate(() =>
        document
          .querySelector('dialog [data-part="panel"]')!
          .getAnimations()
          .map((a) => (a as CSSTransition).transitionProperty)
          .sort()
      );
      expect(entering).toEqual(['opacity', 'translate']);

      await page.locator('[data-part="close"]').click();
      const leaving = await page.evaluate(() => {
        const dialog = document.querySelector('dialog')!;
        return {
          open: dialog.open,
          display: getComputedStyle(dialog).display,
          panel: dialog
            .querySelector('[data-part="panel"]')!
            .getAnimations()
            .map((a) => (a as CSSTransition).transitionProperty)
            .sort(),
        };
      });
      expect(leaving).toEqual({ open: false, display: 'flex', panel: ['opacity', 'translate'] });
      await page.waitForTimeout(500);
      expect(
        await page.evaluate(() => getComputedStyle(document.querySelector('dialog')!).display)
      ).toBe('none');
      await page.close();
    }
  );

  /** The root's scroll offsets on every frame for `ms`: they stay 0 unless something scrolled it. */
  const rootScroll = (page: Page, ms: number) =>
    page.evaluate(
      (duration) =>
        new Promise<number[]>((resolve) => {
          const dialog = document.querySelector('dialog')!;
          const seen: number[] = [];
          const start = performance.now();
          const frame = () => {
            seen.push(Math.abs(dialog.scrollLeft) + Math.abs(dialog.scrollTop));
            if (performance.now() - start < duration) requestAnimationFrame(frame);
            else resolve(seen);
          };
          frame();
        }),
      ms
    );

  // The panel starts past the root's edge, and focus on opening scrolls a scrollable root to the
  // close button, so the panel jumped partway in and then slid on from there.
  it.runIf(built)('a sheet rises without scrolling the root to its close button', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
    await page.setContent(`<style>${css}</style><div id="app"></div>`);
    await page.evaluate(() => {
      (window as unknown as { drawerOptions: Options }).drawerOptions = {
        props: { mobileSheet: true },
      };
    });
    await page.addScriptTag({ content: script });
    await page.waitForSelector('dialog[open]');
    expect(Math.max(...(await rootScroll(page, 450)))).toBe(0);
    await page.close();
  });

  it.runIf(built)(
    'a side drawer swiped closed opens again from its usual offset, the root unscrolled',
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.setContent(`<style>${css}</style><div id="app"></div>`);
      await page.addScriptTag({ content: script });
      await page.waitForSelector('dialog[open]');
      await page.waitForTimeout(450);
      const header = await box(page, 'header');
      const panel = await box(page, 'panel');
      const start = { x: header.x + 40, y: header.y + header.height / 2 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await slowMove(page, start, panel.width * 0.5, 0);
      await page.mouse.up();
      await closed(page);
      await page.waitForTimeout(400);
      await page.evaluate(() => (window as unknown as { reopen: () => void }).reopen());
      await page.waitForSelector('dialog[open]');
      const scroll = await rootScroll(page, 450);
      expect(Math.max(...scroll)).toBe(0);
      expect(await box(page, 'panel')).toEqual(panel);
      await page.close();
    }
  );
});
