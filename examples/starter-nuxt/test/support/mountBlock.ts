import { defineComponent, h, reactive } from 'vue';
import {
  createEldraClient,
  normalizeThemeDesignTokens,
  type EldraClient,
} from '@eldrajs/theme-core';
// `@eldrajs/theme-vue`'s single bundled entry also re-exports `EldraBlockZone`
// / `EldraLayout`, which import `virtual:eldra/blocks` /
// `virtual:eldra/manifest` / `virtual:eldra/breakpoints` at the top level —
// normally supplied only by `@eldrajs/vite-plugin-theme`'s Vite plugin
// during a real theme build. `vitest.config.ts` aliases all three to mocks
// under `test/mocks/`, so importing the package by name here works the same
// as it does in real app code (`app/composables/useT.ts`,
// `app/composables/useBlockData.ts`) — no relative reach into the theme-vue
// package's own source and no per-spec `vi.mock('@eldrajs/theme-vue', …)`
// needed. This matters beyond tidiness: `eldra-theme init` copies this
// starter (including `test/`) into a customer's project verbatim, where no
// monorepo sibling exists to reach into at all.
import { createEldraPreviewState, ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY } from '@eldrajs/ui';
import { currencyFor, uiMessagesFor } from '../../app/i18n/uiMessages';
import { createDemoStorefront } from '../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../app/storefront/types';

/**
 * The single place a block's test environment mimics the site — mirrors
 * `.storybook/eldra.ts` + `.storybook/nuxt-link-stub.ts` (Task 2's Storybook
 * decorator), so a block sees the same shape of `EldraContext` under
 * `mount()` as it does as a story or on a real page: a client (never
 * called — tests pass `entry` data directly), read mode (`preview.active`
 * stays `false` — `createEldraPreviewState()`'s default, there is no Studio
 * bridge in tests either), and a fixed content locale.
 *
 * `provideEldra()` (`@eldrajs/theme-vue`) can't be reused directly here: it
 * calls Vue's `provide()`, which needs an active component instance during
 * `setup()`. `mount()`'s `global.provide` takes the context object itself,
 * so this assembles the same shape by hand instead.
 */
export function mountOptions(
  props: { entry: { id: string; data: Record<string, unknown> } },
  options: { locale?: string } = {}
): {
  props: { entry: { id: string; data: Record<string, unknown> } };
  global: {
    provide: Record<symbol, unknown>;
    components: Record<string, unknown>;
    stubs: Record<string, unknown>;
  };
} {
  const locale = options.locale ?? 'en-US';
  return {
    props,
    global: {
      provide: {
        [ELDRA_KEY]: createTestEldraContext(locale),
        // The same wiring `app/plugins/eldra-ui-messages.ts` does on a real
        // page: `@eldrajs/ui`'s own strings, number locale and store
        // currency all follow the content locale.
        [MESSAGES_KEY]: uiMessagesFor(locale),
        [LOCALE_KEY]: locale,
        [CURRENCY_KEY]: currencyFor(locale),
        // The same wiring `app/plugins/eldra-storefront.ts` does on a real page: a commerce block
        // reads `useStorefront()`, never the client directly, so every block test sees the
        // Northwind demo catalogue (`app/storefront/demo.ts`) instead of a live gateway.
        [STOREFRONT_KEY]: createDemoStorefront(),
      },
      // `components`, not only `stubs`: blocks route an internal destination
      // through `app/components/EldraRouterLink.vue`, whose template writes
      // the `<NuxtLink>` tag — a name only a *registered* component resolves.
      components: { NuxtLink: NuxtLinkStub },
      stubs: { NuxtLink: NuxtLinkStub },
    },
  };
}

function createTestEldraContext(locale = 'en-US'): EldraContext {
  const context: EldraContext = {
    client: createTestEldraClient(),
    designTokens: reactive(normalizeThemeDesignTokens({ colors: {} })),
    preview: createEldraPreviewState(),
  };
  context.preview.locale = locale;
  return context;
}

function createTestEldraClient(): EldraClient {
  return createEldraClient({ gatewayUrl: 'https://vitest.invalid', orgId: 'vitest' });
}

/**
 * Storybook has no Nuxt runtime to resolve the `<NuxtLink>` global; neither
 * does a plain `mount()` outside a Nuxt build. Renders a plain `<a>` from
 * the same `to` prop Nuxt's real component reads — all a test needs, it
 * never navigates.
 */
const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: {
    to: { type: [String, Object], default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'a',
        { href: typeof props.to === 'string' ? props.to : JSON.stringify(props.to) },
        slots.default?.()
      );
  },
});
