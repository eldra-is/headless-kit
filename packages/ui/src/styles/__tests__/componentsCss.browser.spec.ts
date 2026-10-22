// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSSRApp, h, type VNode } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { ALL_FACETS } from '../../components/filter-panel/northwind';
import type { NavMenuItem } from '../../components/nav-menu/types';
import * as ui from '../../index';
import { isBuilt, itFailsWithoutDist } from '../../test/built';

const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
const built = isBuilt(`${dist}style.css`, `${dist}components.css`);

const SITE_CSS =
  'body{margin:0;font-family:Georgia,serif;line-height:1.5;color:#1d2433}' +
  '.frame{box-sizing:border-box;width:640px;padding:16px}';

const RICH_TEXT =
  '<article><h2 id="h2">Heading</h2><p id="p">Text with <a id="a" href="#">a link</a>.</p>' +
  '<ul id="ul"><li>One</li><li>Two</li></ul><ol id="ol"><li>First</li></ol>' +
  '<button id="button" type="button">Site button</button></article>';

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

let browser: Browser;

beforeAll(async () => {
  if (built) browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

describe('components.css', () => {
  it.runIf(built)("leaves a site's own elements at the browser's defaults", async () => {
    const read = async (css: string) => {
      const page = await browser.newPage();
      await page.setContent(documentWith(css, RICH_TEXT));
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
  });

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
        await page.evaluate(() =>
          Promise.all(document.getAnimations().map((animation) => animation.finished))
        );
        const png = await page.screenshot({ fullPage: true });
        await page.close();
        return png;
      };
      const withPreflight = await shot(stylesheet('style.css'));
      const componentsOnly = await shot(stylesheet('components.css'));
      expect(Buffer.compare(componentsOnly, withPreflight)).toBe(0);
    }
  );

  itFailsWithoutDist(built);
});
