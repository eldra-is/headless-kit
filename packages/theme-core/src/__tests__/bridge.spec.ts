import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorBridge } from '../bridge/editor';
import { createThemeBridge } from '../bridge/theme';
import {
  BRIDGE_PROTOCOL,
  BRIDGE_VERSION,
  EDITOR_CAPABILITIES,
  KNOWN_MESSAGE_TYPES,
  THEME_CAPABILITIES,
} from '../bridge/protocol';
import { RICH_TEXT_COMMAND_NAMES } from '../bridge/protocol';
import type {
  BridgeEnvelope,
  EditorRichTextAppliedMessage,
  EditorRichTextEditingMessage,
  EditorRichTextLocateMessage,
  ThemeRichTextCommandMessage,
  ThemeRichTextInputMessage,
  ThemeRichTextSelectionMessage,
} from '../bridge/protocol';
import { installHarness, STUDIO_ORIGIN, THEME_ORIGIN } from './bridge-harness';

describe('@eldrajs/bridge', () => {
  let h: ReturnType<typeof installHarness>;
  beforeEach(() => {
    vi.useFakeTimers();
    h = installHarness();
  });
  afterEach(() => {
    h.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function boot() {
    const editorEvents: Array<{ type: string; payload: unknown }> = [];
    const themeEvents: Array<{ type: string; payload: unknown }> = [];
    const onConnected = vi.fn();
    const onDisconnected = vi.fn();
    const editor = createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: (type, payload) => editorEvents.push({ type, payload }),
      onConnected,
      onDisconnected,
    });
    const theme = createThemeBridge({
      allowedOrigins: [STUDIO_ORIGIN],
      onMessage: (type, payload) => themeEvents.push({ type, payload }),
    });
    return { editor, theme, editorEvents, themeEvents, onConnected, onDisconnected };
  }

  it('completes the handshake: hello -> ready -> onConnected -> ping/pong', () => {
    const { theme, onConnected } = boot();
    h.iframe.dispatchLoad();
    // first hello is posted immediately on load
    expect(h.iframe.sent.map((m) => m.data.type)).toContain('editor:hello');
    // theme answered ready, editor connected
    expect(h.parentStub.posted.map((m) => m.data.type)).toContain('theme:ready');
    const ready = h.parentStub.posted.find((m) => m.data.type === 'theme:ready')!
      .data as BridgeEnvelope<'theme:ready'>;
    expect(ready.payload.capabilities).toEqual([
      'design-tokens',
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);
    // No breakpoints option given: the field is entirely absent, not `undefined`.
    expect(Object.hasOwn(ready.payload, 'breakpoints')).toBe(false);
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(theme.connected).toBe(false); // connected flips only on editor:init
    // heartbeat: ping every 5s, theme pongs
    vi.advanceTimersByTime(5000);
    expect(h.iframe.sent.filter((m) => m.data.type === 'editor:ping')).toHaveLength(1);
    expect(h.parentStub.posted.filter((m) => m.data.type === 'theme:pong')).toHaveLength(1);
  });

  it('includes a given breakpoints option in every theme:ready, including a re-answer', () => {
    createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });
    createThemeBridge({
      allowedOrigins: [STUDIO_ORIGIN],
      onMessage: () => {},
      breakpoints: { tablet: 600, normal: 900 },
    });
    h.iframe.dispatchLoad();

    // Earlier tests' theme bridges stay registered on the shared jsdom window
    // (none of them call destroy()) and idempotently re-answer any later
    // editor:hello too, so `find` the reply carrying *this* configuration
    // rather than assume this bridge's is the only — or the first — one.
    const readyMessages = () =>
      h.parentStub.posted
        .filter((m) => m.data.type === 'theme:ready')
        .map((m) => m.data.payload as { breakpoints?: { tablet: number; normal: number } });
    expect(
      readyMessages().some((p) => p.breakpoints?.tablet === 600 && p.breakpoints.normal === 900)
    ).toBe(true);

    h.parentStub.posted.length = 0;
    // Studio may retry hello; the theme bridge re-answers idempotently.
    h.inject(
      {
        protocol: BRIDGE_PROTOCOL,
        version: 1,
        id: 'retry',
        type: 'editor:hello',
        payload: { capabilities: [] },
      },
      STUDIO_ORIGIN
    );
    expect(
      readyMessages().some((p) => p.breakpoints?.tablet === 600 && p.breakpoints.normal === 900)
    ).toBe(true);
  });

  it('forwards design tokens only after the exact-origin handshake', () => {
    const { editor, themeEvents } = boot();
    h.iframe.dispatchLoad();
    editor.post('editor:design-tokens', {
      revision: 2,
      resolved: { colors: {}, containers: {} },
    });
    expect(themeEvents).toContainEqual({
      type: 'editor:design-tokens',
      payload: { revision: 2, resolved: { colors: {}, containers: {} } },
    });
  });

  it('forwards a theme-messages override only after the exact-origin handshake', () => {
    const { editor, themeEvents } = boot();
    h.iframe.dispatchLoad();
    editor.post('editor:theme-messages', {
      revision: 3,
      locales: { 'en-US': { 'header.menu': 'Overridden menu' } },
    });
    expect(themeEvents).toContainEqual({
      type: 'editor:theme-messages',
      payload: { revision: 3, locales: { 'en-US': { 'header.menu': 'Overridden menu' } } },
    });
    expect(KNOWN_MESSAGE_TYPES.has('editor:theme-messages')).toBe(true);
  });

  it('host posts editor:init from onConnected; theme.connected flips true', () => {
    const initPayload = {
      mode: 'edit',
      previewToken: 'tok-1',
      locale: 'en-US',
      path: '/',
    } as const;
    const themeEvents: Array<{ type: string }> = [];
    const theme = createThemeBridge({
      allowedOrigins: [STUDIO_ORIGIN],
      onMessage: (type) => themeEvents.push({ type }),
    });
    const editor = createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: () => {},
      onConnected: () => editor.post('editor:init', initPayload),
      onDisconnected: () => {},
    });
    h.iframe.dispatchLoad();
    expect(theme.connected).toBe(true);
    expect(themeEvents.map((e) => e.type)).toContain('editor:init');
    editor.destroy();
    theme.destroy();
  });

  it('drops messages from wrong origins silently', () => {
    const { themeEvents, editorEvents } = boot();
    h.iframe.dispatchLoad();
    const before = h.parentStub.posted.length;
    h.inject(
      { protocol: BRIDGE_PROTOCOL, version: 1, id: 'x', type: 'editor:refresh', payload: {} },
      'https://evil.example.com'
    );
    expect(themeEvents.map((e) => e.type)).not.toContain('editor:refresh');
    expect(editorEvents.map((e) => e.type)).not.toContain('editor:refresh');
    expect(h.parentStub.posted.length).toBe(before); // no reply of any kind
  });

  it('drops theme messages from a same-origin window that is not the owned iframe', () => {
    const { editorEvents, onConnected } = boot();
    h.iframe.dispatchLoad();
    const connectedCalls = onConnected.mock.calls.length;
    const message = {
      protocol: BRIDGE_PROTOCOL,
      version: 1,
      id: 'same-origin-spoof',
      type: 'theme:route-changed',
      payload: { path: '/spoofed' },
    };

    h.inject(message, THEME_ORIGIN, window);

    expect(editorEvents).not.toContainEqual({
      type: 'theme:route-changed',
      payload: { path: '/spoofed' },
    });
    expect(onConnected).toHaveBeenCalledTimes(connectedCalls);
  });

  it('ignores version-skewed and malformed envelopes with a console.debug', () => {
    const { themeEvents } = boot();
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    h.iframe.dispatchLoad();
    h.inject(
      { protocol: BRIDGE_PROTOCOL, version: 99, id: 'v', type: 'editor:refresh', payload: {} },
      STUDIO_ORIGIN
    );
    h.inject(
      { protocol: BRIDGE_PROTOCOL, version: 1, id: 'u', type: 'editor:not-a-thing', payload: {} },
      STUDIO_ORIGIN
    );
    h.inject({ hello: 'not an envelope' }, STUDIO_ORIGIN);
    expect(themeEvents.map((e) => e.type)).not.toContain('editor:refresh');
    expect(debug).toHaveBeenCalled();
  });

  it('gives up hello after 20 attempts and reports disconnected', () => {
    const onDisconnected = vi.fn();
    createEditorBridge({
      iframe: h.iframe,
      targetOrigin: 'https://never-answers.pages.dev', // relay drops these
      onMessage: () => {},
      onConnected: () => {},
      onDisconnected,
    });
    h.iframe.dispatchLoad();
    vi.advanceTimersByTime(500 * 25);
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    const hellos = h.iframe.sent.filter((m) => m.data.type === 'editor:hello');
    expect(hellos.length).toBeLessThanOrEqual(20);
  });

  it('declares disconnect after 3 missed pongs, reconnects on next pong', () => {
    const { theme, onConnected, onDisconnected } = boot();
    h.iframe.dispatchLoad();
    theme.destroy(); // theme stops answering pongs
    vi.advanceTimersByTime(5000 * 3);
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    // theme comes back
    const revived = createThemeBridge({ allowedOrigins: [STUDIO_ORIGIN], onMessage: () => {} });
    vi.advanceTimersByTime(5000);
    expect(onConnected).toHaveBeenCalledTimes(2); // initial + recovery
    revived.destroy();
  });

  it('theme locks the first allowed origin and queues posts made before the lock', () => {
    const theme = createThemeBridge({ allowedOrigins: [STUDIO_ORIGIN], onMessage: () => {} });
    theme.post('theme:error', { message: 'early', scope: 'render' }); // queued, no window yet
    expect(h.parentStub.posted).toHaveLength(0);
    createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });
    h.iframe.dispatchLoad();
    const types = h.parentStub.posted.map((m) => m.data.type);
    expect(types[0]).toBe('theme:ready'); // ready always first
    expect(types).toContain('theme:error'); // queue flushed after lock
    expect(h.parentStub.posted.every((m) => m.targetOrigin === STUDIO_ORIGIN)).toBe(true);
  });

  it('round-trips a theme:slots-rendered envelope to the editor', () => {
    const { theme } = boot();
    h.iframe.dispatchLoad();
    theme.post('theme:slots-rendered', {
      slots: [
        {
          layoutNodeId: 'HeroNode',
          slotId: 'actions',
          rect: { x: 0, y: 0, width: 640, height: 48 },
        },
      ],
    });
    expect(h.parentStub.posted).toContainEqual({
      data: {
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id: expect.any(String),
        type: 'theme:slots-rendered',
        payload: {
          slots: [
            {
              layoutNodeId: 'HeroNode',
              slotId: 'actions',
              rect: { x: 0, y: 0, width: 640, height: 48 },
            },
          ],
        },
      },
      targetOrigin: STUDIO_ORIGIN,
    });
  });

  it('round-trips theme:drop-candidate envelopes with and without slotId', () => {
    const { theme } = boot();
    h.iframe.dispatchLoad();
    theme.post('theme:drop-candidate', {
      layoutNodeId: 'HeroNode',
      placement: 'inside',
      rect: { x: 0, y: 0, width: 640, height: 48 },
      slotId: 'actions',
    });
    theme.post('theme:drop-candidate', {
      layoutNodeId: 'FooterNode',
      placement: 'after',
      rect: { x: 0, y: 600, width: 640, height: 48 },
    });
    expect(h.parentStub.posted).toContainEqual({
      data: {
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id: expect.any(String),
        type: 'theme:drop-candidate',
        payload: {
          layoutNodeId: 'HeroNode',
          placement: 'inside',
          rect: { x: 0, y: 0, width: 640, height: 48 },
          slotId: 'actions',
        },
      },
      targetOrigin: STUDIO_ORIGIN,
    });
    expect(h.parentStub.posted).toContainEqual({
      data: {
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id: expect.any(String),
        type: 'theme:drop-candidate',
        payload: {
          layoutNodeId: 'FooterNode',
          placement: 'after',
          rect: { x: 0, y: 600, width: 640, height: 48 },
        },
      },
      targetOrigin: STUDIO_ORIGIN,
    });
  });

  it('round-trips theme:node-dropped envelopes with and without slotId', () => {
    const { theme } = boot();
    h.iframe.dispatchLoad();
    const payload = { kind: 'palette-block', id: 'tile-hero', apiId: 'hero' } as const;
    theme.post('theme:node-dropped', {
      payload,
      layoutNodeId: 'HeroNode',
      placement: 'inside',
      slotId: 'actions',
    });
    theme.post('theme:node-dropped', {
      payload,
      layoutNodeId: 'FooterNode',
      placement: 'before',
    });
    expect(h.parentStub.posted).toContainEqual({
      data: {
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id: expect.any(String),
        type: 'theme:node-dropped',
        payload: { payload, layoutNodeId: 'HeroNode', placement: 'inside', slotId: 'actions' },
      },
      targetOrigin: STUDIO_ORIGIN,
    });
    expect(h.parentStub.posted).toContainEqual({
      data: {
        protocol: BRIDGE_PROTOCOL,
        version: BRIDGE_VERSION,
        id: expect.any(String),
        type: 'theme:node-dropped',
        payload: { payload, layoutNodeId: 'FooterNode', placement: 'before' },
      },
      targetOrigin: STUDIO_ORIGIN,
    });
  });

  it('lists the image-framing messages in KNOWN_MESSAGE_TYPES and advertises the capability on both sides', () => {
    expect(KNOWN_MESSAGE_TYPES.has('theme:slots-rendered')).toBe(true);
    for (const type of ['theme:framing-target', 'theme:framing-changed', 'editor:framing-mode']) {
      expect(KNOWN_MESSAGE_TYPES.has(type)).toBe(true);
    }
    expect(THEME_CAPABILITIES).toEqual([
      'design-tokens',
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);
    expect(EDITOR_CAPABILITIES).toEqual([
      'content-update',
      'select-block',
      'inline-text',
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);
  });

  it('lists theme:block-hovered in KNOWN_MESSAGE_TYPES and advertises block-hover on both sides', () => {
    expect(KNOWN_MESSAGE_TYPES.has('theme:block-hovered')).toBe(true);
    expect([...THEME_CAPABILITIES]).toContain('block-hover');
    expect([...EDITOR_CAPABILITIES]).toContain('block-hover');
  });

  it('round-trips the framing envelopes in both directions', () => {
    const onEditor = vi.fn();
    const onTheme = vi.fn();
    const theme = createThemeBridge({ allowedOrigins: [STUDIO_ORIGIN], onMessage: onTheme });
    const editor = createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: onEditor,
      onConnected: () => {},
      onDisconnected: () => {},
    });
    h.iframe.dispatchLoad();
    theme.post('theme:framing-target', {
      entryId: 'e1',
      fieldPath: 'image',
      rect: { x: 0, y: 0, width: 10, height: 5 },
    });
    theme.post('theme:framing-changed', {
      entryId: 'e1',
      fieldPath: 'image',
      framing: { x: 0.4, y: 0.6, zoom: 1.5 },
      final: false,
    });
    theme.post('theme:framing-target', { entryId: null });
    editor.post('editor:framing-mode', { entryId: 'e1', fieldPath: 'image' });
    editor.post('editor:framing-mode', { entryId: null });
    expect(onEditor).toHaveBeenCalledWith('theme:framing-target', {
      entryId: 'e1',
      fieldPath: 'image',
      rect: { x: 0, y: 0, width: 10, height: 5 },
    });
    expect(onEditor).toHaveBeenCalledWith('theme:framing-changed', {
      entryId: 'e1',
      fieldPath: 'image',
      framing: { x: 0.4, y: 0.6, zoom: 1.5 },
      final: false,
    });
    expect(onEditor).toHaveBeenCalledWith('theme:framing-target', { entryId: null });
    expect(onTheme).toHaveBeenCalledWith('editor:framing-mode', {
      entryId: 'e1',
      fieldPath: 'image',
    });
    expect(onTheme).toHaveBeenCalledWith('editor:framing-mode', { entryId: null });
    theme.destroy();
    editor.destroy();
  });

  it('lists the §18 v3 rich-text messages in KNOWN_MESSAGE_TYPES and advertises rich-text-inline on both sides', () => {
    for (const type of [
      'theme:rich-text-selection',
      'theme:rich-text-input',
      'theme:rich-text-command',
      'editor:rich-text-editing',
      'editor:rich-text-applied',
      'editor:rich-text-locate',
    ]) {
      expect(KNOWN_MESSAGE_TYPES.has(type)).toBe(true);
    }
    expect(THEME_CAPABILITIES).toEqual([
      'design-tokens',
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);
    expect(EDITOR_CAPABILITIES).toEqual([
      'content-update',
      'select-block',
      'inline-text',
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);
  });

  it('§18 v3: the I16 in-theme editor and the I17 overlay messages and capabilities are gone', () => {
    for (const type of [
      // I16
      'theme:rich-text-edited',
      'theme:request-asset',
      'editor:focus-field',
      'editor:asset-selected',
      // I17
      'theme:rich-text-geometry',
    ]) {
      expect(KNOWN_MESSAGE_TYPES.has(type)).toBe(false);
    }
    for (const capability of ['inline-rich-text', 'studio-rich-text']) {
      expect([...THEME_CAPABILITIES]).not.toContain(capability);
      expect([...EDITOR_CAPABILITIES]).not.toContain(capability);
    }
    // BRIDGE_VERSION stays 1: the capability swap is negotiated, not versioned.
    expect(BRIDGE_VERSION).toBe(1);
  });

  it('§18 v3: the command name list is the fixed native inputType vocabulary', () => {
    expect(RICH_TEXT_COMMAND_NAMES).toEqual([
      'insertParagraph',
      'insertLineBreak',
      'insertFromPaste',
      'insertFromDrop',
      'deleteByCut',
      'deleteContentBackward',
      'deleteContentForward',
      'deleteWordBackward',
      'deleteWordForward',
      'deleteContent',
      'formatBold',
      'formatItalic',
      'formatUnderline',
      'formatStrikeThrough',
      'historyUndo',
      'historyRedo',
    ]);
    // No duplicates, and nothing the classifier could confuse with a native op name.
    expect(new Set(RICH_TEXT_COMMAND_NAMES).size).toBe(RICH_TEXT_COMMAND_NAMES.length);
    expect([...RICH_TEXT_COMMAND_NAMES]).not.toContain('insertText');
    expect([...RICH_TEXT_COMMAND_NAMES]).not.toContain('insertCompositionText');
  });

  it('round-trips the §18 v3 rich-text envelopes in both directions', () => {
    const onEditor = vi.fn();
    const onTheme = vi.fn();
    const theme = createThemeBridge({ allowedOrigins: [STUDIO_ORIGIN], onMessage: onTheme });
    const editor = createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: onEditor,
      onConnected: () => {},
      onDisconnected: () => {},
    });
    h.iframe.dispatchLoad();

    // Typed exactly as the contract declares them, minus the `type` discriminant
    // the envelope already carries: a drift in either shape fails to compile.
    const selection: Omit<ThemeRichTextSelectionMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      layoutNodeId: 'ArticleNode',
      reusablePlacementId: 'placement-1',
      anchor: 12,
      head: 18,
      rect: { x: 96, y: 412, width: 74, height: 22 },
      rootRect: { x: 40, y: 200, width: 480, height: 320 },
      marks: ['bold', 'link'],
      block: { type: 'heading', attrs: { level: 2 } },
      revision: 7,
    };
    // Blur: one report with a null anchor/head and no rect/rootRect.
    const blur: Omit<ThemeRichTextSelectionMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      anchor: null,
      head: null,
      rect: null,
      rootRect: null,
      marks: [],
      block: null,
      revision: 7,
    };
    const input: Omit<ThemeRichTextInputMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      from: 12,
      to: 12,
      text: 'a',
      revision: 8,
    };
    const deletion: Omit<ThemeRichTextInputMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: null,
      from: 11,
      to: 12,
      text: '',
      revision: 9,
    };
    const command: Omit<ThemeRichTextCommandMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      name: 'insertFromPaste',
      from: 12,
      to: 18,
      text: 'pasted',
      revision: 10,
    };
    // `text` is optional: a mark toggle or a split carries no payload.
    const bold: Omit<ThemeRichTextCommandMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      name: 'formatBold',
      from: 12,
      to: 18,
      revision: 11,
    };
    const editing: Omit<EditorRichTextEditingMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      active: true,
    };
    const applied: Omit<EditorRichTextAppliedMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: 'en-US',
      layoutNodeId: 'ArticleNode',
      revision: 8,
      anchor: 13,
      head: 13,
      rerender: false,
    };
    const locate: Omit<EditorRichTextLocateMessage, 'type'> = {
      entryId: 'e1',
      fieldPath: 'body',
      locale: null,
    };

    theme.post('theme:rich-text-selection', selection);
    theme.post('theme:rich-text-selection', blur);
    theme.post('theme:rich-text-input', input);
    theme.post('theme:rich-text-input', deletion);
    theme.post('theme:rich-text-command', command);
    theme.post('theme:rich-text-command', bold);
    editor.post('editor:rich-text-editing', editing);
    editor.post('editor:rich-text-editing', { ...editing, active: false });
    editor.post('editor:rich-text-applied', applied);
    editor.post('editor:rich-text-applied', { ...applied, revision: 12, rerender: true });
    editor.post('editor:rich-text-locate', locate);

    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-selection', selection);
    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-selection', blur);
    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-input', input);
    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-input', deletion);
    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-command', command);
    expect(onEditor).toHaveBeenCalledWith('theme:rich-text-command', bold);
    expect(onTheme).toHaveBeenCalledWith('editor:rich-text-editing', editing);
    expect(onTheme).toHaveBeenCalledWith('editor:rich-text-editing', { ...editing, active: false });
    expect(onTheme).toHaveBeenCalledWith('editor:rich-text-applied', applied);
    expect(onTheme).toHaveBeenCalledWith('editor:rich-text-applied', {
      ...applied,
      revision: 12,
      rerender: true,
    });
    expect(onTheme).toHaveBeenCalledWith('editor:rich-text-locate', locate);

    theme.destroy();
    editor.destroy();
  });

  it('surfaces the editor:hello capabilities to the theme consumer', () => {
    const onEditorHello = vi.fn();
    const theme = createThemeBridge({
      allowedOrigins: [STUDIO_ORIGIN],
      onMessage: () => {},
      onEditorHello,
    });
    createEditorBridge({
      iframe: h.iframe,
      targetOrigin: THEME_ORIGIN,
      onMessage: () => {},
      onConnected: () => {},
      onDisconnected: () => {},
    });
    h.iframe.dispatchLoad();
    expect(onEditorHello).toHaveBeenCalledTimes(1);
    expect(onEditorHello).toHaveBeenCalledWith([...EDITOR_CAPABILITIES]);
    theme.destroy();
  });
});
