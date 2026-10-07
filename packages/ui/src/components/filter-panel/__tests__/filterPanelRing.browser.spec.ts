// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import FilterPanel from '../FilterPanel.vue';
import type { FilterFacet } from '../types';
import { COLOUR_FACET, PRICE_FACET, SIZE_FACET } from './fixtures';

/**
 * **Is the ring really painted around the whole row, the whole tile and the thumb — and does the
 * colour facet's two-column rule measure the panel?**
 *
 * Four things no class or declaration assertion can see:
 *
 * 1. A swatch row and a size tile are **proxy** rings: the element that draws the ring is the
 *    `<label>`, and the element that is focused is an `<input>` stretched invisibly over it. That
 *    only works through `:has(:focus-visible)` (`eldra-focus-proxy`), and `:focus-visible` is not
 *    what `element.focus()` produces — so the only honest check is a real `Tab` press followed by
 *    a pixel sample outside the row's own edges.
 * 2. A range thumb is centred on its value, so the one at `min` hangs half its own width past the
 *    start of the track and its ring a further `--eldra-focus-offset` + `--eldra-focus-width` past
 *    that. `RangeSlider` reserves that room itself, but the panel is what puts the control in a
 *    15rem sidebar with a `<fieldset>` around it, which is where a missing reservation would
 *    actually clip.
 * 3. The spec's "colour rows switch to 2 columns once the panel is 26rem or wider" is a
 *    **container** query, and a `@container` rule whose breakpoint or container context is wrong
 *    compiles to silence — no error, no rule, just one column for ever.
 * 4. And the spec's own 320px reflow line: the panel in a phone-width drawer must not scroll
 *    sideways.
 *
 * Modelled on `range-slider/__tests__/rangeSliderRing.browser.spec.ts`: the markup is the real
 * component's, rendered by Vue; the stylesheet is this package's real Tailwind build over exactly
 * those classes; focus is reached by pressing `Tab` from the top of the document.
 */

/** The 15rem sidebar the spec sizes the panel for. */
const SIDEBAR_WIDTH = 240;
/**
 * One pixel either side of 26rem (416px at a 16px root), which is what makes the edge itself the
 * thing under test rather than "somewhere wide" and "somewhere narrow": the root carries no
 * padding precisely so `container-type: inline-size` queries the panel's real width, and a gutter
 * there would move this boundary by its own width.
 */
const UNDER_TWO_COLUMNS = 415;
const OVER_TWO_COLUMNS = 417;

const stylesDir = fileURLToPath(new URL('../../../styles/', import.meta.url));

/** The real component's HTML, one facet at a time so a single `Tab` reaches the control at issue. */
async function render(facets: FilterFacet[], props: Record<string, unknown> = {}): Promise<string> {
  return renderToString(
    createSSRApp(() => h(FilterPanel, { facets, currency: 'USD', showHead: false, ...props }))
  );
}

/**
 * A 1x1 PNG, which is all a pixel sample needs — at one pixel every PNG filter type reduces to the
 * raw bytes, so this is the whole decoder. The same one the other browser specs carry.
 */
function decodeBrightness(png: Buffer): number {
  let pos = 8;
  let channels = 4;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') channels = data[9] === 6 ? 4 : 3;
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < 1 + channels) throw new Error('screenshot carried no pixel');
  return (raw[1]! + raw[2]! + raw[3]!) / 3;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Measured {
  /** What a real `Tab` press reached, by its accessible name. */
  focusedLabel: string;
  focusVisible: boolean;
  /** `1` only under `:focus-visible` — `eldra-focus` declares its shadow at all times. */
  alpha: string;
  /** `--eldra-focus-offset` + `--eldra-focus-width`, as the ring's own element resolves them. */
  reach: number;
  /** The element the ring is drawn on, which for a proxy ring is not the focused one. */
  ring: Box;
  ringPart: string;
}

let browser: Browser;
let css: string;

