import { describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_ROUTER_MESSAGE_TYPES,
  createPreviewMessageRouter,
  type PreviewMessageRouter,
} from '../previewRouter';
import type { OverlayRuntime } from '../overlay';

function overlayStub() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    setMode: vi.fn(),
    setSelected: vi.fn(),
    acceptExternalUpdate: vi.fn(),
    reconcileExternalDrafts: vi.fn(),
    rescan: vi.fn(),
    setDragPayload: vi.fn(),
    setFramingMode: vi.fn(),
    setFramingEnabled: vi.fn(),
    setRichTextEditing: vi.fn(),
    acceptRichTextApplied: vi.fn(),
    locateRichText: vi.fn(),
    setRichTextEnabled: vi.fn(),
    setBlockHoverEnabled: vi.fn(),
    chromeStyles: vi.fn(),
    chromeState: vi.fn(),
  };
}

function setup(capabilities: string[] = []): {
  overlay: ReturnType<typeof overlayStub>;
  router: PreviewMessageRouter;
} {
  const overlay = overlayStub();
  const router = createPreviewMessageRouter(overlay as unknown as OverlayRuntime);
  router.negotiate(capabilities);
  return { overlay, router };
}

const target = { entryId: 'e1', fieldPath: 'body', locale: 'en-US' };

