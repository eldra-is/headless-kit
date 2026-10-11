import { inject } from 'vue';
import { STOREFRONT_KEY, type StorefrontSource } from '../storefront/types';
import { createDemoStorefront } from '../storefront/demo';

/**
 * `inject(STOREFRONT_KEY)` — `app/plugins/eldra-storefront.ts` provides the gateway source on a
 * real page; Storybook (`.storybook/eldra.ts`) and every block spec
 * (`test/support/mountBlock.ts`) provide the demo source instead. A fresh demo source is the
 * fallback (rather than throwing) so a block still renders something real-looking when mounted
 * with no storefront provider at all — the same shape `useT()` falls back to `en-US` for.
 *
 * `treatDefaultAsFactory: true` is what keeps that fallback from being constructed on every call
 * regardless of outcome (Vue evaluates a plain default value eagerly); it is only ever built when
 * nothing was provided.
 */
export function useStorefront(): StorefrontSource {
  return inject(STOREFRONT_KEY, () => createDemoStorefront(), true);
}
