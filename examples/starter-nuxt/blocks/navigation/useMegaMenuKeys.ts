/**
 * The header bar's mega-menu keyboard model, kept out of `Block.vue` because it is a self-contained
 * piece of behaviour over the bar's own DOM — the block keeps the open state and this drives focus
 * through it.
 *
 * The pattern is the WAI-ARIA APG's **Disclosure Navigation Menu** with its arrow-key extension.
 * Not a `combobox` (that role belongs to a text input) and not a `menubar` (these are site
 * navigation links, not application commands), so there is no `role="menu"`, no
 * `aria-activedescendant` and no roving `tabindex`: focus moves to the real links with `.focus()`,
 * every one of them stays in the tab sequence, and the only ARIA on the trigger is
 * `aria-expanded` / `aria-controls`.
 *
 * Reading order is the DOM's: the bar's list renders one `<li>` per resolved link — the trigger (or
 * plain link) first, then that item's panel — so the `<li>`'s position *is* the `links` index, and
 * a panel's links come out of `querySelectorAll` already in the order a visitor reads them (the
 * group columns, then the trailing "View all" row). Nothing here keeps a parallel list of elements
 * that could fall out of step with what is rendered.
 *
 * Arrow keys clamp at both ends rather than wrapping: a visitor holding ArrowDown should stop at
 * the last row instead of silently landing back on the first.
 */
import { nextTick, type Ref } from 'vue';

/** A focusable top-level item of the bar's list, with the `links` index its `<li>` sits at. */
interface TopLevelItem {
  el: HTMLElement;
  index: number;
}

/** Where focus is when an arrow key crosses to another top-level item: on the bar's own row of
 *  items, or down inside one of their panels. */
type Origin = 'bar' | 'panel';

type Edge = 'first' | 'last';

export interface MegaMenuKeysOptions {
  /** The bar's own `<ul>` of top-level items (`null` while the bar renders without it). */
  list: Ref<HTMLElement | null>;
  /** Which panel is open, `null` for none. */
  openIndex: Ref<number | null>;
  /** Whether the item at `index` has a mega-menu panel at all. */
  hasPanel: (index: number) => boolean;
  /** Open `index`'s panel (closing any other) as a keyboard-owned one, which hover never closes. */
  open: (index: number) => void;
  /** Toggle `index`'s panel. */
  toggle: (index: number) => void;
  /** Close whatever is open, leaving focus where it is. */
  close: () => void;
  /** Close `index`'s panel and put focus back on its trigger. */
  closeAndFocusTrigger: (index: number) => void;
}

export interface MegaMenuKeys {
  onTriggerKeydown: (index: number, event: KeyboardEvent) => void;
  onPanelKeydown: (index: number, event: KeyboardEvent) => void;
  onBarLinkKeydown: (index: number, event: KeyboardEvent) => void;
}

