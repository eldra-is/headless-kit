// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { compile } from '@tailwindcss/node';
import vue from '@vitejs/plugin-vue';
import { build, type Rollup } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, defineComponent, h, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ALL_FACETS } from '../../components/filter-panel/northwind';
import type { NavMenuItem } from '../../components/nav-menu/types';
import * as ui from '../../index';
import { isBuilt, itFailsWithoutDist } from '../../test/built';
import { OVERLAY_SAMPLES, type OverlaySample } from './overlaySamples';

const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));
const dist = `${packageRoot}dist/`;
const built = isBuilt(`${dist}style.css`, `${dist}components.css`);

const SITE_CSS =
  'body{margin:0;font-family:Georgia,serif;line-height:1.5;color:#1d2433}' +
  '.frame{box-sizing:border-box;width:640px;padding:16px}';

const RICH_TEXT =
  '<article><h2 id="h2">Heading</h2><p id="p">Text with <a id="a" href="#">a link</a>.</p>' +
  '<ul id="ul"><li>One</li><li>Two</li></ul><ol id="ol"><li>First</li></ol>' +
  '<button id="button" type="button">Site button</button></article>';

/** The site's own markup naming its parts the way this package does: `data-part` is not ours. */
const SITE_PARTS =
  '<article data-part="root"><h2 id="h2" data-part="title">Heading</h2>' +
  '<p id="p" data-part="text">Text with <a id="a" data-part="link" href="#">a link</a>.</p>' +
  '<ul id="ul" data-part="list"><li data-part="item">One</li><li data-part="item">Two</li></ul>' +
  '<ol id="ol" data-part="list"><li data-part="item">First</li></ol>' +
  '<button id="button" data-part="trigger" type="button">Site button</button></article>';

/** Ark UI / Zag put `data-scope` and `data-part` on every element they render. */
const ARK_UI =
  '<div data-scope="accordion" data-part="root" data-orientation="vertical">' +
  '<div data-scope="accordion" data-part="item" data-state="open">' +
  '<h2 id="h2" data-scope="dialog" data-part="title">Heading</h2>' +
  '<button id="button" data-scope="accordion" data-part="item-trigger" type="button">Toggle</button>' +
  '<div data-scope="accordion" data-part="item-content">' +
  '<p id="p" data-scope="dialog" data-part="description">Text with ' +
  '<a id="a" data-scope="menu" data-part="item" href="#">a link</a>.</p>' +
  '<ul id="ul" data-scope="tree-view" data-part="branch-content"><li data-part="item">One</li></ul>' +
  '<ol id="ol" data-scope="steps" data-part="list"><li data-part="item">First</li></ol>' +
  '</div></div></div>';

const SITE_MARKUP: Array<[name: string, markup: string]> = [
  ['rich text', RICH_TEXT],
  ['own data-part elements', SITE_PARTS],
  ['Ark UI accordion', ARK_UI],
];

const NAV_ITEMS: NavMenuItem[] = [
  {
    label: 'Shop',
    children: [
      { label: 'Sweaters', href: '/sweaters', group: 'Knitwear', description: 'Merino and wool' },
      { label: 'Cardigans', href: '/cardigans', group: 'Knitwear', badge: 'New' },
      { label: 'Mugs', href: '/mugs', group: 'Ceramics' },
    ],
  },
  { label: 'Journal', href: '/journal', children: [{ label: 'Stories', href: '/stories' }] },
  { label: 'About', href: '/about', current: true },
];

