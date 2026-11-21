// @vitest-environment node
import { inflateSync } from 'node:zlib';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { compileKitCss } from '../../../test/kitCss';
import Tabs from '../Tabs.vue';

/**
 * **Do `size="sm"` and `fill` draw what the page builder's rail draws?** The rail
 * (`.builder-rail-tabs` in Studio) is 36px tall, 13px text at weight 500, a 6px icon gap and a 2px
 * indicator across the whole tab, tabs sharing the width. Class assertions cannot see any of
 * that, so this renders the real component through Vue, builds the package's real stylesheet over
 * exactly its classes and measures the layout in Chromium (the same shape as
 * `tabsRing.browser.spec.ts`).
 */
const ITEMS = [
  { value: 'blocks', title: 'Blocks' },
  { value: 'layers', title: 'Layers' },
  { value: 'pages', title: 'Pages' },
];

type Props = { size?: 'sm' | 'md'; fill?: boolean; variant?: 'underline' | 'pills' };

const render = (props: Props) =>
  renderToString(
    createSSRApp(() => h(Tabs, { items: ITEMS, ariaLabel: 'Rail', modelValue: 'blocks', ...props }))
  );

let browser: Browser;
let css: string;

beforeAll(async () => {
  const candidates = new Set<string>();
  for (const props of [
    {},
    { size: 'sm', fill: true },
    { size: 'sm', variant: 'pills' },
  ] as Props[]) {
    for (const match of (await render(props)).matchAll(/class="([^"]*)"/g)) {
      for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
    }
  }
  css = await compileKitCss(candidates);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

async function measure(props: Props) {
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  try {
    await page.setContent(
      `<style>${css}</style><main style="padding:40px"><div style="width:300px">${await render(props)}</div></main>`,
      { waitUntil: 'domcontentloaded' }
    );
    return await page.evaluate(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
      const first = tabs[0]!;
      const indicator = first.querySelector<HTMLElement>('[data-part="indicator"]');
      const style = getComputedStyle(first);
      const list = document.querySelector<HTMLElement>('[role="tablist"]')!;
      return {
        heights: tabs.map((tab) => tab.getBoundingClientRect().height),
        widths: tabs.map((tab) => tab.getBoundingClientRect().width),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        columnGap: style.columnGap,
        indicatorHeight: indicator?.getBoundingClientRect().height,
        indicatorWidth: indicator?.getBoundingClientRect().width,
        tabWidth: first.getBoundingClientRect().width,
        listWidth: list.getBoundingClientRect().width,
        tabsRight: tabs[tabs.length - 1]!.getBoundingClientRect().right,
        listRight: list.getBoundingClientRect().right,
      };
    });
  } finally {
    await page.close();
  }
}

