// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import vue from '@vitejs/plugin-vue';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../../../test/built';

const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const navMenuPath = fileURLToPath(new URL('../NavMenu.vue', import.meta.url));
const stylePath = `${packageRoot}dist/style.css`;
const built = isBuilt(stylePath);

const ENTRY = `
import { createApp, h } from 'vue';
import NavMenu from ${JSON.stringify(navMenuPath)};
const items = [
  { label: 'Shop', children: [
    { label: 'Sweaters', href: '#sweaters', group: 'Knitwear' },
    { label: 'Cardigans', href: '#cardigans', group: 'Knitwear' },
    { label: 'Mugs', href: '#mugs', group: 'Ceramics' },
  ] },
  { label: 'Journal', children: [{ label: 'Stories', href: '#stories' }] },
  { label: 'About', href: '#about' },
];
createApp({ render: () => h(NavMenu, { items }) }).mount('#app');
`;

/** The real component, compiled with Vue into one script the page can run. */
async function bundle(): Promise<string> {
  const output = (await build({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [
      vue(),
      {
        name: 'nav-menu-entry',
        resolveId: (id) => (id === 'nav-menu-entry' ? '\0nav-menu-entry' : undefined),
        load: (id) => (id === '\0nav-menu-entry' ? ENTRY : undefined),
      },
    ],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: 'nav-menu-entry', output: { format: 'iife' } },
    },
  })) as Rollup.RollupOutput[] | Rollup.RollupOutput;
  const outputs = Array.isArray(output) ? output : [output];
  const chunk = outputs[0]!.output.find((item) => item.type === 'chunk');
  return (chunk as Rollup.OutputChunk).code;
}

let browser: Browser;
let script: string;
let css: string;

beforeAll(async () => {
  if (!built) return;
  [browser, script] = await Promise.all([chromium.launch(), bundle()]);
  css = readFileSync(stylePath, 'utf8');
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function open(width = 1280): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  await page.setContent(
    `<style>${css}</style><button id="before">Before</button>` +
      `<div id="app" style="margin:0 40px"></div><button id="after">After</button>`
  );
  await page.addScriptTag({ content: script });
  await page.waitForSelector('[data-part="trigger"]', { state: 'attached' });
  return page;
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return `${el.dataset.part ?? el.tagName}:${el.textContent?.trim()}`;
  });

const expanded = (page: Page, label: string) =>
  page.getByRole('button', { name: label }).getAttribute('aria-expanded');

describe('NavMenu in a browser', () => {
  it.runIf(built)('opens with Enter, walks into the panel with Tab, closes on Escape', async () => {
    const page = await open();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('trigger:Shop');
    await page.keyboard.press('Enter');
    expect(await expanded(page, 'Shop')).toBe('true');
    expect(await focused(page)).toBe('trigger:Shop');
    await page.keyboard.press('Tab');
    expect(await focused(page)).toContain('panelLink:Sweaters');
    await page.keyboard.press('Escape');
    expect(await expanded(page, 'Shop')).toBe('false');
    expect(await focused(page)).toBe('trigger:Shop');
    await page.close();
  });

  it.runIf(built)('closes when Tab leaves the panel, landing on the next item', async () => {
    const page = await open();
    await page.getByRole('button', { name: 'Shop' }).focus();
    await page.keyboard.press('Space');
    expect(await expanded(page, 'Shop')).toBe('true');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('trigger:Journal');
    expect(await expanded(page, 'Shop')).toBe('false');
    await page.close();
  });

  it.runIf(built)('keeps one panel open and closes on a click outside', async () => {
    const page = await open();
    await page.getByRole('button', { name: 'Shop' }).click();
    await page.getByRole('button', { name: 'Journal' }).click();
    expect(await expanded(page, 'Shop')).toBe('false');
    expect(await expanded(page, 'Journal')).toBe('true');
    await page.locator('#after').click();
    expect(await expanded(page, 'Journal')).toBe('false');
    await page.close();
  });

  it.runIf(built)(
    'hangs a dropdown under its item and spans the menu with a mega panel',
    async () => {
      const page = await open();
      const box = (selector: string) => page.locator(selector).first().boundingBox();
      await page.getByRole('button', { name: 'Shop' }).click();
      const root = (await box('[data-part="root"]'))!;
      const mega = (await box('[data-part="panel"]:visible [data-part="content"]'))!;
      expect(mega.x).toBeCloseTo(root.x, 0);
      expect(mega.width).toBeCloseTo(root.width, 0);
      expect(mega.y).toBeGreaterThanOrEqual(root.y + root.height);
      await page.getByRole('button', { name: 'Journal' }).click();
      const item = (await box('[data-part="item"]:nth-child(2)'))!;
      const dropdown = (await box('[data-part="panel"]:visible [data-part="content"]'))!;
      expect(dropdown.x).toBeCloseTo(item.x, 0);
      expect(dropdown.y).toBeGreaterThanOrEqual(item.y + item.height);
      await page.close();
    }
  );

  it.runIf(built)('turns into a menu button and a drawer on a narrow screen', async () => {
    const page = await open(375);
    expect(await page.locator('[data-part="nav"]').first().isVisible()).toBe(false);
    const toggle = page.getByRole('button', { name: 'Menu', exact: true });
    await toggle.click();
    expect(await page.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.open)).toBe(
      true
    );
    expect(await toggle.getAttribute('aria-expanded')).toBe('true');
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SUMMARY');
    await page.keyboard.press('Escape');
    expect(await page.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.open)).toBe(
      false
    );
    expect(await focused(page)).toBe('toggle:');
    await page.close();
  });

  itFailsWithoutDist(built);
});
