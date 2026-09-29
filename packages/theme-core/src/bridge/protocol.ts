export const BRIDGE_PROTOCOL = 'eldra-bridge' as const;
export const BRIDGE_VERSION = 1;

export type EditorMode = 'preview' | 'edit';

export interface DOMRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DraftEntryPayload {
  entryId: string;
  schemaApiId: string;
  /** Full draft data document for the entry (same shape as CMSEntry.data). */
  draftDoc: Record<string, unknown>;
}

export interface ResolvedDesignTokensPayload {
  revision: number;
  resolved: {
    colors: Record<
      string,
      {
        label: string;
        value: string;
        group?: string;
        allowSiteOverride?: boolean;
      }
    >;
    containers: Record<
      string,
      {
        label: string;
        maxWidth: string;
        gutter: { normal: string; tablet?: string; mobile?: string };
        allowSiteOverride?: boolean;
      }
    >;
    allowCustomColors?: boolean;
  };
}

export type StructuralDragPayload =
  | { kind: 'layout-node'; nodeId: string; parentId: string; index: number }
  | { id: string; kind: 'palette-block'; apiId: string }
  | { id: string; kind: 'palette-container'; containerType: 'grid' | 'flex' };

/** §17 image framing: focal point as fractions (0..1) and zoom (1..4). */
export interface ImageFramingValue {
  x: number;
  y: number;
  zoom: number;
}

/**
 * §18 v3: the whole TipTap JSON document of a top-level rich-text field. The
 * theme renders it; Studio owns the one headless editor that writes it back
 * through `editor:content-update` — it never crosses the bridge as a message
 * of its own.
 */
export interface RichTextDoc {
  type: 'doc';
  content?: unknown[];
}

/**
 * §18 v3: which rich-text field a message is about. Every §18 message carries
 * it; the optional pair disambiguates the same entry placed more than once
 * (a layout node, or a reusable placement), exactly as `theme:field-clicked`
 * already does.
 */
export interface RichTextIdentity {
  entryId: string;
  fieldPath: string;
  locale: string | null;
  layoutNodeId?: string;
  reusablePlacementId?: string;
}

/**
 * §18 v3: the fixed `beforeinput` inputTypes the theme forwards as commands —
 * everything it cannot let the browser do natively inside one text run. The
 * names are the native `InputEvent.inputType` spellings so neither side
 * invents a vocabulary of its own; Studio maps each to a TipTap command.
 */
export const RICH_TEXT_COMMAND_NAMES = [
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
] as const;

export type RichTextCommandName = (typeof RICH_TEXT_COMMAND_NAMES)[number];

/**
 * §18 v3 (theme → editor): the selection inside a rich-text root, as
 * ProseMirror document positions computed by the theme from the stamped
 * render tree. Posted rAF-coalesced on `selectionchange` while the selection
 * is inside a root. `anchor: null` (with `head: null`) is the blur report the
 * theme posts once when the selection leaves the root.
 *
 * `rect` is the caret/range rect in iframe viewport pixels; `rootRect` is the
 * root element's `getBoundingClientRect()`, in the same coordinate space —
 * the floating toolbar falls back to it when there is no caret rect (an
 * empty range with no layout yet) and anchors above it when there is no
 * caret at all. Both are bounded the same way (`boundedRect`); `rootRect` is
 * `null` only on the blur message. `marks` and `block` are read from the DOM
 * (ancestor mark elements and the nearest node element), which is all the
 * toolbar's active state needs.
 */
export interface ThemeRichTextSelectionMessage extends RichTextIdentity {
  type: 'theme:rich-text-selection';
  anchor: number | null;
  head: number | null;
  rect: DOMRectLike | null;
  rootRect: DOMRectLike | null;
  marks: string[];
  block: { type: string; attrs?: Record<string, unknown> } | null;
  revision: number;
}

/**
 * §18 v3 (theme → editor): a native text edit the browser already performed
 * inside one text run of one node — the theme reports it rather than
 * preventing it, so the caret never leaves the theme. `from`/`to` are the
 * positions of the target range captured in `beforeinput`; `text` is the
 * inserted text (`''` for a deletion). `revision` is the theme's per-field
 * counter, incremented per op and echoed back in `editor:rich-text-applied`.
 */
