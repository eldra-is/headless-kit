// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it } from 'vitest';
import { formatDate } from '@eldrajs/ui';
import ArticleBlock from '../blocks/article/Block.vue';
import articleMock from '../blocks/article/mock.json';
import { calendarDayIn, useFormatDate } from '../app/composables/useRegionalFormat';
import { useMoney } from '../app/storefront/money';
import { mountOptions } from './support/mountBlock';

/**
 * The organisation's regional format (`runtimeConfig.public.eldra.region`, read at build by
 * `@eldrajs/theme-nuxt`) decides how money, numbers and dates are written; the content locale
 * decides only the words. An English-language Icelandic store prints "4.790 kr." and an Icelandic
 * date under English copy — the defect this guards was "ISK 4,790" on such a store.
 */

const ICELAND = { countryCode: 'IS', formatLocale: 'is-IS', timeZone: 'Atlantic/Reykjavik' };
const ISK = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };

/** A component that prints one amount and one timestamp the way every block does. */
const Probe = defineComponent({
  props: { entry: { type: Object, required: true } },
  setup() {
    const money = useMoney();
    const formatRegionalDate = useFormatDate();
    return () =>
      h('p', [
        h('span', { class: 'price' }, money.format(4790)),
        h('span', { class: 'date' }, formatRegionalDate('2026-11-26T12:00:00Z') ?? ''),
      ]);
  },
});

const entry = { id: 'probe', data: {} };

describe('the regional format', () => {
  it('writes an Icelandic store’s prices and dates in Icelandic under English content', () => {
    const wrapper = mount(
      Probe,
      mountOptions({ entry }, { locale: 'en-US', commerce: ISK, region: ICELAND })
    );

    expect(wrapper.get('.price').text()).toBe('4.790 kr.');
    expect(wrapper.get('.date').text()).toBe(formatDate('2026-11-26', 'is-IS'));
    expect(wrapper.get('.date').text()).not.toBe(formatDate('2026-11-26', 'en-US'));
  });

  it('falls back to the content locale with no regional format', () => {
    const wrapper = mount(Probe, mountOptions({ entry }, { locale: 'en-US', commerce: ISK }));

    expect(wrapper.get('.price').text()).toBe('ISK 4,790');
    expect(wrapper.get('.date').text()).toBe(formatDate('2026-11-26', 'en-US'));
  });

  it('dates an article in the regional format, while its words stay English', () => {
    const wrapper = mount(
      ArticleBlock,
      mountOptions(
        { entry: { id: 'article', data: articleMock } },
        { locale: 'en-US', region: ICELAND }
      )
    );
    const spans = wrapper.get('time').findAll('span');

    expect(spans[0]!.text()).toBe(formatDate(articleMock.publishedAt, 'is-IS'));
    expect(spans[1]!.text()).toBe(formatDate(articleMock.publishedAt, 'is-IS', { month: 'long' }));
  });

  it('dates a timestamp on its calendar day in the organisation’s time zone', () => {
    // 02:30 UTC on the 27th is still the evening of the 26th in New York; a bare date is a day
    // already and is left alone, as is anything with no zone to convert to.
    expect(calendarDayIn('2026-11-27T02:30:00Z', 'America/New_York')).toBe('2026-11-26');
    expect(calendarDayIn('2026-11-27T02:30:00Z', 'Atlantic/Reykjavik')).toBe('2026-11-27');
    expect(calendarDayIn('2026-11-27', 'America/New_York')).toBe('2026-11-27');
    expect(calendarDayIn('2026-11-27T02:30:00Z', undefined)).toBe('2026-11-27T02:30:00Z');
    expect(calendarDayIn('not-a-dateTnope', 'America/New_York')).toBe('not-a-dateTnope');
  });
});