/** One render per component family, in the states that draw the most of their own elements. */
const SAMPLES: Array<[name: string, render: () => VNode, modal?: boolean]> = [
  [
    'Button',
    () =>
      h('div', [
        h(ui.Button, { variant: 'primary' }, () => 'Add'),
        h(ui.Button, { variant: 'ghost' }, () => 'Ghost'),
      ]),
  ],
  [
    'Link',
    () => h('div', ['Text with ', h(ui.Link, { href: '#', external: true }, () => 'a link')]),
  ],
  [
    'Badge',
    () =>
      h('div', [
        h(ui.Badge, { label: 'New', variant: 'new' }),
        h(ui.StockBadge, { level: 'low', quantity: 3 }),
      ]),
  ],
  [
    'Accordion',
    () =>
      h(ui.Accordion, () => [
        h(
          ui.AccordionItem,
          { title: 'Shipping', headingLevel: 3, modelValue: true },
          () => 'Two days.'
        ),
        h(ui.AccordionItem, { title: 'Returns' }, () => 'Free.'),
      ]),
  ],
  [
    'Breadcrumb',
    () =>
      h(ui.Breadcrumb, {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Knitwear', href: '/k' },
          { label: 'Sweater' },
        ],
        structuredData: false,
      }),
  ],
  [
    'Pagination',
    () => h(ui.Pagination, { page: 2, totalPages: 8, hrefForPage: (page: number) => `/p/${page}` }),
  ],
  [
    'EmptyState',
    () => h(ui.EmptyState, { title: 'Nothing here', text: 'Try another search.', headingLevel: 2 }),
  ],
  [
    'Input',
    () =>
      h(ui.FieldWrapper, { label: 'Email', help: 'Never shared.' }, () =>
        h(ui.Input, { modelValue: 'a@b.is' })
      ),
  ],
  [
    'Checkbox',
    () =>
      h(ui.FieldWrapper, { label: 'Terms', error: 'Required' }, () =>
        h(ui.Checkbox, { label: 'I agree' })
      ),
  ],
  [
    'Select',
    () =>
      h(ui.Select, { label: 'Size', options: [{ value: 's', label: 'Small' }], modelValue: 's' }),
  ],
  [
    'MultiSelect',
    () =>
      h(ui.MultiSelect, {
        label: 'Colour',
        options: [
          { value: 'r', label: 'Red' },
          { value: 'b', label: 'Blue' },
        ],
        modelValue: ['r', 'b'],
      }),
  ],
  [
    'Tabs',
    () =>
      h(ui.Tabs, {
        ariaLabel: 'Info',
        items: [
          { value: 'a', title: 'Details', content: 'A' },
          { value: 'b', title: 'Care', content: 'B' },
        ],
      }),
  ],
  ['Chip', () => h(ui.Chip, { label: 'Wool', removable: true })],
  ['QuantityStepper', () => h(ui.QuantityStepper, { modelValue: 2, label: 'Quantity' })],
  ['Switch', () => h(ui.Switch, { modelValue: true, description: 'Email me' }, () => 'Newsletter')],
  [
    'RadioGroup',
    () =>
      h(ui.RadioGroup, {
        legend: 'Delivery',
        layout: 'cards',
        modelValue: 'a',
        options: [
          { value: 'a', label: 'Home', hint: 'Two days' },
          { value: 'b', label: 'Pickup' },
        ],
      }),
  ],
  [
    'Textarea',
    () =>
      h(ui.FieldWrapper, { label: 'Note' }, () =>
        h(ui.Textarea, { modelValue: 'Hello', maxLength: 200, counter: true })
      ),
  ],
  [
    'Rating',
    () =>
      h('div', [
        h(ui.Rating, { value: 4.5, count: 128, showCount: true }),
        h(ui.Rating, { value: 4, count: 12, showCount: true, href: '#' }),
      ]),
  ],
  [
    'AvatarGroup',
    () =>
      h(ui.AvatarGroup, {
        label: 'Makers',
        people: [{ name: 'Ingrid Ás' }, { name: 'Tomas B' }, { name: 'Ari C' }],
        max: 2,
      }),
  ],
  ['Price', () => h(ui.Price, { amount: 2800, compareAt: 3500, currency: 'ISK', locale: 'is-IS' })],
  ['LoadMore', () => h(ui.LoadMore, { shown: 24, total: 96 })],
  [
    'VariantPicker',
    () =>
      h('div', [
        h(ui.VariantPicker, {
          name: 'size',
          legend: 'Size',
          modelValue: 'm',
          options: [
            { value: 's', label: 'S', available: true },
            { value: 'm', label: 'M', available: true },
            { value: 'l', label: 'L', available: false },
          ],
        }),
        h(ui.VariantPicker, {
          name: 'colour',
          legend: 'Colour',
          type: 'swatches',
          modelValue: 'b',
          options: [
            { value: 'r', label: 'Red', swatch: '#c33', available: true },
            { value: 'b', label: 'Blue', swatch: '#33c', available: true },
            { value: 'g', label: 'Green', swatch: '#3c3', available: false },
          ],
        }),
      ]),
  ],
  [
    'Toast',
    () => h(ui.Toast, { title: 'Added to cart', text: 'Wool sweater', variant: 'success' }),
  ],
  [
    'ContentCard',
    () =>
      h(ui.ContentCard, {
        title: 'How we dye wool',
        href: '#',
        eyebrow: 'Journal',
        excerpt: 'A short story.',
        headingLevel: 3,
      }),
  ],
  [
    'ProductCard',
    () =>
      h(ui.ProductCard, {
        product: {
          title: 'Wool sweater',
          url: '#',
          price: { amount: 12900, compareAt: 15900 },
          badge: { variant: 'sale' },
        },
        currency: 'ISK',
        locale: 'is-IS',
        headingLevel: 3,
      }),
  ],
  ['SearchBar', () => h(ui.SearchBar, { modelValue: 'wool' })],
  [
    'CurrencyInput',
    () =>
      h(ui.FieldWrapper, { label: 'Amount' }, () =>
        h(ui.CurrencyInput, { modelValue: 2800, currency: 'ISK', locale: 'is-IS' })
      ),
  ],
  [
    'RangeSlider',
    () => h(ui.RangeSlider, { label: 'Price', min: 0, max: 100, modelValue: [10, 80] }),
  ],
  [
    'FormLayout',
    () =>
      h(
        ui.FormLayout,
        { title: 'Contact', headingLevel: 2 },
        {
          default: () => h(ui.FieldWrapper, { label: 'Name' }, () => h(ui.Input)),
          actions: () => h(ui.Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
        }
      ),
  ],
  [
    'FilterPanel',
    () =>
      h(ui.FilterPanel, {
        facets: ALL_FACETS,
        modelValue: { colour: ['brown'] },
        title: 'Filters',
      }),
  ],
  ['EditorPlaceholder', () => h(ui.EditorPlaceholder, { label: 'Add an image' })],
  ['NavMenu mega', () => h(ui.NavMenu, { items: NAV_ITEMS, modelValue: 0 })],
  ['NavMenu dropdown', () => h(ui.NavMenu, { items: NAV_ITEMS, modelValue: 1 })],
  ['NavMenu drawer', () => h(ui.NavMenu, { items: NAV_ITEMS }), true],
  [
    'Dialog',
    () =>
      h(
        ui.Dialog,
        { title: 'Remove item?' },
        { default: () => 'Body', footer: () => h(ui.Button, () => 'OK') }
      ),
    true,
  ],
  [
    'Drawer',
    () =>
      h(
        ui.Drawer,
        { title: 'Cart', count: 2 },
        { default: () => 'Lines', footer: () => h(ui.Button, () => 'Checkout') }
      ),
    true,
  ],
];

