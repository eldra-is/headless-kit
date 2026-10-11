import { RICH_TEXT_COMMAND_NAMES } from './bridge';
import type {
  BridgePayloads,
  DOMRectLike,
  RichTextCommandName,
  StructuralDragPayload,
} from './bridge';
import {
  framingDrag,
  framingZoom,
  imageFramingStyle,
  parseImageFramingValueAttr,
  unscaledFrameRect,
  type FrameRect,
  type ImageFraming,
} from './imageFraming';
import { layoutIdentityOf } from './layoutIdentity';
import { activeLayoutBreakpoint, type LayoutBreakpoints } from './layout';
import {
  describeSelectionContext,
  domRangeToPositions,
  resolveDomPoint,
  resolveDomPosition,
  richTextMarkNameOf,
  RICH_TEXT_LEAF_TYPES,
} from './richTextPositions';
import { decodeStega, stripStega, type StegaMeta } from './stega';

/**
 * Re-exported here so an adapter reaches the whole preview runtime through
 * the single `@eldrajs/theme-core/overlay` dynamic import it already makes.
 * The router lives in its own module (and its own `./preview-router` export)
 * because it is bridge plumbing, not DOM chrome; it imports nothing from
 * this file at runtime.
 */
export {
  createPreviewMessageRouter,
  PREVIEW_ROUTER_MESSAGE_TYPES,
  type NegotiatedEditorCapabilities,
  type PreviewMessageRouter,
  type PreviewRouterMessageType,
} from './previewRouter';

const TEXT_EDIT_DEBOUNCE_MS = 300;

/**
 * §18 v3: the `beforeinput` inputTypes the theme is willing to let the
 * browser perform itself, so the caret never leaves the theme's own render.
 * Each one still has to pass the "one text run of one node" test in
 * `classifyBeforeInput` — the same name outside that test is a command.
 */
const NATIVE_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertText',
  'insertCompositionText',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteWordBackward',
  'deleteWordForward',
  'deleteContent',
]);

const COMMAND_INPUT_TYPES: ReadonlySet<string> = new Set<string>(RICH_TEXT_COMMAND_NAMES);

/**
 * A text insertion that failed the "one text run of one node" test still has
 * to happen — the operator typed a character over a selection crossing a mark
 * or a block. The §18 v3 command vocabulary has no `insertText`, and the
 * command that means exactly "replace `from..to` with this plain text" is
 * `insertFromPaste`, so that is what these become. Dropping them instead
 * would silently swallow the keystroke.
 */
const TEXT_FALLBACK_COMMANDS: Readonly<Record<string, RichTextCommandName>> = {
  insertText: 'insertFromPaste',
  insertCompositionText: 'insertFromPaste',
  insertReplacementText: 'insertFromPaste',
};

/**
 * §18 v3 (floating toolbar follow-up): the command name a `beforeinput`'s
 * `inputType` maps to, independent of whether a position is resolvable at
 * all — `classifyBeforeInput`'s own name resolution (its `COMMAND_INPUT_TYPES`/
 * `TEXT_FALLBACK_COMMANDS` steps, minus the native-range test, which needs a
 * range to test) is exactly this, but it never runs that far when there is no
 * range to classify. Used only to queue a pending intent in that situation;
 * `null` for an inputType with no command name (the same set that classifies
 * `ignore` when positions *are* resolvable) — nothing to queue for those.
 */
function commandNameForInputType(inputType: string): RichTextCommandName | null {
  if (COMMAND_INPUT_TYPES.has(inputType)) return inputType as RichTextCommandName;
  return TEXT_FALLBACK_COMMANDS[inputType] ?? null;
}

const RICH_TEXT_LEAF_NODE_TYPES: ReadonlySet<string> = new Set(RICH_TEXT_LEAF_TYPES);

/** §18 v3 §4.3 bounds, enforced on the way out as well as on the way in: a
 * message the other side would drop is one the theme should never send. */
const POSITION_MAX = 1e6;
const RICH_TEXT_TEXT_MAX = 64 * 1024;
const RICH_TEXT_MARKS_MAX = 32;
const RICH_TEXT_MARK_LENGTH_MAX = 32;
const RECT_MAX = 1e6;

function isPosition(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= POSITION_MAX
  );
}

/** The node element (block or leaf) a DOM point belongs to, bounded by the
 * rich-text root. Mark elements, a table's `tbody` and a code block's `code`
 * are not nodes and carry no stamp, so `closest` walks straight past them. */
function nodeElementOf(root: Element, node: Node): Element | null {
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  if (element === null || !root.contains(element)) return null;
  const found = element.closest('[data-eldra-node][data-eldra-pos]');
  return found !== null && root.contains(found) ? found : null;
}

/**
 * §18 v3: "the target range stays inside one text run of one block", read
 * strictly — every case the theme cannot describe as a pure text change goes
 * to Studio instead.
 *
 * - A **non-collapsed** range must live in a single `Text` node. A selection
 *   crossing a mark or a block boundary changes structure, not just text.
 * - A **collapsed** range is native only for an insertion. A collapsed
 *   delete is a join: backspace at the start of a run pulls in whatever is
 *   before it, which is a structural edit however small it looks.
 * - A collapsed insertion must sit **strictly inside** a text run, not on a
 *   boundary with a mark element on the other side. `Rich |<strong>bold` is
 *   ambiguous — the browser picks whether the character inherits the mark,
 *   and its answer is not the document's — so Studio decides it.
 * - Either way the containing node element must exist and must not be a leaf.
 */
function isNativeTextRange(
  root: Element,
  inputType: string,
  range: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number }
): boolean {
  const host = nodeElementOf(root, range.startContainer);
  if (host === null || host !== nodeElementOf(root, range.endContainer)) return false;
  if (RICH_TEXT_LEAF_NODE_TYPES.has(host.getAttribute('data-eldra-node') ?? '')) return false;
  if (range.startContainer !== range.endContainer) return false;
  if (range.startContainer.nodeType !== 3) return false;
  const text = range.startContainer as Text;
  if (range.startOffset !== range.endOffset) return true;
  if (inputType !== 'insertText' && inputType !== 'insertCompositionText') return false;
  return !atMarkBoundary(host, text, range.startOffset);
}

/**
 * Is a collapsed caret sitting where one mark ends and another begins?
 *
 * `Rich |<strong>bold` and `<strong>bold|</strong> more` are the same
 * question from either side: whether the next character inherits the mark is
 * the browser's guess, and its guess is not the document's. The caret is on
 * such a boundary when it is at the edge of a text node that lives **inside** a
 * mark element, or at the edge of a bare run with an element on that side.
 * Wrappers that are not marks — a code block's `code`, a table's `tbody` —
 * are transparent here exactly as they are everywhere else in §18 v3.
 */
function atMarkBoundary(host: Element, text: Text, offset: number): boolean {
  const atStart = offset === 0;
  if (!atStart && offset !== text.data.length) return false;
  const parent = text.parentElement;
  if (parent !== null && parent !== host && richTextMarkNameOf(parent) !== null) return true;
  return isElementNode(atStart ? text.previousSibling : text.nextSibling);
}

function isElementNode(node: Node | null): boolean {
  return node !== null && node.nodeType === 1;
}

/**
 * §18 v3: which rendered rich-text field something is about. The optional pair
 * is what tells two renders of the same entry apart — a layout node and a
 * reusable placement can both hold it, and each is its own editing surface, so
 * it is part of the identity rather than decoration on it.
 */
export interface RichTextFieldIdentity {
  entryId: string;
  fieldPath: string;
  locale: string | null;
  layoutNodeId?: string;
  reusablePlacementId?: string;
}

/** One field's deferral state, as reported to `onRichTextRenderState`. */
export interface RichTextRenderStateChange extends RichTextFieldIdentity {
  deferred: boolean;
}

export interface BeforeInputClassification {
  /**
   * `native`: let the browser do it and report it afterwards. `command`:
   * `preventDefault()` and hand the intent to Studio. `ignore`: neither side
   * can place it, so the runtime prevents it and reports nothing — an
   * unnameable edit is a visible no-op, never something the browser is left
   * free to perform behind the document's back.
   */
  kind: 'native' | 'command' | 'ignore';
  from: number;
  to: number;
  name?: RichTextCommandName;
}

const IGNORED: BeforeInputClassification = { kind: 'ignore', from: 0, to: 0 };

/**
 * §18 v3 (spec §4.1): decide what a `beforeinput` inside a rich-text root
 * is. Exported so the Playwright stub theme and Studio's tests classify by
 * the same rules the runtime does, rather than a second copy of them.
 *
 * `getTargetRanges()` is the authority — it is the range the browser is about
 * to change, which for a backspace at the start of a paragraph already spans
 * the block boundary and therefore classifies as a command without the
 * runtime having to reason about intent. The current selection is only a
 * fallback for engines (and jsdom) that do not implement it.
 */
export function classifyBeforeInput(event: InputEvent, root: Element): BeforeInputClassification {
  // `ignore` is never a licence to let the browser proceed — see
  // `onBeforeInput`, which prevents everything this does not call native.
  const name = event.inputType;
  const ranges = typeof event.getTargetRanges === 'function' ? event.getTargetRanges() : [];
  const multi = ranges.length > 1;
  const range = ranges[0] ?? currentSelectionRange();
  if (range === null) return IGNORED;
  const positions = domRangeToPositions(root, range);
  if (positions === null) return IGNORED;
  const { from, to } = positions;
  if (!isPosition(from) || !isPosition(to)) return IGNORED;
  if (!multi && NATIVE_INPUT_TYPES.has(name) && isNativeTextRange(root, name, range)) {
    return { kind: 'native', from, to };
  }
  if (COMMAND_INPUT_TYPES.has(name)) {
    return { kind: 'command', from, to, name: name as RichTextCommandName };
  }
  const fallback = TEXT_FALLBACK_COMMANDS[name];
  if (fallback !== undefined) return { kind: 'command', from, to, name: fallback };
  return { kind: 'ignore', from, to };
}

function currentSelectionRange(): Range | null {
  const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
  if (selection === null || selection.rangeCount === 0) return null;
  return selection.getRangeAt(0);
}

const STEGA_DELIMITER = '\uFEFF';

/**
 * `Node.prototype`'s own `textContent` accessor, resolved on first use so that
 * importing this module where there is no DOM stays harmless. `guardRendererText`
 * shadows `textContent` on the field elements it marks and needs the platform
 * pair to read and to write through.
 */
let nodeTextContent: PropertyDescriptor | undefined;
function platformTextContent(): PropertyDescriptor | undefined {
  if (nodeTextContent === undefined && typeof Node !== 'undefined') {
    nodeTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  }
  return nodeTextContent;
}

/** True only for the duration of a `setFieldText` call. Module scope, not
 * runtime scope: two overlay runtimes over one document install one guard
 * between them, and either one's repair has to pass through it. */
let writingFieldText = false;

/**
 * Write a field's whole text as the overlay, past `guardRendererText`'s filter.
 * The overlay's own writes are not renderer echoes: `restoreEditingFocus`
 * repairs a field whose element a renderer pass replaced outright, and that
 * repair has to land exactly when the filter is refusing the stale value it is
 * repairing.
 */
function setFieldText(span: HTMLElement, value: string): void {
  writingFieldText = true;
  try {
    span.textContent = value;
  } finally {
    writingFieldText = false;
  }
}

/** A wheel gesture is considered settled this long after its last event. */
const FRAMING_WHEEL_SETTLE_MS = 200;
/** Focal/zoom values are stored and posted at 1e-6 \u2014 far below one device
 * pixel on any frame \u2014 so accumulated drag steps do not leak float drift
 * into the marking attribute or the value Studio persists. */
const FRAMING_PRECISION = 1e6;

const roundFramingValue = (value: ImageFraming): ImageFraming => ({
  x: Math.round(value.x * FRAMING_PRECISION) / FRAMING_PRECISION,
  y: Math.round(value.y * FRAMING_PRECISION) / FRAMING_PRECISION,
  zoom: Math.round(value.zoom * FRAMING_PRECISION) / FRAMING_PRECISION,
});

// Studio primary chrome. The hover/selected boxes are hidden outside edit
// mode (see positionBox); the drop indicator stays green and is only ever
// shown during edit-mode drags, so it needs no mode guard here.
// No glow anywhere, and every line is drawn inset (box-shadow/outline, never
// border, never an *outer* box-shadow) so a full-bleed block's chrome is
// never clipped at the iframe edge: an outer glow on a block touching the
// edge used to be cut off and looked broken, and a soft inner glow band was
// tried and rejected too — a solid (selected/framing) or dotted (hover) 1px
// inset line only.
const CHROME_STYLES = `
      .box { position: fixed; pointer-events: none; display: none; border: 0; border-radius: 2px;
             box-shadow: inset 0 0 0 1px #025df3; z-index: 2147483646; }
      .box.hover { outline: 1px dotted #025df3; outline-offset: -1px; box-shadow: none; }
      .box.drop { box-shadow: inset 0 0 0 2px #059669; }
      .box.framing { box-shadow: inset 0 0 0 1px #025df3; z-index: 2147483647; }
      .badge { position: fixed; display: none; pointer-events: none; background: #025df3;
               color: #fff; font: 12px/1.4 system-ui, sans-serif; padding: 2px 6px;
               border-radius: 4px; z-index: 2147483647; }
    `;

/** A resolved drop point: either a layout-node band target or a slot marker
 * hit (which carries `slotId` and always uses `placement: 'inside'`). */
interface DropTarget {
  layoutNodeId: string;
  placement: 'before' | 'after' | 'inside';
  rect: DOMRectLike;
  slotId?: string;
}

export interface OverlayRuntimeOptions {
  /** Post a theme-to-editor bridge message. */
  post: <
    T extends
      | 'theme:block-clicked'
      | 'theme:field-clicked'
      | 'theme:text-edited'
      | 'theme:blocks-rendered'
      | 'theme:block-hovered'
      | 'theme:drop-candidate'
      | 'theme:node-dropped'
      | 'theme:framing-target'
      | 'theme:framing-changed'
      | 'theme:rich-text-selection'
      | 'theme:rich-text-input'
      | 'theme:rich-text-command',
  >(
    type: T,
    payload: BridgePayloads[T]
  ) => void;
  root?: ParentNode;
  /**
   * The theme's own layout breakpoints, so `hiddenAtBreakpoint` can say which
   * of the three ranges the viewport is in — the same numbers the generated
   * layout CSS wrote its `@media` blocks with, and the same ones the bridge
   * advertises in `theme:ready`. Omitted, the kit defaults are used.
   */
  breakpoints?: LayoutBreakpoints;
}

export interface OverlayRuntime {
  start(): void;
  stop(): void;
  setMode(mode: 'preview' | 'edit'): void;
  setSelected(entryId: string | null, layoutNodeId?: string, reusablePlacementId?: string): void;
  acceptExternalUpdate(entryIds: readonly string[]): void;
  reconcileExternalDrafts(
    drafts: Readonly<Record<string, Record<string, unknown>>>,
    entryIds: readonly string[]
  ): void;
  rescan(): void;
  setDragPayload(payload: StructuralDragPayload | null): void;
  /** §17: enter canvas framing for a marked image, or leave framing (null). */
  setFramingMode(target: { entryId: string; fieldPath: string } | null): void;
  /**
   * Contract §17: "A side that does not advertise `image-framing` never
   * sends, and must ignore, the messages below." Gates every framing entry
   * point (click-to-enter and setFramingMode) on the editor's negotiated
   * capability; defaults to false so framing stays off until onEditorHello
   * turns it on. Disabling mid-session exits any live framing silently (no
   * theme:framing-target / theme:framing-changed post) since a side that
   * doesn't advertise the capability can't receive them either.
   */
  setFramingEnabled(enabled: boolean): void;
  /**
   * Mirroring setFramingEnabled: the `block-hover` capability negotiated
   * from editor:hello gates `theme:block-hovered`.
   * Defaults closed, so a theme never reports the hovered block to an editor
   * that did not ask for it. Disabling mid-session forgets the reported
   * hover silently — the other side cannot receive the leave post either.
   * The theme's own hover outline is unaffected either way.
   */
  setBlockHoverEnabled(enabled: boolean): void;
  /**
   * §18 v3: Studio's headless rich-text editor became active (`active: true`)
   * for this field, or closed. The theme marks the root with
   * `data-eldra-rich-text-editing` and does nothing else: it keeps rendering
   * and showing its own content, because that content *is* the editing
   * surface. Nothing is hidden and nothing is laid over it.
   */
  setRichTextEditing(target: RichTextFieldIdentity, active: boolean): void;
  /**
   * §18 v3: the acknowledgement that follows an `editor:content-update` for
   * the active field. When it acks a native text op the theme already
   * performed and asks for no re-render, the DOM is already right and is left
   * strictly alone — touching it would take the caret with it. Otherwise the
   * content update has re-rendered the root and the selection is restored at
   * `anchor`/`head`.
   */
  acceptRichTextApplied(
    message: RichTextFieldIdentity & {
      revision: number;
      anchor: number;
      head: number;
      rerender: boolean;
    }
  ): void;
  /**
   * §18 v3: is this field's re-render deferred right now? True from the
   * moment the theme posts a native text op until Studio releases it (see
   * `onRichTextRenderState`). A framework binding consults this before
   * applying a new document: while it is true the browser owns that subtree
   * and replacing it would take the caret with it.
   */
  isRichTextRenderDeferred(identity: RichTextFieldIdentity): boolean;
  /**
   * Subscribe to every change of that state — both when a field starts
   * deferring and when it stops. Returns an unsubscribe. Deliberately a plain
   * callback rather than anything reactive: the decision is core's, and each
   * binding only has to turn the notification into whatever its framework
   * counts as a change.
   */
  onRichTextRenderState(listener: (change: RichTextRenderStateChange) => void): () => void;
  /** §18 v3: scroll a rich-text field into view, focus it and put the caret
   * at the end, so Studio's sidebar "Edit on canvas" lands in the theme. */
  locateRichText(target: RichTextFieldIdentity): void;
  /**
   * §18 v3, mirroring setFramingEnabled: the `rich-text-inline` capability
   * negotiated from editor:hello. Defaults closed, so a theme never reports
   * to an editor that cannot receive it. Disabling mid-session clears any
   * editing mark (silently — the other side cannot receive a post either).
   */
  setRichTextEnabled(enabled: boolean): void;
  /** Test-only accessor: the overlay's style text (the shadow root is closed). */
  chromeStyles(): string;
  /** Test-only accessor: hover/selected box visibility (the shadow root is closed). */
  chromeState(): {
    /** The hover box re-anchors on every scroll/resize (see reposition()),
     * so its rect is exposed alongside display for drift assertions. */
    hover: { display: 'none' | 'block'; rect: FrameRect };
    selected: 'none' | 'block';
    framing: 'none' | 'block';
    /** The framing outline's unscaled frame rect (parsed from its inline
     * left/top/width/height). */
    frameRect: FrameRect;
  };
}

