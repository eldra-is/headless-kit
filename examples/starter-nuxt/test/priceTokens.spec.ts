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