const stylesheet = (name: string): string => readFileSync(`${dist}${name}`, 'utf8');

function documentWith(css: string, body: string): string {
  return `<!doctype html><html><head><style>${css}</style><style>${SITE_CSS}</style></head><body>${body}</body></html>`;
}

const OVERLAY_ENTRY = `
import { createApp } from 'vue';
import { provideEldraScope } from ${JSON.stringify(fileURLToPath(new URL('../../composables/useEldraScope.ts', import.meta.url)))};
import { OVERLAY_SAMPLES } from ${JSON.stringify(fileURLToPath(new URL('./overlaySamples.ts', import.meta.url)))};
window.mountOverlay = (name, scope) => {
  const render = OVERLAY_SAMPLES.find((sample) => sample.name === name).render;
  createApp({ setup: () => (scope && provideEldraScope(scope), render) }).mount('#app');
};
`;

/** The overlay samples, compiled with Vue into one script: an overlay only opens in a real DOM. */
async function bundleOverlays(): Promise<string> {
  const output = (await build({
    configFile: false,
    root: packageRoot,
    logLevel: 'silent',
    plugins: [
      vue(),
      {
        name: 'overlay-entry',
        resolveId: (id) => (id === 'overlay-entry' ? '\0overlay-entry' : undefined),
        load: (id) => (id === '\0overlay-entry' ? OVERLAY_ENTRY : undefined),
      },
    ],
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: 'overlay-entry', output: { format: 'iife' } },
    },
  })) as Rollup.RollupOutput[] | Rollup.RollupOutput;
  const outputs = Array.isArray(output) ? output : [output];
  const chunk = outputs[0]!.output.find((item) => item.type === 'chunk');
  return (chunk as Rollup.OutputChunk).code;
}

