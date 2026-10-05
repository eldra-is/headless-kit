import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mountWith } from '../../test/mount';

/**
 * `useEldraUiCurrency` once answered `USD` for a store that had published no currency, which is
 * the one wrong answer available: a dollar sign in front of krónur is a *wrong* price, where a
 * bare number is merely an incomplete one. The rule now is that there is no default code at all,
 * and a consumer that had to work around the old one — the starter provided `''`, a code `Intl`
 * must reject, purely to decline a currency — provides `undefined` instead.
 *
 * Three outcomes have to stay distinguishable, and only one of them is a mistake:
 *
 * - a provider supplied a code — that code;
 * - a provider supplied `undefined` (or the retired `''`) — no currency, and **no warning**: the
 *   store has answered;
 * - nothing provided at all — no currency, and one dev warning for the whole session, because
 *   that is an app that never wired the provide.
 *
 * The last two are the same value and different diagnoses, which is only possible because Vue's
 * `inject` tests `key in provides`: a provided `undefined` reaches the composable rather than
 * `inject`'s own default. That is the mechanism this spec pins.
 *
 * Each case imports the module **freshly** (`vi.resetModules()` + dynamic import): the
 * once-per-session guard is module state by design, so a shared import would make the order of
 * these tests load-bearing.
 */

type LocaleModule = typeof import('../useLocale');

async function freshModule(): Promise<LocaleModule> {
  vi.resetModules();
  return import('../useLocale');
}

/** Reads the composable inside a real `setup()`, with whatever the caller provides above it. */
function consumerOf(useCurrency: () => { value: string | undefined }) {
  return defineComponent({
    setup() {
      const currency = useCurrency();
      return () => h('i', {}, currency.value ?? '(none)');
    },
  });
}

function providerOf(
  key: symbol,
  value: unknown,
  child: ReturnType<typeof consumerOf>
): ReturnType<typeof consumerOf> {
  return defineComponent({
    provide: { [key]: value },
    setup: () => () => h(child),
  }) as ReturnType<typeof consumerOf>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEldraUiCurrency', () => {
  it('answers the provided currency, and follows a getter', async () => {
    const { CURRENCY_KEY, useEldraUiCurrency } = await freshModule();
    const code = ref<string | undefined>('ISK');
    const wrapper = mountWith(
      providerOf(CURRENCY_KEY as symbol, () => code.value, consumerOf(useEldraUiCurrency))
    );

    expect(wrapper.text()).toBe('ISK');
    code.value = 'EUR';
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('EUR');
    wrapper.unmount();
  });

  it('answers nothing — and warns once per session in dev — with no provider at all', async () => {
    const { useEldraUiCurrency } = await freshModule();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = mountWith(consumerOf(useEldraUiCurrency));
    expect(first.text()).toBe('(none)');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('CURRENCY_KEY');
    expect(String(warn.mock.calls[0]?.[0])).toContain('provideEldraUiCurrency');

    // Once per session, not once per component: a page of twenty prices says it once.
    const second = mountWith(consumerOf(useEldraUiCurrency));
    expect(second.text()).toBe('(none)');
    expect(warn).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
  });

  it('answers nothing and says nothing when a provider supplies undefined', async () => {
    const { CURRENCY_KEY, useEldraUiCurrency } = await freshModule();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWith(
      providerOf(CURRENCY_KEY as symbol, undefined, consumerOf(useEldraUiCurrency))
    );

    expect(wrapper.text()).toBe('(none)');
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('reads the retired empty-string sentinel as "no currency", also silently', async () => {
    const { CURRENCY_KEY, useEldraUiCurrency } = await freshModule();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const wrapper = mountWith(
      providerOf(CURRENCY_KEY as symbol, '', consumerOf(useEldraUiCurrency))
    );

    expect(wrapper.text()).toBe('(none)');
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('exports no default currency constant to fall back to', async () => {
    const locale = await freshModule();
    expect((locale as Record<string, unknown>).DEFAULT_UI_CURRENCY).toBeUndefined();
    // The number locale keeps its own default: grouping and a decimal point are a formatting
    // convention, not a claim about what the money is.
    expect(locale.DEFAULT_UI_LOCALE).toBe('en-US');
  });
});

describe('useEldraUiLocale', () => {
  it('falls back to en-US and follows a provided getter', async () => {
    const { LOCALE_KEY, useEldraUiLocale } = await freshModule();

    const bare = mountWith(consumerOf(useEldraUiLocale));
    expect(bare.text()).toBe('en-US');
    bare.unmount();

    const tag = ref<string | undefined>('is-IS');
    const wrapper = mountWith(
      providerOf(LOCALE_KEY as symbol, () => tag.value, consumerOf(useEldraUiLocale))
    );
    expect(wrapper.text()).toBe('is-IS');
    tag.value = undefined;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toBe('en-US');
    wrapper.unmount();
  });
});