export interface ThemeRichTextInputMessage extends RichTextIdentity {
  type: 'theme:rich-text-input';
  from: number;
  to: number;
  text: string;
  revision: number;
}

/**
 * §18 v3 (theme → editor): a structural or formatting intent the theme
 * `preventDefault()`ed — Enter, paste, cut, a mark shortcut, undo/redo, or a
 * text edit whose target range crosses a block or leaf boundary. `text`
 * carries the plain text of a paste/drop; `from`/`to` are the target range.
 */
export interface ThemeRichTextCommandMessage extends RichTextIdentity {
  type: 'theme:rich-text-command';
  name: RichTextCommandName;
  from: number;
  to: number;
  text?: string;
  revision: number;
}

/**
 * §18 v3 (editor → theme): Studio activated (`active: true`) or closed
 * (`active: false`) its headless editor and docked toolbar for this field.
 * The theme only marks the root (`data-eldra-rich-text-editing`) — it keeps
 * rendering and showing its own content; nothing is hidden or overlaid.
 */
export interface EditorRichTextEditingMessage {
  type: 'editor:rich-text-editing';
  entryId: string;
  fieldPath: string;
  locale: string | null;
  active: boolean;
}

/**
 * §18 v3 (editor → theme): the acknowledgement that follows every
 * `editor:content-update` Studio sends for the active field. `revision` is
 * the theme revision this applies to. When it matches the theme's latest
 * posted revision and `rerender` is false, the theme's DOM already shows the
 * edit: it skips the re-render for that root and only re-stamps positions.
 * Otherwise the content update re-renders and the theme restores the
 * selection at `anchor`/`head`.
 */
export interface EditorRichTextAppliedMessage extends RichTextIdentity {
  type: 'editor:rich-text-applied';
  revision: number;
  anchor: number;
  head: number;
  rerender: boolean;
}

/**
 * §18 v3 (editor → theme): scroll the field into view, focus its root and put
 * the caret at the end. Studio's sidebar "Edit on canvas" uses it.
 */
export interface EditorRichTextLocateMessage {
  type: 'editor:rich-text-locate';
  entryId: string;
  fieldPath: string;
  locale: string | null;
}

