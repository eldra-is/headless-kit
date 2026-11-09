import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import { defineComponent, h, nextTick } from 'vue';
import { useMessages, type UiMessages } from '../../composables/useMessages';
import { enUS } from '../../messages/en-US';
import { isIS } from '../../messages/is-IS';
import {
  eldraUiI18nMessages,
  icelandicPluralRule,
  toVueI18nMessages,
  useEldraUiI18n,
  type EldraUiI18n,
} from '../index';
import { SHAPES, type FunctionMessageKey } from '../shapes';

function i18nWith(locale: 'en-US' | 'is-IS', extra: Record<string, string> = {}) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en-US',
    pluralRules: { 'is-IS': icelandicPluralRule },
    messages: {
      'en-US': { eldraUi: { ...toVueI18nMessages(enUS), ...extra } },
      'is-IS': { eldraUi: toVueI18nMessages(isIS) },
    },
  });
}

const COUNTS = [0, 1, 2, 5, 11, 21, 22, 101];
const TEXT = ['Ullarpeysa', 'Shoes & socks'];

/** Every argument list worth comparing for a message: each branch, each plural edge, two texts. */
function cases(key: FunctionMessageKey): unknown[][] {
  if (key === 'avatarGroup') {
    return [[], ['Anna'], ['Anna', 'Björn', 'Kári']].flatMap((names) =>
      [0, 1, 4].map((more) => ['Team', names, more])
    );
  }
  const shape = SHAPES[key];
  const base = COUNTS.flatMap((n) =>
    TEXT.map((text) =>
      shape.params.map((name) =>
        name === shape.count
          ? n
          : name === 'value'
            ? 4.25
            : shape.numbers?.includes(name)
              ? n + 3
              : text
      )
    )
  );
  if (!shape.variants) return base;
  return Object.values(shape.variants).flatMap((toArgs) => base.map((args) => toArgs(args)));
}

describe.each([
  ['en-US', enUS],
  ['is-IS', isIS],
] as const)('%s through vue-i18n', (locale, source) => {
  const kit = eldraUiI18nMessages(i18nWith(locale).global as unknown as EldraUiI18n);

  it.each(Object.keys(source))('%s prints exactly what the message set prints', (key) => {
    const expected = source[key as keyof UiMessages];
    const actual = kit[key as keyof UiMessages];
    if (typeof expected === 'string') {
      expect(actual).toBe(expected);
      return;
    }
    for (const args of cases(key as FunctionMessageKey)) {
      expect((actual as (...a: unknown[]) => string)(...args), JSON.stringify(args)).toBe(
        (expected as (...a: unknown[]) => string)(...args)
      );
    }
  });
});

describe('eldraUiI18nMessages', () => {
  it('falls back to the English default for a key the app has not translated', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'da-DK',
      messages: { 'da-DK': { eldraUi: { close: 'Luk' } } },
    });
    const kit = eldraUiI18nMessages(i18n.global as unknown as EldraUiI18n);
    expect(kit.close).toBe('Luk');
    expect(kit.clear).toBe(enUS.clear);
    expect(kit.createOption('sko')).toBe(enUS.createOption('sko'));
  });

  it('reads a translated message with named values and plural forms', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'da-DK',
      messages: {
        'da-DK': {
          eldraUi: {
            createOption: 'Opret “{query}”',
            resultsCount: '{n} resultat | {n} resultater',
          },
        },
      },
    });
    const kit = eldraUiI18nMessages(i18n.global as unknown as EldraUiI18n);
    expect(kit.createOption('sko')).toBe('Opret “sko”');
    expect(kit.resultsCount(1)).toBe('1 resultat');
    expect(kit.resultsCount(3)).toBe('3 resultater');
    // The query branch is its own key, untranslated here.
    expect(kit.resultsCount(3, 'sko')).toBe(enUS.resultsCount(3, 'sko'));
  });

  it('never parses an argument as message syntax', () => {
    const kit = eldraUiI18nMessages(i18nWith('en-US').global as unknown as EldraUiI18n);
    expect(kit.createOption('{n} @user | $x')).toBe('Create “{n} @user | $x”');
  });

  it('follows a locale switch', async () => {
    const i18n = i18nWith('en-US');
    const Probe = defineComponent({
      setup() {
        useEldraUiI18n();
        const Child = defineComponent({
          setup() {
            const messages = useMessages();
            return () => h('p', `${messages.value.close} / ${messages.value.charactersLeft(21)}`);
          },
        });
        return () => h(Child);
      },
    });
    const wrapper = mount(Probe, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe(`${enUS.close} / ${enUS.charactersLeft(21)}`);
    i18n.global.locale.value = 'is-IS';
    await nextTick();
    expect(wrapper.text()).toBe(`${isIS.close} / ${isIS.charactersLeft(21)}`);
    wrapper.unmount();
  });
});

describe('icelandicPluralRule', () => {
  it('treats numbers ending in 1, except 11, as singular', () => {
    expect([1, 21, 101, 11, 111, 2, 0].map((n) => icelandicPluralRule(n, 2))).toEqual([
      0, 0, 0, 1, 1, 1, 1,
    ]);
  });
});