async function open(
  facets: FilterFacet[],
  width: number,
  props: Record<string, unknown> = {}
): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 700 },
    reducedMotion: 'reduce',
  });
  await page.setContent(
    `<style>${css}</style><main style="padding:40px"><div style="width:${width}px">` +
      `${await render(facets, props)}</div></main>`,
    { waitUntil: 'domcontentloaded' }
  );
  return page;
}

/**
 * The element whose ring is in question: the focused one, or — for a proxy ring — the row or tile
 * that `eldra-focus-proxy` draws it on.
 */
async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    const ringEl =
      (active.closest('[data-part="row"], [data-part="tile"]') as HTMLElement | null) ?? active;
    const style = getComputedStyle(ringEl);
    const box = ringEl.getBoundingClientRect();
    return {
      focusedLabel: active.getAttribute('aria-label') ?? '',
      focusVisible: active.matches(':focus-visible'),
      // From the element the ring is drawn on, not the focused one: a proxy ring
      // (`eldra-focus-proxy`) raises the alpha on the row, which is what paints it.
      alpha: style.getPropertyValue('--eldra-focus-alpha').trim(),
      reach:
        parseFloat(style.getPropertyValue('--eldra-focus-offset')) +
        parseFloat(style.getPropertyValue('--eldra-focus-width')),
      ring: { x: box.x, y: box.y, width: box.width, height: box.height },
      ringPart: ringEl.getAttribute('data-part') ?? '',
    };
  });
}

/** The ring's own outer band, one pixel in from its outside edge, on each side of the element. */
async function ringPixels(
  page: Page,
  { ring, reach }: { ring: Box; reach: number }
): Promise<Record<'left' | 'right' | 'top' | 'bottom', number>> {
  const at = reach - 1;
  const midX = Math.round(ring.x + ring.width / 2);
  const midY = Math.round(ring.y + ring.height / 2);
  const sample = async (x: number, y: number): Promise<number> =>
    decodeBrightness(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return {
    left: await sample(Math.round(ring.x) - at, midY),
    right: await sample(Math.round(ring.x + ring.width) + at - 1, midY),
    top: await sample(midX, Math.round(ring.y) - at),
    bottom: await sample(midX, Math.round(ring.y + ring.height) + at - 1),
  };
}

/** One element's box and ring reach with nothing focused, so the resting state can be sampled. */
async function resting(page: Page, selector: string): Promise<{ ring: Box; reach: number }> {
  return page.evaluate((target) => {
    const element = document.querySelector(target) as HTMLElement;
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      ring: { x: box.x, y: box.y, width: box.width, height: box.height },
      reach:
        parseFloat(style.getPropertyValue('--eldra-focus-offset')) +
        parseFloat(style.getPropertyValue('--eldra-focus-width')),
    };
  }, selector);
}

/** Near-black `--eldra-color-focus` against a near-white page: one number tells them apart. */
const RING = 128;

beforeAll(async () => {
  // The package's real Tailwind entry — `@theme`, the `--eldra-*` tokens, the `eldra-focus` ring
  // and this panel's own utilities — compiled over exactly the classes this markup uses, gathered
  // from every shape the spec renders below.
  const candidates = new Set<string>();
  for (const html of await Promise.all([
    render([COLOUR_FACET]),
    render([{ ...COLOUR_FACET, layout: 'grid' }]),
    render([SIZE_FACET]),
    render([PRICE_FACET]),
    render([COLOUR_FACET, SIZE_FACET, PRICE_FACET], {
      showHead: true,
      showApplied: true,
      modelValue: { colour: ['brown'] },
      mode: 'drawer',
      resultCount: 24,
    }),
  ])) {
    for (const match of html.matchAll(/class="([^"]*)"/g)) {
      for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
    }
  }
  const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';\n`, {
    base: stylesDir,
    onDependency() {},
  });
  css = compiler.build([...candidates]);
  browser = await chromium.launch();
}, 180_000);

