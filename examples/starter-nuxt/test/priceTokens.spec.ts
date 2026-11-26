// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { decodeStega, encodeStega } from '@eldrajs/theme-core/stega';
import { resolveBlockTokens } from '../app/composables/usePriceTokens';
import { formatMoney } from '../app/storefront/money';
import AnnouncementBar from '../blocks/announcement-bar/Block.vue';
import Faq from '../blocks/faq/Block.vue';
import PricingTable from '../blocks/pricing-table/Block.vue';
import announcementMock from '../blocks/announcement-bar/mock.json';
import faqMock from '../blocks/faq/mock.json';
import pricingMock from '../blocks/pricing-table/mock.json';
import { mountOptions } from './support/mountBlock';

/**
 * Price tokens (WS-1474, WS-1473) resolve in one place, `useBlockData`, for every block: these specs
 * mount real blocks whose seeds carry tokens and read what a shopper sees.
 */

const ISK = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
};
const EUR = {
  currency: 'EUR',
  taxInclusivePricing: true,
  defaultTaxRate: 0.21,
};

describe('price tokens in block data', () => {
  it("writes a store setting in the shopper's currency, from the store's own amounts", async () => {
    const wrapper = mount(
      AnnouncementBar,
      mountOptions({ entry: { id: 'a1', data: { ...announcementMock } } })
    );
    await flushPromises();
    expect(wrapper.text()).toContain('Free shipping on orders over $80.00');
    expect(wrapper.text()).not.toContain('⟦');
  });

  it('follows the store currency and the regional format, never converting', async () => {
    const wrapper = mount(
      AnnouncementBar,
      mountOptions(
        { entry: { id: 'a1', data: { ...announcementMock } } },
        {
          commerce: ISK,
          region: {
            countryCode: 'IS',
            formatLocale: 'is-IS',
            timeZone: 'Atlantic/Reykjavik',
          },
        }
      )
    );
    await flushPromises();
    expect(wrapper.text()).toContain(
      `Free shipping on orders over ${formatMoney(15000, 'ISK', 'is-IS')}`
    );
    expect(formatMoney(15000, 'ISK', 'is-IS')).toMatch(/^15\.000\skr\.$/);
  });

  it('leaves the sentence out when the store has no amount for the currency', async () => {
    const wrapper = mount(
      AnnouncementBar,
      mountOptions({ entry: { id: 'a1', data: { ...announcementMock } } }, { storeAmounts: null })
    );
    await flushPromises();
    expect(wrapper.text()).not.toContain('Free shipping');
    expect(wrapper.text()).not.toContain('⟦');
  });

  it('writes each plan price from its own amount in that currency', async () => {
    const wrapper = mount(
      PricingTable,
      mountOptions({ entry: { id: 'p1', data: { ...pricingMock } } }, { commerce: EUR })
    );
    await flushPromises();
    const text = wrapper.text();
    // EUR=3500 on the monthly plan: the merchant's euro amount, not $38 converted.
    expect(text).toContain(formatMoney(35, 'EUR', 'en-US'));
    expect(text).toContain(`${formatMoney(32, 'EUR', 'en-US')} a box, billed each season.`);
    expect(text).not.toContain('⟦');
  });

  it("writes a rich-text price node, and drops only its paragraph when it can't be", async () => {
    const answer = (faqMock.items as { answer?: unknown }[]).find((item) =>
      JSON.stringify(item.answer).includes('"price"')
    );
    expect(answer).toBeDefined();
    const data = { ...faqMock, items: [answer] };
    const usd = mount(Faq, mountOptions({ entry: { id: 'f1', data } }));
    await flushPromises();
    expect(usd.text()).toContain('Add a handwritten card at checkout for $4.00, and');

    const sek = mount(
      Faq,
      mountOptions(
        { entry: { id: 'f1', data } },
        {
          commerce: {
            currency: 'SEK',
            taxInclusivePricing: true,
            defaultTaxRate: 0.25,
          },
        }
      )
    );
    await flushPromises();
    // The paragraph stays in the tree (the builder's rich-text positions count it) but is hidden.
    const paragraph = sek.findAll('p').find((p) => p.text().includes('handwritten card'));
    expect(paragraph?.attributes('hidden')).toBeDefined();
    expect(sek.text()).not.toContain('⟦');
    expect(
      usd
        .findAll('p')
        .find((p) => p.text().includes('handwritten card'))
        ?.attributes('hidden')
    ).toBeUndefined();
  });
});

