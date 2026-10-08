import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraLinkState, type EldraContext } from '../context';
import { applyThemeMessages } from '../useEldraPreview';

function context(): EldraContext {
  return {
    client: {} as EldraContext['client'],
    designTokens: reactive({ colors: {}, containers: {} }),
    messages: reactive({
      defaultLocale: 'en-US',
      locales: {
        'en-US': { 'header.menu': 'Menu', 'cart.empty.title': 'Your cart is empty' },
        'is-IS': { 'header.menu': 'Valmynd' },
      },
    }),
    links: createEldraLinkState(),
    preview: reactive({
      active: true,
      mode: 'edit',
      locale: 'en-US',
      sourceDrafts: {},
      drafts: {},
      draftSchemaApiIds: {},
      refreshRevision: 0,
      revision: 0,
      designTokensRevision: 0,
      messagesRevision: 1,
      tokenRevision: 0,
      richTextRenderRevision: 0,
      editorSupportsSlots: false,
    }),
  };
}

describe('live theme-message catalogue', () => {
  it('replaces one locale’s full record, leaving the others untouched', () => {
    const target = context();
    expect(
      applyThemeMessages(target, {
        revision: 2,
        locales: { 'en-US': { 'header.menu': 'Overridden menu' } },
      })
    ).toBe(true);
    // Whole replacement, not a per-key merge: cart.empty.title is gone, not kept.
    expect(target.messages.locales['en-US']).toEqual({ 'header.menu': 'Overridden menu' });
    expect(target.messages.locales['is-IS']).toEqual({ 'header.menu': 'Valmynd' });
    expect(target.preview.messagesRevision).toBe(2);
  });

  it('adds a locale the catalogue did not carry yet', () => {
    const target = context();
    expect(
      applyThemeMessages(target, { revision: 2, locales: { 'fr-FR': { 'header.menu': 'Menu FR' } } })
    ).toBe(true);
    expect(target.messages.locales['fr-FR']).toEqual({ 'header.menu': 'Menu FR' });
  });

  it('ignores a stale revision, applying no change', () => {
    const target = context();
    const before = JSON.parse(JSON.stringify(target.messages));
    expect(
      applyThemeMessages(target, {
        revision: 1,
        locales: { 'en-US': { 'header.menu': 'Should not land' } },
      })
    ).toBe(false);
    expect(
      applyThemeMessages(target, {
        revision: 0,
        locales: { 'en-US': { 'header.menu': 'Should not land either' } },
      })
    ).toBe(false);
    expect(target.messages).toEqual(before);
    expect(target.preview.messagesRevision).toBe(1);
  });

  it('refuses an oversized payload without partial mutation', () => {
    const target = context();
    const before = JSON.parse(JSON.stringify(target.messages));
    expect(
      applyThemeMessages(target, {
        revision: 2,
        locales: { 'en-US': { 'header.menu': 'x'.repeat(70_000) } },
      })
    ).toBe(false);
    expect(target.messages).toEqual(before);
    expect(target.preview.messagesRevision).toBe(1);
  });

  it('drops a non-string value rather than letting it through', () => {
    const target = context();
    expect(
      applyThemeMessages(target, {
        revision: 2,
        locales: {
          'en-US': { 'header.menu': 'Kept', attack: 1 } as unknown as Record<string, string>,
        },
      })
    ).toBe(true);
    expect(target.messages.locales['en-US']).toEqual({ 'header.menu': 'Kept' });
  });

  it('applies several locales from one push', () => {
    const target = context();
    expect(
      applyThemeMessages(target, {
        revision: 2,
        locales: {
          'en-US': { 'header.menu': 'Menu EN2' },
          'is-IS': { 'header.menu': 'Valmynd 2' },
        },
      })
    ).toBe(true);
    expect(target.messages.locales['en-US']).toEqual({ 'header.menu': 'Menu EN2' });
    expect(target.messages.locales['is-IS']).toEqual({ 'header.menu': 'Valmynd 2' });
  });
});
