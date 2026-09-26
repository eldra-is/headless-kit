// @vitest-environment jsdom
//
// `useT.ts` imports `useEldra` from `@eldrajs/theme-vue`; its single index
// entry also re-exports `EldraBlockZone`/`EldraLayout`, which import
// `virtual:eldra/blocks`/`virtual:eldra/manifest`/`virtual:eldra/breakpoints`
// at the top level, normally supplied only by the Nuxt build's vite plugin.
// `vitest.config.ts` aliases all three to mocks under `test/mocks/`, so the
// package resolves for real here — no mocking needed.
import { defineComponent, h, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createEldraClient, normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import { createEldraPreviewState, ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { useT, type Translate } from '../app/composables/useT';
import { enUS } from '../app/i18n/en-US';
import { isIS } from '../app/i18n/is-IS';
import type { MessageKey } from '../app/i18n/messages';

function flattenKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    return typeof child === 'string' ? [path] : flattenKeys(child as Record<string, unknown>, path);
  });
}

describe('locale key parity', () => {
  it('en-US and is-IS declare exactly the same set of dotted keys', () => {
    expect(flattenKeys(enUS).sort()).toEqual(flattenKeys(isIS).sort());
  });
});

function mountWithLocale(locale: string | undefined): Translate {
  let translate!: Translate;
  const Harness = defineComponent({
    setup() {
      translate = useT();
      return () => h('div');
    },
  });
  if (locale === undefined) {
    mount(Harness);
    return translate;
  }
  const context: EldraContext = {
    client: createEldraClient({ gatewayUrl: 'https://vitest.invalid', orgId: 'vitest' }),
    designTokens: reactive(normalizeThemeDesignTokens({ colors: {} })),
    preview: createEldraPreviewState(),
  };
  context.preview.locale = locale;
  mount(Harness, { global: { provide: { [ELDRA_KEY]: context } } });
  return translate;
}

describe('useT', () => {
  it('falls back to en-US when no Eldra context is provided at all', () => {
    const t = mountWithLocale(undefined);
    expect(t('nav.menu')).toBe('Menu');
    expect(t('notFound.title')).toBe('Page not found');
  });

  it('picks the is-IS message when the context locale is is-IS', () => {
    const t = mountWithLocale('is-IS');
    expect(t('nav.menu')).toBe('Valmynd');
    expect(t('notFound.title')).toBe('Síða fannst ekki');
  });

  it('falls back to en-US when the context locale is not a shipped locale', () => {
    const t = mountWithLocale('fr-FR');
    expect(t('nav.menu')).toBe('Menu');
  });

  // `{param}` interpolation has no shipped message left that uses it — every string with a
  // placeholder (`gallery.imageOf`, `carousel.slideOf`) belonged to the hand-rolled primitives
  // plan 3 replaced with `@eldrajs/ui`'s `Lightbox`/`Carousel`, which carry their own equivalent
  // vocabulary through their own `useMessages` instead. `interpolate()` itself is exercised
  // indirectly (a no-params call is still a call) by every other test in this file; a future
  // block that needs `{param}` text back is what re-earns a dedicated test here.

  it('returns the key itself when it does not resolve to a message', () => {
    const t = mountWithLocale('en-US');
    expect(t('does.not.exist' as MessageKey)).toBe('does.not.exist');
  });
});
