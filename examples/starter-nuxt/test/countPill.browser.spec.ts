// @vitest-environment jsdom
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 * **Does the header's cart count pill actually come out as a corner badge, in a real browser?**
 *
 * `blocks/navigation/__tests__/Block.spec.ts` proves the pill carries the operator's corner-badge
 * classes (`COUNT_PILL_CLASSES` in `Block.vue`) — `min-h-3.5`/`min-w-3.5`/`h-3.5`, `-top-0.5
 * -right-0.5`, no ring. That is a class-name assertion, in jsdom, which computes no layout at all —
 * it cannot see whether those classes actually resolve to a 14px-tall box sitting on the icon's own
 * corner once the theme's real Tailwind build and a real browser's box model are both in the loop,
 * which is exactly the gap two reported defects in a row lived in: first a pill that read as too
 * large next to the icon (fixed by shrinking it to spec), then — worse — a pill that, once moved onto
 * the icon's corner, covered almost the whole glyph (fixed by shrinking it further and letting it
 * mostly overlap the button's own padding rather than the icon).
 *
 * Same technique as `carouselRing.browser.spec.ts`: the real block is mounted with
 * `@vue/test-utils`, its rendered markup is compiled against the theme's actual `main.css` with
 * `@tailwindcss/node`, and the result is handed to a real Chromium page — no Nuxt build, no
 * network, nothing but the markup, the stylesheet and the browser's own layout engine.
 */

const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;
/** 1440px, the width the operator's screenshots showed the pill at. */
const VIEWPORT = { width: 1440, height: 900 };
/** Where the operator's review ledger keeps this change's screenshot. Written by the test itself
 *  (outside the repo tree on purpose — a ledger artefact, not a committed fixture, alongside the
 *  ledger's other `*-live*.png` entries), so a reviewer can see the actions row the assertions
 *  below are describing without re-running anything. An absolute path on purpose: the ledger's
 *  location is fixed by the review workflow, not by where this worktree happens to sit on disk. */
const LEDGER_SCREENSHOT =
  '/Users/nokkvi/Documents/eldra/web-studio/cms-ecommerce/web-studio-web/.superpowers/sdd/' +
  '2026-09-30-link-field-and-navigation/refs/count-pills-r19.png';

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

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Overlap area of two axis-aligned rects, clamped to zero when they don't intersect. */
function intersectionArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return Math.max(width, 0) * Math.max(height, 0);
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
   * A corner badge is at most 14px tall — that is the
   * whole point of shrinking it off the spec's 1.25rem minimum. The width floor comes along for
   * free from `min-w-3.5`.
   */
  it('comes out at most 14px tall with one item', async () => {
    const html = await renderHeaderWithCartCount(1);
    const page = await pageFor(html);
    try {
      // `span`, not `[aria-hidden="true"]` alone: the bag's own icon is an `aria-hidden` `<svg>`
      // right beside it, inside the same actions row.
      const pill = page.locator('header [data-eldra-header-actions] span[aria-hidden="true"]');
      expect((await pill.textContent())?.trim()).toBe('1');
      const box = await pill.boundingBox();
      if (box === null) throw new Error('the pill never laid out');
      expect(box.height).toBeLessThanOrEqual(14);
    } finally {
      await page.close();
    }
  });

  /**
   * The defect this change actually fixes: a pill moved onto the icon's own corner that then
   * covered almost the whole glyph. Measured against the real `<svg>` the bag icon renders (not an
   * assumed box), the pill's footprint must land mostly on the button's own padding — at most a
   * quarter of the icon's area — so the icon stays recognisable with a badge sitting on its
   * corner, not a badge sitting on top of it.
   */
  it('overlaps the bag icon by at most a quarter of its area, with no ring left behind', async () => {
    const html = await renderHeaderWithCartCount(1);
    const page = await pageFor(html);
    try {
      const pill = page.locator('header [data-eldra-header-actions] span[aria-hidden="true"]');
      const pillBox = await pill.boundingBox();
      if (pillBox === null) throw new Error('the pill never laid out');

      // The bag's own icon: the leading-icon slot's `<svg>` inside the same wrapper the pill is a
      // sibling of (`<span class="relative inline-flex"><Button>…<svg/></Button><Badge/></span>`).
      const iconBox = await pill.evaluate((el): Rect | null => {
        const svg = el.parentElement?.querySelector('[data-part="leadingIcon"] svg');
        if (svg === null || svg === undefined) return null;
        const rect = svg.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      if (iconBox === null) throw new Error('the bag icon never rendered');

      const overlap = intersectionArea(pillBox, iconBox);
      const iconArea = iconBox.width * iconBox.height;
      expect(overlap / iconArea).toBeLessThanOrEqual(0.25);

      // The ring the earlier version carried (`ring-2 ring-background`) painted as a box-shadow;
      // a corner badge sitting on the icon must carry none, since a ring's job is separating a
      // pill from what sits beside it, and this pill sits deliberately on top of the icon.
      const boxShadow = await pill.evaluate((el) => getComputedStyle(el).boxShadow);
      expect(boxShadow === 'none' || boxShadow === '').toBe(true);
    } finally {
      await page.close();
    }
  });

  /** Spec: "Above 99 it reads `99+`." Three characters, bold, at 0.625rem — this is the row most
   *  likely to overflow its own box if the pill's padding or width ever regressed, now that both
   *  are smaller than the spec's original pill. */
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
      expect(box.height).toBeLessThanOrEqual(14);
    } finally {
      await page.close();
    }
  });

  /**
   * The operator's own review artefact: a screenshot of the actions row (bag + its corner badge)
   * at the viewport the defect was reported at, written to the review ledger so this change can
   * be checked without re-running the suite.
   */
  it('writes the actions row to the review ledger', async () => {
    const html = await renderHeaderWithCartCount(3);
    const page = await pageFor(html);
    try {
      const actions = page.locator('header [data-eldra-header-actions]');
      mkdirSync(dirname(LEDGER_SCREENSHOT), { recursive: true });
      await actions.screenshot({ path: LEDGER_SCREENSHOT });
    } finally {
      await page.close();
    }
  });
});
