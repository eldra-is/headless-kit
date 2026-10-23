// @vitest-environment node
import { fileURLToPath } from 'node:url';
import type { EldraFormDefinition } from '@eldrajs/sdk';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import SiteForm from '../SiteForm.vue';

// A real browser decides what the honeypot is to a person: whether it paints, takes focus or reaches the accessibility tree.

const CONTACT: EldraFormDefinition = {
  key: 'contact',
  name: 'Hafa samband',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'is-IS': 'Nafn' } },
    { id: 'email', type: 'email', required: true, label: { 'is-IS': 'Netfang' } },
    { id: 'note', type: 'textarea', required: false, label: { 'is-IS': 'Skilaboð' } },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: { 'is-IS': 'Takk.' } },
  kinds: ['store', 'notify'],
};

const stylesDir = fileURLToPath(new URL('../../../styles/', import.meta.url));
const client = {
  forms: {
    get: async () => CONTACT,
    submit: async () => ({ status: 'ok' as const, pending: false }),
  },
};

let browser: Browser;
let html: string;
let css: string;

beforeAll(async () => {
  html = await renderToString(
    createSSRApp(() => h(SiteForm, { definition: CONTACT, client, locale: 'is-IS' }))
  );
  const candidates = new Set<string>();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
  }
  const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';\n`, {
    base: stylesDir,
    onDependency() {},
  });
  css = compiler.build([...candidates]);
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

async function open(): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`<style>${css}</style><main style="padding:16px">${html}</main>`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

describe('SiteForm in a browser', () => {
  it('renders on the server with every field, the honeypot and the button', () => {
    expect(html).toContain('name="name"');
    expect(html).toContain('name="website"');
    expect(html).toContain('type="submit"');
  });

  it('tabs through the fields and the button, never the honeypot', async () => {
    const page = await open();
    try {
      const visited: string[] = [];
      for (let press = 0; press < 5; press += 1) {
        await page.keyboard.press('Tab');
        visited.push(
          await page.evaluate(() => {
            const active = document.activeElement as HTMLInputElement | null;
            return active?.getAttribute('name') ?? active?.textContent?.trim() ?? '';
          })
        );
      }
      expect(visited.slice(0, 4)).toEqual(['name', 'email', 'note', 'Send']);
      expect(visited).not.toContain('website');
    } finally {
      await page.close();
    }
  });

  it('keeps the honeypot out of sight and out of the accessibility tree', async () => {
    const page = await open();
    try {
      const textboxes = await page
        .getByRole('textbox')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('name')));
      expect(textboxes).toEqual(['name', 'email', 'note']);

      const honeypot = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>('input[name="website"]')!;
        input.focus();
        const box = input.parentElement!.getBoundingClientRect();
        const own = input.getBoundingClientRect();
        const hit = document.elementFromPoint(own.x + own.width / 2, own.y + own.height / 2);
        return {
          focused: document.activeElement === input,
          width: box.width,
          height: box.height,
          paintedOnTop: hit === input,
        };
      });
      expect(honeypot.focused).toBe(false);
      expect(honeypot.width).toBeLessThanOrEqual(1);
      expect(honeypot.height).toBeLessThanOrEqual(1);
      expect(honeypot.paintedOnTop).toBe(false);
    } finally {
      await page.close();
    }
  });
});