export function useMegaMenuKeys(options: MegaMenuKeysOptions): MegaMenuKeys {
  function itemElement(index: number): HTMLElement | null {
    const li = options.list.value?.children[index];
    return li instanceof HTMLElement ? li : null;
  }

  /**
   * The bar's focusable top-level items in bar order: a mega-menu trigger (`<button>`) or a plain
   * link (`<a>`), each the first element child of its `<li>`. This walks the `<li>` children rather
   * than querying the list for `a, button` because an open panel's own links live deeper in that
   * same `<li>` and must never be mistaken for a top-level item. An item whose destination no
   * longer resolves renders as a `<span>`: not focusable, so an arrow key steps over it instead of
   * landing on a dead row.
   */
  function topLevelItems(): TopLevelItem[] {
    const list = options.list.value;
    if (list === null) return [];
    const items: TopLevelItem[] = [];
    const rows = Array.from(list.children);
    for (let index = 0; index < rows.length; index += 1) {
      for (const child of Array.from(rows[index]!.children)) {
        if (child instanceof HTMLElement && (child.tagName === 'BUTTON' || child.tagName === 'A')) {
          items.push({ el: child, index });
          break;
        }
      }
    }
    return items;
  }

  /**
   * One panel's focusable links, in the panel's own DOM order. A row with no destination renders as
   * a `<span>`, so `a[href]` doubles as the "is it focusable" test; `button` is matched too so a
   * panel part that grows one later is walked without a change here.
   */
  function panelLinks(index: number): HTMLElement[] {
    const panel = itemElement(index)?.querySelector('[data-eldra-mega-panel]');
    if (!(panel instanceof HTMLElement)) return [];
    return Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
  }

  function clamp(position: number, length: number): number {
    return Math.min(Math.max(position, 0), length - 1);
  }

  /**
   * The panel is `v-show`n, so between the open state changing and Vue flushing it the element is
   * still `display: none` — and `focus()` on a hidden element does nothing. Always focus on the
   * next tick, which is also harmless when the panel was open already (Home/End inside one).
   */
  function focusPanelEdge(index: number, edge: Edge): void {
    void nextTick(() => {
      const links = panelLinks(index);
      const target = edge === 'first' ? links[0] : links[links.length - 1];
      target?.focus();
    });
  }

  function focusPanelLink(index: number, position: number): void {
    const links = panelLinks(index);
    if (links.length === 0) return;
    links[clamp(position, links.length)]?.focus();
  }

  /** Which link in the panel has focus now, `-1` when focus sits somewhere else in it. */
  function focusedPanelPosition(index: number): number {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (active === null) return -1;
    return panelLinks(index).findIndex((link) => link === active || link.contains(active));
  }

  /**
   * Moves focus to another top-level item, and takes the open panel with it.
   *
   * From a trigger, focus lands on the next trigger or plain link — and if a panel was open, moving
   * onto another trigger opens *that* one, so arrowing along the bar reads as walking the open
   * menu rather than closing it and starting again. From inside a panel, focus lands at the same
   * level it left: the next trigger's panel opens and focus goes to its first link. Either way a
   * plain link just takes focus and the open panel closes behind it.
   */
  function focusTopLevel(position: number, from: Origin): void {
    const items = topLevelItems();
    const target = items[position];
    if (target === undefined) return;
    const wasOpen = options.openIndex.value !== null;
    if (options.hasPanel(target.index) && (from === 'panel' || wasOpen)) {
      options.open(target.index);
      if (from === 'panel') {
        focusPanelEdge(target.index, 'first');
        return;
      }
    } else if (wasOpen) {
      options.close();
    }
    target.el.focus();
  }

  /** ArrowRight / ArrowLeft: one step along the bar, clamped at both ends. */
  function stepTopLevel(index: number, delta: number, from: Origin): void {
    const items = topLevelItems();
    const position = items.findIndex((item) => item.index === index);
    if (position === -1) return;
    const next = clamp(position + delta, items.length);
    // Already at that end: nothing moves, and focus stays exactly where the visitor left it.
    if (next === position) return;
    focusTopLevel(next, from);
  }

  /** Home / End on an item in the bar: its first or last item. */
  function edgeTopLevel(edge: Edge, from: Origin): void {
    const items = topLevelItems();
    if (items.length === 0) return;
    focusTopLevel(edge === 'first' ? 0 : items.length - 1, from);
  }

  function onTriggerKeydown(index: number, event: KeyboardEvent): void {
    // `preventDefault` is called only on the keys handled here, so page scrolling and every
    // shortcut this block has no business in behave exactly as they do anywhere else.
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        options.toggle(index);
        return;
      case 'Escape':
        if (options.openIndex.value !== index) return;
        event.preventDefault();
        options.closeAndFocusTrigger(index);
        return;
      // ArrowDown / ArrowUp open the panel if it is closed and step straight into it, at the end
      // the key points at — the APG's own "open and move focus into the disclosure" keys.
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (options.openIndex.value !== index) options.open(index);
        focusPanelEdge(index, event.key === 'ArrowDown' ? 'first' : 'last');
        return;
      }
      case 'ArrowRight':
        event.preventDefault();
        stepTopLevel(index, 1, 'bar');
        return;
      case 'ArrowLeft':
        event.preventDefault();
        stepTopLevel(index, -1, 'bar');
        return;
      case 'Home':
        event.preventDefault();
        edgeTopLevel('first', 'bar');
        return;
      case 'End':
        event.preventDefault();
        edgeTopLevel('last', 'bar');
        return;
      default:
        return;
    }
  }

  /**
   * The same left/right/Home/End travel along the bar, for a top-level item that is a plain link
   * rather than a disclosure. Without it the arrow keys would be a one-way street: a visitor
   * arrowing out of a mega-menu onto an ordinary link could not arrow any further, and the bar's
   * row would read as navigable in one direction only. Down and up are *not* handled here — a plain
   * link has no panel to open, so those keys stay the page's own scroll.
   */
  function onBarLinkKeydown(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        stepTopLevel(index, 1, 'bar');
        return;
      case 'ArrowLeft':
        event.preventDefault();
        stepTopLevel(index, -1, 'bar');
        return;
      case 'Home':
        event.preventDefault();
        edgeTopLevel('first', 'bar');
        return;
      case 'End':
        event.preventDefault();
        edgeTopLevel('last', 'bar');
        return;
      default:
        return;
    }
  }

  function onPanelKeydown(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        options.closeAndFocusTrigger(index);
        return;
      // Down and up walk the panel's own reading order, clamped at its ends; Home and End jump to
      // them. Tab still moves through the very same links, in the very same order.
      case 'ArrowDown':
        event.preventDefault();
        focusPanelLink(index, focusedPanelPosition(index) + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        focusPanelLink(index, focusedPanelPosition(index) - 1);
        return;
      case 'Home':
        event.preventDefault();
        focusPanelEdge(index, 'first');
        return;
      case 'End':
        event.preventDefault();
        focusPanelEdge(index, 'last');
        return;
      case 'ArrowRight':
        event.preventDefault();
        stepTopLevel(index, 1, 'panel');
        return;
      case 'ArrowLeft':
        event.preventDefault();
        stepTopLevel(index, -1, 'panel');
        return;
      default:
        return;
    }
  }

  return { onTriggerKeydown, onPanelKeydown, onBarLinkKeydown };
}