describe('Tabs size="sm" and fill, measured', () => {
  it('sm is 36px tall, 13px at weight 500, a 6px icon gap and a 2px full-width indicator', async () => {
    const m = await measure({ size: 'sm' });
    for (const height of m.heights) expect(height).toBe(36);
    expect(m.fontSize).toBe('13px');
    expect(m.fontWeight).toBe('500');
    expect(m.columnGap).toBe('6px');
    expect(m.indicatorHeight).toBe(2);
    expect(m.indicatorWidth).toBe(m.tabWidth);
  });

  it('md is untouched: 44px minimum, a 3px inset indicator', async () => {
    const m = await measure({});
    expect(m.heights[0]).toBeGreaterThanOrEqual(44);
    expect(m.indicatorHeight).toBe(3);
    expect(m.indicatorWidth).toBe(m.tabWidth - 16);
  });

  it('fill makes the tabs share the whole list width equally', async () => {
    const m = await measure({ size: 'sm', fill: true });
    expect(m.listWidth).toBe(300);
    expect(Math.round(m.tabsRight)).toBe(Math.round(m.listRight));
    expect(m.widths[0]).toBeCloseTo(m.widths[1]!, 0);
    expect(m.widths[1]).toBeCloseTo(m.widths[2]!, 0);
  });

  it('the scoped variables recolour an sm tab bar, and default to the kit colours', async () => {
    const colours = async (style: string) => {
      const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
      try {
        await page.setContent(
          `<style>${css}</style><main style="padding:40px"><div style="width:300px;${style}">${await render({ size: 'sm' })}</div></main>`,
          { waitUntil: 'domcontentloaded' }
        );
        return await page.evaluate(() => {
          const [selected, rest] = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
          const bar = selected!.querySelector<HTMLElement>('[data-part="indicator"]')!;
          return {
            selectedText: getComputedStyle(selected!).color,
            indicator: getComputedStyle(bar).backgroundColor,
            restText: getComputedStyle(rest!).color,
          };
        });
      } finally {
        await page.close();
      }
    };
    const themed = await colours(
      '--eldra-tabs-accent:rgb(9, 74, 196);--eldra-tabs-muted:rgb(75, 85, 99)'
    );
    expect(themed.selectedText).toBe('rgb(9, 74, 196)');
    expect(themed.indicator).toBe('rgb(9, 74, 196)');
    expect(themed.restText).toBe('rgb(75, 85, 99)');
    const plain = await colours('');
    expect(plain.selectedText).not.toBe('rgb(9, 74, 196)');
    expect(plain.indicator).toBe(plain.selectedText);
  });

  it('hovering an sm tab paints --eldra-tabs-hover-bg', async () => {
    const page = await browser.newPage({
      viewport: { width: 800, height: 400 },
      reducedMotion: 'reduce',
    });
    try {
      await page.setContent(
        `<style>${css}</style><main style="padding:40px"><div style="width:300px;--eldra-tabs-hover-bg:rgb(243, 244, 246)">${await render({ size: 'sm' })}</div></main>`,
        { waitUntil: 'domcontentloaded' }
      );
      const second = page.locator('[role="tab"]').nth(1);
      const before = await second.evaluate((el) => getComputedStyle(el).backgroundColor);
      await second.hover();
      const after = await second.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(before).not.toBe('rgb(243, 244, 246)');
      expect(after).toBe('rgb(243, 244, 246)');
    } finally {
      await page.close();
    }
  });

  it('a keyboard-focused, selected sm tab shows the focus ring along its bottom edge', async () => {
    const page = await browser.newPage({
      viewport: { width: 800, height: 400 },
      reducedMotion: 'reduce',
    });
    try {
      await page.setContent(
        `<style>${css}</style><main style="padding:40px"><div style="width:300px">${await render({ size: 'sm', fill: true })}</div></main>`,
        { waitUntil: 'domcontentloaded' }
      );
      await page.keyboard.press('Tab');
      const { box, focus, bar } = await page.evaluate(() => {
        const tab = document.activeElement as HTMLElement;
        const probe = document.createElement('i');
        probe.style.background = 'var(--eldra-color-focus)';
        document.body.append(probe);
        const focus = getComputedStyle(probe).backgroundColor;
        const rect = tab.getBoundingClientRect();
        const bar = tab
          .querySelector<HTMLElement>('[data-part="indicator"]')!
          .getBoundingClientRect();
        return {
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          focus,
          bar: bar.bottom - rect.bottom,
        };
      });
      // The indicator has lifted off the bottom edge ...
      expect(bar).toBeLessThan(0);
      // ... and the pixel on the tab's very bottom row is the ring's colour, not the bar's.
      const png = await page.screenshot({
        clip: { x: box.x + box.width / 2, y: box.y + box.height - 1, width: 1, height: 1 },
      });
      const want = focus.match(/\d+/g)!.map(Number);
      const got = decodeRgb(png);
      for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!)).toBeLessThanOrEqual(2);
    } finally {
      await page.close();
    }
  });

  it('with fill, one long label truncates: equal widths, nothing runs into the next tab', async () => {
    const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
    try {
      const html = await renderToString(
        createSSRApp(() =>
          h(Tabs, {
            ariaLabel: 'Rail',
            modelValue: 'a',
            size: 'sm',
            fill: true,
            items: [
              { value: 'a', title: 'A very long label that cannot possibly fit in its share' },
              { value: 'b', title: 'Layers' },
              { value: 'c', title: 'Pages' },
            ],
          })
        )
      );
      await page.setContent(
        `<style>${css}</style><main style="padding:40px"><div style="width:300px">${html}</div></main>`,
        { waitUntil: 'domcontentloaded' }
      );
      const m = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
        const rects = tabs.map((tab) => tab.getBoundingClientRect());
        const label = tabs[0]!.querySelector<HTMLElement>('[data-part="label"]')!;
        return {
          widths: rects.map((rect) => rect.width),
          overlaps: rects.slice(1).map((rect, i) => rects[i]!.right > rect.left + 0.5),
          truncated: label.scrollWidth > label.clientWidth,
          ellipsis: getComputedStyle(label).textOverflow,
        };
      });
      expect(m.truncated).toBe(true);
      expect(m.ellipsis).toBe('ellipsis');
      expect(m.widths[0]).toBeCloseTo(m.widths[1]!, 0);
      expect(m.widths[1]).toBeCloseTo(m.widths[2]!, 0);
      expect(m.overlaps).toEqual([false, false]);
    } finally {
      await page.close();
    }
  });
});

/** A 1x1 PNG's pixel: at one pixel every PNG filter reduces to the raw bytes (see
 *  `tabsRing.browser.spec.ts`), so find `IDAT`, inflate, skip the filter byte. */
function decodeRgb(png: Buffer): number[] {
  let pos = 8;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') idat.push(Buffer.from(png.subarray(pos + 8, pos + 8 + length)));
    else if (type === 'IEND') break;
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [raw[1]!, raw[2]!, raw[3]!];
}