export interface BridgePayloads {
  // editor (Studio) → theme
  'editor:hello': { capabilities: string[] };
  'editor:init': { mode: EditorMode; previewToken: string; locale: string; path: string };
  'editor:content-update': { entries: DraftEntryPayload[] };
  'editor:design-tokens': ResolvedDesignTokensPayload;
  'editor:select-block': { entryId: string; layoutNodeId?: string; reusablePlacementId?: string };
  'editor:navigate': { path: string };
  'editor:set-mode': { mode: EditorMode };
  'editor:set-viewport': { width: number };
  'editor:refresh': Record<string, never>;
  'editor:ping': Record<string, never>;
  'editor:drag-start': { payload: StructuralDragPayload };
  'editor:drag-end': Record<string, never>;
  /** §17: enter framing for a field (the inspector's "Adjust on canvas") or leave it. */
  'editor:framing-mode': { entryId: string; fieldPath: string } | { entryId: null };
  /** §18 v3: Studio's headless rich-text editor became active for a field, or closed. */
  'editor:rich-text-editing': Omit<EditorRichTextEditingMessage, 'type'>;
  /** §18 v3: the ack that follows a content update for the active field. */
  'editor:rich-text-applied': Omit<EditorRichTextAppliedMessage, 'type'>;
  /** §18 v3: scroll a rich-text field into view, focus it and place the caret. */
  'editor:rich-text-locate': Omit<EditorRichTextLocateMessage, 'type'>;
  // theme → editor (Studio)
  /**
   * Breakpoints negotiation: the theme's own tablet/normal layout
   * breakpoints, as configured min-width px — so Studio's UI can react to
   * the theme's actual ranges (its side panels overlay the preview at
   * `tablet + 100`px) rather than a value the theme may not share.
   * `mobile` is `< tablet`, `tablet` is `tablet…normal-1`, `normal` is
   * `>= normal`. Additive and optional: a theme SDK build older than this
   * field omits it; a current one always includes it, defaults (768/1024)
   * when the theme did not configure custom ones. Bounds:
   * `320 <= tablet < normal <= 4096` — see @eldrajs/theme-core's
   * `resolveLayoutBreakpoints`, the one place that validates and defaults
   * this pair; Studio should treat an out-of-bounds pair the same way (fall
   * back to 768/1024) rather than trust it blindly.
   */
  'theme:ready': {
    manifestVersion: number;
    themeVersion: string;
    sdkVersion: string;
    path: string;
    capabilities: string[];
    breakpoints?: { tablet: number; normal: number };
  };
  'theme:pong': Record<string, never>;
  'theme:route-changed': { path: string };
  'theme:block-clicked': {
    entryId: string;
    schemaApiId: string;
    rect: DOMRectLike;
    layoutNodeId?: string;
    reusablePlacementId?: string;
    /**
     * Present, and always `true`, when the layout hides this block at the
     * breakpoint the theme is currently rendering at (`style.visible` false
     * there). Edit mode keeps such a block on the canvas — dimmed, still
     * selectable — so Studio needs to be told what the viewport alone no longer
     * shows. Absent means visible: additive, so an editor that does not know the
     * field is unaffected.
     */
    hiddenAtBreakpoint?: true;
  };
  'theme:field-clicked': {
    entryId: string;
    fieldPath: string;
    locale: string | null;
    rect: DOMRectLike;
    layoutNodeId?: string;
    reusablePlacementId?: string;
  };
  'theme:text-edited': {
    entryId: string;
    fieldPath: string;
    locale: string | null;
    value: string;
    layoutNodeId?: string;
    reusablePlacementId?: string;
  };
  'theme:blocks-rendered': {
    blocks: Array<{
      entryId: string;
      rect: DOMRectLike;
      layoutNodeId?: string;
      reusablePlacementId?: string;
      /** See `theme:block-clicked`'s field of the same name. */
      hiddenAtBreakpoint?: true;
    }>;
  };
  /**
   * The block the pointer is currently over, reported in edit mode only and
   * only when the editor negotiated the `block-hover` capability
   * (theme → editor).
   *
   * Posted when the hovered block *changes* — never once per pointer move
   * inside the same block — and `null` when the pointer leaves the last
   * hovered block (onto the page background, out of the document, or because
   * a rerender detached it). While a block stays hovered the message is
   * re-posted, coalesced to one per animation frame, whenever the theme's
   * geometry may have moved — a scroll, a resize, a selection change or a
   * content rerender — exactly the triggers `theme:blocks-rendered` re-posts
   * on, and for the same reason: the iframe can scroll or re-lay-out without
   * any DOM mutation, and a stale rect would strand the editor's chrome. A
   * re-post can repeat the rect it last sent, so a consumer applies it
   * idempotently rather than treating every message as a change.
   *
   * `rect` is the block's `getBoundingClientRect()` in iframe viewport
   * pixels, the same space `theme:blocks-rendered` and `theme:block-clicked`
   * report; `layoutNodeId`/`reusablePlacementId` are the block's placement
   * identity, omitted (never `undefined`) when it has none.
   *
   * The identity is always the block's — hovering a field, or anything inside
   * a rich-text editing root, reports the block that contains it and nothing
   * finer. The intended consumer is an editor-side "add block" affordance
   * anchored to the hovered block's bottom edge; the theme draws its own hover
   * outline regardless and that behaviour is independent of this message.
   */
  'theme:block-hovered': {
    entryId: string;
    rect: DOMRectLike;
    layoutNodeId?: string;
    reusablePlacementId?: string;
  } | null;
  /**
   * Geometry of the editor-only slot markers rendered by the theme when the
   * editor negotiated the `block-slots` capability (theme → editor).
   */
  'theme:slots-rendered': {
    slots: Array<{ layoutNodeId: string; slotId: string; rect: DOMRectLike }>;
  };
  'theme:height-changed': { height: number };
  'theme:error': { message: string; scope: 'bridge' | 'data' | 'render' };
  'theme:drop-candidate': {
    layoutNodeId: string;
    placement: 'before' | 'after' | 'inside';
    rect: DOMRectLike;
    /** Set when the drop point resolves to a slot marker rect (editor-only). */
    slotId?: string;
  } | null;
  'theme:node-dropped': {
    payload: StructuralDragPayload;
    layoutNodeId: string;
    placement: 'before' | 'after' | 'inside';
    /** Set when the drop resolved to a slot marker rect (editor-only). */
    slotId?: string;
  };
  /** §17: the theme entered ({rect} of the frame) or left ({entryId: null}) framing mode. */
  'theme:framing-target':
    | { entryId: string; fieldPath: string; rect: DOMRectLike }
    | { entryId: null };
  /** §17: a live (final: false) or settled (final: true) framing value. */
  'theme:framing-changed': {
    entryId: string;
    fieldPath: string;
    framing: ImageFramingValue;
    final: boolean;
  };
  /** §18 v3: the selection inside a rich-text root, in document positions. */
  'theme:rich-text-selection': Omit<ThemeRichTextSelectionMessage, 'type'>;
  /** §18 v3: a native text edit the theme already performed, as a position range. */
  'theme:rich-text-input': Omit<ThemeRichTextInputMessage, 'type'>;
  /** §18 v3: a structural/format intent the theme prevented and forwarded. */
  'theme:rich-text-command': Omit<ThemeRichTextCommandMessage, 'type'>;
}

