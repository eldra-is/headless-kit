import { defineComponent, h, reactive } from 'vue';
import {
  createEldraClient,
  normalizeThemeDesignTokens,
  type EldraClient,
} from '@eldrajs/theme-core';
// Import straight from theme-vue's source, not the `@eldrajs/theme-vue`
// package entry: that single bundled entry also re-exports `EldraBlockZone`,
// which pulls in a `virtual:eldra/blocks` module supplied only by the Nuxt
// build's vite plugin (see test/framing.spec.ts and test/richText.spec.ts
// for the same underlying issue). `context.ts`'s own dependency chain never
// touches the virtual module, so every block spec that imports this support
// module gets the real `createEldraPreviewState`/`ELDRA_KEY` for free,
// without each spec having to `vi.mock('@eldrajs/theme-vue', …)` itself.
import {
  createEldraPreviewState,
  ELDRA_KEY,
  type EldraContext,
} from '../../../../packages/theme-vue/src/context';

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
  global: { provide: Record<symbol, EldraContext>; stubs: Record<string, unknown> };
} {
  return {
    props,
    global: {
      provide: { [ELDRA_KEY]: createTestEldraContext(options.locale) },
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