let browser: Browser;
let overlayScript: string;

beforeAll(async () => {
  if (built) [browser, overlayScript] = await Promise.all([chromium.launch(), bundleOverlays()]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/**
 * Every class on a kit element below a scope that is not `eldra:`-prefixed (a `group`/`peer` marker
 * aside). Such a class is styled by nothing in `scoped.css` and by whatever the consumer's own
 * Tailwind defines under that name, so the list must be empty.
 */
function unprefixedKitClasses(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const kitOwned = (element: Element): boolean => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        if (node.hasAttribute('data-eldra-scope')) return true;
        if (node.parentElement?.hasAttribute('data-eldra-slot')) return false;
      }
      return false;
    };
    return [...document.querySelectorAll('[class]')].flatMap((element) => {
      if (!kitOwned(element)) return [];
      const bare = [...element.classList].filter(
        (name) => !name.startsWith('eldra:') && !/^(group|peer)(\/|$)/.test(name)
      );
      const part = element.getAttribute('data-part') ?? '';
      return bare.length ? [`${element.tagName.toLowerCase()}[${part}] ${bare.join(' ')}`] : [];
    });
  });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all([
      ...document.getAnimations().map((animation) => animation.finished),
      ...[...document.images].map((image) => image.decode().catch(() => undefined)),
    ])
  );
}

async function shotOpen(sample: OverlaySample, css: string, scope?: string): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: 1100, height: 700 },
    reducedMotion: 'reduce',
  });
  await page.setContent(documentWith(css, '<div class="frame"><div id="app"></div></div>'));
  await page.addScriptTag({ content: overlayScript });
  await page.evaluate(
    ([name, scope]) =>
      (window as unknown as { mountOverlay(n: string, s?: string): void }).mountOverlay(
        name,
        scope
      ),
    [sample.name, scope] as const
  );
  if (sample.open) {
    const target = page.locator(`#app ${sample.open.selector}`).first();
    await target[sample.open.action]();
  }
  const overlay = page.locator(sample.overlay.selector).first();
  await overlay.waitFor({ state: 'visible' });
  const placement = await overlay.evaluate((element) =>
    element.closest('#app') === null ? 'teleported' : element.matches(':modal') ? 'modal' : 'inline'
  );
  expect(placement, `where ${sample.name} draws its overlay`).toBe(sample.overlay.placement);
  await settle(page);
  if (scope) expect(await unprefixedKitClasses(page), 'unprefixed kit classes').toEqual([]);
  const png = await page.screenshot({ fullPage: true });
  await page.close();
  return png;
}

