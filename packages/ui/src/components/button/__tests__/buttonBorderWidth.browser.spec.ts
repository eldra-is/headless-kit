// @vitest-environment node
import { chromium, type Browser } from '@playwright/test';
import { IconX } from '@tabler/icons-vue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import Button from '../Button.vue';
import ButtonGroup from '../ButtonGroup.vue';
import { compileKitCss } from '../../../test/kitCss';

/**
 * **Does `--eldra-button-border-width` widen the border without growing the button, and do attached
 * buttons still share one line?** Only layout can say: the real markup, the package's own
 * stylesheet built over its classes, measured in Chromium.
 */

async function render(): Promise<string> {
  return renderToString(
    createSSRApp(() =>
      h('div', [
        h(Button, { variant: 'outline', id: 'single' }, () => 'Save'),
        h('div', { id: 'column', style: 'display:flex;flex-direction:column;width:600px' }, [
          h(Button, { variant: 'primary', id: 'fit' }, () => 'Save'),
          h(Button, {
            variant: 'primary',
            iconOnly: true,
            icon: IconX,
            label: 'Close',
            id: 'icon',
          }),
          h(Button, { variant: 'primary', block: true, id: 'block' }, () => 'Save'),
        ]),
        h(ButtonGroup, { attached: true, 'aria-label': 'View' }, () => [
          h(Button, { variant: 'outline', id: 'first' }, () => 'Grid'),
          h(Button, { variant: 'outline', id: 'second' }, () => 'List'),
        ]),
      ])
    )
  );
}

let browser: Browser;
let css: string;
let html: string;

async function measure(width?: string) {
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  const style = width === undefined ? '' : `--eldra-button-border-width:${width}`;
  await page.setContent(`<style>${css}</style><main style="${style}">${html}</main>`);
  const result = await page.evaluate(() => {
    const box = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    const single = document.getElementById('single')!;
    return {
      border: getComputedStyle(single).borderTopWidth,
      height: box('single').height,
      overlap: box('first').right - box('second').left,
      column: { fit: box('fit').width, icon: box('icon'), block: box('block').width },
    };
  });
  await page.close();
  return result;
}

beforeAll(async () => {
  html = await render();
  const candidates = new Set<string>();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    // The server renderer escapes `&` and `>` in an attribute; the group's `[&>*…]` variants need
    // them back.
    const classes = match[1]!.replaceAll('&gt;', '>').replaceAll('&amp;', '&');
    for (const name of classes.split(/\s+/)) {
      if (name) candidates.add(name);
    }
  }
  css = await compileKitCss(candidates);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

describe('Button border width, in a real browser', () => {
  it('defaults to 1px, and attached buttons overlap by 1px', async () => {
    const { border, overlap } = await measure();
    expect(border).toBe('1px');
    expect(overlap).toBe(1);
  });

  it('follows --eldra-button-border-width at the same height, the overlap following it', async () => {
    const thin = await measure();
    const wide = await measure('2px');
    expect(wide.border).toBe('2px');
    expect(wide.height).toBe(thin.height);
    expect(wide.overlap).toBe(2);
  });

  it('fits its content in a stretching flex column, unless block', async () => {
    const { column } = await measure();
    expect(column.fit).toBeLessThan(200);
    expect(column.icon.width).toBe(column.icon.height);
    expect(column.block).toBe(600);
  });
});
