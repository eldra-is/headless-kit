// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { flushPromises, mount } from '@vue/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Block from '../blocks/product-carousel/Block.vue';
import mock from '../blocks/product-carousel/mock.json';
import { mountOptions } from './support/mountBlock';
import { STOREFRONT_KEY } from '../app/storefront/types';
import { createDemoStorefront } from '../app/storefront/demo';

/**
 * **Does a product card stay inside its slide, in a real browser?**
 *
 * `ProductCard` carries the spec's grid recommendation as a hard `min-w-56` (14rem). A carousel
 * slide is `(track − gaps) / perView` wide, and the `recently-viewed` variant shows six per view
 * from 64rem — on a 1228px track that is 189px, 35px less than the card's minimum. The card then
 * overflowed its slide, the 16px gap disappeared under it and every tile overlapped the next one,
 * which is what the operator saw on the cart page's "Recently viewed" row. jsdom computes no
 * layout, so only a real browser over the theme's real stylesheet can prove the card now fills its
 * slide exactly (`blocks/product-carousel/Block.vue`'s `CARD_CLASSES`). Same technique as
 * `carouselRing.browser.spec.ts`.
 */

const assetsDir = `${join(import.meta.dirname, '../app/assets')}/`;

describe('a recently-viewed product carousel at 1440px, in a real browser', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const storefront = createDemoStorefront();
    const base = mountOptions({
      entry: { id: 'width', data: { ...mock, variant: 'recently-viewed' } },
    });
    const wrapper = mount(Block, {
      ...base,
      global: { ...base.global, provide: { ...base.global.provide, [STOREFRONT_KEY]: storefront } },
    });
    await flushPromises();
    await flushPromises();
    const html = wrapper.html();
    wrapper.unmount();

    const candidates = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
      match[1]!.split(/\s+/).filter(Boolean)
    );
    const compiler = await compile(readFileSync(`${assetsDir}main.css`, 'utf8'), {
      base: assetsDir,
      onDependency() {},
    });
    const css = compiler.build([...new Set(candidates)]);

    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    await page.route('**', (route) => route.abort());
    await page.setContent(`<style>${css}</style><main>${html}</main>`, {
      waitUntil: 'domcontentloaded',
    });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('shows more than one card, each exactly as wide as its slide, with the track gap kept between them', async () => {
    const boxes = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('.eldra-carousel-track');
      if (track === null) return null;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap);
      const slides = Array.from(track.querySelectorAll<HTMLElement>('.eldra-carousel-slide')).map(
        (slide) => {
          const card = slide.querySelector('article');
          const s = slide.getBoundingClientRect();
          const c = card?.getBoundingClientRect();
          return { slide: { x: s.x, width: s.width }, card: c ? { x: c.x, width: c.width } : null };
        }
      );
      return { gap, slides };
    });
    if (boxes === null) throw new Error('the carousel track never laid out');
    expect(boxes.slides.length).toBeGreaterThan(1);
    expect(boxes.gap).toBeGreaterThan(0);
    for (const { slide, card } of boxes.slides) {
      if (card === null) throw new Error('a slide holds no card');
      // The card fills its slide: same left edge, same width (within a subpixel of rounding).
      expect(Math.abs(card.x - slide.x)).toBeLessThan(1);
      expect(Math.abs(card.width - slide.width)).toBeLessThan(1);
    }
    for (let i = 1; i < boxes.slides.length; i += 1) {
      const previous = boxes.slides[i - 1]!.card!;
      const current = boxes.slides[i]!.card!;
      // The visible space between two neighbouring cards is the track's own gap, not less.
      expect(current.x - (previous.x + previous.width)).toBeGreaterThanOrEqual(boxes.gap - 1);
    }
  });
});