export function createOverlayRuntime(opts: OverlayRuntimeOptions): OverlayRuntime {
  const root = opts.root ?? document;
  const eventTarget = root instanceof Document ? root : root;
  let mode: 'preview' | 'edit' = 'preview';
  let selectedId: string | null = null;
  let selectedLayoutNodeId: string | null = null;
  let selectedReusablePlacementId: string | null = null;
  let host: HTMLElement | null = null;
  let styleEl: HTMLStyleElement | null = null;
  let hoverBox: HTMLElement | null = null;
  /** The block last reported by onPointerOver, re-read by reposition() on
   * every scroll/resize so the hover box tracks it instead of staying
   * anchored to the rect captured at pointerover time. Cleared when the
   * pointer leaves the document, on setMode's hide-hover branch, and on
   * stop(). */
  let hoveredElement: Element | null = null;
  let selectedBox: HTMLElement | null = null;
  let dropIndicator: HTMLElement | null = null;
  let framingBox: HTMLElement | null = null;
  let framingBadge: HTMLElement | null = null;
  let dragPayload: StructuralDragPayload | null = null;
  let observer: MutationObserver | null = null;
  let started = false;
  /** Coalesces reportBlocks() calls scheduled by reposition() (bound to
   * window scroll/resize) into at most one per animation frame. Cancelled
   * in stop(); scheduling is a no-op once stopped. */
  let blocksRaf: number | null = null;
  /** §17 capability gate: set via setFramingEnabled, negotiated from the
   * editor's editor:hello capabilities. Defaults closed. */
  let framingEnabled = false;
  /** §18 v3 capability gate: set via setRichTextEnabled, negotiated from the
   * `rich-text-inline` capability. Defaults closed. */
  let richTextEnabled = false;
  /** `block-hover` capability gate: set via setBlockHoverEnabled, negotiated
   * from the editor's editor:hello capabilities. Defaults closed. */
  let blockHoverEnabled = false;
  /** The block last *posted* over `theme:block-hovered` — null once the leave
   * message went out. Distinct from `hoveredElement`, which is the theme's
   * own hover-box anchor and moves with every pointerover: comparing the two
   * is what keeps a pointer wandering inside one block from posting again. */
  let reportedHoverElement: Element | null = null;
  /** Coalesces `theme:block-hovered` posts into at most one per animation
   * frame, like blocksRaf. Cancelled in stop(); scheduling is a no-op once
   * stopped. */
  let hoverReportRaf: number | null = null;
  /** Set when the pending frame must post even though the hovered block did
   * not change — a scroll or resize moved its rect under a still-hovered
   * pointer, which no pointer event reports. */
  let hoverGeometryStale = false;
  /**
   * §18 v3 (floating toolbar follow-up): each editable rich-text root's
   * prior inline `white-space`/`word-wrap` declarations, captured the one
   * time `applyRichTextEditable` forces them for editing and restored
   * exactly once the root stops being editable — never re-captured while
   * still editable (a rerender that keeps the marked root, or a `rescan()`
   * that runs this function again with nothing changed, must not overwrite
   * the original with the forced value). Keyed by element, so a rerender
   * that replaces the root simply never restores the detached one — nothing
   * to restore it to matters once it is gone.
   */
  const richTextPriorWhiteSpace = new WeakMap<
    HTMLElement,
    { whiteSpace: string; wordWrap: string }
  >();
  /** §18 v3: the rich-text root Studio's editor is currently active for, if
   * any. While set, reposition() re-asserts the mark once per animation
   * frame. */
  let editingRichTextRoot: HTMLElement | null = null;
  /**
   * The full identity (entry, field, locale, layout placement) of
   * `editingRichTextRoot`, captured from the element itself — via
   * `richTextIdentityOf`, which reads `closest('[data-eldra-layout-node]')`
   * — at the moment it was marked, while it was still attached. A rerender
   * can detach that element before its replacement is found; `closest` on a
   * detached element cannot see its former layout ancestor, so re-deriving
   * the identity from `editingRichTextRoot` at that point would silently
   * drop `layoutNodeId`/`reusablePlacementId` and let `findRichTextRoot`'s
   * unplaced fallback resolve to the *first* placement of the field in
   * document order — the wrong one, on a page that places the same
   * entry+field twice. Both re-find paths (`reassertRichTextEditingRoot`)
   * must use this captured identity instead. */
  let editingRichTextIdentity: RichTextFieldIdentity | null = null;
  /** Coalesces the editing-root mark re-assert, like blocksRaf. */
  let richTextRaf: number | null = null;
  /** Coalesces scheduleRichTextSelectionRepost's re-post, like richTextRaf. */
  let richTextSelectionRepostRaf: number | null = null;
  /** §18 v3: the per-field op counter. Keyed by field identity rather than by
   * element, because a rerender replaces the element while the field — and
   * therefore the sequence Studio acks against — is the same one. */
  const richTextRevisions = new Map<string, number>();
  /**
   * §18 v3: the fields whose re-render is deferred, mapped to the latest
   * native op revision the theme posted for them.
   *
   * A field enters this map when the theme posts a native text op — from that
   * moment the browser, not the renderer, owns its DOM — and leaves it only
   * when Studio hands ownership back: an `applied` asking for a re-render, an
   * `applied` from ahead of the theme, a command (which Studio performs, so
   * its result must be rendered), or the edit ending. An
   * `applied { rerender: false }` **confirms** the deferral rather than
   * ending it: Studio is agreeing the theme's DOM is already right, which is
   * precisely the state that has to persist across the debounced write's
   * later content update.
   */
  const deferredRenders = new Map<string, { meta: RichTextFieldIdentity; revision: number }>();
  const richTextRenderListeners = new Set<(change: RichTextRenderStateChange) => void>();
  /** §18 v3: a native `beforeinput` the browser is about to perform — its
   * target range, captured before the DOM moves, and posted on the `input`
   * that follows. */
  let pendingNativeInput: {
    key: string;
    root: HTMLElement;
    from: number;
    to: number;
    data: string;
  } | null = null;
  /** §18 v3: the range a composition replaces, captured on `compositionstart`;
   * the whole composition is posted once, on `compositionend`. */
  let composition: { key: string; root: HTMLElement; from: number; to: number } | null = null;
  /**
   * §18 v3 (the floating-toolbar follow-up, generalized and then serialized):
   * an ordered, per-field buffer of the commands a `beforeinput`
   * would have posted while its root could not yet accept one — either not
   * marked editing at all yet (a click immediately followed by
   * typing, before Studio's `editor:rich-text-editing` echo arrives ~14ms
   * later) or marked but with no resolvable selection (the window
   * between the theme's own content-update re-render and
   * `editor:rich-text-applied` restoring the caret).
   *
   * Why one at a time: Studio applies a `theme:rich-text-command` literally at the
   * `from`/`to` it was posted with — no position tracking between messages —
   * so flushing more than one entry at the *same* frozen position reverses
   * typed order and misplaces a later structural command. Only one entry is
   * ever in flight: `awaitingRevision` is the revision of the entry most
   * recently posted but not yet acked, or `null` once nothing has posted at
   * all for the current buffer. The *next* entry posts only once
   * `restoreRichTextSelection` runs for a revision at or beyond it (`>=`, not
   * `===`; see `flushNextPendingRichTextIntent`) — an ack strictly behind it
   * neither advances nor posts. A run of plain typed characters (`insertText`)
   * coalesces into one entry while queuing (`queueRichTextIntent`), so the
   * common case (typing) still reaches Studio as a single command, not N
   * serialized round trips.
   *
   * Flushed by whichever of two triggers comes first: the root being marked
   * editing (`setRichTextEditing`'s `applyRichTextEditing(element, true)`)
   * or `restoreRichTextSelection` actually placing a selection. At most 64
   * entries — coalescing keeps this small in practice — a further one drops
   * the oldest (logged via `console.debug`), so a runaway burst never blocks
   * new input. Cleared on blur, on the editing mark coming off (deactivate,
   * a mode change, `stop()`, or the root vanishing — all of which route
   * through `unmarkRichTextEditing`), so a stale buffer can never flush
   * against an unrelated later selection, and dropping the rest of an
   * in-flight sequence is exactly that: a blur mid-sequence clears whatever
   * had not posted yet.
   */
  let pendingRichTextIntents: {
    key: string;
    entries: Array<{ name: RichTextCommandName; text?: string; coalescable: boolean }>;
    awaitingRevision: number | null;
  } | null = null;
  /** §18 v3: the field the last selection report named, so leaving it can post
   * exactly one blur. */
  let reportedSelectionField: RichTextFieldIdentity | null = null;
  /**
   * §18 v3 (floating toolbar): the last real anchor/head reported for each
   * field, keyed like `richTextRevisions`. Read back when the DOM selection
   * has no range (e.g. `removeAllRanges()` after a re-render or a
   * programmatic change) but the editing root still has document focus — the
   * floating toolbar has nowhere else to get a position from, and the field
   * has not actually been left.
   */
  const lastRichTextPositions = new Map<string, { anchor: number; head: number }>();
  /** Coalesces selectionchange reports to one per animation frame. */
  let selectionRaf: number | null = null;
  let activeEdit: {
    meta: StegaMeta;
    caretOffset: number;
    value: string;
    dirty: boolean;
    /** The field element and the text node the record was taken against. A
     * keystroke mutates that node's data in place; a renderer pass replaces
     * it. That is how `restoreEditingFocus` tells "the operator just typed"
     * from "the field was re-rendered under them" without depending on
     * whether `onInput` has run yet. */
    element: HTMLElement | null;
    node: ChildNode | null;
  } | null = null;
  const debounceTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  /**
   * Per field (`entryId|fieldPath|locale`), the value the overlay last posted
   * as `theme:text-edited` and has not yet seen the editor echo back. See
   * `hasUnacknowledgedTextEdit`.
   */
  const postedText = new Map<string, string>();
  let framing: {
    entryId: string;
    fieldPath: string;
    image: HTMLElement;
    value: ImageFraming;
    /** Last pointer position while dragging; null when no drag is active. */
    drag: { x: number; y: number } | null;
    raf: number | null;
    wheelTimer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  function rectOf(element: Element): DOMRectLike {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  function mountHost(): void {
    host = document.createElement('div');
    host.setAttribute('data-eldra-overlay-host', '');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CHROME_STYLES;
    styleEl = style;
    hoverBox = document.createElement('div');
    hoverBox.className = 'box hover';
    selectedBox = document.createElement('div');
    selectedBox.className = 'box';
    dropIndicator = document.createElement('div');
    dropIndicator.className = 'box drop';
    framingBox = document.createElement('div');
    framingBox.className = 'box framing';
    framingBadge = document.createElement('div');
    framingBadge.className = 'badge';
    shadow.append(style, hoverBox, selectedBox, dropIndicator, framingBox, framingBadge);
    document.body.appendChild(host);
  }

  function positionBox(box: HTMLElement, element: Element | null): void {
    // Only hoverBox and selectedBox reach here with a non-null element (the
    // drop indicator is positioned directly and only during edit-mode drags),
    // so gating here is enough to hide both chrome boxes outside edit mode.
    if (element === null || mode !== 'edit') {
      box.style.display = 'none';
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  function selectedElement(): Element | null {
    if (selectedLayoutNodeId !== null) {
      const escapedNodeId = escapeAttributeValue(selectedLayoutNodeId);
      const escapedReusablePlacementId =
        selectedReusablePlacementId === null
          ? null
          : escapeAttributeValue(selectedReusablePlacementId);
      const selector =
        escapedReusablePlacementId === null
          ? `[data-eldra-layout-node="${escapedNodeId}"]`
          : `[data-eldra-layout-node="${escapedNodeId}"][data-eldra-reusable-placement="${escapedReusablePlacementId}"]`;
      const placement = root.querySelector(selector);
      if (placement !== null) return placement;
    }
    if (selectedId === null) return null;
    const escaped = escapeAttributeValue(selectedId);
    return root.querySelector(`[data-eldra-block="${escaped}"]`);
  }

  function escapeAttributeValue(value: string): string {
    return globalThis.CSS?.escape(value) ?? value.replace(/["\\]/g, '\\$&');
  }

  function framingImageFor(target: Element): HTMLElement | null {
    return target.closest<HTMLElement>('img[data-eldra-framing]');
  }

  /** Behaviour item 1: the image's own block is selected, or (when no layout
   * node is selected) the image marks itself with the selected entry id. */
  function ownsSelectedBlock(image: HTMLElement): boolean {
    const block = image.closest('[data-eldra-block]');
    if (block !== null && block === selectedElement()) return true;
    if (selectedLayoutNodeId === null && selectedId !== null) {
      return image.getAttribute('data-eldra-framing-entry') === selectedId;
    }
    return false;
  }

  function findFramingImage(entryId: string, fieldPath: string): HTMLElement | null {
    const escapedField = escapeAttributeValue(fieldPath);
    const escapedEntry = escapeAttributeValue(entryId);
    return root.querySelector<HTMLElement>(
      `img[data-eldra-framing="${escapedField}"][data-eldra-framing-entry="${escapedEntry}"]`
    );
  }

  /**
   * §18 v3: the rich-text root a message names. Resolved by attributes (not
   * a remembered node) because a rerender replaces the element while keeping
   * `data-eldra-entry` / `-field` / `-locale` — the same reason framing
   * re-resolves its image in rescan(). `locale` is compared against the
   * attribute, which the renderer omits entirely for an unlocalized field,
   * so `null` matches exactly that case.
   */
  function findRichTextRoot(
    entryId: string,
    fieldPath: string,
    locale: string | null,
    layoutNodeId?: string,
    reusablePlacementId?: string
  ): HTMLElement | null {
    const selector =
      `[data-eldra-rich-text][data-eldra-field="${escapeAttributeValue(fieldPath)}"]` +
      `[data-eldra-entry="${escapeAttributeValue(entryId)}"]`;
    let fallback: HTMLElement | null = null;
    for (const candidate of root.querySelectorAll<HTMLElement>(selector)) {
      if (candidate.getAttribute('data-eldra-locale') !== locale) continue;
      // The same entry can be placed twice. When the message names a
      // placement, only that one matches; when it names none (an older
      // message, or a page with a single placement) the first match stands in,
      // which is what the single-placement case has always resolved to.
      const identity = layoutIdentityOf(candidate);
      if (layoutNodeId !== undefined && identity.layoutNodeId !== layoutNodeId) continue;
      if (reusablePlacementId !== undefined && identity.reusablePlacementId !== reusablePlacementId)
        continue;
      if (layoutNodeId === undefined && reusablePlacementId === undefined) {
        fallback ??= candidate;
        continue;
      }
      return candidate;
    }
    return fallback;
  }

  /**
   * §18 v3: mark (or unmark) a root as the one Studio is editing. That is the
   * whole of it. I17 hid the root's children behind Studio's overlay editor;
   * v3 edits the theme's own render in place, so hiding it would hide the very
   * text the operator is typing into.
   */
  function applyRichTextEditing(element: HTMLElement, active: boolean): void {
    if (active) element.setAttribute('data-eldra-rich-text-editing', '');
    else element.removeAttribute('data-eldra-rich-text-editing');
  }

  /**
   * Every rich-text root is `contenteditable` throughout edit mode, but that
   * is not the same as Studio actually editing it: `setRichTextEditing`
   * arrives asynchronously (Studio's headless editor negotiates the field
   * before it marks the root), so there is a window — and, if the first
   * activation message is ever dropped, an unbounded one — where a root
   * accepts focus and keystrokes with no document behind them on Studio's
   * side. `onBeforeInput`/`onCompositionStart` must fail closed on that
   * window exactly as they fail closed on an unnameable inputType.
   */
  function isRichTextEditingActive(element: HTMLElement): boolean {
    return element.hasAttribute('data-eldra-rich-text-editing');
  }

  /** Unmark whatever is currently marked, including a root a rerender
   * replaced while the mark was on it. Posts nothing, and says nothing about
   * whose render is deferred — the two are separate questions. */
  function unmarkRichTextEditing(): void {
    if (richTextRaf !== null) {
      cancelAnimationFrame(richTextRaf);
      richTextRaf = null;
    }
    const current = editingRichTextRoot;
    editingRichTextRoot = null;
    editingRichTextIdentity = null;
    // §18 v3 (floating toolbar follow-up): every path that unmarks — Studio
    // deactivating the field, a mode change, stop(), or reassert failing to
    // find the root again — ends whatever selection-restoration a queued
    // buffer was waiting on.
    pendingRichTextIntents = null;
    if (current !== null && !current.isConnected) applyRichTextEditing(current, false);
    for (const marked of root.querySelectorAll<HTMLElement>('[data-eldra-rich-text-editing]')) {
      applyRichTextEditing(marked, false);
    }
  }

  /**
   * Unmark **and** hand every field back to the renderer. This is the whole
   * session ending — leaving edit mode, the capability closing, teardown —
   * where nothing on the page is being typed into any more. Studio closing one
   * field is not this: see `setRichTextEditing`, which releases only that one,
   * so a native op still in flight in another placement is not thrown away.
   */
  function clearRichTextEditing(): void {
    unmarkRichTextEditing();
    releaseAllRichTextRenders();
  }

  /**
   * §18 v3: the editing mark must be on whichever element is *currently*
   * live for the active field, even when a rerender replaced it outright.
   * Two callers need this, on two different schedules:
   *
   * - `scheduleRichTextSync` (below), coalesced to one frame — the same
   *   treatment scheduleReportBlocks() gives block geometry, so a scroll
   *   burst does not flood the main thread;
   * - `applyRichTextEditable`, called synchronously from `rescan()` on every
   *   `editor:content-update`, which cannot wait a frame: a keystroke can
   *   arrive before the next paint, and `onBeforeInput`'s activation gate
   *   would otherwise prevent it as if Studio had never activated the field.
   */
  function reassertRichTextEditingRoot(): void {
    const current = editingRichTextRoot;
    const identity = editingRichTextIdentity;
    if (current === null || identity === null) return;
    if (current.isConnected) {
      applyRichTextEditing(current, true);
      return;
    }
    // A rerender can replace the marked element outright; follow it by the
    // identity captured while it was still attached — never by re-deriving
    // layoutNodeId/reusablePlacementId from `current` itself, which is
    // detached here and so `closest('[data-eldra-layout-node]')` can no
    // longer see its former layout ancestor (see `editingRichTextIdentity`).
    const live = findRichTextRoot(
      identity.entryId,
      identity.fieldPath,
      identity.locale,
      identity.layoutNodeId,
      identity.reusablePlacementId
    );
    if (live === null) {
      clearRichTextEditing();
      return;
    }
    applyRichTextEditing(current, false);
    editingRichTextRoot = live;
    applyRichTextEditing(live, true);
  }

  /**
   * §18 v3: while Studio edits a field, re-assert the mark on the live root —
   * coalesced to one frame, the same treatment scheduleReportBlocks() gives
   * block geometry, so a scroll burst does not flood the main thread.
   */
  function scheduleRichTextSync(): void {
    if (!started || editingRichTextRoot === null || richTextRaf !== null) return;
    richTextRaf = requestAnimationFrame(() => {
      richTextRaf = null;
      reassertRichTextEditingRoot();
    });
  }

  /** The arguments `findRichTextRoot` takes, from a (possibly detached) root —
   * so a rerender is followed by identity, placement included. */
  function richTextLookup(
    element: HTMLElement
  ): [string, string, string | null, string | undefined, string | undefined] {
    const identity = richTextIdentityOf(element);
    return [
      identity.entryId,
      identity.fieldPath,
      identity.locale,
      identity.layoutNodeId,
      identity.reusablePlacementId,
    ];
  }

  // --- 18 v3 native editing ------------------------------------------------

  /**
   * The editing surface. In edit mode with the negotiated `rich-text-inline`
   * capability every rich-text root becomes `contenteditable` — exactly like
   * the plain-text spans `applyEditable` handles, which is the point: rich
   * text is edited the way plain text already is. `spellcheck` is off because
   * the squiggles would be drawn over a document Studio owns and the theme
   * cannot correct.
   *
   * Outside edit mode, or without the capability, both attributes go: a
   * published page must never be editable, and a theme must never hand a
   * caret to an editor that cannot receive what is done with it.
   */
  const RICH_TEXT_WHITE_SPACE_PROP = 'white-space';
  const RICH_TEXT_WORD_WRAP_PROP = 'word-wrap';

  function setOrRemoveStyleProp(element: HTMLElement, prop: string, value: string): void {
    if (value === '') element.style.removeProperty(prop);
    else element.style.setProperty(prop, value);
  }

  /**
   * §18 v3 (floating toolbar follow-up): ProseMirror's own stylesheet sets
   * `white-space: pre-wrap` and `word-wrap: break-word` on its editable
   * root, so a run of consecutive spaces and a trailing space both render
   * (and take up a line box) exactly as Studio's headless editor sees them.
   * Normal `white-space` collapses that — a paragraph ending in spaces (or
   * holding nothing else) renders as if it were empty — which is the same
   * root cause that let a Backspace-join eat real content and a keystroke
   * land in the previous paragraph: the DOM's caret position and the
   * document's position had quietly stopped agreeing. Applied as an inline
   * style rather than a stylesheet rule the theme would have to carry;
   * captured once per element so `restoreRichTextWhiteSpace` can put back
   * whatever the theme's own render had there, not just clear it.
   *
   * Accepted consequence: `pre-wrap` also preserves a literal `\n` inside a
   * text leaf's string as a visible line break. The document schema never
   * emits one — a line break is a `hardBreak` node, not a character inside
   * text — but nothing here strips or rejects one if it somehow arrives (a
   * paste that bypassed normalization, say). That is out of the normal
   * schema path and not specifically guarded against; the character still
   * counts as an ordinary position like any other (see
   * `richTextPositions.ts`'s `richTextNodeSize`/`resolveDomPosition`, which
   * have no special case for it).
   */
  function applyRichTextWhiteSpace(element: HTMLElement): void {
    if (richTextPriorWhiteSpace.has(element)) return;
    richTextPriorWhiteSpace.set(element, {
      whiteSpace: element.style.getPropertyValue(RICH_TEXT_WHITE_SPACE_PROP),
      wordWrap: element.style.getPropertyValue(RICH_TEXT_WORD_WRAP_PROP),
    });
    element.style.setProperty(RICH_TEXT_WHITE_SPACE_PROP, 'pre-wrap');
    element.style.setProperty(RICH_TEXT_WORD_WRAP_PROP, 'break-word');
  }

  /** The inverse of `applyRichTextWhiteSpace`: restores exactly the two
   * declarations it changed, to whatever they were before — including
   * nothing, which removes them rather than leaving an empty string behind. */
  function restoreRichTextWhiteSpace(element: HTMLElement): void {
    const prior = richTextPriorWhiteSpace.get(element);
    if (prior === undefined) return;
    richTextPriorWhiteSpace.delete(element);
    setOrRemoveStyleProp(element, RICH_TEXT_WHITE_SPACE_PROP, prior.whiteSpace);
    setOrRemoveStyleProp(element, RICH_TEXT_WORD_WRAP_PROP, prior.wordWrap);
  }

  function applyRichTextEditable(): void {
    const editable = mode === 'edit' && richTextEnabled;
    for (const element of root.querySelectorAll<HTMLElement>('[data-eldra-rich-text]')) {
      if (editable) {
        element.setAttribute('contenteditable', 'true');
        element.setAttribute('spellcheck', 'false');
        applyRichTextWhiteSpace(element);
      } else {
        element.removeAttribute('contenteditable');
        element.removeAttribute('spellcheck');
        restoreRichTextWhiteSpace(element);
      }
    }
    if (editable) {
      // A content-update rerender can replace the actively-edited root
      // element synchronously, and `rescan()` calls this function
      // synchronously too (on every such update) — well before
      // scheduleRichTextSync's rAF would otherwise catch up. Reassert here so
      // a keystroke arriving in that window is not treated as landing on a
      // root Studio never activated.
      reassertRichTextEditingRoot();
    } else {
      pendingNativeInput = null;
      composition = null;
      reportedSelectionField = null;
      releaseAllRichTextRenders();
    }
  }

  /** The rich-text root a DOM node sits in, but only while that root is a live
   * editing surface — so a stale selection in a preview-mode page, or one in a
   * theme whose editor never negotiated the capability, reports nothing. */
  function editableRichTextRootOf(node: Node | null): HTMLElement | null {
    if (node === null || mode !== 'edit' || !richTextEnabled) return null;
    const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
    if (element === null) return null;
    const found = element.closest<HTMLElement>('[data-eldra-rich-text][contenteditable="true"]');
    if (found === null) return null;
    const scope = root instanceof Document ? root.documentElement : (root as Element);
    return scope === null || scope.contains(found) ? found : null;
  }

  /**
   * §18 v3: a field's identity as a map key. The layout identity is part of
   * it, not decoration: the same entry can be placed twice on a page (a layout
   * node, a reusable placement), and those two renders are two independent
   * editing surfaces. Keying only by entry/field/locale would let a native op
   * in one defer — and re-stamp, and ack — the other.
   *
   * NUL cannot appear in an attribute value, so no combination can collide
   * with another by accident.
   */
  function richTextKey(identity: RichTextFieldIdentity): string {
    return [
      identity.entryId,
      identity.fieldPath,
      identity.locale ?? '',
      identity.layoutNodeId ?? '',
      identity.reusablePlacementId ?? '',
    ].join('\u0000');
  }

  /** The full identity of a rendered root, marking attributes included. */
  function richTextIdentityOf(element: HTMLElement): RichTextFieldIdentity {
    return { ...metadataOf(element), ...layoutIdentityOf(element) };
  }

  function richTextKeyOf(element: HTMLElement): string {
    return richTextKey(richTextIdentityOf(element));
  }

  function revisionOf(key: string): number {
    return richTextRevisions.get(key) ?? 0;
  }

  function nextRevision(key: string): number {
    const revision = revisionOf(key) + 1;
    richTextRevisions.set(key, revision);
    return revision;
  }

  function notifyRichTextRenderState(identity: RichTextFieldIdentity, deferred: boolean): void {
    if (richTextRenderListeners.size === 0) return;
    const change: RichTextRenderStateChange = { ...identity, deferred };
    for (const listener of richTextRenderListeners) listener(change);
  }

  /** The browser now owns this field's DOM; a binding must stop replacing it. */
  function deferRichTextRender(identity: RichTextFieldIdentity, revision: number): void {
    const key = richTextKey(identity);
    const already = deferredRenders.has(key);
    deferredRenders.set(key, { meta: identity, revision });
    // Deferring is a state, not an event stream: a second op does not
    // re-announce what the binding already knows.
    if (!already) notifyRichTextRenderState(identity, true);
  }

  /** Hand the field back to the renderer. */
  function releaseRichTextRender(key: string): boolean {
    const entry = deferredRenders.get(key);
    if (entry === undefined) return false;
    deferredRenders.delete(key);
    notifyRichTextRenderState(entry.meta, false);
    return true;
  }

  /**
   * Release one field's deferral. An identity that names no placement matches
   * every placement of that field: a message can legitimately arrive without
   * one (Studio need not know which of two renders the theme used), and a
   * deferral that nothing can name would outlive its root.
   */
  function releaseRichTextRenderFor(identity: RichTextFieldIdentity): boolean {
    if (releaseRichTextRender(richTextKey(identity))) return true;
    if (identity.layoutNodeId !== undefined || identity.reusablePlacementId !== undefined) {
      return false;
    }
    // Collect first: releasing mutates the map this is walking.
    const matching: string[] = [];
    for (const [key, { meta }] of deferredRenders) {
      if (
        meta.entryId === identity.entryId &&
        meta.fieldPath === identity.fieldPath &&
        meta.locale === identity.locale
      )
        matching.push(key);
    }
    let released = false;
    for (const key of matching) released = releaseRichTextRender(key) || released;
    return released;
  }

  function releaseAllRichTextRenders(): void {
    if (deferredRenders.size === 0) return;
    const entries = [...deferredRenders.values()];
    deferredRenders.clear();
    for (const entry of entries) notifyRichTextRenderState(entry.meta, false);
  }

  /** 4.3: `text` is bounded at 64 KiB. Cut on a code-unit boundary rather
   * than mid-surrogate, so the other side never receives a lone half. */
  function boundedText(value: string): string {
    if (value.length <= RICH_TEXT_TEXT_MAX) return value;
    const cut = value.slice(0, RICH_TEXT_TEXT_MAX);
    const last = cut.charCodeAt(cut.length - 1);
    return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
  }

  function boundedMarks(marks: readonly string[]): string[] {
    return marks
      .slice(0, RICH_TEXT_MARKS_MAX)
      .filter((mark) => mark.length <= RICH_TEXT_MARK_LENGTH_MAX);
  }

  function boundedRect(rect: DOMRectLike | null): DOMRectLike | null {
    if (rect === null) return null;
    const values = [rect.x, rect.y, rect.width, rect.height];
    const ok = values.every((value) => Number.isFinite(value) && Math.abs(value) <= RECT_MAX);
    return ok ? rect : null;
  }

  /**
   * §18 v3: report the selection inside a rich-text root as document
   * positions, plus the marks and the block the toolbar needs — both read off
   * the DOM, which is all the theme knows and all Studio needs to light the
   * toolbar. Leaving a root posts exactly one blur (`anchor: null`).
   */
  function reportRichTextSelection(): void {
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
    const focusNode = selection?.focusNode ?? null;
    const element = editableRichTextRootOf(focusNode);
    if (element === null || selection === null || focusNode === null) {
      // No resolvable position — either there is no range at all
      // (`removeAllRanges()`, typically after a re-render or a programmatic
      // change) or the focus node sits outside every editable root. Neither
      // means the operator left the field if the root itself still has
      // document focus; see reportRetainedFocusOrBlur.
      reportRetainedFocusOrBlur();
      return;
    }
    const anchorNode = selection.anchorNode ?? focusNode;
    // A selection that starts in one root and ends in another is not a
    // position in either document. Report it as a blur rather than as a range
    // Studio would apply to the wrong field.
    if (editableRichTextRootOf(anchorNode) !== element) {
      postRichTextBlur();
      return;
    }
    const anchor = resolveDomPosition(element, anchorNode, selection.anchorOffset);
    const head = resolveDomPosition(element, focusNode, selection.focusOffset);
    if (!isPosition(anchor) || !isPosition(head)) return;
    const identity = richTextIdentityOf(element);
    const context = describeSelectionContext(element, focusNode);
    let rect: DOMRectLike | null = null;
    if (selection.rangeCount > 0) {
      const box = selection.getRangeAt(0).getBoundingClientRect?.();
      if (box !== undefined) {
        rect = { x: box.x, y: box.y, width: box.width, height: box.height };
      }
    }
    const key = richTextKey(identity);
    reportedSelectionField = identity;
    lastRichTextPositions.set(key, { anchor, head });
    opts.post('theme:rich-text-selection', {
      ...identity,
      anchor,
      head,
      rect: boundedRect(rect),
      // The floating toolbar's fallback anchor when there is no caret rect —
      // same coordinate space, same bound as `rect`.
      rootRect: boundedRect(rectOf(element)),
      marks: boundedMarks(context.marks),
      block: context.block,
      revision: revisionOf(key),
    });
  }

  /**
   * §18 v3 (floating toolbar): the DOM selection could not be resolved to a
   * position, but the editing root itself may still hold document focus —
   * `removeAllRanges()` after a re-render or a programmatic change does
   * exactly this without the operator leaving the field. In that case report
   * the root is still being edited, at its last known positions (0/0 if none
   * were ever reported), with no caret rect but a `rootRect` so the floating
   * toolbar has somewhere to sit. Blur in every other case: the root is not
   * the one Studio is editing, it is not marked editing, or it does not have
   * focus at all — the operator actually left.
   */
  function reportRetainedFocusOrBlur(): void {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active === editingRichTextRoot &&
      isRichTextEditingActive(active)
    ) {
      const identity = richTextIdentityOf(active);
      const key = richTextKey(identity);
      const last = lastRichTextPositions.get(key) ?? { anchor: 0, head: 0 };
      reportedSelectionField = identity;
      opts.post('theme:rich-text-selection', {
        ...identity,
        anchor: last.anchor,
        head: last.head,
        rect: null,
        rootRect: boundedRect(rectOf(active)),
        marks: [],
        block: null,
        revision: revisionOf(key),
      });
      return;
    }
    postRichTextBlur();
  }

  function postRichTextBlur(): void {
    // The operator left the field: a queued buffer (§18 v3 floating toolbar
    // follow-up) belongs to the activation/selection restoration that never
    // came, and must not flush against whatever the caret lands on next.
    // Cleared unconditionally, ahead of the early return below — the
    // retained-focus state this exists for is exactly a state where
    // `reportedSelectionField` can already be null (no `selectionchange`
    // reached `reportRichTextSelection` to repopulate it) even though a real
    // blur is happening right now.
    pendingRichTextIntents = null;
    const identity = reportedSelectionField;
    if (identity === null) return;
    reportedSelectionField = null;
    // The caret has left: nothing is mid-word any more, so the renderer can
    // have the field back.
    releaseRichTextRender(richTextKey(identity));
    opts.post('theme:rich-text-selection', {
      ...identity,
      anchor: null,
      head: null,
      rect: null,
      rootRect: null,
      marks: [],
      block: null,
      revision: revisionOf(richTextKey(identity)),
    });
  }

  /**
   * Re-post the selection while a root is being edited — the floating
   * toolbar tracks the operator's selection, so a scroll or resize inside
   * the iframe (which produces no DOM mutation the MutationObserver would
   * see) must still refresh `rect`/`rootRect`. Coalesced to one post per
   * animation frame via `reposition()`, the same treatment
   * `scheduleReportBlocks`/`scheduleRichTextSync` give their own geometry.
   * Posts nothing when no root is being edited, or when the current DOM
   * selection is not inside the one being edited — Studio owns the toolbar's
   * fate in that case, not a stale re-post.
   */
  function scheduleRichTextSelectionRepost(): void {
    if (!started || editingRichTextRoot === null || richTextSelectionRepostRaf !== null) return;
    richTextSelectionRepostRaf = requestAnimationFrame(() => {
      richTextSelectionRepostRaf = null;
      const target = editingRichTextRoot;
      if (target === null) return;
      const selection =
        typeof document.getSelection === 'function' ? document.getSelection() : null;
      const focusNode = selection?.focusNode ?? null;
      const insideRoot = focusNode !== null && target.contains(focusNode);
      // The retained-focus state reportRetainedFocusOrBlur handles: no
      // resolvable position — no range at all, *or* a focus node that sits
      // outside every editable root — while the root itself still has
      // document focus. Both match `reportRichTextSelection`'s own
      // `element === null` gate (`editableRichTextRootOf` returns null for a
      // focus node outside every root, not only for a null one), so this
      // check must not narrow further to "no focus node" or a repost while
      // the selection sits outside every root would be skipped and
      // `rootRect` would go stale. Re-posting here is what keeps the
      // floating toolbar's rootRect current while the operator
      // scrolls/resizes in that state.
      const retainedFocus = !insideRoot && document.activeElement === target;
      if (!insideRoot && !retainedFocus) return;
      reportRichTextSelection();
    });
  }

  function onSelectionChange(): void {
    if (!started || selectionRaf !== null) return;
    selectionRaf = requestAnimationFrame(() => {
      selectionRaf = null;
      reportRichTextSelection();
    });
  }

  /**
   * §18 v3: the one place the theme decides whether the browser or Studio
   * performs an edit. A native op runs and is reported afterwards; everything
   * else is prevented and forwarded as an intent.
   */
  function onBeforeInput(event: Event): void {
    if (!isInputEvent(event)) return;
    const element = editableRichTextRootOf(event.target instanceof Node ? event.target : null);
    if (element === null) return;
    if (!isRichTextEditingActive(element)) {
      // Studio has not (yet, or any more) activated this root: no document on
      // the other side to apply an op to. Prevent the native edit and drop
      // any captured state — but the keystroke still happened, and a click
      // immediately followed by typing is the common case (Studio's
      // `editor:rich-text-editing` echo arrives ~14ms later): queue the
      // command it would have posted, the same buffer the retained-focus
      // state uses. `setRichTextEditing`'s
      // `applyRichTextEditing(element, true)` flushes it in order once the
      // root is actually marked. Re-post the current selection so Studio
      // gets a fresh chance to activate — but only once per run of queued
      // keystrokes, not on every one (posted directly, not through the rAF
      // coalescer: this is the one report that must reach Studio before the
      // next keystroke, not batched with it).
      event.preventDefault();
      pendingNativeInput = null;
      composition = null;
      const key = richTextKeyOf(element);
      const isFreshRun = pendingRichTextIntents === null || pendingRichTextIntents.key !== key;
      queueRichTextIntent(key, event);
      if (isFreshRun) reportRichTextSelection();
      return;
    }
    const key = richTextKeyOf(element);
    const verdict = classifyBeforeInput(event, element);
    if (verdict.kind === 'native') {
      // A composition reports once, on compositionend, with the range it
      // started from — never one message per intermediate keystroke.
      if (event.isComposing === true || event.inputType === 'insertCompositionText') {
        pendingNativeInput = null;
        composition ??= { key, root: element, from: verdict.from, to: verdict.to };
        return;
      }
      pendingNativeInput = {
        key,
        root: element,
        from: verdict.from,
        to: verdict.to,
        data: typeof event.data === 'string' ? event.data : '',
      };
      return;
    }
    if (verdict === IGNORED && document.activeElement === element) {
      // Retained-focus state: the root has document focus but no selection a
      // position can be computed from — the window between the theme's own
      // content-update re-render and Studio's editor:rich-text-applied
      // putting the caret back. `classifyBeforeInput` cannot tell native from
      // command without a range, so there is nothing to run and nothing to
      // report yet, but the keystroke still happened — queue the intent it
      // would have posted instead of losing it. `restoreRichTextSelection`
      // flushes it once a selection actually lands.
      event.preventDefault();
      pendingNativeInput = null;
      if (composition !== null && composition.key === key) composition = null;
      queueRichTextIntent(key, event);
      return;
    }
    // Fail closed. Anything the theme cannot describe as a pure text change is
    // prevented, whether or not §18 v3 has a name for it: letting the browser
    // run an edit nobody reports would silently desynchronise the document
    // from what the operator sees, and that divergence is unrecoverable —
    // every later position would be wrong. An unnameable inputType
    // (`deleteSoftLineBackward`, `insertTranspose`, `insertOrderedList`, a
    // `format*` outside the list) therefore does nothing at all, which is a
    // visible no-op rather than an invisible corruption.
    event.preventDefault();
    pendingNativeInput = null;
    // A composition that turned out not to be native must not also post on
    // compositionend.
    if (composition !== null && composition.key === key) composition = null;
    if (verdict.kind === 'ignore') return;
    const name = verdict.name as RichTextCommandName;
    const text = commandText(event, name);
    // An HTML-only paste with nothing in `text/plain` is dropped rather than
    // sent as an empty string: Studio would delete the selection and insert
    // nothing, which loses content the operator still has on the clipboard.
    if (text === '' && (name === 'insertFromPaste' || name === 'insertFromDrop')) return;
    // Only now, with the message actually going out: Studio performs a command,
    // so its result has to be rendered and whatever the browser was allowed to
    // do natively before it is behind. Releasing above this return would hand
    // the field back over a message nobody sent, and the next content update
    // would replace the DOM the operator is still typing into.
    releaseRichTextRender(key);
    opts.post('theme:rich-text-command', {
      ...richTextIdentityOf(element),
      name,
      from: verdict.from,
      to: verdict.to,
      ...(text === null ? {} : { text: boundedText(text) }),
      revision: nextRevision(key),
    });
  }

  /** A paste or a drop — including a keystroke that became one (see
   * `TEXT_FALLBACK_COMMANDS`) — carries the plain text Studio inserts; every
   * other command carries none, because its meaning is its name. */
  function commandText(event: InputEvent, name: RichTextCommandName): string | null {
    if (name !== 'insertFromPaste' && name !== 'insertFromDrop') return null;
    const transferred = event.dataTransfer?.getData('text/plain');
    if (typeof transferred === 'string' && transferred !== '') return transferred;
    // A typed character that became an insertFromPaste (see
    // TEXT_FALLBACK_COMMANDS) carries it here instead.
    return typeof event.data === 'string' ? event.data : '';
  }

  const RICH_TEXT_INTENT_BUFFER_MAX = 64;

  /**
   * §18 v3 (the floating-toolbar follow-up, generalized and then serialized):
   * append the command `event`'s `inputType` maps to onto `key`'s
   * ordered buffer, for `flushNextPendingRichTextIntent` to post one at a
   * time once the root can accept them. Nothing is queued for an inputType
   * with no command name — the same ones `classifyBeforeInput` would call
   * `ignore` even with a resolvable position, so there is nothing to lose —
   * nor for a composition-sourced event (`isComposing`/
   * `insertCompositionText`): `onCompositionStart` already refuses to start
   * a composition on a root in either state this is called from, so this is
   * only the defensive fallback for an engine that does not honor that
   * `preventDefault()`, and a composition has no meaningful, complete text
   * to queue piecemeal anyway.
   *
   * A run of plain typed characters (`inputType === 'insertText'`)
   * coalesces into the buffer's last entry, concatenating text, rather than
   * pushing a new one — Studio applies each posted command literally at the
   * `from`/`to` it carries, so N one-character entries flushed one at a time
   * would each land at the same (by-then stale) position and reverse the
   * typed order (`a`,`b`,`c` → `cba`). A real paste/drop (or anything else)
   * never coalesces with a neighbor; it ends the run.
   */
  function queueRichTextIntent(key: string, event: InputEvent): void {
    if (event.isComposing === true || event.inputType === 'insertCompositionText') return;
    const name = commandNameForInputType(event.inputType);
    if (name === null) return;
    // The same text `commandText` derives for the ordinary path — dataTransfer's
    // `text/plain` first, `event.data` only as the typed-character fallback —
    // not just `event.data` alone, or a real paste/drop (whose text lives in
    // `dataTransfer`, not `data`) would queue and later flush with `text: ''`.
    const text = commandText(event, name);
    // An HTML-only paste/drop with nothing in `text/plain` mirrors the
    // ordinary path's guard: post nothing rather than queue something that
    // would flush as an empty insertion — Studio would delete the selection
    // and insert nothing, losing content the operator still has on the
    // clipboard.
    if (text === '' && (name === 'insertFromPaste' || name === 'insertFromDrop')) return;
    if (pendingRichTextIntents === null || pendingRichTextIntents.key !== key) {
      pendingRichTextIntents = { key, entries: [], awaitingRevision: null };
    }
    const entries = pendingRichTextIntents.entries;
    const coalescable = event.inputType === 'insertText';
    const last = entries[entries.length - 1];
    if (coalescable && last !== undefined && last.coalescable && text !== null) {
      last.text = `${last.text ?? ''}${text}`;
      return;
    }
    if (entries.length >= RICH_TEXT_INTENT_BUFFER_MAX) {
      const dropped = entries.shift();
      // A keystroke lost to a 64-deep backlog is worth a trace, not a
      // silent loss — though reaching the cap at all should be rare, and
      // coalescing keeps a typing burst to one entry regardless of length.
      // eslint-disable-next-line no-console
      console.debug(
        '[eldra] rich-text: pending intent buffer full (64); dropping the oldest queued intent',
        {
          key,
          dropped:
            dropped === undefined
              ? dropped
              : {
                  ...dropped,
                  ...(dropped.text === undefined ? {} : { text: boundedText(dropped.text) }),
                },
        }
      );
    }
    entries.push({ name, coalescable, ...(text === null ? {} : { text }) });
  }

  /** The browser has performed the edit; report it against the range captured
   * before the DOM moved. */
  function postNativeRichTextInput(
    pending: { key: string; root: HTMLElement; from: number; to: number },
    text: string
  ): void {
    const element = pending.root.isConnected
      ? pending.root
      : findRichTextRoot(...richTextLookup(pending.root));
    if (element === null) return;
    const revision = nextRevision(pending.key);
    deferRichTextRender(richTextIdentityOf(element), revision);
    opts.post('theme:rich-text-input', {
      ...richTextIdentityOf(element),
      from: pending.from,
      to: pending.to,
      text: boundedText(text),
      revision,
    });
  }

  function onCompositionStart(event: Event): void {
    const element = editableRichTextRootOf(event.target instanceof Node ? event.target : null);
    if (element === null) return;
    if (!isRichTextEditingActive(element)) {
      // Same gate as onBeforeInput: an IME session started on a root Studio
      // has not activated must not be allowed to start composing at all.
      if (isCompositionEvent(event)) event.preventDefault();
      pendingNativeInput = null;
      composition = null;
      reportRichTextSelection();
      return;
    }
    const range = currentSelectionRange();
    if (range === null) {
      // §18 v3 (floating toolbar follow-up): the same retained-focus window
      // onBeforeInput queues an intent for — but a composition has no text
      // yet at compositionstart (it arrives on compositionupdate/end), so
      // there is nothing meaningful to queue. Just drop it: prevent the
      // session from starting (best effort; not every engine honors this)
      // rather than let it compose into a caret nobody can resolve. The
      // operator's IME session restarts once the selection actually returns.
      if (document.activeElement === element && isCompositionEvent(event)) event.preventDefault();
      return;
    }
    // The same test `beforeinput` applies: an IME started over a selection
    // that crosses a mark or a block is not a text run edit, so nothing is
    // captured here and the `beforeinput` that follows classifies it as the
    // command it is. Capturing it anyway would post a text op on
    // compositionend *as well as* that command.
    if (!isNativeTextRange(element, 'insertCompositionText', range)) return;
    const positions = domRangeToPositions(element, range);
    if (positions === null || !isPosition(positions.from) || !isPosition(positions.to)) return;
    composition = {
      key: richTextKeyOf(element),
      root: element,
      from: positions.from,
      to: positions.to,
    };
  }

  function onCompositionEnd(event: Event): void {
    const pending = composition;
    composition = null;
    pendingNativeInput = null;
    if (pending === null) return;
    const data = isCompositionEvent(event) && typeof event.data === 'string' ? event.data : '';
    postNativeRichTextInput(pending, data);
  }

  /**
   * §18 v3: Studio's answer to an `editor:content-update` for the active
   * field. When it acks a native op the theme performed and asks for no
   * re-render, the DOM already shows the edit: touching it — or the selection
   * — would take the caret away from the operator mid-word. Otherwise the
   * content update has re-rendered the root and the caret has to be put back
   * where Studio says the document's selection is.
   */
  function acceptRichTextApplied(
    message: RichTextFieldIdentity & {
      revision: number;
      anchor: number;
      head: number;
      rerender: boolean;
    }
  ): void {
    // Outside edit mode there is no editing surface to put a caret into, and
    // a late ack must not resurrect one on a published page.
    if (!richTextEnabled || mode !== 'edit') return;
    if (!isPosition(message.anchor) || !isPosition(message.head)) return;
    if (!Number.isInteger(message.revision) || message.revision < 0) return;
    // Key by the rendered root when it can be found: Studio may name the field
    // without its placement, and the deferral was recorded with one.
    const element = findRichTextRoot(
      message.entryId,
      message.fieldPath,
      message.locale,
      message.layoutNodeId,
      message.reusablePlacementId
    );
    const key = element === null ? richTextKey(message) : richTextKeyOf(element);
    const deferredAt = deferredRenders.get(key)?.revision;
    // `rerender: false` for an op the theme posted (or for anything it has
    // already moved past) confirms the deferral rather than ending it: the
    // theme's DOM is right, and it has to stay in that state across the
    // debounced write's later content update, which is acked the same way.
    const confirms =
      deferredAt !== undefined && message.rerender === false && message.revision <= deferredAt;
    if (confirms) return;
    // A root that is gone still has to lose its deferral, or nothing would
    // ever release it: fall back to the message's own identity.
    if (!releaseRichTextRender(key)) releaseRichTextRenderFor(message);
    if (element === null) return;
    // The release above may have told a binding to re-render, and a framework
    // scheduler does that on a microtask. Put the caret back after it, not
    // into the nodes it is about to replace.
    queueMicrotask(() => {
      if (!element.isConnected) return;
      restoreRichTextSelection(element, message.anchor, message.head, message.revision);
    });
  }

  /**
   * §18 v3 (the floating-toolbar follow-up, generalized and then serialized;
   * release on `>=`, not `===`): post exactly the next
   * entry of `element`'s queued buffer, if it is this trigger's turn —
   * Studio applies a `theme:rich-text-command` literally at the `from`/`to`
   * it carries, with no position tracking between messages, so more than one
   * in flight at once would land at the same (by-then stale) position.
   * `ackRevision` is the revision the calling `restoreRichTextSelection` ran
   * for (`null` for the mark-time trigger, which carries no ack of its own):
   * it is this trigger's turn when nothing has posted for the buffer yet
   * (`awaitingRevision === null` — the first entry, whichever of the two
   * triggers gets there first) or when the ack is at or beyond the entry most
   * recently posted (`ackRevision >= awaitingRevision`). Studio's self-heal
   * path can answer a refused op with its *current* revision rather than the
   * one that was awaited, and a later ack can supersede an earlier one in
   * flight — either arrives strictly ahead, never behind, so `>=` (not
   * `===`) is what "Studio has caught up" actually means; an ack strictly
   * behind the awaited revision is stale and neither advances nor posts. A
   * no-op when nothing is queued — including the common Studio-first case
   * (marked before the operator ever types) — or when what is queued belongs
   * to a different field.
   */
  function flushNextPendingRichTextIntent(
    element: HTMLElement,
    from: number,
    to: number,
    ackRevision: number | null
  ): void {
    const pending = pendingRichTextIntents;
    if (pending === null) return;
    const key = richTextKeyOf(element);
    if (pending.key !== key) return;
    if (
      pending.awaitingRevision !== null &&
      (ackRevision === null || ackRevision < pending.awaitingRevision)
    )
      return;
    const next = pending.entries.shift();
    if (next === undefined) {
      pendingRichTextIntents = null;
      return;
    }
    // Same as an ordinary single `theme:rich-text-command` from
    // `onBeforeInput`: the field's render is no longer deferred once Studio
    // has something to apply. Idempotent — a no-op past the first entry,
    // since nothing here ever re-defers.
    releaseRichTextRender(key);
    const revision = nextRevision(key);
    if (pending.entries.length === 0) {
      // Nothing left to wait for; no ack needs to find this buffer again.
      pendingRichTextIntents = null;
    } else {
      pending.awaitingRevision = revision;
    }
    opts.post('theme:rich-text-command', {
      ...richTextIdentityOf(element),
      name: next.name,
      from,
      to,
      ...(next.text === undefined ? {} : { text: boundedText(next.text) }),
      revision,
    });
  }

  /**
   * §18 v3 (the floating-toolbar follow-up): flush `element`'s queued
   * buffer against whatever the DOM selection already is inside it, for the
   * "root just got marked editing" trigger — `editor:rich-text-editing`
   * carries no position. The keystrokes that filled the buffer were
   * prevented, so the DOM text never moved, but the caret is still exactly
   * where the operator clicked or last typed toward, so this is the position
   * the queued commands belong at. A no-op (skips resolving a position at
   * all) when nothing is queued for this field.
   */
  function flushPendingRichTextIntentsHere(element: HTMLElement): void {
    if (pendingRichTextIntents === null || pendingRichTextIntents.key !== richTextKeyOf(element))
      return;
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
    const focusNode = selection?.focusNode ?? null;
    if (selection === null || focusNode === null) return;
    const anchorNode = selection.anchorNode ?? focusNode;
    const anchor = resolveDomPosition(element, anchorNode, selection.anchorOffset);
    const head = resolveDomPosition(element, focusNode, selection.focusOffset);
    if (!isPosition(anchor) || !isPosition(head)) return;
    flushNextPendingRichTextIntent(element, Math.min(anchor, head), Math.max(anchor, head), null);
  }

  /**
   * Put the caret (or the range) back at the document positions Studio
   * reports, after a re-render replaced the nodes it used to live in.
   * `ackRevision` is the revision of the `editor:rich-text-applied` this
   * restore is running for — passed through to
   * `flushNextPendingRichTextIntent`, which uses it to decide whether this
   * is the ack the next queued entry, if any, was waiting on.
   */
  function restoreRichTextSelection(
    element: HTMLElement,
    anchor: number,
    head: number,
    ackRevision: number | null
  ): void {
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
    if (selection === null) return;
    // Studio's positions describe the document it holds; the theme's render can
    // be a beat behind (a dropped node, an update still in flight), so clamp to
    // what is actually on screen instead of refusing to place the caret at all.
    const end = resolveDomPosition(element, element, element.childNodes.length) ?? 0;
    const clamp = (value: number): number => Math.min(Math.max(value, 0), end);
    const from = clamp(Math.min(anchor, head));
    const to = clamp(Math.max(anchor, head));
    const start = resolveDomPoint(element, from);
    const finish = resolveDomPoint(element, to);
    if (start === null || finish === null) return;
    // Taking focus is only right when the operator is already in this frame.
    // Stealing it from Studio's own toolbar or sidebar — the other half of the
    // same screen — would close the popover they just opened.
    const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    if (focused && document.activeElement !== element) element.focus?.({ preventScroll: true });
    const range = document.createRange();
    try {
      range.setStart(start.node, start.offset);
      range.setEnd(finish.node, finish.offset);
    } catch {
      return;
    }
    selection.removeAllRanges();
    selection.addRange(range);
    // A selection now exists for this root: this may be the ack the next
    // queued entry was waiting on (or, if nothing has posted yet, the first
    // chance to post one at all) — the caller is acceptRichTextApplied's
    // microtask, or any future path that restores a selection the same way.
    flushNextPendingRichTextIntent(element, from, to, ackRevision);
  }

  /** Put the caret at the very end of a root's content, for `locate`. */
  function placeCaretAtEnd(element: HTMLElement): void {
    const selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
    if (selection === null) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function isInputEvent(event: Event): event is InputEvent {
    return typeof (event as InputEvent).inputType === 'string';
  }

  function isCompositionEvent(event: Event): event is CompositionEvent {
    return 'data' in event;
  }

  function postFramingTarget(): void {
    if (framing === null) return;
    const rect = unscaledFrameRect(rectOf(framing.image), framing.value);
    opts.post('theme:framing-target', {
      entryId: framing.entryId,
      fieldPath: framing.fieldPath,
      rect,
    });
  }

  function postFraming(final: boolean): void {
    if (framing === null) return;
    opts.post('theme:framing-changed', {
      entryId: framing.entryId,
      fieldPath: framing.fieldPath,
      framing: { ...framing.value },
      final,
    });
  }

  /** True while the live gesture's settled value has not been posted yet: an
   * active pointer drag, a throttled live post waiting for its frame, or the
   * wheel's settle timer. Outside that window the editor's draft is the
   * authority on the framing value. */
  function framingGestureInFlight(): boolean {
    return (
      framing !== null &&
      (framing.drag !== null || framing.raf !== null || framing.wheelTimer !== null)
    );
  }

  /** Item 7: one rAF at a time carries a live (final: false) post; final: true
   * cancels any pending frame and posts synchronously. */
  function scheduleFramingPost(final: boolean): void {
    if (framing === null) return;
    if (final) {
      if (framing.raf !== null) {
        cancelAnimationFrame(framing.raf);
        framing.raf = null;
      }
      postFraming(true);
      return;
    }
    if (framing.raf !== null) return;
    framing.raf = requestAnimationFrame(() => {
      if (framing === null) return;
      framing.raf = null;
      postFraming(false);
    });
  }

  function positionFramingChrome(): void {
    if (framing === null || framingBox === null || framingBadge === null) return;
    // `transform: scale(z)` on the image itself means `getBoundingClientRect()`
    // reports the *scaled* box in a real browser, so `unscaledFrameRect` is
    // what recovers the stable, zoom-independent frame the outline/badge need.
    const rect = unscaledFrameRect(rectOf(framing.image), framing.value);
    Object.assign(framingBox.style, {
      display: 'block',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    Object.assign(framingBadge.style, {
      display: 'block',
      left: `${rect.x + 4}px`,
      top: `${rect.y + 4}px`,
    });
  }

  /** Item 6: apply the CSS (kebab-case props via setProperty), the marking
   * attribute Studio persists, the badge text and reposition the chrome. */
  function applyFraming(): void {
    if (framing === null) return;
    const image = framing.image;
    const style = imageFramingStyle(framing.value);
    for (const [prop, value] of Object.entries(style)) image.style.setProperty(prop, value);
    if (!('transform' in style)) image.style.removeProperty('transform');
    if (!('transform-origin' in style)) image.style.removeProperty('transform-origin');
    image.dataset.eldraFramingValue = `${framing.value.x},${framing.value.y},${framing.value.zoom}`;
    if (framingBadge !== null) framingBadge.textContent = `${framing.value.zoom.toFixed(1)}x`;
    positionFramingChrome();
  }

  function onFramingPointerDown(event: PointerEvent): void {
    if (framing === null || event.button !== 0) return;
    event.preventDefault();
    framing.drag = { x: event.clientX, y: event.clientY };
    const image = framing.image;
    if (typeof image.setPointerCapture === 'function') {
      try {
        image.setPointerCapture(event.pointerId);
      } catch {
        /* jsdom: no-op */
      }
    }
    window.addEventListener('pointermove', onFramingPointerMove, true);
    window.addEventListener('pointerup', onFramingPointerUp, true);
    window.addEventListener('pointercancel', onFramingPointerUp, true);
  }

  function onFramingPointerMove(event: PointerEvent): void {
    if (framing === null || framing.drag === null) return;
    const dx = event.clientX - framing.drag.x;
    const dy = event.clientY - framing.drag.y;
    framing.drag = { x: event.clientX, y: event.clientY };
    const frame = unscaledFrameRect(rectOf(framing.image), framing.value);
    framing.value = roundFramingValue(
      framingDrag(framing.value, dx, dy, frame.width, frame.height)
    );
    applyFraming();
    scheduleFramingPost(false);
  }

  function onFramingPointerUp(): void {
    if (framing === null) return;
    framing.drag = null;
    window.removeEventListener('pointermove', onFramingPointerMove, true);
    window.removeEventListener('pointerup', onFramingPointerUp, true);
    window.removeEventListener('pointercancel', onFramingPointerUp, true);
    scheduleFramingPost(true);
  }

  function onFramingWheel(event: WheelEvent): void {
    if (framing === null) return;
    event.preventDefault();
    framing.value = roundFramingValue(framingZoom(framing.value, event.deltaY));
    applyFraming();
    scheduleFramingPost(false);
    if (framing.wheelTimer !== null) clearTimeout(framing.wheelTimer);
    framing.wheelTimer = setTimeout(() => {
      if (framing === null) return;
      framing.wheelTimer = null;
      scheduleFramingPost(true);
    }, FRAMING_WHEEL_SETTLE_MS);
  }

  function onFramingKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') exitFraming();
  }

  function attachFramingListeners(image: HTMLElement): void {
    image.addEventListener('pointerdown', onFramingPointerDown, true);
    image.addEventListener('wheel', onFramingWheel, { passive: false, capture: true });
    document.addEventListener('keydown', onFramingKeyDown, true);
  }

  function detachFramingListeners(image: HTMLElement): void {
    image.removeEventListener('pointerdown', onFramingPointerDown, true);
    image.removeEventListener('wheel', onFramingWheel, true);
    document.removeEventListener('keydown', onFramingKeyDown, true);
  }

  /** Item 9/1: enter framing for a resolved image (no selection precondition
   * for setFramingMode; the click-entry path checks ownership itself).
   * Guarded the same way positionBox gates chrome: framing never arms outside
   * edit mode, and never arms once the runtime is stopped (setFramingMode can
   * be called before start() / after stop() by a caller that hasn't noticed
   * yet) — stop() itself never releases listeners armed after it ran. */
  function enterFraming(image: HTMLElement): void {
    if (!started || mode !== 'edit' || !framingEnabled) return;
    // Retargeting to a different image: leave the previous one without the
    // null-target post exitFraming() normally sends — Studio should see
    // open → open, not open → null → open.
    if (framing !== null) exitFraming({ post: false });
    framing = {
      entryId: image.getAttribute('data-eldra-framing-entry') ?? '',
      fieldPath: image.getAttribute('data-eldra-framing') ?? '',
      image,
      value: parseImageFramingValueAttr(image.dataset.eldraFramingValue),
      drag: null,
      raf: null,
      wheelTimer: null,
    };
    attachFramingListeners(image);
    applyFraming();
    postFramingTarget();
  }

  /** Item 8: leave framing from any of its exits (Escape, outside click,
   * selection change, preview mode, setFramingMode(null), stop()).
   * `post: false` is for the retarget path only (see enterFraming): it still
   * finalizes an in-flight drag's value, hides chrome and releases listeners,
   * it just skips the {entryId: null} target post.
   * `silent: true` is for setFramingEnabled(false) mid-session: the editor
   * stopped advertising `image-framing`, so per contract §17 the overlay must
   * post nothing at all — not even the drag's finalizing theme:framing-changed. */
  function exitFraming(options: { post?: boolean; silent?: boolean } = {}): void {
    if (framing === null) return;
    const silent = options.silent === true;
    const post = !silent && options.post !== false;
    if (framing.drag !== null) {
      framing.drag = null;
      window.removeEventListener('pointermove', onFramingPointerMove, true);
      window.removeEventListener('pointerup', onFramingPointerUp, true);
      window.removeEventListener('pointercancel', onFramingPointerUp, true);
      if (framing.raf !== null) {
        cancelAnimationFrame(framing.raf);
        framing.raf = null;
      }
      if (!silent) postFraming(true);
    }
    if (framing.raf !== null) {
      cancelAnimationFrame(framing.raf);
      framing.raf = null;
    }
    if (framing.wheelTimer !== null) {
      clearTimeout(framing.wheelTimer);
      framing.wheelTimer = null;
    }
    if (framingBox !== null) framingBox.style.display = 'none';
    if (framingBadge !== null) framingBadge.style.display = 'none';
    if (post) opts.post('theme:framing-target', { entryId: null });
    detachFramingListeners(framing.image);
    framing = null;
  }

  function scanRoot(): Node {
    return root instanceof Document ? root.body : (root as Node);
  }

  /**
   * §4.2 perf: a rich-text root is undecorated — `decorateStegaTextNodes`
   * skips everything under `[data-eldra-rich-text]` — yet the theme rewrites
   * that subtree on every `editor:content-update` echo, which while Studio is
   * editing arrives on roughly every keystroke. Those records can never
   * produce decoration work, and `decorateStegaTextNodes` walks the whole
   * document, so when every record in a batch is inside such a root, drop the
   * batch instead of re-walking the page. A batch that also touches anything
   * else still decorates as before.
   */
  function onMutations(records: MutationRecord[]): void {
    if (records.length > 0 && records.every((record) => insideRichTextRoot(record.target))) return;
    decorateStegaTextNodes();
  }

  function insideRichTextRoot(node: Node): boolean {
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return element?.closest('[data-eldra-rich-text]') != null;
  }

  function decorateStegaTextNodes(): void {
    const walker = document.createTreeWalker(scanRoot(), NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node as Text;
      if (!text.data.includes(STEGA_DELIMITER)) continue;
      // §4.2: rich-text roots render their own marks/leaves and manage their
      // own editing surface (a TipTap editor mounted by the theme component);
      // the overlay must not wrap their text runs into per-leaf stega fields
      // or apply contenteditable to them.
      if (text.parentElement?.closest('[data-eldra-rich-text]') != null) continue;
      targets.push(text);
    }
    for (const text of targets) {
      const { cleaned, meta } = decodeStega(text.data);
      if (meta === null) continue;
      const existing = text.parentElement?.closest<HTMLElement>('[data-eldra-field]') ?? null;
      if (existing !== null) {
        existing.setAttribute('data-eldra-field', meta.fieldPath);
        existing.setAttribute('data-eldra-entry', meta.entryId);
        if (meta.locale !== null) existing.setAttribute('data-eldra-locale', meta.locale);
        else existing.removeAttribute('data-eldra-locale');
        text.data = cleaned;
        applyEditable(existing);
        continue;
      }
      const parent = text.parentElement;
      if (parent !== null && parent.childNodes.length === 1) {
        parent.setAttribute('data-eldra-field', meta.fieldPath);
        parent.setAttribute('data-eldra-entry', meta.entryId);
        if (meta.locale !== null) parent.setAttribute('data-eldra-locale', meta.locale);
        text.data = cleaned;
        applyEditable(parent);
        continue;
      }
      const span = document.createElement('span');
      span.setAttribute('data-eldra-field', meta.fieldPath);
      span.setAttribute('data-eldra-entry', meta.entryId);
      if (meta.locale !== null) span.setAttribute('data-eldra-locale', meta.locale);
      // Mixed-content parents still need a leaf wrapper. Preserve the
      // renderer-owned Text node inside it so reactive text updates continue
      // to target the live DOM node.
      text.before(span);
      span.append(text);
      text.data = cleaned;
      applyEditable(span);
    }
    restoreEditingFocus();
  }

  function metadataOf(span: HTMLElement): StegaMeta {
    return {
      entryId: span.getAttribute('data-eldra-entry') ?? '',
      fieldPath: span.getAttribute('data-eldra-field') ?? '',
      locale: span.getAttribute('data-eldra-locale'),
    };
  }

  function caretOffsetWithin(span: HTMLElement): number {
    const selection = document.getSelection();
    if (
      selection === null ||
      selection.rangeCount === 0 ||
      !selection.focusNode ||
      !span.contains(selection.focusNode)
    ) {
      return span.textContent?.length ?? 0;
    }
    const range = document.createRange();
    range.selectNodeContents(span);
    try {
      range.setEnd(selection.focusNode, selection.focusOffset);
      return range.toString().length;
    } catch {
      return span.textContent?.length ?? 0;
    }
  }

  function rememberEditing(span: HTMLElement, dirty = false): void {
    activeEdit = {
      meta: metadataOf(span),
      caretOffset: caretOffsetWithin(span),
      value: stripStega(span.textContent ?? ''),
      dirty,
      element: span,
      node: span.firstChild,
    };
  }

  function sameTextField(a: StegaMeta, b: StegaMeta): boolean {
    return a.entryId === b.entryId && a.fieldPath === b.fieldPath && a.locale === b.locale;
  }

  function textEditKey(meta: StegaMeta): string {
    return `${meta.entryId}|${meta.fieldPath}|${meta.locale ?? ''}`;
  }

  /** The field `meta` names still has its own `theme:text-edited` debounce
   * armed, so the editor has not been told about the keystrokes in it at all.
   * Matched by metadata rather than element identity on purpose: a renderer
   * pass can replace the element between the keystroke and the flush, and the
   * pending timer is still the same edit. */
  function hasPendingTextEdit(meta: StegaMeta): boolean {
    for (const span of debounceTimers.keys()) {
      if (sameTextField(metadataOf(span), meta)) return true;
    }
    return false;
  }

  /**
   * True while the editor cannot yet have a draft that describes what the
   * operator has typed into `meta`'s field, which is the window in which the
   * overlay — not the editor — owns that field's text. Two halves:
   *
   * - the field's `theme:text-edited` debounce is still armed, so the editor
   *   has not been told anything yet; and
   * - a posted value is still waiting to be echoed back. The round trip is
   *   not bounded by anything the theme controls (the editor debounces its
   *   own content update, then the draft write and the re-render take as long
   *   as the operator's machine and network take), so "wait for the debounce
   *   to flush" is not enough on its own: an echo that arrives after the next
   *   keystroke has already flushed still carries the older draft, and
   *   applying it deletes that keystroke. Ownership therefore ends on the
   *   acknowledgement itself — `acceptTextEditEcho` sees the posted value come
   *   back — and not on a timer.
   *
   * The posted half is held only while the operator is still editing this
   * field in this frame, so a write the editor silently refuses cannot own the
   * field forever: moving the caret elsewhere, or focus leaving the preview,
   * hands it back.
   */
  function hasUnacknowledgedTextEdit(meta: StegaMeta): boolean {
    if (hasPendingTextEdit(meta)) return true;
    if (!postedText.has(textEditKey(meta))) return false;
    const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    return focused && activeEdit !== null && sameTextField(activeEdit.meta, meta);
  }

  /**
   * Whether an `editor:content-update` may write `value` over `meta`'s field.
   * A posted value coming back is the acknowledgement this has been waiting
   * for, and retires it — but only that one: anything typed since keeps the
   * field, which is why the answer is re-derived afterwards rather than
   * returned from inside the branch.
   */
  function acceptTextEditEcho(meta: StegaMeta, value: string): boolean {
    const key = textEditKey(meta);
    if (postedText.get(key) === value) postedText.delete(key);
    return !hasUnacknowledgedTextEdit(meta);
  }

  function restoreEditingFocus(): void {
    if (mode !== 'edit' || activeEdit === null) return;
    const replacement = [...root.querySelectorAll<HTMLElement>('[data-eldra-field]')].find(
      (span) => {
        const meta = metadataOf(span);
        return (
          meta.entryId === activeEdit?.meta.entryId && meta.fieldPath === activeEdit.meta.fieldPath
        );
      }
    );
    if (replacement === undefined) return;
    const { caretOffset, value } = activeEdit;
    // `activeEdit.dirty` alone cannot carry "the editor has not seen this
    // text": it is retired the moment the DOM matches `value`, which is true
    // again on the very next mutation pass after a keystroke (and after this
    // function's own write). A field whose `theme:text-edited` debounce is
    // still armed has by definition not reached the editor, so it stays dirty
    // until the flush — that is what lets the stale renderer echo the editor
    // sends in the meantime be undone here instead of eating the keystroke.
    const dirty = activeEdit.dirty || hasUnacknowledgedTextEdit(activeEdit.meta);
    const acknowledged = replacement.textContent === value;
    // Nothing has come between the operator and their field while its element
    // and text node are the ones this record was taken against: a keystroke
    // mutates that node's data in place, so a text difference here is the
    // operator's own newer typing, not an echo drawn over them. Re-asserting
    // `value` over it would delete the character they just typed — and this
    // function does run before the overlay's own `input` handler whenever
    // anything else on the page registered an `input` listener first, because
    // a listener ahead of it puts a microtask checkpoint between the two and a
    // checkpoint is where queued MutationObserver records are delivered.
    const sameNodes =
      activeEdit.element === replacement &&
      activeEdit.node !== null &&
      activeEdit.node === replacement.firstChild;
    const rewrote = dirty && !acknowledged && !sameNodes;
    if (rewrote) setFieldText(replacement, value);
    const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    const selection = document.getSelection();
    // The caret only has to be put back when it has actually been lost: this
    // runs from `decorateStegaTextNodes`, so every characterData mutation in
    // the document reaches it — including the operator's own keystroke, whose
    // node was mutated in place and whose caret the browser has already
    // advanced. `caretOffset` is only as fresh as the last `rememberEditing`,
    // and whether `onInput` has refreshed it yet depends on listener
    // registration order: a single `input` listener anywhere on the page ahead
    // of the overlay's own puts a microtask checkpoint between the two, and a
    // checkpoint is where queued MutationObserver records are delivered, so
    // this can and does run *before* `onInput`. Re-placing the caret from the
    // remembered offset then moved it back in front of the character just
    // typed, and because the next `rememberEditing` recorded that moved caret,
    // every further keystroke inserted there too.
    //
    // A caret sitting in one of the field's own text nodes is therefore left
    // exactly where it is — nothing re-rendered it, and the browser's position
    // is newer than anything remembered here. The remembered offset is
    // refreshed from it instead, so the restore below has a current offset on
    // the pass that really does need one: the caret collapses onto the field
    // *element* when the renderer replaces the text node it lived in, lands
    // outside the field, or disappears, and a rewrite above replaces the node
    // this function itself just wrote.
    const caretNode = selection === null ? null : selection.focusNode;
    const caretSettled =
      !rewrote && sameNodes && caretNode !== null && replacement.contains(caretNode);
    if (caretSettled) {
      // Take the caret offset from what the browser is actually showing, so
      // the pass that really does have to put one back — the one after a
      // renderer echo replaced the node — restores the operator's latest
      // position rather than one from an earlier keystroke. (`value` is left
      // to `onInput`'s own `rememberEditing`, which runs for every keystroke
      // whichever side of this pass it lands on.)
      activeEdit = {
        meta: metadataOf(replacement),
        caretOffset: caretOffsetWithin(replacement),
        value,
        dirty,
        element: replacement,
        node: replacement.firstChild,
      };
      return;
    }
    // Taking focus is only right when the operator is already in this frame —
    // the same rule `restoreRichTextSelection` follows. A renderer pass that
    // replaces the element while they are in Studio's own sidebar or toolbar
    // must not pull focus back into the preview and close what they opened.
    if (focused && document.activeElement !== replacement)
      replacement.focus({ preventScroll: true });
    if (selection === null) return;
    const range = document.createRange();
    const text = replacement.firstChild;
    const offset = Math.min(caretOffset, replacement.textContent?.length ?? 0);
    if (text?.nodeType === Node.TEXT_NODE) range.setStart(text, offset);
    else range.selectNodeContents(replacement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    activeEdit = {
      meta: metadataOf(replacement),
      caretOffset: offset,
      value,
      dirty: dirty && !acknowledged,
      element: replacement,
      node: replacement.firstChild,
    };
  }

  function applyEditable(span: HTMLElement): void {
    // The rich-text root carries data-eldra-field itself (§4.2), so it also
    // reaches this function via setMode's blanket [data-eldra-field] sweep;
    // it must never gain contenteditable from the overlay — its own
    // TipTap editor (mounted separately by the theme component) owns that.
    if (span.hasAttribute('data-eldra-rich-text')) return;
    if (mode === 'edit') {
      span.setAttribute('contenteditable', 'true');
      guardRendererText(span);
    } else {
      span.removeAttribute('contenteditable');
      unguardRendererText(span);
    }
  }

  /**
   * A renderer re-states a field's text on every `editor:content-update`, and
   * for a field whose whole content is one text run that is
   * `element.textContent = value` (Vue's `setElementText`; the same call in
   * every framework whose text patch writes a string child). The browser
   * answers it by **replacing the text node**, and with it goes the native
   * undo stack of the contenteditable it lives in: the operator loses ⌘Z for
   * everything they typed before that echo. Autosave guarantees at least one
   * echo, which is why undo appeared to work only until the page was saved.
   *
   * Two kinds of echo reach a field the operator is editing, and neither has
   * anything to say to the DOM.
   *
   * An echo that re-states the text already on screen. The string the renderer
   * holds carries the stega payload (`entryId`/`fieldPath`/`locale`), which
   * `decorateStegaTextNodes` strips out of the DOM, so it never equals the live
   * text and the renderer's own "did this change?" check cannot see that it did
   * not. Removing the payload from both sides before comparing makes that echo
   * the no-op it already was.
   *
   * An echo that is simply behind. While `hasUnacknowledgedTextEdit` holds, the
   * editor cannot have a draft that describes what the operator has typed, so
   * the renderer's value is stale by construction — `reconcileExternalDrafts`
   * already refuses it and `restoreEditingFocus` already undoes it. Refusing it
   * here instead means it never reaches the text node in the first place: the
   * repair afterwards cost the operator the node, the caret and the undo stack
   * every time.
   *
   * Scoped to the field elements the overlay has marked, and installed only in
   * edit mode: a published page, and a preview that is not editing, keep the
   * platform setter untouched. The overlay's own repair writes go through
   * `setFieldText`, which is not an echo and is not filtered.
   */
  const guardedFields = new WeakSet<HTMLElement>();
  function guardRendererText(span: HTMLElement): void {
    if (guardedFields.has(span)) return;
    const read = platformTextContent()?.get;
    const write = platformTextContent()?.set;
    if (read === undefined || write === undefined) return;
    Object.defineProperty(span, 'textContent', {
      configurable: true,
      enumerable: false,
      get(this: HTMLElement): string | null {
        return read.call(this) as string | null;
      },
      set(this: HTMLElement, value: unknown): void {
        if (writingFieldText) {
          write.call(this, value);
          return;
        }
        const next = value === null || value === undefined ? '' : String(value);
        if (stripStega(next) === stripStega((read.call(this) as string | null) ?? '')) return;
        if (hasUnacknowledgedTextEdit(metadataOf(this))) return;
        write.call(this, value);
      },
    });
    guardedFields.add(span);
  }

  function unguardRendererText(span: HTMLElement): void {
    if (!guardedFields.has(span)) return;
    Reflect.deleteProperty(span, 'textContent');
    guardedFields.delete(span);
  }

  function ownValueAtPath(value: Record<string, unknown>, path: string): unknown {
    let current: unknown = value;
    for (const segment of path.split('.')) {
      if (
        segment === '' ||
        segment === '__proto__' ||
        segment === 'prototype' ||
        segment === 'constructor' ||
        typeof current !== 'object' ||
        current === null ||
        !Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  function reconcileExternalDrafts(
    drafts: Readonly<Record<string, Record<string, unknown>>>,
    entryIds: readonly string[]
  ): void {
    const accepted = new Set(entryIds);
    root.querySelectorAll<HTMLElement>('[data-eldra-entry][data-eldra-field]').forEach((field) => {
      // Template fields may combine literals and several source values. The
      // template renderer applies accepted drafts; copying one raw source
      // scalar over its derived text would discard that composition.
      if (field.closest('[data-eldra-template-block]') !== null) return;
      // §4.2: a rich-text root's document is not a plain scalar string;
      // leave it to the theme component's own editor/read-render sync.
      if (field.closest('[data-eldra-rich-text]') !== null) return;
      const meta = metadataOf(field);
      if (!accepted.has(meta.entryId)) return;
      if (!Object.prototype.hasOwnProperty.call(drafts, meta.entryId)) return;
      const draft = drafts[meta.entryId];
      if (draft === undefined) return;
      const value = ownValueAtPath(draft, meta.fieldPath);
      if (typeof value !== 'string') return;
      const cleaned = stripStega(value);
      // This is also where an echo is recognised as the acknowledgement of
      // what the overlay posted. Until one arrives, the draft cannot describe
      // what the operator has typed: writing it would delete those keystrokes,
      // and replacing the caret's text node would take the caret with it. The
      // renderer may already have drawn that stale value — `restoreEditingFocus`
      // has just undone it, and this must not write it straight back.
      if (!acceptTextEditEcho(meta, cleaned)) return;
      const text = field.firstChild;
      if (field.childNodes.length !== 1 || text?.nodeType !== Node.TEXT_NODE) return;
      const textNode = text as Text;
      if (textNode.data !== cleaned) textNode.data = cleaned;
    });
  }

  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  /** The href this element navigates through, however it is authored: the
   * plain `href` attribute, or — legacy SVG (`<a xlink:href="…">`, still
   * valid outside SVG2) — the `xlink:href` attribute in the XLink
   * namespace. `null` when neither is present. */
  function hrefValueOf(element: Element): string | null {
    if (element.hasAttribute('href')) return element.getAttribute('href');
    return element.getAttributeNS(XLINK_NS, 'href');
  }

  /**
   * Navigation guard: the first element (innermost first, walking up through
   * shadow boundaries) in `event`'s composed path that carries an `href` —
   * an `a[href]`, an `area[href]`, a legacy SVG `<a xlink:href>`, or
   * anything else authored with a plain or XLink `href`. `composedPath()`
   * rather than `event.target`/bubbling ancestors because the overlay host
   * is a closed shadow root; a click that lands on shadow content still
   * needs the theme's own light-DOM anchors it passed through on the way
   * out.
   */
  function hrefElementInPath(event: Event): Element | null {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element && hrefValueOf(node) !== null) return node;
    }
    return null;
  }

  /**
   * §18-adjacent (navigation guard): while the preview bridge is connected —
   * `start()` through `stop()`, covering both `edit` and `preview` mode —
   * Studio owns navigation, not the embedded iframe. A click that would
   * follow a link's href (however it got there: a plain click, a modifier
   * click that would normally open a new tab) is prevented outright;
   * nothing here special-cases the button or modifier keys, so every one of
   * those is caught by the same unconditional preventDefault. A real middle
   * click never reaches this as a `click` at all — the browser fires
   * `auxclick` for any non-primary button instead — so this same handler is
   * also registered for `auxclick` (see `start()`), not just `click`. An
   * anchor inside a rich-text root being edited is not exempted either —
   * putting the caret in a link's text must not navigate, the same as
   * anywhere else in the document.
   *
   * Registered on `document` — not `eventTarget` — because a nav bar or
   * footer link is not necessarily inside whatever subtree a scoped `root`
   * overlay instance scans; the guard's job is the whole embedded page, not
   * just the blocks the overlay decorates.
   *
   * Deliberately does not stop propagation: `onClick` below still needs to
   * run for its own selection bookkeeping (`theme:block-clicked` /
   * `theme:field-clicked`) even when the click also happened to land on a
   * link — the navigation is prevented first, then the existing handling
   * runs exactly as it would without a href present. (`onClick` itself is
   * only ever wired to `click`, so this is moot for the `auxclick` case —
   * there is nothing downstream to let run — but the same function handles
   * both events, so the same non-stopping behavior applies to both.)
   *
   * Out of scope: a `window.location` change the theme's own JS makes
   * directly (a router push, an imperative redirect) is not a navigation
   * this guard sees at all — it only ever intercepts the DOM events a link
   * click or a form submission dispatch. Studio moves the embedded preview
   * between pages via its own `editor:navigate` message instead.
   */
  function onNavigationClick(event: Event): void {
    const element = hrefElementInPath(event);
    if (element === null) return;
    event.preventDefault();
    // eslint-disable-next-line no-console
    console.debug('[eldra] navigation prevented', hrefValueOf(element));
  }

  /** Navigation guard (submit half): a form posting/navigating the embedded
   * iframe is exactly the same problem a link click is — prevented
   * unconditionally while the bridge is connected. */
  function onNavigationSubmit(event: Event): void {
    event.preventDefault();
  }

  function onClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    if (target === null) return;
    if (mode === 'edit') {
      const framed = framingEnabled ? framingImageFor(target) : null;
      if (framed !== null && ownsSelectedBlock(framed)) {
        if (framing === null || framing.image !== framed) enterFraming(framed);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (framing !== null && !framing.image.contains(target)) exitFraming();
    }
    const field = target.closest<HTMLElement>('[data-eldra-field]');
    // §4.2: a rich-text root carries data-eldra-field itself (its interior is
    // never decorated, so `field` above always resolves to the root for a
    // click anywhere inside it). It mirrors the framing ownership rule (see
    // ownsSelectedBlock): the first click on an unselected block only
    // selects it (fall through to block-clicked below, no field-clicked);
    // once its block is already selected, a click posts field-clicked only
    // and the theme component activates its own editor on that same click.
    const richTextRoot =
      field !== null && field.hasAttribute('data-eldra-rich-text') ? field : null;
    if (richTextRoot !== null && mode === 'edit') {
      const block = richTextRoot.closest<HTMLElement>('[data-eldra-block]');
      if (block !== null && block === selectedElement()) {
        opts.post('theme:field-clicked', {
          ...metadataOf(richTextRoot),
          ...layoutIdentityOf(richTextRoot),
          rect: rectOf(richTextRoot),
        });
        // The document can contain links, and this click is the one that
        // puts the caret in the theme's own render: let it keep propagating
        // but never navigate the iframe.
        event.preventDefault();
        return;
      }
      // Not yet the selected block: fall through to the block-clicked
      // handling below so the first click selects it.
    } else if (field !== null) {
      opts.post('theme:field-clicked', {
        ...metadataOf(field),
        ...layoutIdentityOf(field),
        rect: rectOf(field),
      });
      if (mode === 'edit') return;
    }
    const block = target.closest<HTMLElement>('[data-eldra-block]');
    if (block === null) return;
    const layoutNode =
      target.closest<HTMLElement>('[data-eldra-layout-node]') ??
      block.closest<HTMLElement>('[data-eldra-layout-node]');
    const layoutNodeId = layoutNode?.getAttribute('data-eldra-layout-node') || undefined;
    const reusablePlacementId =
      layoutNode?.getAttribute('data-eldra-reusable-placement') || undefined;
    opts.post('theme:block-clicked', {
      entryId: block.getAttribute('data-eldra-block') ?? '',
      schemaApiId: block.getAttribute('data-eldra-schema') ?? '',
      rect: rectOf(block),
      ...(layoutNodeId ? { layoutNodeId } : {}),
      ...(reusablePlacementId ? { reusablePlacementId } : {}),
      ...hiddenAtBreakpoint(block),
    });
    if (mode === 'edit') {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onPointerOver(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const block = target?.closest('[data-eldra-block]') ?? null;
    hoveredElement = block;
    if (hoverBox !== null) positionBox(hoverBox, block);
    scheduleHoverReport('change');
  }

  /** Clears the tracked hover once the pointer actually leaves the document
   * (relatedTarget null on the bubbled pointerout), so a stale hover does
   * not get re-anchored by the next scroll/resize. */
  function onPointerOut(event: Event): void {
    if ((event as PointerEvent).relatedTarget !== null) return;
    hoveredElement = null;
    if (hoverBox !== null) positionBox(hoverBox, null);
    scheduleHoverReport('change');
  }

  function layoutNodes(): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('[data-eldra-layout-node]')];
  }

  function resolveSlotMarker(clientX: number, clientY: number): DropTarget | null {
    // Editor-only slot markers (theme-vue marker mode) are few — ≤12 per host —
    // so a direct bounded scan is fine. Only visible markers (non-empty rect)
    // are considered; hidden markers fall through to the node hit-test.
    const markers = root.querySelectorAll<HTMLElement>('[data-eldra-slot-marker]');
    for (const marker of markers) {
      const rect = marker.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      )
        continue;
      const layoutNodeId = marker.getAttribute('data-eldra-layout-node-id') ?? '';
      const slotId = marker.getAttribute('data-eldra-slot-id') ?? '';
      if (layoutNodeId === '' || slotId === '') continue;
      return { layoutNodeId, placement: 'inside', rect: rectOf(marker), slotId };
    }
    return null;
  }

  function resolveCanvasPlacement(clientX: number, clientY: number): DropTarget | null {
    // Slot markers win over node bands: a drop aimed at a slot region resolves
    // to the host layout node with placement 'inside' + slotId, before the
    // normal node hit-test below runs.
    const slotTarget = resolveSlotMarker(clientX, clientY);
    if (slotTarget !== null) return slotTarget;
    // Same band math as Studio: vertical bands over each node rect.
    // Matches resolve innermost-first (reverse document order) so a pointer
    // over nested nodes targets the most specific layout node.
    const nodes = [...layoutNodes()].reverse().filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    let hit: HTMLElement | null = null;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (
        clientY >= rect.top &&
        clientY <= rect.bottom &&
        clientX >= rect.left &&
        clientX <= rect.right
      ) {
        hit = node;
        break;
      }
    }
    if (!hit) return null;
    const rect = hit.getBoundingClientRect();
    const ratio = (clientY - rect.top) / Math.max(rect.height, 1);
    const isContainer =
      hit.querySelector('[data-eldra-layout-node]') !== null || hit.children.length > 0;
    // The theme cannot know container semantics authoritatively; it reports the
    // geometry-derived band and Studio validates. Containers are approximated by
    // "has nested layout nodes" — placement 'inside' is only emitted for those.
    if (isContainer && ratio >= 0.25 && ratio <= 0.75) {
      return {
        layoutNodeId: hit.getAttribute('data-eldra-layout-node') ?? '',
        placement: 'inside',
        rect: rectOf(hit),
      };
    }
    return {
      layoutNodeId: hit.getAttribute('data-eldra-layout-node') ?? '',
      placement: ratio < 0.5 ? 'before' : 'after',
      rect: rectOf(hit),
    };
  }

  function positionDropIndicator(target: DropTarget): void {
    if (!dropIndicator) return;
    if (target.placement === 'inside') {
      positionBox(dropIndicator, null);
      return;
    } // no line inside: theme outline is enough
    Object.assign(dropIndicator.style, {
      display: 'block',
      left: `${target.rect.x}px`,
      top: `${target.placement === 'before' ? target.rect.y : target.rect.y + target.rect.height}px`,
      width: `${target.rect.width}px`,
      height: '2px',
    });
  }

  function clearDropIndicator(): void {
    if (dropIndicator) dropIndicator.style.display = 'none';
  }

  function onDragPointerMove(event: PointerEvent): void {
    if (!dragPayload) return;
    const target = resolveCanvasPlacement(event.clientX, event.clientY);
    opts.post('theme:drop-candidate', target);
    if (target) positionDropIndicator(target);
    else clearDropIndicator();
  }

  function onDragPointerUp(event: PointerEvent): void {
    if (!dragPayload) return;
    const target = resolveCanvasPlacement(event.clientX, event.clientY);
    if (target) {
      opts.post('theme:node-dropped', {
        payload: dragPayload,
        layoutNodeId: target.layoutNodeId,
        placement: target.placement,
        ...(target.slotId !== undefined ? { slotId: target.slotId } : {}),
      });
    }
    dragPayload = null;
    clearDropIndicator();
    window.removeEventListener('pointermove', onDragPointerMove, true);
    window.removeEventListener('pointerup', onDragPointerUp, true);
  }

  function onInput(event: Event): void {
    const target = elementTargetOf(event);
    // §4.2: a rich-text root carries data-eldra-field itself, so every
    // keystroke inside it reaches here. Its value is a document, not the
    // flattened textContent this path posts, and rememberEditing would make
    // the root the activeEdit — letting restoreEditingFocus overwrite the
    // rich-text render. §18 v3 answers that keystroke on its own terms.
    if (target?.closest('[data-eldra-rich-text]') != null) {
      onRichTextInput(event);
      return;
    }
    const span = target?.closest<HTMLElement>('[data-eldra-field]') ?? null;
    if (span === null || mode !== 'edit') return;
    rememberEditing(span, true);
    const pending = debounceTimers.get(span);
    if (pending !== undefined) clearTimeout(pending);
    debounceTimers.set(
      span,
      setTimeout(() => {
        debounceTimers.delete(span);
        const meta = metadataOf(span);
        const value = stripStega(span.textContent ?? '');
        // Remember it until the editor echoes it back: see
        // `hasUnacknowledgedTextEdit`.
        postedText.set(textEditKey(meta), value);
        opts.post('theme:text-edited', {
          ...meta,
          ...layoutIdentityOf(span),
          value,
        });
      }, TEXT_EDIT_DEBOUNCE_MS)
    );
  }

  /** An event's target as an element: a DOM event inside a contenteditable
   * names the element in browsers, but a text node is a legal target and
   * `closest` only exists on elements. */
  function elementTargetOf(event: Event): Element | null {
    const node = event.target instanceof Node ? event.target : null;
    if (node === null) return null;
    return node.nodeType === 1 ? (node as Element) : node.parentElement;
  }

  /**
   * §18 v3: the browser has just performed the edit classified as native in
   * `beforeinput`. Report it against the range captured there — the DOM has
   * already moved, so re-reading it now would describe the result rather than
   * the change. A composition reports on `compositionend` only, never here.
   */
  function onRichTextInput(event: Event): void {
    const pending = pendingNativeInput;
    if (pending === null) return;
    if (isInputEvent(event) && event.isComposing === true) return;
    // The pending op belongs to the root its `beforeinput` came from. An
    // `input` from a different root means the first one never produced one
    // (the browser refused it, or focus moved between the two events), so the
    // stale capture is discarded rather than reported against the wrong field.
    const element = editableRichTextRootOf(event.target instanceof Node ? event.target : null);
    pendingNativeInput = null;
    // Defensive: `onBeforeInput`'s gate means `pendingNativeInput` should
    // never be set for a root that is not marked editing, but this checks it
    // again anyway rather than trusting that invariant to hold forever —
    // cheap, and it closes the hole outright if it is ever reopened.
    if (
      element === null ||
      richTextKeyOf(element) !== pending.key ||
      !isRichTextEditingActive(element)
    ) {
      return;
    }
    const data = isInputEvent(event) && typeof event.data === 'string' ? event.data : pending.data;
    postNativeRichTextInput(pending, data);
  }

  function onFocusIn(event: Event): void {
    const target = elementTargetOf(event);
    // §4.2, as in onInput: focus landing inside a mounted editor must not make
    // the rich-text root the activeEdit. It must still clear whatever edit was
    // remembered — focus entering the editor is focus leaving every
    // overlay-owned field — or the next decorateStegaTextNodes pass would
    // restore that stale edit, re-focusing its span and stealing focus from
    // ProseMirror (and, when dirty, overwriting the renderer's text).
    const richTextRoot = target?.closest<HTMLElement>('[data-eldra-rich-text]') ?? null;
    if (richTextRoot !== null) {
      activeEdit = null;
      // Focus can land on a root before Studio has activated it (or after it
      // stopped being activated, on a rerender that replaced the marked
      // element). Re-report the selection so Studio gets a chance to catch up
      // without waiting on the operator to type first.
      if (!isRichTextEditingActive(richTextRoot)) reportRichTextSelection();
      return;
    }
    const span = target?.closest<HTMLElement>('[data-eldra-field]') ?? null;
    if (span !== null && mode === 'edit') rememberEditing(span);
    else activeEdit = null;
  }

  /**
   * §18 v3 (floating toolbar): focus leaving an editable root to somewhere
   * else *in this document* is a blur — the toolbar has nothing left to float
   * over. `relatedTarget === null` means focus left the iframe window
   * entirely (typically to Studio's own floating toolbar after a command);
   * that is not a blur, and Studio — not the theme — decides what happens
   * next, so nothing is posted. `relatedTarget` inside the same root (an
   * interactive descendant, e.g. a link) is not a departure either. Focus
   * coming back later reports a normal selection through the existing
   * focusin/selectionchange paths.
   */
  function onFocusOut(event: Event): void {
    const target = elementTargetOf(event);
    const richTextRoot = editableRichTextRootOf(target);
    if (richTextRoot === null) return;
    const relatedTarget = (event as FocusEvent).relatedTarget;
    if (relatedTarget === null) return;
    if (relatedTarget instanceof Node && richTextRoot.contains(relatedTarget)) return;
    postRichTextBlur();
  }

  function reposition(): void {
    // A rerender can replace the hovered node outright (same block re-mounted
    // as a new element) without ever firing pointerout on it; the detached
    // node's rect would otherwise keep being read as if it were still live.
    // Clear rather than re-query: the hover box should wait for a fresh
    // pointerover onto whatever replaced it.
    if (hoveredElement !== null && !hoveredElement.isConnected) hoveredElement = null;
    if (hoverBox !== null) positionBox(hoverBox, hoveredElement);
    if (selectedBox !== null) positionBox(selectedBox, selectedElement());
    if (framing !== null) positionFramingChrome();
    scheduleReportBlocks();
    scheduleHoverReport('geometry');
    scheduleRichTextSync();
    scheduleRichTextSelectionRepost();
  }

  /**
   * Report the hovered block to the editor, coalesced to one post per
   * animation frame so a pointer sweep or a scroll burst does not flood the
   * bridge. `reason` separates the two callers: a pointer event ('change')
   * posts only when the hovered block is a different one, while 'geometry' —
   * every `reposition()`, so a scroll or resize but equally a selection
   * change or a rerender — re-posts the same block's rect, which may well be
   * the rect already sent. Either way, with nothing hovered the only post
   * left to make is the leave message.
   */
  function scheduleHoverReport(reason: 'change' | 'geometry'): void {
    if (!started || !blockHoverEnabled || mode !== 'edit') return;
    if (hoveredElement === null) {
      // Nothing is hovered, so there is no geometry to refresh: the only
      // thing left to report is the leave message, and only when a block was
      // actually reported before. This is also the rerender case —
      // `reposition()` clears a detached hovered element before scheduling,
      // and the editor's affordance would otherwise stay anchored to a block
      // that no longer exists, with no pointerout ever coming for it.
      if (reportedHoverElement === null) return;
    } else if (reason === 'geometry') {
      hoverGeometryStale = true;
    } else if (hoveredElement === reportedHoverElement && !hoverGeometryStale) {
      // Pointerover fires for every descendant the pointer crosses; the
      // block behind them is the same one that was already reported.
      return;
    }
    if (hoverReportRaf !== null) return;
    hoverReportRaf = requestAnimationFrame(() => {
      hoverReportRaf = null;
      const stale = hoverGeometryStale;
      hoverGeometryStale = false;
      reportHoveredBlock(stale);
    });
  }

  /**
   * Posts the hovered block's identity and rect, or `null` once a block that
   * was reported stops being hovered. `refreshGeometry` is the scroll/resize
   * path: the block is unchanged but its rect is not, so the dedupe against
   * `reportedHoverElement` must not swallow the post.
   *
   * A rerender can detach the hovered node without any pointerout (the same
   * case `reposition()` guards for the hover box), so a disconnected element
   * counts as no hover and posts the leave message.
   */
  function reportHoveredBlock(refreshGeometry: boolean): void {
    if (!started || !blockHoverEnabled || mode !== 'edit') return;
    const block = hoveredElement !== null && hoveredElement.isConnected ? hoveredElement : null;
    // Nothing hovered and nothing reported: there is no leave to report, and
    // `refreshGeometry` must not manufacture one. A pointerover, a scroll and
    // a pointer-leave inside one frame reach exactly this state — the
    // pointerover arms the frame, the scroll marks the geometry stale, the
    // leave empties the hover before anything was ever posted — and a `null`
    // here would be a leave message for a hover the editor never heard about.
    if (block === null && reportedHoverElement === null) return;
    if (block === reportedHoverElement && !refreshGeometry) return;
    reportedHoverElement = block;
    if (block === null) {
      opts.post('theme:block-hovered', null);
      return;
    }
    opts.post('theme:block-hovered', {
      // The identity is the block's, never the hovered descendant's — a field
      // or a node inside a rich-text editing root reports the block that
      // contains it and nothing finer.
      entryId: block.getAttribute('data-eldra-block') ?? '',
      rect: rectOf(block),
      ...layoutIdentityOf(block),
    });
  }

  /** Forget the reported hover without posting a leave message — for the
   * transitions Studio itself drove (a mode change, the capability closing,
   * teardown), where the other side either knows already or cannot receive
   * the post at all. */
  function forgetReportedHover(): void {
    reportedHoverElement = null;
    hoverGeometryStale = false;
    if (hoverReportRaf !== null) {
      cancelAnimationFrame(hoverReportRaf);
      hoverReportRaf = null;
    }
  }

  /** Studio anchors its floating chrome to block rects reported over
   * `theme:blocks-rendered`; the iframe can scroll (or be resized)
   * internally without any DOM mutation the MutationObserver would catch,
   * so reposition() (bound to window scroll/resize) also re-reports block
   * geometry here — coalesced to one post per animation frame so a
   * scroll burst does not flood the bridge. */
  function scheduleReportBlocks(): void {
    if (!started || blocksRaf !== null) return;
    blocksRaf = requestAnimationFrame(() => {
      blocksRaf = null;
      reportBlocks();
    });
  }

  function reportBlocks(): void {
    const blocks = [...root.querySelectorAll<HTMLElement>('[data-eldra-block]')].map((block) => {
      const layoutNode = block.closest<HTMLElement>('[data-eldra-layout-node]');
      const layoutNodeId = layoutNode?.getAttribute('data-eldra-layout-node') || undefined;
      const reusablePlacementId =
        layoutNode?.getAttribute('data-eldra-reusable-placement') || undefined;
      return {
        entryId: block.getAttribute('data-eldra-block') ?? '',
        rect: rectOf(block),
        ...(layoutNodeId ? { layoutNodeId } : {}),
        ...(reusablePlacementId ? { reusablePlacementId } : {}),
        ...hiddenAtBreakpoint(block),
      };
    });
    opts.post('theme:blocks-rendered', { blocks });
  }

  /**
   * Is *this* element's own layout node hidden at the breakpoint currently in
   * force? Strictly own-node: a block inside a hidden container reports
   * nothing, because unhiding it is a different act from unhiding its parent
   * and Studio needs to tell the two apart.
   *
   * `data-eldra-hidden` is the node's own list of hidden breakpoints, put
   * there by the framework binding at render time; `activeLayoutBreakpoint`
   * resolves the viewport against the same three ranges the layout CSS wrote
   * its `@media` blocks with. Reading `display` instead would not work in edit
   * mode, which is the only mode that asks: there the node is deliberately
   * still displayed.
   *
   * Spread into a payload, so a visible block's message is byte-identical to
   * what it was before this field existed.
   */
  function hiddenAtBreakpoint(element: Element): { hiddenAtBreakpoint?: true } {
    const hidden = element.getAttribute('data-eldra-hidden');
    if (hidden === null) return {};
    const active = activeLayoutBreakpoint(window.innerWidth, opts.breakpoints);
    return hidden.split(' ').includes(active) ? { hiddenAtBreakpoint: true } : {};
  }

  /**
   * Edit mode keeps a breakpoint-hidden node on the canvas so the author can
   * still see and select it. The layout CSS gates its `display:none` on
   * `:not([data-eldra-edit-mode])` and dims the node when that attribute is
   * there, so all this has to do is put the attribute on the nodes a framework
   * binding marked `data-eldra-hidden` — after mount, like every other overlay
   * decoration, never during render, so server and client agree on the DOM.
   *
   * The name says *mode*, not "this element is being edited": the marker means
   * "the canvas is in edit mode, so do not hide me". `data-eldra-rich-text-editing`
   * is the one that marks an element actually under edit.
   */
  function applyHiddenEditing(): void {
    const editing = started && mode === 'edit';
    for (const element of root.querySelectorAll<HTMLElement>('[data-eldra-hidden]')) {
      if (editing) element.setAttribute('data-eldra-edit-mode', '');
      else element.removeAttribute('data-eldra-edit-mode');
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      mountHost();
      decorateStegaTextNodes();
      applyRichTextEditable();
      applyHiddenEditing();
      reportBlocks();
      // Registered before onClick, on document rather than eventTarget (see
      // onNavigationClick's doc comment) — navigation is prevented first,
      // then the existing block/field selection handling still runs.
      document.addEventListener('click', onNavigationClick, true);
      // A real middle click fires auxclick, not click — same handler, same
      // href-in-composed-path check, no propagation stop.
      document.addEventListener('auxclick', onNavigationClick, true);
      document.addEventListener('submit', onNavigationSubmit, true);
      eventTarget.addEventListener('click', onClick, true);
      eventTarget.addEventListener('pointerover', onPointerOver, true);
      eventTarget.addEventListener('pointerout', onPointerOut, true);
      eventTarget.addEventListener('input', onInput, true);
      eventTarget.addEventListener('focusin', onFocusIn, true);
      eventTarget.addEventListener('focusout', onFocusOut, true);
      eventTarget.addEventListener('beforeinput', onBeforeInput, true);
      eventTarget.addEventListener('compositionstart', onCompositionStart, true);
      eventTarget.addEventListener('compositionend', onCompositionEnd, true);
      // selectionchange only ever fires on the document, never on an element,
      // so it is the one listener that cannot be scoped to `eventTarget` when
      // a test passes a subtree as the root.
      document.addEventListener('selectionchange', onSelectionChange);
      window.addEventListener('scroll', reposition, true);
      window.addEventListener('resize', reposition);
      observer = new MutationObserver(onMutations);
      observer.observe(scanRoot(), { childList: true, characterData: true, subtree: true });
    },
    stop() {
      if (!started) return;
      started = false;
      // exitFraming() posts the null target while the bridge is still wired
      // up, then releases its own listeners; do this before the rest of
      // teardown removes the click listener it relies on for re-entry.
      exitFraming();
      // §18 v3: a torn-down bridge must not leave the page editable — the
      // caret would keep moving in a document nobody is listening to.
      clearRichTextEditing();
      mode = 'preview';
      applyRichTextEditable();
      // `started` is already false, so this strips the edit marker from every
      // node it put one on: a torn-down bridge must not leave the page showing
      // what the published site hides.
      applyHiddenEditing();
      richTextRevisions.clear();
      releaseAllRichTextRenders();
      if (blocksRaf !== null) {
        cancelAnimationFrame(blocksRaf);
        blocksRaf = null;
      }
      if (selectionRaf !== null) {
        cancelAnimationFrame(selectionRaf);
        selectionRaf = null;
      }
      if (richTextSelectionRepostRaf !== null) {
        cancelAnimationFrame(richTextSelectionRepostRaf);
        richTextSelectionRepostRaf = null;
      }
      observer?.disconnect();
      observer = null;
      document.removeEventListener('click', onNavigationClick, true);
      document.removeEventListener('auxclick', onNavigationClick, true);
      document.removeEventListener('submit', onNavigationSubmit, true);
      eventTarget.removeEventListener('click', onClick, true);
      eventTarget.removeEventListener('pointerover', onPointerOver, true);
      eventTarget.removeEventListener('pointerout', onPointerOut, true);
      eventTarget.removeEventListener('input', onInput, true);
      eventTarget.removeEventListener('focusin', onFocusIn, true);
      eventTarget.removeEventListener('focusout', onFocusOut, true);
      eventTarget.removeEventListener('beforeinput', onBeforeInput, true);
      eventTarget.removeEventListener('compositionstart', onCompositionStart, true);
      eventTarget.removeEventListener('compositionend', onCompositionEnd, true);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('pointermove', onDragPointerMove, true);
      window.removeEventListener('pointerup', onDragPointerUp, true);
      dragPayload = null;
      host?.remove();
      host = null;
      styleEl = null;
      hoverBox = null;
      hoveredElement = null;
      forgetReportedHover();
      selectedBox = null;
      dropIndicator = null;
      framingBox = null;
      framingBadge = null;
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
      postedText.clear();
      activeEdit = null;
      // The renderer's text setter is the theme's own DOM, not the overlay's:
      // hand every field back the platform one, or a destroyed overlay keeps
      // filtering writes on a page that has no editing surface left.
      root.querySelectorAll<HTMLElement>('[data-eldra-field]').forEach(unguardRendererText);
    },
    setMode(nextMode) {
      mode = nextMode;
      // No editing surface outside edit mode, so nothing is owned any more.
      if (nextMode !== 'edit') postedText.clear();
      if (nextMode !== 'edit') exitFraming();
      // §18 v3: leaving edit mode ends any Studio-hosted edit and takes the
      // editing surface with it. Clearing posts nothing — Studio drove the
      // mode change and knows it is over.
      if (nextMode !== 'edit') clearRichTextEditing();
      root.querySelectorAll<HTMLElement>('[data-eldra-field]').forEach(applyEditable);
      applyRichTextEditable();
      applyHiddenEditing();
      // Leaving edit mode must hide the selected box immediately, and
      // re-entering it must restore the box for the current selection,
      // without waiting on the next pointer/scroll/resize event.
      reposition();
      // Hover is otherwise event-driven (onPointerOver only), so it does not
      // naturally clear when the pointer stays put across a mode change: a
      // hover left over from edit mode would stay visible through preview,
      // and re-entering edit would resurrect that stale box before any new
      // pointerover. Hide it on every mode change; edit mode shows a hover
      // box again only once the pointer actually moves over a block. Clear
      // the tracked element too, so a later scroll/resize does not
      // re-anchor and re-show it before a fresh pointerover.
      hoveredElement = null;
      if (hoverBox !== null) positionBox(hoverBox, null);
      // The hover report goes with it, silently: Studio drove the mode change
      // and a preview-mode theme reports no hover at all.
      forgetReportedHover();
    },
    setSelected(entryId, layoutNodeId, reusablePlacementId) {
      selectedId = entryId;
      selectedLayoutNodeId = entryId === null ? null : (layoutNodeId ?? null);
      selectedReusablePlacementId = entryId === null ? null : (reusablePlacementId ?? null);
      if (framing !== null && (entryId === null || entryId !== framing.entryId)) exitFraming();
      reposition();
    },
    acceptExternalUpdate(entryIds) {
      if (activeEdit === null || !entryIds.includes(activeEdit.meta.entryId)) return;
      // The draft is authoritative for the *text*: retire the dirty flag so
      // nothing re-asserts a pre-update value over it. Keystrokes the editor
      // has not been told about yet are not described by this draft at all, so
      // `restoreEditingFocus` keeps owning those — see `hasUnflushedTextEdit`.
      //
      // The record itself is kept rather than dropped, because it is also
      // where the caret is, and the renderer is about to replace the very text
      // node the caret lives in; dropping it left the caret collapsed at
      // offset 0 of the field after every accepted echo, so the next keystroke
      // landed at the start of the heading.
      activeEdit = { ...activeEdit, dirty: false };
    },
    reconcileExternalDrafts,
    rescan() {
      decorateStegaTextNodes();
      // A rerender brings back roots without the editing surface on them.
      applyRichTextEditable();
      // ...and layout nodes without the edit-mode marker on them either.
      applyHiddenEditing();
      // Item 10: a framed image can be replaced by a rerender (same entry/
      // field attributes, new DOM node); re-resolve it or leave framing if
      // it is truly gone.
      if (framing !== null && !framing.image.isConnected) {
        const replacement = findFramingImage(framing.entryId, framing.fieldPath);
        if (replacement === null) {
          exitFraming();
        } else {
          detachFramingListeners(framing.image);
          framing.image = replacement;
          attachFramingListeners(replacement);
        }
      }
      // A rerender re-applies `style` and `data-eldra-framing-value` to the
      // framed image from the editor's *draft*, which trails a live gesture by
      // up to one settle window (the wheel's 200 ms) plus the editor's own
      // content-update debounce. Decide who owns the value:
      //
      //   gesture in flight -> the overlay owns it. Re-assert it, or the
      //     renderer's stale committed value stays on the image until the next
      //     commit echo lands and the operator sees the zoom snap back out.
      //   nothing pending   -> the draft owns it (inspector slider, keyboard
      //     nudge, reset, undo). Adopt it so the next gesture and the chrome
      //     continue from what is actually rendered.
      if (framing !== null) {
        if (framingGestureInFlight()) applyFraming();
        else {
          framing.value = parseImageFramingValueAttr(framing.image.dataset.eldraFramingValue);
          if (framingBadge !== null) framingBadge.textContent = `${framing.value.zoom.toFixed(1)}x`;
        }
      }
      reposition();
      reportBlocks();
    },
    setFramingMode(target) {
      if (target === null) {
        exitFraming();
        return;
      }
      if (!framingEnabled) return;
      const image = findFramingImage(target.entryId, target.fieldPath);
      if (image === null) return;
      enterFraming(image);
    },
    setFramingEnabled(enabled) {
      framingEnabled = enabled;
      if (!enabled) exitFraming({ silent: true });
    },
    setBlockHoverEnabled(enabled) {
      blockHoverEnabled = enabled;
      if (!enabled) forgetReportedHover();
    },
    setRichTextEditing(target, active) {
      if (!richTextEnabled) return;
      // Closing clears whatever is marked — Studio hosts at most one editor,
      // and a rerender may have replaced the element it opened over — but
      // releases only the field it names.
      if (!active) {
        unmarkRichTextEditing();
        releaseRichTextRenderFor(target);
        return;
      }
      const element = findRichTextRoot(
        target.entryId,
        target.fieldPath,
        target.locale,
        target.layoutNodeId,
        target.reusablePlacementId
      );
      // Fail safe: an unresolvable target (the field navigated away, or the
      // locale disagrees) must still end whatever session was running, or a
      // previously marked root stays hidden with no way back.
      if (element === null) {
        unmarkRichTextEditing();
        releaseRichTextRenderFor(target);
        return;
      }
      if (editingRichTextRoot !== null && editingRichTextRoot !== element) {
        // Moving to another field: the one being left is no longer being typed
        // into, but nothing else on the page has changed.
        const leaving = richTextIdentityOf(editingRichTextRoot);
        unmarkRichTextEditing();
        releaseRichTextRenderFor(leaving);
      }
      editingRichTextRoot = element;
      // Captured from the element itself, while it is still attached, so a
      // later reassert (after a rerender detaches it) has the fully-resolved
      // layoutNodeId/reusablePlacementId to find its replacement by — not
      // just whatever placement `target` happened to name (Studio may omit
      // it on a single-placement page).
      editingRichTextIdentity = richTextIdentityOf(element);
      applyRichTextEditing(element, true);
      // §18 v3 (the floating-toolbar follow-up): the root just became
      // able to accept commands — flush whatever a click-then-type burst
      // queued while it could not (that same gap) or Studio's
      // acceptRichTextApplied hasn't restored a selection for yet. A no-op
      // when nothing is queued, including the common case where Studio marks
      // the field before the operator has typed anything at all.
      flushPendingRichTextIntentsHere(element);
    },
    acceptRichTextApplied,
    isRichTextRenderDeferred(identity) {
      if (deferredRenders.has(richTextKey(identity))) return true;
      // A caller that does not know its placement — a framework component
      // asking about the field it renders — gets the conservative answer: if
      // any placement of this field is deferred, treat it as deferred. The
      // cost is one extra skipped re-render on a page that places the same
      // entry twice; the cost of the other answer is a lost caret.
      if (identity.layoutNodeId !== undefined || identity.reusablePlacementId !== undefined) {
        return false;
      }
      for (const { meta } of deferredRenders.values()) {
        if (
          meta.entryId === identity.entryId &&
          meta.fieldPath === identity.fieldPath &&
          meta.locale === identity.locale
        )
          return true;
      }
      return false;
    },
    onRichTextRenderState(listener) {
      richTextRenderListeners.add(listener);
      return () => {
        richTextRenderListeners.delete(listener);
      };
    },
    locateRichText(target) {
      if (!richTextEnabled) return;
      const element = findRichTextRoot(
        target.entryId,
        target.fieldPath,
        target.locale,
        target.layoutNodeId,
        target.reusablePlacementId
      );
      if (element === null) return;
      element.scrollIntoView?.({ block: 'nearest' });
      // §18 v3: "Edit on canvas" has to land the operator in the theme, not
      // just bring it on screen — focus the root and put the caret at the end,
      // which is also what fires the first selection report.
      if (mode !== 'edit' || !richTextEnabled) return;
      element.focus?.({ preventScroll: true });
      placeCaretAtEnd(element);
    },
    setRichTextEnabled(enabled) {
      richTextEnabled = enabled;
      if (!enabled) clearRichTextEditing();
      applyRichTextEditable();
    },
    setDragPayload(payload) {
      dragPayload = payload;
      clearDropIndicator();
      if (payload === null) {
        window.removeEventListener('pointermove', onDragPointerMove, true);
        window.removeEventListener('pointerup', onDragPointerUp, true);
      } else {
        window.addEventListener('pointermove', onDragPointerMove, true);
        window.addEventListener('pointerup', onDragPointerUp, true);
      }
    },
    chromeStyles() {
      return styleEl?.textContent ?? CHROME_STYLES;
    },
    chromeState() {
      const parsePx = (value: string): number => parseFloat(value) || 0;
      return {
        hover: {
          display: hoverBox?.style.display === 'block' ? 'block' : 'none',
          rect: {
            x: parsePx(hoverBox?.style.left ?? ''),
            y: parsePx(hoverBox?.style.top ?? ''),
            width: parsePx(hoverBox?.style.width ?? ''),
            height: parsePx(hoverBox?.style.height ?? ''),
          },
        },
        selected: selectedBox?.style.display === 'block' ? 'block' : 'none',
        framing: framingBox?.style.display === 'block' ? 'block' : 'none',
        frameRect: {
          x: parsePx(framingBox?.style.left ?? ''),
          y: parsePx(framingBox?.style.top ?? ''),
          width: parsePx(framingBox?.style.width ?? ''),
          height: parsePx(framingBox?.style.height ?? ''),
        },
      };
    },
  };
}
