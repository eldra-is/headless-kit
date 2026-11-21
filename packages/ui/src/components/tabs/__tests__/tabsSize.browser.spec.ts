// @vitest-environment node
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
});
