// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * **Does the caret stay where the customer is typing while the number is re-spaced?**
 *
 * Every keystroke rewrites the field's text, and a rewritten `<input>` puts its caret at the end.
 * Whether it is then put back correctly is a question about a real browser's selection after real
 * key presses: a DOM stand-in applies `setSelectionRange` to whatever value it is handed, and has
 * no caret that a `Backspace` or an arrow key moves. So the real component is bundled, mounted in
 * Chromium and typed into with the keyboard.
 *
 * `environment: node` for the reason `tabsRing.browser.spec.ts` gives: under happy-dom, closing
 * Playwright's browser is reported as a worker crash.
 */
const entry = fileURLToPath(new URL('./caretHarness.ts', import.meta.url));

describe('PhoneInput caret, in real Chromium', () => {
  let browser: Browser;
  let bundle: string;

  beforeAll(async () => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [vue()],
      define: { 'process.env.NODE_ENV': '"production"' },
      build: {
        write: false,
        minify: false,
        lib: { entry, formats: ['iife'], name: 'phoneHarness' },
      },
    });
    const [result] = Array.isArray(output) ? output : [output];
    bundle = (result as { output: { code?: string }[] }).output[0]?.code ?? '';
    browser = await chromium.launch();
  }, 120_000);
  afterAll(() => browser?.close());

  async function open(country: string): Promise<Page> {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><div id="host"></div>');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      (code) => (globalThis as any).phoneHarness.mountPhone(document.getElementById('host'), code),
      country
    );
    await page.locator('input[type="tel"]').click();
    return page;
  }

  /** The field's text with `|` where the caret is, and what the model holds. */
  async function read(page: Page): Promise<{ text: string; value: string | undefined }> {
    return page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      if (input.selectionStart !== input.selectionEnd) throw new Error('a selection, not a caret');
      const caret = input.selectionStart!;
      return {
        text: `${input.value.slice(0, caret)}|${input.value.slice(caret)}`,
        value: document.getElementById('host')!.dataset.value,
      };
    });
  }

  it('typing at the end keeps the caret at the end, past each space the format adds', async () => {
    const page = await open('DK');
    const seen: string[] = [];
    for (const digit of '32123456') {
      await page.keyboard.press(digit);
      seen.push((await read(page)).text);
    }
    expect(seen).toEqual([
      '3|',
      '32|',
      '32 1|',
      '32 12|',
      '32 12 3|',
      '32 12 34|',
      '32 12 34 5|',
      '32 12 34 56|',
    ]);
    expect((await read(page)).value).toBe('+4532123456');
    await page.close();
  });

  it('a digit typed in the middle leaves the caret right after it', async () => {
    const page = await open('DK');
    await page.keyboard.type('321234');
    expect((await read(page)).text).toBe('32 12 34|');
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
    expect((await read(page)).text).toBe('32 1|2 34');
    await page.keyboard.press('9');
    // Seven digits re-space; the caret is after the 9, wherever the spaces now fall.
    const after = await read(page);
    expect(after.text.replace(/ /g, '')).toBe('3219|234');
    await page.keyboard.press('8');
    expect((await read(page)).text.replace(/ /g, '')).toBe('32198|234');
    await page.close();
  });

  it('Backspace over a space steps the caret back, and the next one deletes the digit', async () => {
    const page = await open('IS');
    await page.keyboard.type('5812345');
    expect((await read(page)).text).toBe('581 2345|');
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
    expect((await read(page)).text).toBe('581 |2345');
    await page.keyboard.press('Backspace');
    expect((await read(page)).text).toBe('581| 2345');
    await page.keyboard.press('Backspace');
    expect((await read(page)).text).toBe('58|2 345');
    expect((await read(page)).value).toBe('+35458234' + '5');
    await page.close();
  });

  it('Delete in the middle keeps the caret in place', async () => {
    const page = await open('IS');
    await page.keyboard.type('5812345');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    expect((await read(page)).text).toBe('5|81 2345');
    await page.keyboard.press('Delete');
    expect((await read(page)).text).toBe('5|12 345');
    await page.close();
  });

  it('a number with brackets keeps the caret after the digit typed inside them', async () => {
    const page = await open('US');
    await page.keyboard.type('2015550123');
    expect((await read(page)).text).toBe('(201) 555-0123|');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect((await read(page)).text).toBe('(2|01) 555-0123');
    await page.keyboard.press('Backspace');
    expect((await read(page)).text.replace(/\D/g, '').length).toBe(9);
    expect(
      (await read(page)).text.startsWith('|') || (await read(page)).text.startsWith('(|')
    ).toBe(true);
    await page.close();
  });

  it('typing a dialling code switches the country and leaves the caret with the national digits', async () => {
    const page = await open('IS');
    await page.keyboard.type('+45');
    expect((await read(page)).text).toBe('|');
    expect(await page.locator('[data-part="callingCode"]').textContent()).toBe('+45');
    await page.keyboard.type('3212');
    expect((await read(page)).text).toBe('32 12|');
    await page.close();
  });

  it('a pasted international number picks its country, and the caret ends after it', async () => {
    const page = await open('IS');
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('input[type="tel"]')!;
      input.focus();
      document.execCommand('insertText', false, '+45 32 12 34 56');
    });
    expect((await read(page)).text).toBe('32 12 34 56|');
    expect(await page.locator('[data-part="callingCode"]').textContent()).toBe('+45');
    expect((await read(page)).value).toBe('+4532123456');
    await page.close();
  });

  it('a dialling code pasted in front of the digits leaves the caret in front of them', async () => {
    const page = await open('IS');
    await page.keyboard.type('32123456');
    await page.keyboard.press('Home');
    await page.evaluate(() => document.execCommand('insertText', false, '+45'));
    expect((await read(page)).text).toBe('|32 12 34 56');
    expect(await page.locator('[data-part="callingCode"]').textContent()).toBe('+45');
    await page.close();
  });

  it('a letter is dropped and the caret stays between the same two digits', async () => {
    const page = await open('IS');
    await page.keyboard.type('5812345');
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('x');
    // Either side of the space: the next digit typed lands in the same place from both.
    expect((await read(page)).text.replace(/ /g, '')).toBe('581|2345');
    await page.keyboard.press('9');
    expect((await read(page)).text.replace(/ /g, '')).toBe('5819|2345');
    await page.close();
  });
});
