import { describe, expect, it, vi } from 'vitest';
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
    // with. It is provided as `''` — not left absent — because an absent provide is exactly what
    // `@eldrajs/ui` answers `USD` for; see `uiCurrencyFor` (`app/storefront/commerce.ts`).
    for (const eldra of [
      {},
      { commerce: null },
      { commerce: { currency: 'ISK' } },
      { commerce: { ...ISK, currency: '' } },
      { commerce: { ...ISK, taxInclusivePricing: 'yes' } },
    ]) {
      expect(provideWith(eldra).get(CURRENCY_KEY)).toBe('');
    }
  });
});
