// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { native, render } from './cases';

const entry = fileURLToPath(new URL('./ours.ts', import.meta.url));

describe('in real Chromium, which ships without Icelandic', () => {
  let browser: Browser;
  let bundle: string;

  beforeAll(async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'eldraFormat' },
      },
    });
    const [result] = Array.isArray(output) ? output : [output];
    bundle = (result as { output: { code?: string }[] }).output[0]?.code ?? '';
    browser = await chromium.launch();
  }, 60_000);
  afterAll(() => browser?.close());

  it.each(['is-IS', 'en-US'])('%s matches Node with full ICU', async (locale) => {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const runtime = await page.evaluate(() => Intl.NumberFormat.supportedLocalesOf(['is']).length);
    const rendered = await page.evaluate(
      (tag) => (globalThis as any).eldraFormat.renderOurs(tag),
      locale
    );
    await page.close();
    expect(runtime).toBe(0);
    expect(rendered).toEqual(render(native, locale));
  });
});
