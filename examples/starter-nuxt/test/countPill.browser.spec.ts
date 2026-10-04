// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { flushPromises, mount } from '@vue/test-utils';
import { computed } from 'vue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Block from '../blocks/navigation/Block.vue';
import mock from '../blocks/navigation/mock.json';
import { mountOptions } from './support/mountBlock';
import { STOREFRONT_KEY } from '../app/storefront/types';
import { createDemoStorefront } from '../app/storefront/demo';

/**
 * **Does the header's cart count pill actually come out pill-sized, in a real browser?**
 *
 * `blocks/navigation/__tests__/Block.spec.ts` proves the pill carries the spec's classes
 * (`COUNT_PILL_CLASSES` in `Block.vue`) — `min-h-5`/`min-w-5`/`h-5` instead of `@eldrajs/ui`
 * `Badge`'s own `min-h-6`, and none of the old `-top-0.5 -right-0.5`/`px-1` overshoot survives
 * `tailwind-merge`. That is a class-name assertion, in jsdom, which computes no layout at all — it
 * cannot see whether those classes actually resolve to a ≤20px-tall, ≥20px-wide box once the
 * theme's real Tailwind build and a real browser's box model are both in the loop, which is
 * exactly the gap the reported defect (a pill that read as too large next to its icon) lived in.
 *
 * Same technique as `carouselRing.browser.spec.ts`: the real block is mounted with
 * `@vue/test-utils`, its rendered markup is compiled against the theme's actual `main.css` with
 * `@tailwindcss/node`, and the result is handed to a real Chromium page — no Nuxt build, no
 * network, nothing but the markup, the stylesheet and the browser's own layout engine.
 */

const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;
/** 1440px, the width the operator's screenshot showed the oversized pill at. */
const VIEWPORT = { width: 1440, height: 900 };

/** Renders the header with a fixed cart count, against the theme's real stylesheet. */
async function renderHeaderWithCartCount(count: number): Promise<string> {
  const base = mountOptions({ entry: { id: 'e1', data: mock } });
  const storefront = createDemoStorefront();
  const cart = { ...storefront.cart, count: computed(() => count) };
  const wrapper = mount(Block, {
    ...base,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [STOREFRONT_KEY]: { ...storefront, cart } },
    },
  });
  // `cartCount` only reads the store after `onMounted` (so a prerendered page's first client
  // render agrees with the server's) — the same wait `Block.spec.ts` gives every cart-count case.
  await flushPromises();
  await flushPromises();
  const html = wrapper.html();
  wrapper.unmount();
  return html;
}

async function pageFor(html: string): Promise<Page> {
  const candidates = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.split(/\s+/).filter(Boolean)
  );
  const compiler = await compile(readFileSync(`${assetsDir}main.css`, 'utf8'), {
    base: assetsDir,
    onDependency() {},
  });
  const css = compiler.build([...new Set(candidates)]);

  const page = await browser.newPage({ viewport: VIEWPORT, reducedMotion: 'reduce' });
  // Nothing is fetched: icon markup and the brand logo are either inline or absent from the mock,
  // and the pill owes nothing to either.
  await page.route('**', (route) => route.abort());
  await page.setContent(`<style>${css}</style><main>${html}</main>`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

let browser: Browser;

describe('the header cart count pill, in a real browser at 1440px', () => {
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  /**
   * Spec "Header" → Layout, "Cart count": "a pill at least 1.25rem wide and 1.25rem tall". The
   * ceiling (≤20px tall) is the actual defect: `Badge`'s own `min-h-6` (24px) read as oversized
   * next to the bag icon; the floor (≥20px wide) is the spec's own minimum, so a one-digit count
   * does not shrink below it either.
   */
  it('comes out at most 20px tall and at least 20px wide with one item', async () => {
    const html = await renderHeaderWithCartCount(1);
    const page = await pageFor(html);
    try {
      // `span`, not `[aria-hidden="true"]` alone: the bag's own icon is an `aria-hidden` `<svg>`
      // right beside it, inside the same actions row.
      const pill = page.locator('header [data-eldra-header-actions] span[aria-hidden="true"]');
      expect((await pill.textContent())?.trim()).toBe('1');
      const box = await pill.boundingBox();
      if (box === null) throw new Error('the pill never laid out');
      expect(box.height).toBeLessThanOrEqual(20);
      expect(box.width).toBeGreaterThanOrEqual(20);
    } finally {
      await page.close();
    }
  });

  /** Spec: "Above 99 it reads `99+`." Three characters, bold, at 0.75rem — this is the row most
   *  likely to overflow its own box if the pill's padding or width ever regressed. */
  it('fits "99+" with no clipping, above the 99 ceiling', async () => {
    const html = await renderHeaderWithCartCount(120);
    const page = await pageFor(html);
    try {
      const pill = page.locator('header [data-eldra-header-actions] span[aria-hidden="true"]');
      expect((await pill.textContent())?.trim()).toBe('99+');
      const overflow = await pill.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
      const box = await pill.boundingBox();
      if (box === null) throw new Error('the pill never laid out');
      expect(box.height).toBeLessThanOrEqual(20);
    } finally {
      await page.close();
    }
  });
});
