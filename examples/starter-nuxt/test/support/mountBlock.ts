import { defineComponent, h, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import {
  createEldraClient,
  normalizeThemeDesignTokens,
  type EldraClient,
} from '@eldrajs/theme-core';
import { flattenMessages } from '@eldrajs/theme-core/i18n';
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
import {
  createEldraLinkState,
  createEldraLocaleState,
  createEldraPreviewState,
  ELDRA_KEY,
  type EldraContext,
  type EldraLinkState,
  type EldraLocaleState,
} from '@eldrajs/theme-vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY, enUS as uiEnUS } from '@eldrajs/ui';
import { isIS as uiIsIS } from '@eldrajs/ui/messages/is-IS';
import { createDemoStorefront } from '../../app/storefront/demo';
import { STOREFRONT_KEY, type StorefrontCommerce } from '../../app/storefront/types';
import enUSMessages from '../../i18n/en-US.json';
import isISMessages from '../../i18n/is-IS.json';

const STARTER_DEFAULT_LOCALE = 'en-US';

/** The package's own default message set for a content locale — mirrors `app/plugins/
 * eldra-ui-messages.ts`'s `uiPackageMessagesFor`. A test fixes its locale at mount time (no Studio
 * bridge, no live switch — see `[LOCALE_KEY]` below), so a plain lookup is all this needs. */
function uiMessagesFor(locale: string): typeof uiEnUS {
  return locale === 'is-IS' ? uiIsIS : uiEnUS;
}

/**
 * The single place a block's test environment mimics the site — mirrors
 * `.storybook/eldra.ts` + `.storybook/nuxt-link-stub.ts` (the Storybook
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
 *
 * No gateway and no `virtual:eldra/messages` here either — `vue-i18n` is installed straight from
 * the starter's own two locale files (`global.plugins`), the same way `.storybook/i18n.ts` does for
 * Storybook, so a block's `useI18n()` call resolves. Fixed at mount time, like every other provide
 * here: a spec that needs the switch to be *live* builds its own `createI18n()` call and its own
 * watcher the way `blocks/collection-grid/__tests__/Block.spec.ts`'s "follows a locale switch" spec
 * does, rather than this shared helper carrying reactive plumbing every other caller pays for.
 */
export function mountOptions(
  props: { entry: { id: string; data: Record<string, unknown> } },
  options: {
    locale?: string;
    links?: Partial<EldraLinkState>;
    /**
     * Which content locale this page is, and how a destination is spelled in it. One unprefixed
     * site by default — what a single-locale store is, and what every block spec but
     * `test/localePrefix.spec.ts` is about.
     */
    locales?: Partial<EldraLocaleState>;
    /**
     * What the store sells in, for a spec about money: the demo store's own `DEMO_COMMERCE` (US
     * dollars) by default, `null` for a store that publishes no currency at all. Both the
     * storefront's `commerce` and `@eldrajs/ui`'s `CURRENCY_KEY` come from this one value, the
     * same way the two plugins take both from one runtime-config read on a real page.
     */
    commerce?: StorefrontCommerce | null;
  } = {}
): {
  props: { entry: { id: string; data: Record<string, unknown> } };
  global: {
    plugins: unknown[];
    provide: Record<symbol, unknown>;
    components: Record<string, unknown>;
    stubs: Record<string, unknown>;
  };
} {
  const locale = options.locale ?? STARTER_DEFAULT_LOCALE;
  const context = createTestEldraContext(locale, options.links, options.locales);
  // The same priority `app/plugins/eldra-i18n.ts` (and the old `useT()` before it) reads: a page's
  // own `locales.active` — the locale its URL prefix names, or the one Studio is driving — wins
  // over the plain `locale` this mount was given, so a spec that overrides `options.locales.active`
  // (rather than `options.locale`) still gets translated output in that locale.
  const effectiveLocale = context.locales?.active ?? context.preview.locale ?? locale;
  const storefront = createDemoStorefront({ commerce: options.commerce });
  const i18n = createI18n({
    legacy: false,
    locale: effectiveLocale,
    fallbackLocale: STARTER_DEFAULT_LOCALE,
    messages: { 'en-US': enUSMessages, 'is-IS': isISMessages },
  });
  return {
    props,
    global: {
      plugins: [i18n],
      provide: {
        [ELDRA_KEY]: context,
        // The same wiring `app/plugins/eldra-ui-messages.ts` does on a real
        // page: `@eldrajs/ui`'s own strings and number locale follow the
        // content locale, and its store currency comes from the store — the
        // platform's answer there, the demo source's own here — never from the
        // locale.
        [MESSAGES_KEY]: uiMessagesFor(effectiveLocale),
        [LOCALE_KEY]: effectiveLocale,
        [CURRENCY_KEY]: storefront.commerce?.currency,
        // The same wiring `app/plugins/eldra-storefront.ts` does on a real page: a commerce block
        // reads `useStorefront()`, never the client directly, so every block test sees the
        // Northwind demo catalogue (`app/storefront/demo.ts`) instead of a live gateway.
        [STOREFRONT_KEY]: storefront,
      },
      // `components`, not only `stubs`: blocks route an internal destination
      // through `app/components/EldraRouterLink.vue`, whose template writes
      // the `<NuxtLink>` tag — a name only a *registered* component resolves.
      components: { NuxtLink: NuxtLinkStub },
      stubs: { NuxtLink: NuxtLinkStub },
    },
  };
}

function createTestEldraContext(
  locale = 'en-US',
  links: Partial<EldraLinkState> = {},
  locales: Partial<EldraLocaleState> = {}
): EldraContext {
  const context: EldraContext = {
    client: createTestEldraClient(),
    designTokens: reactive(normalizeThemeDesignTokens({ colors: {} })),
    // Nothing here reads `context.messages` directly — a block calls `useI18n()`, which resolves
    // through `mountOptions`' own `global.plugins` instead — but `EldraContext['messages']` is a
    // required field (`@eldrajs/theme-vue`), so a hand-built context needs one. The real catalogue,
    // not an empty one: `app/plugins/eldra-ui-messages.ts`'s own per-key override lookup reads
    // `context.messages.locales[locale]?.['ui.<key>']`, and a spec that provides this context
    // straight to that plugin's logic (none does today, but the shape should hold) gets the same
    // answer a real page would.
    messages: reactive({
      defaultLocale: STARTER_DEFAULT_LOCALE,
      locales: {
        'en-US': flattenMessages(enUSMessages),
        'is-IS': flattenMessages(isISMessages),
      },
    }),
    // Empty by default, exactly as a page that has resolved nothing yet: every
    // `link` value then resolves to a label with no href. A spec that wants a
    // real destination passes the site's own route templates and targets, the
    // way `@eldrajs/theme-nuxt` fills them from the resolved route.
    links: Object.assign(createEldraLinkState(), links),
    locales: Object.assign(createEldraLocaleState(), locales),
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
