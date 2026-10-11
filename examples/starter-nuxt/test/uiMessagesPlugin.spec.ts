import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY } from '@eldrajs/ui';

/**
 * `app/plugins/eldra-ui-messages.ts` is the one place the store's currency reaches `@eldrajs/ui` —
 * and therefore `useMoney()`, which reads the same provide. It is a Nuxt plugin, so `nuxt/app` is
 * mocked down to the two functions it calls: `defineNuxtPlugin` (the identity, so the object's own
 * `setup` can be invoked) and `useRuntimeConfig` (the config this spec sets per case).
 *
 * `vi.hoisted` is what makes the shared state reachable from the mock factory: `vi.mock` is
 * hoisted above the imports, so a plain `const` declared below would still be in its temporal dead
 * zone when the factory runs.
 */
const state = vi.hoisted(() => ({ publicConfig: {} as Record<string, unknown> }));

vi.mock('nuxt/app', () => ({
  defineNuxtPlugin: <T>(plugin: T): T => plugin,
  useRuntimeConfig: () => ({ public: state.publicConfig }),
}));

const { default: plugin } = await import('../app/plugins/eldra-ui-messages');

const ISK = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };

/** Runs the plugin against one `runtimeConfig.public`, and reports what it provided. */
function provideWith(eldra: Record<string, unknown>): Map<symbol, unknown> {
  state.publicConfig = { eldra };
  const provided = new Map<symbol, unknown>();
  const vueApp = {
    provide: (key: symbol, value: unknown) => {
      provided.set(key, value);
    },
    runWithContext: <T>(fn: () => T): T => fn(),
  };
  (plugin as { setup: (nuxtApp: { vueApp: typeof vueApp }) => void }).setup({ vueApp });
  return provided;
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** This theme's own warnings, separated from Vue's. */
function eldraWarnings(warn: { mock: { calls: unknown[][] } }): string[] {
  return warn.mock.calls
    .map((call) => String(call[0]))
    .filter((message) => message.startsWith('[eldra]'));
}

describe('eldra-ui-messages', () => {
  it('provides the currency the platform published, not one read off the locale', () => {
    const provided = provideWith({ commerce: ISK });

    expect(provided.get(CURRENCY_KEY)).toBe('ISK');
    // The other two still come from the content locale — they always did.
    expect(provided.has(MESSAGES_KEY)).toBe(true);
    expect(provided.has(LOCALE_KEY)).toBe(true);
  });

  it('declines a currency when the store publishes none, rather than leaving one to be guessed', () => {
    // Absent, explicitly null and a half-filled record are the same answer: nothing to format
    // with. The provide still happens, carrying `undefined` — which `@eldrajs/ui` reads as "this
    // store has no currency", distinct from the no-provider-at-all case it warns about. So the
    // key must be *present* and its value absent, not the other way round.
    for (const eldra of [
      {},
      { commerce: null },
      // What a page actually carries when the module wrote `null`: Nuxt serialises a null public
      // runtime-config value as an empty string.
      { commerce: '' },
      { commerce: { currency: 'ISK' } },
      { commerce: { ...ISK, currency: '' } },
      { commerce: { ...ISK, taxInclusivePricing: 'yes' } },
    ]) {
      const provided = provideWith(eldra);
      expect(provided.has(CURRENCY_KEY)).toBe(true);
      expect(provided.get(CURRENCY_KEY)).toBeUndefined();
    }
  });

  it('says so in dev when it throws away a currency because the record is half set', () => {
    // Dropping every price on the page to a bare number because two tax fields were missing is not
    // something to do in silence: the currency was there.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    provideWith({ commerce: { currency: 'ISK', defaultTaxRate: 0.24 } });

    // Filtered, because Vue itself warns about the `inject()` this harness makes outside a
    // component — see `provideWith`.
    expect(eldraWarnings(warn)).toHaveLength(1);
    expect(eldraWarnings(warn)[0]).toContain('taxInclusivePricing');
  });

  it('says nothing when the store simply has no commerce settings', () => {
    // Not a mistake, and not a lost currency — the ordinary state of a store that sells nothing yet.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    provideWith({});
    provideWith({ commerce: null });
    provideWith({ commerce: '' });

    expect(eldraWarnings(warn)).toEqual([]);
  });
});
