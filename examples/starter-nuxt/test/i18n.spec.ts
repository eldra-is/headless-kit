// @vitest-environment jsdom
//
// `useT.ts` imports `useEldra` from `@eldrajs/theme-vue`, whose single index
// entry also re-exports `EldraBlockZone`, which pulls in a
// `virtual:eldra/blocks` module supplied only by the Nuxt build's vite
// plugin (see test/framing.spec.ts and test/richText.spec.ts for the same
// underlying issue). Re-export the real `useEldra` straight from its source
// file instead (its own dependency chain never touches the virtual module),
// so the assertions below still exercise the genuine composable, not a
// stub — and import `ELDRA_KEY`/`createEldraPreviewState` the same way for
// building the provided context below.
import { defineComponent, h, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { createEldraClient, normalizeThemeDesignTokens } from '@eldrajs/theme-core';
import {
  createEldraPreviewState,
  ELDRA_KEY,
  type EldraContext,
} from '../../../packages/theme-vue/src/context';
import { enUS } from '../app/i18n/en-US';
import { isIS } from '../app/i18n/is-IS';
import type { MessageKey } from '../app/i18n/messages';

vi.mock('@eldrajs/theme-vue', async () => {
  const { useEldra } = await import('../../../packages/theme-vue/src/context');
  return { useEldra };
});

const { useT } = await import('../app/composables/useT');
type Translate = ReturnType<typeof useT>;

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

  it('interpolates {param} placeholders from the params argument', () => {
    const t = mountWithLocale('en-US');
    expect(t('gallery.imageOf', { index: 2, total: 5 })).toBe('Image 2 of 5');
    const isT = mountWithLocale('is-IS');
    expect(isT('gallery.imageOf', { index: 2, total: 5 })).toBe('Mynd 2 af 5');
  });

  it('leaves an unmatched {param} placeholder untouched', () => {
    const t = mountWithLocale('en-US');
    expect(t('gallery.imageOf', { index: 2 })).toBe('Image 2 of {total}');
  });

  it('returns the key itself when it does not resolve to a message', () => {
    const t = mountWithLocale('en-US');
    expect(t('does.not.exist' as MessageKey)).toBe('does.not.exist');
  });
});
