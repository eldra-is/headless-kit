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
      applyThemeMessages(target, {
        revision: 2,
        locales: { 'fr-FR': { 'header.menu': 'Menu FR' } },
      })
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

  /**
   * `context.messages` is `reactive(...)` — a real Vue proxy, not a plain object — so a locale tag
   * of `__proto__` arriving in a push is the live-bridge instance of the same risk
   * `@eldrajs/theme-core/i18n`'s merge/resolve helpers already guard against: a bare
   * `locales[tag] = …` write for that literal key reassigns the object's own prototype through the
   * proxy's `set` trap exactly as it would on a plain object, rather than adding an own property
   * named for it. `JSON.parse` (not object-literal syntax, which sets the prototype at creation
   * time and never produces an own `"__proto__"` key at all) is what actually constructs a payload
   * carrying one, the same way a real `postMessage` payload would arrive deserialized.
   */
  it('refuses a __proto__ locale tag pushed over the bridge, against the real reactive proxy', () => {
    const target = context();
    // A marker key distinct from any real message key: the actual risk (confirmed against the
    // real `vue` package before this guard existed) is that `target.messages.locales.pollution`
    // — a property *nobody ever set* — starts answering `"leaked"` because the object's own
    // prototype, not the global `Object.prototype`, was reassigned. Asserting on a marker rather
    // than a realistic-looking key is what makes this failure mode impossible to miss.
    const payload = JSON.parse(
      '{"revision":2,"locales":{"__proto__":{"pollution":"leaked"},"en-US":{"header.menu":"Safe override"}}}'
    ) as Parameters<typeof applyThemeMessages>[1];

    expect(applyThemeMessages(target, payload)).toBe(true);

    // The forbidden tag never lands as an own key...
    expect(Object.keys(target.messages.locales)).not.toContain('__proto__');
    // ...and, the actual risk: the live, shared object's own prototype is untouched.
    expect((target.messages.locales as Record<string, unknown>).pollution).toBeUndefined();
    // A clean sibling locale in the very same push still applies normally.
    expect(target.messages.locales['en-US']).toEqual({ 'header.menu': 'Safe override' });
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