describe('components.css', () => {
  it.runIf(built).each(SITE_MARKUP)(
    "leaves a site's %s at the browser's defaults beside a component",
    async (_name, markup) => {
      const component = await renderToString(
        createSSRApp({ render: () => h(ui.Button, { variant: 'primary' }, () => 'Add') })
      );
      const read = async (css: string) => {
        const page = await browser.newPage();
        await page.setContent(documentWith(css, component + markup));
        const styles = await page.evaluate(() =>
          ['h2', 'p', 'a', 'ul', 'ol', 'button'].map((id) => {
            const style = getComputedStyle(document.getElementById(id) as Element);
            return [
              id,
              style.fontSize,
              style.fontWeight,
              style.marginTop,
              style.paddingLeft,
              style.listStyleType,
              style.color,
              style.textDecorationLine,
              style.backgroundColor,
              style.borderTopWidth,
            ].join(' ');
          })
        );
        await page.close();
        return styles;
      };
      const defaults = await read('');
      expect(await read(stylesheet('components.css'))).toEqual(defaults);
      // The reason components.css exists: style.css's preflight resets all of them.
      const reset = await read(stylesheet('style.css'));
      for (const [index, line] of reset.entries()) expect(line).not.toBe(defaults[index]);
    }
  );

  it.runIf(built).each(SAMPLES)(
    'draws %s exactly as style.css does',
    async (_name, render, modal = false) => {
      const markup = await renderToString(createSSRApp({ render }));
      const shot = async (css: string) => {
        const page = await browser.newPage({
          viewport: { width: 1100, height: 700 },
          reducedMotion: 'reduce',
        });
        await page.setContent(documentWith(css, `<div class="frame">${markup}</div>`));
        if (modal) {
          await page.evaluate(() => {
            for (const dialog of document.querySelectorAll('dialog')) dialog.showModal();
          });
        }
        await settle(page);
        const png = await page.screenshot({ fullPage: true });
        await page.close();
        return png;
      };
      const withPreflight = await shot(stylesheet('style.css'));
      const componentsOnly = await shot(stylesheet('components.css'));
      expect(Buffer.compare(componentsOnly, withPreflight)).toBe(0);
    }
  );

  it.runIf(built).each(OVERLAY_SAMPLES.map((sample) => [sample.name, sample] as const))(
    'draws %s open, outside its root, exactly as style.css does',
    async (_name, sample) => {
      const withPreflight = await shotOpen(sample, stylesheet('style.css'));
      const componentsOnly = await shotOpen(sample, stylesheet('components.css'));
      expect(Buffer.compare(componentsOnly, withPreflight)).toBe(0);
    }
  );

  itFailsWithoutDist(built);
});

/**
 * A consumer that runs Tailwind itself, with a theme that disagrees with the kit's on every name
 * they share and every utility the kit compiles, so each collision `scoped.css` removes would show.
 */
/** A plain consumer Tailwind build (the default theme) over exactly `candidates`. */
async function consumerTailwindWith(entry: string, candidates: string[]): Promise<string> {
  const compiler = await compile(entry, { base: packageRoot, onDependency() {} });
  return compiler.build(candidates);
}

async function consumerTailwind(): Promise<string> {
  const candidates = new Set<string>();
  for (const [, name] of stylesheet('components.css').matchAll(/\.((?:\\.|[\w-])+)/g))
    candidates.add(name!.replace(/\\(.)/g, '$1'));
  const compiler = await compile(
    `@import 'tailwindcss';
@theme {
  --color-text: rgb(1 2 3); --color-primary: rgb(200 0 0); --color-background: rgb(250 250 0);
  --color-surface: rgb(0 250 250); --color-border: rgb(0 200 0); --color-muted: rgb(0 0 200);
  --spacing: 1px; --radius-sm: 0; --radius-md: 0; --radius-lg: 0; --radius-full: 0;
  --text-sm: 30px; --font-body: monospace; --shadow-md: 0 0 0 4px red;
}`,
    { base: packageRoot, onDependency() {} }
  );
  return compiler.build([...candidates, 'text-text', 'p-4', 'border', 'bg-surface']);
}

/** Renders a sample under `provideEldraScope(name)`, the way a wrapper does. */
const scoped = (render: () => VNode, name = 'studio') =>
  defineComponent({
    setup() {
      ui.provideEldraScope(name);
      return render;
    },
  });

