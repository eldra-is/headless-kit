import type { Decorator } from '@storybook/vue3-vite';
import { provide } from 'vue';
import { createEldraClient } from '@eldrajs/theme-core';
import { provideEldra } from '@eldrajs/theme-vue';
import { provideEldraUiCurrency, provideEldraUiLocale, provideEldraUiMessages } from '@eldrajs/ui';
import { currencyFor, uiMessagesFor } from '../app/i18n/uiMessages';
import { createDemoStorefront } from '../app/storefront/demo';
import { STOREFRONT_KEY } from '../app/storefront/types';

/**
 * Provides the same `EldraContext` a real page gets from
 * `@eldrajs/theme-nuxt`'s runtime plugin, so a block rendered as a story
 * sees exactly what it sees in production: a client (never called —
 * stories pass `entry` data directly via args, no block here fetches), read
 * mode (`preview.active` stays `false`, its `createEldraPreviewState()`
 * default — there is no Studio bridge in Storybook), and a fixed content
 * locale. `provideEldra` builds the rest of the context
 * (`@eldrajs/theme-vue`'s own `EldraContext`) with its own safe defaults,
 * which is all a block needs: none of the ten starter blocks read
 * `designTokens` directly, only the CSS custom properties
 * `virtual:eldra/tokens.css` sets (imported once in `preview.ts`).
 *
 * Also provides the Northwind demo storefront (`app/storefront/demo.ts`) under `STOREFRONT_KEY` —
 * the same wiring `app/plugins/eldra-storefront.ts` does on a real page — so a commerce block
 * story (and the Playwright preview screenshot taken from it) renders real-looking catalogue,
 * cart and order data with no gateway, exactly like `test/support/mountBlock.ts` does for specs.
 */
export const withEldraContext: Decorator = (story) => ({
  components: { story },
  setup() {
    const context = provideEldra({
      client: createEldraClient({ gatewayUrl: 'https://storybook.invalid', orgId: 'storybook' }),
    });
    context.preview.locale = 'en-US';
    // The same wiring `app/plugins/eldra-ui-messages.ts` does on a real page:
    // `@eldrajs/ui`'s own strings, number locale and store currency all
    // follow the story's content locale.
    provideEldraUiMessages(uiMessagesFor(context.preview.locale));
    provideEldraUiLocale(context.preview.locale);
    provideEldraUiCurrency(currencyFor(context.preview.locale));
    provide(STOREFRONT_KEY, createDemoStorefront());
    return {};
  },
  template: '<story />',
});