// Generous, and deliberately not the default 10s: this runs alongside the kit's other browser
// specs in one `pnpm test`.
afterAll(async () => {
  await browser?.close();
}, 60_000);

describe('a focused swatch row', () => {
  /**
   * Three things, in the order they have to hold: nothing is painted at rest (the ring's shadow is
   * declared at all times, so this is what says the rest measures focus); one `Tab` past the group
   * trigger reaches the first row's own control and it is `:focus-visible`; and the ring's band is
   * really painted outside the **row**, not around the invisible input inside it.
   */
  it('draws the ring around the whole row, not around the hidden checkbox', async () => {
    const page = await open([COLOUR_FACET], SIDEBAR_WIDTH);
    try {
      const rest = await resting(page, '[data-part="row"]');
      for (const [edge, brightness] of Object.entries(await ringPixels(page, rest))) {
        expect(brightness, `${edge} edge at rest`).toBeGreaterThan(RING);
      }

      // Past the group's own trigger, onto the first value.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const measured = await measure(page);
      expect(measured.focusedLabel).toBe('Black, 14 products');
      expect(measured.focusVisible).toBe(true);
      expect(measured.alpha).toBe('1');
      // The ring belongs to the row, which is the whole target.
      expect(measured.ringPart).toBe('row');
      expect(measured.ring.height).toBeGreaterThanOrEqual(36);

      for (const [edge, brightness] of Object.entries(await ringPixels(page, measured))) {
        expect(brightness, `${edge} edge focused`).toBeLessThan(RING);
      }
    } finally {
      await page.close();
    }
  });

  /** A swatch **tile** is the same proxy ring around a different box. */
  it('draws the ring around the whole tile in the grid layout', async () => {
    const page = await open([{ ...COLOUR_FACET, layout: 'grid' }], 420);
    try {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const measured = await measure(page);
      expect(measured.focusVisible).toBe(true);
      expect(measured.ringPart).toBe('tile');
      for (const [edge, brightness] of Object.entries(await ringPixels(page, measured))) {
        expect(brightness, `${edge} edge focused`).toBeLessThan(RING);
      }
    } finally {
      await page.close();
    }
  });
});

describe('a focused size tile', () => {
  it('draws the ring around the whole tile, at the spec’s own 2.5rem height', async () => {
    const page = await open([SIZE_FACET], SIDEBAR_WIDTH);
    try {
      const rest = await resting(page, '[data-part="tile"]');
      for (const [edge, brightness] of Object.entries(await ringPixels(page, rest))) {
        expect(brightness, `${edge} edge at rest`).toBeGreaterThan(RING);
      }

      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const measured = await measure(page);
      expect(measured.focusedLabel).toBe('Knitwear XS, 8 products');
      expect(measured.focusVisible).toBe(true);
      expect(measured.ringPart).toBe('tile');
      // Spec → Sizes, Size tile row: "Tile min height `control-height` (2.5rem)."
      expect(measured.ring.height).toBeGreaterThanOrEqual(40);

      for (const [edge, brightness] of Object.entries(await ringPixels(page, measured))) {
        expect(brightness, `${edge} edge focused`).toBeLessThan(RING);
      }
    } finally {
      await page.close();
    }
  });

  /** Spec → Keyboard: "Disabled values are skipped." A real `Tab` run, not a `[disabled]` query. */
  it('is skipped by Tab when nothing is left for it', async () => {
    const page = await open([SIZE_FACET], SIDEBAR_WIDTH);
    try {
      const names: string[] = [];
      for (let press = 0; press < 10; press += 1) {
        await page.keyboard.press('Tab');
        names.push(
          await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
        );
      }
      // XXL and 42–44 have nothing left; every other size is reached.
      expect(names).toContain('Knitwear XL, 8 products');
      expect(names.some((name) => name.includes('XXL'))).toBe(false);
      expect(names.some((name) => name.includes('42–44'))).toBe(false);
    } finally {
      await page.close();
    }
  });
});