export type BridgeMessageType = keyof BridgePayloads;

export interface BridgeEnvelope<T extends BridgeMessageType = BridgeMessageType> {
  protocol: typeof BRIDGE_PROTOCOL;
  version: number; // sender's BRIDGE_VERSION
  id: string; // unique per message (crypto.randomUUID())
  type: T;
  payload: BridgePayloads[T];
}

export type BridgeHandler = <T extends BridgeMessageType>(
  type: T,
  payload: BridgePayloads[T]
) => void;

export const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'editor:hello',
  'editor:init',
  'editor:content-update',
  'editor:design-tokens',
  'editor:select-block',
  'editor:navigate',
  'editor:set-mode',
  'editor:set-viewport',
  'editor:refresh',
  'editor:ping',
  'editor:drag-start',
  'editor:drag-end',
  'editor:framing-mode',
  'editor:rich-text-editing',
  'editor:rich-text-applied',
  'editor:rich-text-locate',
  'theme:ready',
  'theme:pong',
  'theme:route-changed',
  'theme:block-clicked',
  'theme:field-clicked',
  'theme:text-edited',
  'theme:blocks-rendered',
  'theme:block-hovered',
  'theme:slots-rendered',
  'theme:height-changed',
  'theme:error',
  'theme:drop-candidate',
  'theme:node-dropped',
  'theme:framing-target',
  'theme:framing-changed',
  'theme:rich-text-selection',
  'theme:rich-text-input',
  'theme:rich-text-command',
]);

/**
 * Capabilities advertised in editor:hello. Single source of truth is contracts §8b.1/§8b.13:
 * the list below, matched verbatim by Studio's vendored app/types/bridge.ts.
 */
export const EDITOR_CAPABILITIES = [
  'content-update',
  'select-block',
  'inline-text',
  'block-slots',
  'block-hover',
  'image-framing',
  'rich-text-inline',
] as const;

/** Capabilities the theme advertises in theme:ready. `block-slots` gates the
 * editor-only slot markers and their theme:slots-rendered geometry reports.
 * `block-hover` gates theme:block-hovered, the hovered block's identity and
 * rect, the same way. `image-framing` gates the framing messages. `rich-text-inline` gates the
 * §18 v3 messages that let the operator edit rich text natively in the
 * theme's own rendered DOM while Studio owns the document, the editor and
 * the toolbar; a side that does not advertise it never sends, and must
 * ignore, those messages. */
export const THEME_CAPABILITIES = [
  'design-tokens',
  'block-slots',
  'block-hover',
  'image-framing',
  'rich-text-inline',
] as const;
