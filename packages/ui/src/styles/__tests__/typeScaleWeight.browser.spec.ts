// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ALL_FACETS } from '../../components/filter-panel/northwind';
import type { NavMenuItem } from '../../components/nav-menu/types';
import * as ui from '../../index';
import { isBuilt, itFailsWithoutDist } from '../../test/built';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const dist = `${packageRoot}dist/`;
const built = isBuilt(`${dist}style.css`);

const NAV_ITEMS: NavMenuItem[] = [
  {
    label: 'Shop',
    href: '/shop',
    children: [
      { label: 'Sweaters', href: '/sweaters', group: 'Knitwear' },
      { label: 'Mugs', href: '/mugs', group: 'Ceramics' },
    ],
  },
  { label: 'About', href: '/about' },
];

const TRAIL = ['Home', 'Ceramics', 'Tableware', 'Bowls', 'Serving bowl'].map((label, index) => ({
  label,
  href: index < 4 ? `/${index}` : undefined,
}));

/** [part, render, selector, text the element must contain, weight the spec gives it] */
const CASES: Array<[string, () => VNode, string, string, string]> = [
  [
    'NavMenu top-level link',
    () => h(ui.NavMenu, { items: NAV_ITEMS }),
    '[data-part="link"]',
    'About',
    '500',
  ],
  [
    'NavMenu top-level trigger',
    () => h(ui.NavMenu, { items: NAV_ITEMS }),
    '[data-part="trigger"]',
    'Shop',
    '500',
  ],
  [
    'NavMenu panel overview',
    () => h(ui.NavMenu, { items: NAV_ITEMS, modelValue: 0 }),
    '[data-part="overview"]',
    'Shop',
    '600',
  ],
  [
    'NavMenu panel label',
    () => h(ui.NavMenu, { items: NAV_ITEMS, modelValue: 0 }),
    '[data-part="panelLabel"]',
    'Sweaters',
    '500',
  ],
  [
    'Rating value',
    () => h(ui.Rating, { value: 4.5, count: 12, showValue: true, showCount: true }),
    '[data-part="value"]',
    '4.5',
    '600',
  ],
  [
    'Toast action',
    () => h(ui.Toast, { title: 'Added', action: { label: 'View cart (3)', href: '#' } }),
    '[data-part="action"]',
    'View cart',
    '600',
  ],
  [
    'EditorPlaceholder label',
    () => h(ui.EditorPlaceholder, { label: 'Add products' }),
    '[data-part="label"]',
    'Add products',
    '600',
  ],
  [
    'Breadcrumb current page',
    () => h(ui.Breadcrumb, { items: TRAIL, structuredData: false }),
    '[data-part="current"]',
    'Serving bowl',
    '500',
  ],
  [
    'Breadcrumb ellipsis',
    () => h(ui.Breadcrumb, { items: TRAIL, structuredData: false }),
    '[data-part="ellipsis"]',
    '',
    '600',
  ],
  [
    'SearchModal cancel',
    () => h(ui.SearchModal, { modelValue: true, query: 'wool' }),
    '[data-part="close"]',
    'Cancel',
    '500',
  ],
  [
    'FilterGroup trigger label',
    () => h(ui.FilterPanel, { facets: ALL_FACETS, currency: 'USD' }),
    '[data-part="groupLabel"]',
    'Category',
    '600',
  ],
  [
    'FilterPanel checked colour',
    () =>
      h(ui.FilterPanel, { facets: ALL_FACETS, currency: 'USD', modelValue: { colour: ['brown'] } }),
    '[data-part="rowLabel"]',
    'Brown',
    '600',
  ],
  [
    'LoadMore button',
    () => h(ui.LoadMore, { shown: 24, total: 96 }),
    '[data-part="button"]',
    '',
    '600',
  ],
  [
    "a consumer's classes override",
    () => h(ui.Rating, { value: 4.5, count: 12, showValue: true, classes: { value: 'font-bold' } }),
    '[data-part="value"]',
    '4.5',
    '700',
  ],
];

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

async function weightOf(css: string, markup: string, selector: string, text: string) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  try {
    await page.setContent(`<style>${css}</style><div style="width:22rem">${markup}</div>`);
    return await page.evaluate(
      ([selector, text]) =>
        [...document.querySelectorAll(selector!)]
          .filter((element) => element.textContent?.includes(text!))
          .map((element) => getComputedStyle(element).fontWeight),
      [selector, text]
    );
  } finally {
    await page.close();
  }
}

describe('a weight utility beside a type style', () => {
  it.runIf(built).each(CASES)(
    'renders the %s at its own weight',
    async (_name, render, selector, text, weight) => {
      const markup = await renderToString(createSSRApp({ render }));
      const weights = await weightOf(
        readFileSync(`${dist}style.css`, 'utf8'),
        markup,
        selector,
        text
      );
      expect(weights.length).toBeGreaterThan(0);
      expect(new Set(weights)).toEqual(new Set([weight]));
    }
  );

  it('wins even when the type style is emitted after it', async () => {
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';\n`, {
      base: `${packageRoot}src/styles/`,
      onDependency() {},
    });
    const css = compiler.build([
      'font-semibold',
      'text-body',
      'md:text-body-sm',
      'text-h2',
      'font-normal',
    ]);
    expect(css.indexOf('.md\\:text-body-sm')).toBeGreaterThan(css.indexOf('.font-semibold'));
    const markup =
      '<p id="a" class="text-body md:text-body-sm font-semibold">a</p>' +
      '<h2 id="b" class="font-normal md:text-h2">b</h2>';
    expect(await weightOf(css, markup, '#a', 'a')).toEqual(['600']);
    expect(await weightOf(css, markup, '#b', 'b')).toEqual(['400']);
  });

  itFailsWithoutDist(built);
});
