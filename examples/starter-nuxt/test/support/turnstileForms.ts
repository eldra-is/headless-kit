import { computed } from 'vue';
import { vi } from 'vitest';
import { createDemoStorefront } from '../../app/storefront/demo';
import type { StorefrontForms, StorefrontSource } from '../../app/storefront/types';

export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

/**
 * The demo storefront whose forms all have Cloudflare Turnstile switched on (a site key on the
 * definition), with `forms.submit` replaced by `submit`: what a spec needs to prove a block that
 * renders its own fields still renders the widget and sends the token.
 */
export function storefrontWithTurnstile(submit: StorefrontForms['submit']): StorefrontSource {
  const base = createDemoStorefront();
  return {
    ...base,
    forms: {
      definition: (key) => {
        const result = base.forms.definition(key);
        return {
          ...result,
          data: computed(() =>
            result.data.value === null
              ? null
              : { ...result.data.value, turnstileSiteKey: TURNSTILE_SITE_KEY }
          ) as typeof result.data,
        };
      },
      submit,
    },
  };
}

/** A fake `window.turnstile`: `solve(token)` is the visitor passing the check. */
export function stubTurnstile() {
  let callback: ((token: string) => void) | undefined;
  const render = vi.fn((_el: HTMLElement, options: { callback: (token: string) => void }) => {
    callback = options.callback;
    return 'widget-1';
  });
  const reset = vi.fn();
  (window as unknown as { turnstile: unknown }).turnstile = { render, reset, remove: vi.fn() };
  return {
    render,
    reset,
    solve: (token: string) => callback?.(token),
  };
}

export function cleanUpTurnstile(): void {
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((node) => node.remove());
  delete (window as { turnstile?: unknown }).turnstile;
}
