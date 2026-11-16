// @vitest-environment node
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { compileKitCss } from '../../test/kitCss';

/** `section-primary:` / `section-accent:` follow the nearest `data-section`, as `group/section` did. */
const PROBE = 'eldra:section-primary:text-[rgb(1,0,0)] eldra:section-accent:text-[rgb(0,1,0)]';
const MARKUP = `
  <p id="plain" class="${PROBE}"></p>
  <div data-section="primary">
    <p id="primary" class="${PROBE}"></p>
    <div data-section="none"><p id="card" class="${PROBE}"></p></div>
    <div data-section="accent"><div><p id="accent" class="${PROBE}"></p></div></div>
  </div>`;

let browser: Browser;
let css: string;

beforeAll(async () => {
  css = await compileKitCss(PROBE.split(' '));
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

describe('the section variants, in a real browser', () => {
  it('invert under the nearest coloured section and stop at a nearer other one', async () => {
    const page = await browser.newPage();
    await page.setContent(
      `<style>${css} @layer base { p { color: rgb(9, 9, 9); } }</style>${MARKUP}`
    );
    const color = (id: string) =>
      page.evaluate((i) => getComputedStyle(document.getElementById(i)!).color, id);
    expect(await color('plain')).toBe('rgb(9, 9, 9)');
    expect(await color('primary')).toBe('rgb(1, 0, 0)');
    expect(await color('card')).toBe('rgb(9, 9, 9)');
    expect(await color('accent')).toBe('rgb(0, 1, 0)');
    await page.close();
  });
});
