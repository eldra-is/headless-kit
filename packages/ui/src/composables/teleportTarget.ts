import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';

/**
 * Whether an element is a dialog the browser has put in its **top layer**.
 *
 * `:modal` is the only way to ask: a `<dialog>` has the `open` attribute whether it was shown with
 * `show()` (an ordinary in-flow element, which clips and stacks like any other) or with
 * `showModal()` (top layer, above every z-index, with a backdrop), and nothing else in the DOM
 * tells the two apart. Engines that do not implement `:modal` answer `false` here — happy-dom
 * parses the selector and never matches it, jsdom does not implement `<dialog>` modality at all —
 * which is what the caller's fallback is for.
 *
 * Wrapped in a `try`: a selector an engine cannot parse is a `SyntaxError`, not a `false`.
 */
function isTopLayer(element: Element): boolean {
  try {
    return element.matches(':modal');
  } catch {
    return false;
  }
}

/**
 * The `<dialog>` a popup anchored to `anchor` has to be teleported *into* rather than escape, or
 * `null` when there is none.
 *
 * A **modal** dialog is the one place `document.body` is the wrong target: the dialog is in the top
 * layer, so a popup on the body would be painted behind it and no `z-index` could raise it. So the
 * nearest open ancestor dialog that is actually in the top layer wins — which is not always the
 * nearest one, since a non-modal `<dialog open>` may sit inside a modal one.
 *
 * When **no** ancestor dialog claims the top layer, the nearest open one is still the answer. That
 * case is ambiguous — either they really are all non-modal, or the engine does not implement
 * `:modal` and cannot say — and the two mistakes are not equally bad. Teleporting into a dialog
 * that did not need it still escapes everything between the control and that dialog, and the
 * dialog is a box the popup had no business overflowing anyway; teleporting to `body` out of a
 * dialog that *was* modal puts the popup behind it, invisibly, which is the very bug this whole
 * mechanism exists to fix. There is no engine-independent probe to break the tie —
 * `CSS.supports('selector(:modal)')` answers `true` for nonsense in happy-dom — so the safe
 * mistake is the one taken. A non-modal `<dialog open>` is in any case close to hypothetical here:
 * the design spec's non-negotiable 2 opens every modal surface with `showModal()`, and says the
 * non-modal popups are not dialogs at all.
 */
export function topLayerDialog(anchor: HTMLElement): HTMLElement | null {
  const nearest = anchor.closest<HTMLElement>('dialog[open]');
  if (nearest === null) return null;
  for (
    let dialog: HTMLElement | null = nearest;
    dialog !== null;
    dialog = dialog.parentElement?.closest<HTMLElement>('dialog[open]') ?? null
  ) {
    if (isTopLayer(dialog)) return dialog;
  }
  return nearest;
}

export interface UseTeleportTargetOptions {
  /** The element the popup is anchored to. */
  trigger: Ref<HTMLElement | null>;
  /**
   * Where the popup is rendered. Read once, like every `useFloating` option.
   *
   * - `true` — through a `<Teleport>` to `document.body`, or to the nearest **open native
   *   `<dialog>`** above the trigger when there is one (see `topLayerDialog`).
   * - a string — a CSS selector, passed to `<Teleport to>` verbatim.
   * - `false` — no teleport: `teleportDisabled` is `true` for good.
   */
  teleport: boolean | string;
  /**
   * Re-resolve the target whenever this changes — typically the popup's own open/visible state.
   * `closest()` answers about the DOM as it is, not reactively, so the lookup has to be re-run on
   * every open: a dialog that was closed the last time this popup opened may be open now.
   */
  isOpen: Ref<boolean>;
}

export interface UseTeleportTargetReturn {
  /**
   * `<Teleport to>`: the open `<dialog>` the trigger sits in, or `document.body`, or the
   * consumer's own selector. An **element** rather than a selector wherever one is known, so two
   * open dialogs cannot both answer the same query.
   */
  teleportTo: ComputedRef<HTMLElement | string>;
  /**
   * `<Teleport disabled>`: `true` until this component is mounted, and for good when
   * `teleport: false`.
   *
   * The mounted flag is what makes the teleport SSR-safe. `<Teleport>` renders its content into a
   * separate buffer on the server, and hydration then has to find it somewhere the server never
   * put it; `disabled` renders in place on both sides instead, and the real teleport happens once,
   * after mount, when Vue simply moves the nodes.
   */
  teleportDisabled: ComputedRef<boolean>;
}

/**
 * Where a teleported popup is rendered: `usePopover`'s and `Tooltip`'s shared answer to "escape
 * clipping and stacking, but not the browser's own top layer."
 *
 * A panel (or bubble) rendered inside its own control is at the mercy of everything above it: an
 * ancestor with `overflow: hidden` (a card, a table cell, a carousel track) clips it, and any later
 * sibling that starts a stacking context (a sticky header with a `z-index`, a section with
 * `isolate`) paints over it however high its own `z-index` is. On `body` neither can happen — except
 * for a native `<dialog>` opened with `showModal()`, which renders in the top layer above every
 * `z-index` on the page, so a popup teleported to `body` out from under one would be invisible
 * behind it. `topLayerDialog` is the one exception that rule needs.
 *
 * ```ts
 * const isOpen = ref(false);
 * const trigger = ref<HTMLElement | null>(null);
 * const { teleportTo, teleportDisabled } = useTeleportTarget({ trigger, teleport: true, isOpen });
 * ```
 */
export function useTeleportTarget(options: UseTeleportTargetOptions): UseTeleportTargetReturn {
  const { trigger, teleport, isOpen } = options;

  /**
   * Only `true` after `onMounted`, which never runs on the server. Everything that reads the
   * document below is behind it.
   */
  const isMounted = ref(false);
  onMounted(() => {
    isMounted.value = true;
  });

  const teleportDisabled = computed(() => teleport === false || !isMounted.value);

  const teleportTo = computed<HTMLElement | string>(() => {
    if (!isMounted.value) return 'body';
    if (typeof teleport === 'string') return teleport;
    void isOpen.value;
    const anchor = trigger.value;
    return (anchor === null ? null : topLayerDialog(anchor)) ?? document.body;
  });

  return { teleportTo, teleportDisabled };
}