describe('resolveBlockTokens', () => {
  const options = {
    currency: 'USD',
    locale: 'en-US',
    storeAmounts: null,
    format: formatMoney,
  };

  it('returns the very same data when nothing holds a token', () => {
    const data = {
      title: 'Hello',
      items: [{ text: 'a' }],
      doc: { type: 'doc', content: [] },
    };
    expect(resolveBlockTokens(data, options)).toBe(data);
  });

  it('resolves at any depth and copies only the path that changed', () => {
    const untouched = { text: 'plain' };
    const data = {
      items: [untouched, { text: 'Card ⟦price#card USD=400⟧.' }],
    };
    const out = resolveBlockTokens(data, options);
    expect(out.items[1]).toEqual({ text: 'Card $4.00.' });
    expect(out.items[0]).toBe(untouched);
    expect(data.items[1]!.text).toBe('Card ⟦price#card USD=400⟧.');
  });

  it('keeps the builder field selectable but marks it never editable in place', () => {
    const meta = { entryId: 'e1', fieldPath: 'message', locale: 'en-US' };
    const out = resolveBlockTokens(encodeStega('Card ⟦price#card USD=400⟧.', meta), options);
    expect(decodeStega(out)).toEqual({
      cleaned: 'Card $4.00.',
      meta: { ...meta, inline: false },
    });
    // A field without a token keeps its payload exactly as Studio sent it.
    const plain = encodeStega('Hello', meta);
    expect(resolveBlockTokens(plain, options)).toBe(plain);
  });
});

describe('price opt-outs (allowPrices: false)', () => {
  interface FieldDef {
    fieldId: string;
    type: string;
    allowPrices?: boolean;
    metadata?: { item?: FieldDef; fields?: FieldDef[] };
  }
  const definitions = import.meta.glob<{ default: { apiId: string; fields: FieldDef[] } }>(
    '../blocks/*/block.json',
    { eager: true }
  );
  const seeds = import.meta.glob<{ default: Record<string, unknown> }>(
    ['../blocks/*/mock.json', '../blocks/*/preview.json'],
    { eager: true }
  );
  const pages = import.meta.glob<{
    default: { blocks: { apiId: string; data: Record<string, unknown> }[] };
  }>('../pages/*.page.json', { eager: true });

  /** A field's own children: a list's item (or the item composite's fields), a composite's fields. */
  const childrenOf = (field: FieldDef): FieldDef[] => {
    const item = field.metadata?.item;
    if (item !== undefined)
      return item.type === 'composite' ? (item.metadata?.fields ?? []) : [item];
    return field.metadata?.fields ?? [];
  };
  const isUrlLike = (id: string): boolean => id === 'href' || /(Href|Url)$/.test(id);

  it('opts out every URL field: a written price there would break the link', () => {
    const missing: string[] = [];
    const walk = (fields: FieldDef[], at: string): void => {
      for (const field of fields) {
        const where = `${at}.${field.fieldId}`;
        if ((field.type === 'string' || field.type === 'text') && isUrlLike(field.fieldId)) {
          if (field.allowPrices !== false) missing.push(where);
        }
        walk(childrenOf(field), where);
      }
    };
    for (const d of Object.values(definitions)) walk(d.default.fields, d.default.apiId);
    expect(missing).toEqual([]);
  });

  it('never seeds a price into a field that opted out, which Core would refuse', () => {
    const found: string[] = [];
    const walk = (value: unknown, field: FieldDef | null, at: string): void => {
      if (typeof value === 'string') {
        if (value.includes('⟦') && field?.allowPrices === false) found.push(at);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, field, `${at}.${i}`));
        return;
      }
      if (value === null || typeof value !== 'object' || field?.type === 'rich-text') return;
      for (const [key, v] of Object.entries(value)) {
        const children = field === null ? [] : childrenOf(field);
        walk(v, children.find((f) => f.fieldId === key) ?? null, `${at}.${key}`);
      }
    };
    const check = (apiId: string, data: Record<string, unknown>, where: string): void => {
      const fields = Object.values(definitions).find((d) => d.default.apiId === apiId)!.default
        .fields;
      for (const [key, value] of Object.entries(data)) {
        walk(value, fields.find((f) => f.fieldId === key) ?? null, `${where}:${key}`);
      }
    };
    for (const [path, seed] of Object.entries(seeds))
      check(path.split('/')[2]!, seed.default, path);
    for (const [path, page] of Object.entries(pages)) {
      for (const block of page.default.blocks) check(block.apiId, block.data, path);
    }
    expect(found).toEqual([]);
  });
});