describe('scoped.css', () => {
  let consumer = '';
  beforeAll(async () => {
    if (built) consumer = await consumerTailwind();
  }, 60_000);
  // The consumer's stylesheet last, so it wins every tie the kit's does not win by being unlayered.
  const inConsumerApp = () => `${stylesheet('scoped.css')}\n${consumer}`;

  it.runIf(built).each(SAMPLES)(
    'draws a scoped %s in a consumer Tailwind app exactly as style.css does alone',
    async (_name, render, modal = false) => {
      const shot = async (css: string, markup: string) => {
        const page = await browser.newPage({
          viewport: { width: 1100, height: 700 },
          reducedMotion: 'reduce',
        });
        await page.setContent(documentWith(css, `<div class="frame">${markup}</div>`));
        if (modal) {
          await page.evaluate(() => {
            for (const dialog of document.querySelectorAll('dialog')) dialog.showModal();
          });
        }
        await settle(page);
        const png = await page.screenshot({ fullPage: true });
        await page.close();
        return png;
      };
      const plain = await renderToString(createSSRApp({ render }));
      const markup = await renderToString(createSSRApp(scoped(render)));
      expect(markup).toContain('data-eldra-scope="studio"');
      const reference = await shot(stylesheet('style.css'), plain);
      expect(Buffer.compare(await shot(inConsumerApp(), markup), reference)).toBe(0);
    }
  );

  it.runIf(built).each(SAMPLES)('renders no unprefixed kit class in a scoped %s', async (_n, r) => {
    const page = await browser.newPage();
    await page.setContent(await renderToString(createSSRApp(scoped(r))));
    expect(await unprefixedKitClasses(page)).toEqual([]);
    await page.close();
  });

  /**
   * The consumer's way to let its own classes win: the sheet in a layer below its utilities. A
   * consumer utility then beats a kit utility whatever the load order, and the prefix is what keeps
   * the consumer's own (hostile here) utilities from matching a kit element by name.
   */
  const inLayer = (consumerCss: string) =>
    '@layer theme, base, components, utilities;\n' +
    `@import url("data:text/css;base64,${Buffer.from(stylesheet('scoped.css')).toString('base64')}") layer(components);\n` +
    consumerCss;

  it.runIf(built).each(SAMPLES)(
    'draws a scoped %s in layer(components) of a consumer Tailwind app exactly as style.css does',
    async (_name, render, modal = false) => {
      const shot = async (css: string, markup: string) => {
        const page = await browser.newPage({
          viewport: { width: 1100, height: 700 },
          reducedMotion: 'reduce',
        });
        await page.setContent(documentWith(css, `<div class="frame">${markup}</div>`));
        if (modal) {
          await page.evaluate(() => {
            for (const dialog of document.querySelectorAll('dialog')) dialog.showModal();
          });
        }
        await settle(page);
        const png = await page.screenshot({ fullPage: true });
        await page.close();
        return png;
      };
      const plain = await renderToString(createSSRApp({ render }));
      const markup = await renderToString(createSSRApp(scoped(render)));
      const reference = await shot(stylesheet('style.css'), plain);
      expect(Buffer.compare(await shot(inLayer(consumer), markup), reference)).toBe(0);
    }
  );

  it.runIf(built)(
    "lets the consumer's own classes on a component win, prefixed or not, with variants",
    async () => {
      const own = await consumerTailwindWith(`@import 'tailwindcss';`, [
        'mt-4',
        'px-8',
        'md:w-full',
      ]);
      const prefixed = await consumerTailwindWith(`@import 'tailwindcss' prefix(ui);`, [
        'ui:mt-6',
        'ui:px-10',
        'ui:md:w-full',
      ]);
      const measure = async (css: string, classes: string) => {
        const button = () =>
          h('div', { style: 'width:600px' }, [
            h(ui.Button, { variant: 'primary', classes: { container: classes } }, () => 'Add'),
          ]);
        const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
        await page.setContent(
          documentWith(css, await renderToString(createSSRApp(scoped(button))))
        );
        const style = await page.evaluate(() => {
          const s = getComputedStyle(document.querySelector('button')!);
          return [s.marginTop, s.paddingLeft, s.width];
        });
        await page.close();
        return style;
      };
      expect(await measure(inLayer(own), 'mt-4 px-8 md:w-full')).toEqual(['16px', '32px', '600px']);
      expect(await measure(inLayer(prefixed), 'ui:mt-6 ui:px-10 ui:md:w-full')).toEqual([
        '24px',
        '40px',
        '600px',
      ]);
      // Unlayered, the sheet still wins every property it sets: the reason to import it in a layer.
      const unlayered = await measure(`${stylesheet('scoped.css')}\n${prefixed}`, 'ui:px-10');
      expect(unlayered[1]).not.toBe('40px');
    }
  );

  it.runIf(built).each(OVERLAY_SAMPLES.map((sample) => [sample.name, sample] as const))(
    'draws a scoped %s open, teleported parts too, exactly as style.css does alone',
    async (_name, sample) => {
      const reference = await shotOpen(sample, stylesheet('style.css'));
      expect(Buffer.compare(await shotOpen(sample, inConsumerApp(), 'studio'), reference)).toBe(0);
    }
  );

  it.runIf(built)(
    "leaves the consumer's own markup in a slot to the consumer's Tailwind",
    async () => {
      const label = () => h('span', { id: 'mine', class: 'text-text p-4' }, 'Mine');
      const markup = await renderToString(
        createSSRApp(scoped(() => h(ui.Button, { variant: 'secondary' }, label)))
      );
      const page = await browser.newPage();
      await page.setContent(documentWith(inConsumerApp(), markup));
      const read = (selector: string) =>
        page.evaluate((s) => {
          const style = getComputedStyle(document.querySelector(s)!);
          return `${style.color} ${style.paddingTop}`;
        }, selector);
      expect(await read('#mine')).toBe('rgb(1, 2, 3) 4px');
      expect(await read('[data-part="label"]')).not.toBe('rgb(1, 2, 3) 4px');
      expect(await page.locator('[data-part="label"]').getAttribute('data-eldra-slot')).toBe('');
      await page.close();
    }
  );

  const MINE = 'text-text border p-4 bg-surface';
  const CONSUMER_SLOTS: Array<[name: string, render: () => VNode]> = [
    [
      'Popover trigger',
      () =>
        h(ui.Popover, null, {
          trigger: ({ attrs }: { attrs: Record<string, unknown> }) =>
            h('button', { ...attrs, id: 'mine', class: [attrs.class, MINE] }, 'Filters'),
          default: () => 'Panel',
        }),
    ],
    [
      'Tooltip trigger',
      () =>
        h(ui.Tooltip, { text: 'Tip' }, () =>
          h('button', { id: 'mine', type: 'button', 'data-part': 'trigger', class: MINE }, 'Info')
        ),
    ],
    [
      'FieldWrapper error',
      () =>
        h(
          ui.FieldWrapper,
          { label: 'Name' },
          {
            default: () => h(ui.Input),
            error: () => h('span', { id: 'mine', 'data-part': 'message', class: MINE }, 'Wrong'),
          }
        ),
    ],
  ];

  it.runIf(built).each(CONSUMER_SLOTS)(
    "leaves the consumer's own element in a %s to the consumer's Tailwind",
    async (_name, render) => {
      const markup = await renderToString(createSSRApp(scoped(render)));
      const page = await browser.newPage();
      await page.setContent(documentWith(inConsumerApp(), `<div class="frame">${markup}</div>`));
      const style = await page.evaluate(() => {
        const s = getComputedStyle(document.getElementById('mine')!);
        return [s.color, s.borderTopWidth, s.paddingTop, s.backgroundColor];
      });
      expect(style).toEqual(['rgb(1, 2, 3)', '1px', '4px', 'rgb(0, 250, 250)']);
      await page.close();
    }
  );

  it.runIf(built)(
    "re-themes through --eldra-* on its scope, and never a host page's own components",
    async () => {
      const button = () => h(ui.Button, { variant: 'primary' }, () => 'Add');
      const host = await renderToString(createSSRApp({ render: button }));
      const embedded = await renderToString(createSSRApp(scoped(button, 'toolbar')));
      // Reduced motion zeroes the colour transition, so a re-theme reads at once.
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      const css =
        `${stylesheet('components.css')}\n:root { --eldra-color-primary: rgb(0, 128, 0); }\n` +
        `${stylesheet('scoped.css')}\n` +
        "[data-eldra-scope='toolbar'] { --eldra-color-accent: rgb(0, 0, 128); }";
      await page.setContent(
        documentWith(css, `<div id="host">${host}</div><div id="embedded">${embedded}</div>`)
      );
      const background = (id: string) =>
        page.evaluate(
          (i) => getComputedStyle(document.querySelector(`#${i} button`)!).backgroundColor,
          id
        );
      expect(await background('host')).toBe('rgb(0, 128, 0)');
      expect(await background('embedded')).toBe('rgb(36, 32, 28)');
      await page.evaluate(() =>
        document
          .querySelector('#embedded [data-eldra-scope]')!
          .setAttribute('style', '--eldra-color-primary: rgb(9, 9, 9)')
      );
      expect(await background('embedded')).toBe('rgb(9, 9, 9)');
      expect(await background('host')).toBe('rgb(0, 128, 0)');
      await page.close();
    }
  );

  itFailsWithoutDist(built);
});
