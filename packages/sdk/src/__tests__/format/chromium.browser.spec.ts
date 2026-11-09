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

describe('installIcelandicIntl in real Chromium', () => {
  let browser: Browser;
  let bundle: string;

  beforeAll(async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: {
          entry: fileURLToPath(new URL('../../format/intl.ts', import.meta.url)),
          formats: ['iife'],
          name: 'eldraIntl',
        },
      },
    });
    const [result] = Array.isArray(output) ? output : [output];
    bundle = (result as { output: { code?: string }[] }).output[0]?.code ?? '';
    browser = await chromium.launch();
  }, 60_000);
  afterAll(() => browser?.close());

  it('formats Icelandic and leaves en-GB to the browser', async () => {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle });
    const printed = await page.evaluate(() => {
      const moment = new Date(Date.UTC(2026, 9, 12));
      const date = { dateStyle: 'long', timeZone: 'UTC' } as const;
      const before = new Intl.DateTimeFormat('is-IS', date).format(moment);
      (globalThis as any).eldraIntl.installIcelandicIntl();
      return {
        before,
        is: new Intl.DateTimeFormat('is-IS', date).format(moment),
        isNumber: (1234.5).toLocaleString('is-IS'),
        enGB: new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeZone: 'UTC' }).format(
          moment
        ),
      };
    });
    await page.close();
    expect(printed.before).not.toContain('október');
    expect(printed).toMatchObject({
      is: '12. október 2026',
      isNumber: '1.234,5',
      enGB: '12/10/2026',
    });
  });
});