describe('createPreviewMessageRouter', () => {
  it('negotiates the four capabilities and forwards the three overlay gates', () => {
    const { overlay, router } = setup([
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);

    expect(router.capabilities).toEqual({
      slots: true,
      framing: true,
      richText: true,
      blockHover: true,
    });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(true);
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(true);
    expect(overlay.setBlockHoverEnabled).toHaveBeenLastCalledWith(true);

    // Re-negotiated on every hello, including reconnects that drop a capability.
    router.negotiate(['block-slots']);
    expect(router.capabilities).toEqual({
      slots: true,
      framing: false,
      richText: false,
      blockHover: false,
    });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(false);
    expect(overlay.setBlockHoverEnabled).toHaveBeenLastCalledWith(false);
  });

  it('reset() closes every gate', () => {
    const { overlay, router } = setup([
      'block-slots',
      'block-hover',
      'image-framing',
      'rich-text-inline',
    ]);

    router.reset();

    expect(router.capabilities).toEqual({
      slots: false,
      framing: false,
      richText: false,
      blockHover: false,
    });
    expect(overlay.setFramingEnabled).toHaveBeenLastCalledWith(false);
    expect(overlay.setRichTextEnabled).toHaveBeenLastCalledWith(false);
    expect(overlay.setBlockHoverEnabled).toHaveBeenLastCalledWith(false);
  });

  it('routes selection and drag messages to the overlay', () => {
    const { overlay, router } = setup();

    expect(
      router.route('editor:select-block', {
        entryId: 'e1',
        layoutNodeId: 'n1',
        reusablePlacementId: 'p1',
      })
    ).toBe(true);
    expect(overlay.setSelected).toHaveBeenCalledWith('e1', 'n1', 'p1');

    const payload = { kind: 'layout-node', nodeId: 'n1', parentId: 'root', index: 0 };
    expect(router.route('editor:drag-start', { payload })).toBe(true);
    expect(overlay.setDragPayload).toHaveBeenCalledWith(payload);

    expect(router.route('editor:drag-end', {})).toBe(true);
    expect(overlay.setDragPayload).toHaveBeenLastCalledWith(null);
  });

  it('routes the §18 v3 rich-text messages once the capability is negotiated', () => {
    const { overlay, router } = setup(['rich-text-inline']);

    expect(router.route('editor:rich-text-editing', { ...target, active: true })).toBe(true);
    expect(overlay.setRichTextEditing).toHaveBeenCalledWith(target, true);

    router.route('editor:rich-text-editing', { ...target, active: false });
    expect(overlay.setRichTextEditing).toHaveBeenLastCalledWith(target, false);

    expect(router.route('editor:rich-text-locate', { ...target, locale: null })).toBe(true);
    expect(overlay.locateRichText).toHaveBeenCalledWith({ ...target, locale: null });
  });

  it('contract §18 v3: without rich-text-inline the messages are consumed and ignored', () => {
    const { overlay, router } = setup(['image-framing']);

    expect(router.route('editor:rich-text-editing', { ...target, active: true })).toBe(true);
    expect(router.route('editor:rich-text-locate', target)).toBe(true);
    expect(
      router.route('editor:rich-text-applied', {
        ...target,
        revision: 1,
        anchor: 2,
        head: 2,
        rerender: true,
      })
    ).toBe(true);

    expect(overlay.setRichTextEditing).not.toHaveBeenCalled();
    expect(overlay.locateRichText).not.toHaveBeenCalled();
    expect(overlay.acceptRichTextApplied).not.toHaveBeenCalled();
  });

  it('forwards editor:rich-text-applied with its identity and positions', () => {
    const { overlay, router } = setup(['rich-text-inline']);

    expect(
      router.route('editor:rich-text-applied', {
        ...target,
        revision: 4,
        anchor: 12,
        head: 18,
        rerender: true,
      })
    ).toBe(true);

    expect(overlay.acceptRichTextApplied).toHaveBeenCalledWith({
      ...target,
      revision: 4,
      anchor: 12,
      head: 18,
      rerender: true,
    });
  });

  it('carries the placement identity, so two renders of one entry stay apart', () => {
    const { overlay, router } = setup(['image-framing', 'rich-text-inline']);
    const placed = { ...target, layoutNodeId: 'ArticleNode', reusablePlacementId: 'placement-1' };

    router.route('editor:rich-text-editing', { ...placed, active: true });
    expect(overlay.setRichTextEditing).toHaveBeenCalledWith(placed, true);

    router.route('editor:rich-text-locate', placed);
    expect(overlay.locateRichText).toHaveBeenCalledWith(placed);

    // An empty string is not a placement: it normalizes away rather than
    // becoming a placement id nothing can match.
    router.route('editor:rich-text-locate', {
      ...target,
      layoutNodeId: '',
      reusablePlacementId: 7,
    });
    expect(overlay.locateRichText).toHaveBeenLastCalledWith(target);
  });

  it('normalizes a malformed applied into values the runtime will refuse', () => {
    const { overlay, router } = setup(['rich-text-inline']);

    // Untrusted wire data: a missing or non-numeric position must not reach
    // the DOM as NaN, and an absent `rerender` is not a licence to skip the
    // re-render — the safe side is the one that shows Studio's document.
    expect(router.route('editor:rich-text-applied', { ...target, anchor: 'x' })).toBe(true);
    expect(overlay.acceptRichTextApplied).toHaveBeenCalledWith({
      ...target,
      revision: -1,
      anchor: -1,
      head: -1,
      rerender: true,
    });

    expect(router.route('editor:rich-text-applied', null)).toBe(true);
    expect(overlay.acceptRichTextApplied).toHaveBeenLastCalledWith({
      entryId: '',
      fieldPath: '',
      locale: null,
      revision: -1,
      anchor: -1,
      head: -1,
      rerender: true,
    });
  });

  it('contract §17: without image-framing editor:framing-mode is consumed and ignored', () => {
    const { overlay, router } = setup([]);

    expect(router.route('editor:framing-mode', { entryId: 'e1', fieldPath: 'image' })).toBe(true);
    expect(overlay.setFramingMode).not.toHaveBeenCalled();

    router.negotiate(['image-framing']);
    router.route('editor:framing-mode', { entryId: 'e1', fieldPath: 'image' });
    expect(overlay.setFramingMode).toHaveBeenCalledWith({ entryId: 'e1', fieldPath: 'image' });
    router.route('editor:framing-mode', { entryId: null });
    expect(overlay.setFramingMode).toHaveBeenLastCalledWith(null);
  });

  it('leaves messages it does not own to the caller', () => {
    const { router } = setup(['rich-text-inline']);

    for (const type of [
      'editor:init',
      'editor:content-update',
      'editor:design-tokens',
      'editor:set-mode',
      'editor:navigate',
      'editor:refresh',
      'editor:hello',
      'theme:ready',
    ]) {
      expect(router.route(type, {}), type).toBe(false);
      expect([...PREVIEW_ROUTER_MESSAGE_TYPES] as string[], type).not.toContain(type);
    }
  });

  it('PREVIEW_ROUTER_MESSAGE_TYPES lists exactly what route() claims', () => {
    // The exported list is what an adapter reads to know what it no longer
    // has to handle; a type in the switch but not the list (or the reverse)
    // silently splits the contract.
    const { router } = setup(['image-framing', 'rich-text-inline']);
    const minimal: Record<string, unknown> = {
      'editor:select-block': { entryId: 'e1' },
      'editor:drag-start': {
        payload: { kind: 'layout-node', nodeId: 'n', parentId: 'r', index: 0 },
      },
      'editor:drag-end': {},
      'editor:framing-mode': { entryId: null },
      'editor:rich-text-editing': { ...target, active: false },
      'editor:rich-text-applied': { ...target, revision: 1, anchor: 2, head: 2, rerender: true },
      'editor:rich-text-locate': target,
    };

    expect(Object.keys(minimal).sort()).toEqual([...PREVIEW_ROUTER_MESSAGE_TYPES].sort());
    for (const type of PREVIEW_ROUTER_MESSAGE_TYPES) {
      expect(router.route(type, minimal[type]), type).toBe(true);
    }
  });

  it('survives a malformed payload on either rich-text message', () => {
    const { overlay, router } = setup(['rich-text-inline']);
    const unresolvable = { entryId: '', fieldPath: '', locale: null };

    // Untrusted wire data: a non-object must normalize, not throw and take
    // the whole message loop down.
    for (const payload of [null, undefined, 'nope', 42, []]) {
      expect(router.route('editor:rich-text-editing', payload), String(payload)).toBe(true);
      expect(router.route('editor:rich-text-locate', payload), String(payload)).toBe(true);
    }

    expect(overlay.setRichTextEditing).toHaveBeenCalledWith(unresolvable, false);
    expect(overlay.locateRichText).toHaveBeenCalledWith(unresolvable);
  });

  it('normalizes a malformed rich-text target rather than passing it through', () => {
    const { overlay, router } = setup(['rich-text-inline']);

    router.route('editor:rich-text-editing', {
      entryId: 1,
      fieldPath: null,
      locale: 7,
      active: 'yes',
    });

    expect(overlay.setRichTextEditing).toHaveBeenCalledWith(
      { entryId: '', fieldPath: '', locale: null },
      false
    );
  });

  it('resolves the overlay lazily, so an adapter can wire the bridge first', () => {
    let overlay: ReturnType<typeof overlayStub> | null = null;
    const router = createPreviewMessageRouter(() => overlay as unknown as OverlayRuntime);
    overlay = overlayStub();

    router.negotiate(['rich-text-inline']);
    router.route('editor:rich-text-locate', target);

    expect(overlay.setRichTextEnabled).toHaveBeenCalledWith(true);
    expect(overlay.locateRichText).toHaveBeenCalledWith(target);
  });
});
