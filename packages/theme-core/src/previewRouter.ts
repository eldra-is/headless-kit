import type { BridgePayloads, StructuralDragPayload } from './bridge';
import type { OverlayRuntime } from './overlay';

/**
 * The `editor:*` messages whose whole effect is a call on the overlay
 * runtime. They carry no framework state, so they belong here rather than in
 * each framework binding: `@eldrajs/theme-vue` (and any future
 * `theme-react`/`theme-svelte`) delegate to this router and keep only the
 * messages that touch their own reactive context (`editor:init`,
 * `editor:content-update`, `editor:design-tokens`, `editor:set-mode` — which
 * mirrors the mode into the theme's own context before calling the overlay —
 * `editor:navigate` and `editor:refresh`).
 */
export const PREVIEW_ROUTER_MESSAGE_TYPES = [
  'editor:select-block',
  'editor:drag-start',
  'editor:drag-end',
  'editor:framing-mode',
  'editor:rich-text-editing',
  'editor:rich-text-applied',
  'editor:rich-text-locate',
] as const;

export type PreviewRouterMessageType = (typeof PREVIEW_ROUTER_MESSAGE_TYPES)[number];

/** Capabilities negotiated from `editor:hello`, as flags an adapter can
 * surface to its own components. `slots` is not acted on here — the
 * editor-only slot markers are rendered by the framework binding — but it is
 * negotiated in one place with the rest. */
export interface NegotiatedEditorCapabilities {
  slots: boolean;
  framing: boolean;
  richText: boolean;
  blockHover: boolean;
}

export interface PreviewMessageRouter {
  /** Re-negotiate from an `editor:hello` capability list (Studio re-sends it
   * on every reconnect) and forward the gates to the overlay. */
  negotiate(capabilities: readonly string[]): NegotiatedEditorCapabilities;
  /** Handle `type` if it is one of this router's; returns false otherwise so
   * the caller can fall through to its own branches. */
  route(type: string, payload: unknown): boolean;
  /** The last negotiated flags. */
  readonly capabilities: NegotiatedEditorCapabilities;
  /** Close every gate (bridge teardown). Forwarded to the overlay, which
   * exits framing and clears any rich-text editing mark. */
  reset(): void;
}

const CLOSED: NegotiatedEditorCapabilities = {
  slots: false,
  framing: false,
  richText: false,
  blockHover: false,
};

type RichTextTarget = {
  entryId: string;
  fieldPath: string;
  locale: string | null;
  layoutNodeId?: string;
  reusablePlacementId?: string;
};

/**
 * @param overlay resolved lazily, because adapters create the bridge (whose
 *   `onMessage` routes here) before the overlay runtime it posts through.
 */
export function createPreviewMessageRouter(
  overlay: OverlayRuntime | (() => OverlayRuntime)
): PreviewMessageRouter {
  const resolve = (): OverlayRuntime => (typeof overlay === 'function' ? overlay() : overlay);
  let capabilities: NegotiatedEditorCapabilities = { ...CLOSED };

  function apply(): void {
    const runtime = resolve();
    runtime.setFramingEnabled(capabilities.framing);
    runtime.setRichTextEnabled(capabilities.richText);
    runtime.setBlockHoverEnabled(capabilities.blockHover);
  }

  return {
    get capabilities() {
      return capabilities;
    },
    negotiate(list) {
      capabilities = {
        slots: list.includes('block-slots'),
        framing: list.includes('image-framing'),
        richText: list.includes('rich-text-inline'),
        blockHover: list.includes('block-hover'),
      };
      apply();
      return capabilities;
    },
    reset() {
      capabilities = { ...CLOSED };
      apply();
    },
    route(type, payload) {
      const runtime = resolve();
      switch (type) {
        case 'editor:select-block': {
          const selection = payload as BridgePayloads['editor:select-block'];
          runtime.setSelected(
            selection.entryId,
            selection.layoutNodeId,
            selection.reusablePlacementId
          );
          return true;
        }
        case 'editor:drag-start': {
          runtime.setDragPayload((payload as { payload: StructuralDragPayload }).payload);
          return true;
        }
        case 'editor:drag-end': {
          runtime.setDragPayload(null);
          return true;
        }
        case 'editor:framing-mode': {
          // Contract §17: a side that does not advertise `image-framing` must
          // ignore these messages. The editor should not send this without the
          // negotiated capability, but stay defensive.
          if (!capabilities.framing) return true;
          const target = payload as BridgePayloads['editor:framing-mode'];
          runtime.setFramingMode(
            target.entryId === null
              ? null
              : { entryId: target.entryId, fieldPath: target.fieldPath }
          );
          return true;
        }
        case 'editor:rich-text-editing': {
          // Contract §18 v3: same rule for `rich-text-inline`. The overlay
          // gates again on its own flag; this keeps the refusal explicit.
          if (!capabilities.richText) return true;
          const active =
            payload !== null &&
            typeof payload === 'object' &&
            (payload as { active?: unknown }).active === true;
          runtime.setRichTextEditing(richTextTarget(payload), active);
          return true;
        }
        case 'editor:rich-text-applied': {
          if (!capabilities.richText) return true;
          // The payload is untrusted wire data: `null` and a primitive are
          // both legal `postMessage` bodies and must not throw on property
          // access and take the whole message loop with them.
          const applied = (
            payload !== null && typeof payload === 'object' ? payload : {}
          ) as Partial<BridgePayloads['editor:rich-text-applied']>;
          runtime.acceptRichTextApplied({
            ...richTextTarget(payload),
            // Untrusted wire data: a non-number normalizes to a value the
            // runtime's own §4.3 bounds check refuses, rather than reaching
            // the DOM as NaN.
            revision: typeof applied.revision === 'number' ? applied.revision : -1,
            anchor: typeof applied.anchor === 'number' ? applied.anchor : -1,
            head: typeof applied.head === 'number' ? applied.head : -1,
            // Missing or malformed means re-render: the safe side is the one
            // that shows Studio's document, not the one that trusts a DOM
            // nobody confirmed.
            rerender: applied.rerender !== false,
          });
          return true;
        }
        case 'editor:rich-text-locate': {
          if (!capabilities.richText) return true;
          runtime.locateRichText(richTextTarget(payload));
          return true;
        }
        default:
          return false;
      }
    },
  };
}

/**
 * Normalizes the three identity fields every §18 v3 editor message carries.
 * The payload is untrusted wire data, so a non-object (null, a string, an
 * array) must normalize to an unresolvable target rather than throw on
 * property access and take the message loop with it.
 */
function richTextTarget(payload: unknown): RichTextTarget {
  if (payload === null || typeof payload !== 'object') {
    return { entryId: '', fieldPath: '', locale: null };
  }
  const message = payload as Partial<RichTextTarget>;
  return {
    entryId: typeof message.entryId === 'string' ? message.entryId : '',
    fieldPath: typeof message.fieldPath === 'string' ? message.fieldPath : '',
    locale: typeof message.locale === 'string' ? message.locale : null,
    // §18 v3: the same entry can be placed twice, and each placement is its own
    // editing surface — an omitted pair means "whichever one this page has",
    // which is what a single-placement page has always resolved to.
    ...(typeof message.layoutNodeId === 'string' && message.layoutNodeId !== ''
      ? { layoutNodeId: message.layoutNodeId }
      : {}),
    ...(typeof message.reusablePlacementId === 'string' && message.reusablePlacementId !== ''
      ? { reusablePlacementId: message.reusablePlacementId }
      : {}),
  };
}
