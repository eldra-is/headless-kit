import type { Decorator } from '@storybook/vue3-vite';
import { createEldraClient } from '@eldrajs/theme-core';
import { provideEldra } from '@eldrajs/theme-vue';

/**
 * Provides the same `EldraContext` a real page gets from
 * `@eldrajs/theme-nuxt`'s runtime plugin (see
 * `packages/theme-nuxt/src/runtime/plugin.ts`), so a block rendered as a
 * story sees exactly what it sees in production: a client (never called —
 * stories pass `entry` data directly via args, no block here fetches), read
 * mode (`preview.active` stays `false`, its `createEldraPreviewState()`
 * default — there is no Studio bridge in Storybook), and a fixed content
 * locale. `provideEldra` builds the rest of the context
 * (`packages/theme-vue/src/context.ts`) with its own safe defaults, which is
 * all a block needs: none of the ten starter blocks read `designTokens`
 * directly, only the CSS custom properties `virtual:eldra/tokens.css` sets
 * (imported once in `preview.ts`).
 */
export const withEldraContext: Decorator = (story) => ({
  components: { story },
  setup() {
    const context = provideEldra({
      client: createEldraClient({ gatewayUrl: 'https://storybook.invalid', orgId: 'storybook' }),
    });
    context.preview.locale = 'en-US';
    return {};
  },
  template: '<story />',
});