describe('a focused range thumb inside the panel', () => {
  /**
   * The thumb's own reservation is `RangeSlider`'s, but the panel is what puts it in a 15rem
   * column inside a `<fieldset>` — so this measures the ring against the **panel's** box, which is
   * what would clip it.
   */
  it('keeps its ring inside the panel at the start of the track', async () => {
    const page = await open([PRICE_FACET], SIDEBAR_WIDTH);
    try {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      const measured = await measure(page);
      expect(measured.focusedLabel).toBe('Minimum Price');
      expect(measured.focusVisible).toBe(true);
      expect(measured.alpha).toBe('1');

      const slack = await page.evaluate((reach: number) => {
        const root = document.querySelector('[data-part="root"]') as HTMLElement;
        const thumb = document.activeElement as HTMLElement;
        const rootBox = root.getBoundingClientRect();
        const box = thumb.getBoundingClientRect();
        return {
          left: +(box.x - reach - rootBox.x).toFixed(2),
          right: +(rootBox.x + rootBox.width - (box.x + box.width + reach)).toFixed(2),
        };
      }, measured.reach);
      expect(slack.left).toBeGreaterThanOrEqual(0);
      expect(slack.right).toBeGreaterThanOrEqual(0);

      for (const [edge, brightness] of Object.entries(await ringPixels(page, measured))) {
        // The filled range lies against the thumb's right flank and is as dark as the ring, so a
        // pixel there says nothing about one; the three other edges are the readable ones.
        if (edge === 'right') continue;
        expect(brightness, `${edge} edge focused`).toBeLessThan(RING);
      }
    } finally {
      await page.close();
    }
  });
});

describe('the colour facet’s two-column rule measures the panel', () => {
  /**
   * Spec → Sizes, Panel row: "colour rows switch to 2 columns ... once the panel is 26rem or
   * wider." The panel's own root is the container, so the same markup in a 15rem sidebar keeps one
   * column and in a wide drawer takes two — and a `@container` rule with the wrong context or
   * breakpoint simply never fires.
   */
  it('keeps one column under 26rem and takes two over it', async () => {
    const columnsAt = async (width: number): Promise<number> => {
      const page = await open([COLOUR_FACET], width);
      try {
        return await page.evaluate(() => {
          const values = document.querySelector('[data-part="values"]') as HTMLElement;
          return getComputedStyle(values).gridTemplateColumns.split(/\s+/).length;
        });
      } finally {
        await page.close();
      }
    };
    expect(await columnsAt(SIDEBAR_WIDTH)).toBe(1);
    expect(await columnsAt(UNDER_TWO_COLUMNS)).toBe(1);
    expect(await columnsAt(OVER_TWO_COLUMNS)).toBe(2);
  });
});

describe('the panel at a 320px drawer width', () => {
  /**
   * Spec → Acceptance: "At 200% zoom and in a 320px column the panel fits with no horizontal
   * scroll." Measured as `scrollWidth` against `clientWidth`, which is the condition the criterion
   * states — with no page padding at all, which is the filter drawer's own width on a phone.
   */
  it('does not scroll sideways, with every facet type and the drawer foot', async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    try {
      await page.setContent(
        `<style>${css}\nhtml,body{margin:0;padding:0}</style>` +
          (await render([COLOUR_FACET, SIZE_FACET, PRICE_FACET], {
            showHead: true,
            showApplied: true,
            modelValue: { colour: ['brown'] },
            mode: 'drawer',
            resultCount: 24,
          })),
        { waitUntil: 'domcontentloaded' }
      );
      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        panel: (() => {
          const root = document.querySelector('[data-part="root"]') as HTMLElement;
          return root.scrollWidth - root.clientWidth;
        })(),
      }));
      expect(overflow.document).toBeLessThanOrEqual(0);
      expect(overflow.panel).toBeLessThanOrEqual(0);
    } finally {
      await page.close();
    }
  });
});
