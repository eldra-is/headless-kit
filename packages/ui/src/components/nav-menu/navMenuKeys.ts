import { nextTick, type Ref } from 'vue';

export interface NavMenuKeysOptions {
  /** The bar's `<ul>`, one `<li>` per rendered entry. */
  list: Ref<HTMLElement | null>;
  /** The `items` index of the entry rendered at `position` in the list. */
  indexAt: (position: number) => number;
  /** The entry's panel, or `null` when it has none. */
  panel: (index: number) => HTMLElement | null;
  openIndex: Ref<number | null>;
  open: (index: number) => void;
  close: () => void;
}

interface TopLevel {
  el: HTMLElement;
  index: number;
}

type Edge = 'first' | 'last';

const PANEL_FOCUSABLE = 'a[href], button:not([disabled])';
const TYPING = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function clamp(position: number, length: number): number {
  return Math.min(Math.max(position, 0), length - 1);
}

/**
 * The arrow keys of the APG disclosure navigation pattern, over the bar's own DOM: Left/Right and
 * Home/End along the bar, Down/Up into and through a panel. Clamped, never wrapping.
 */
export function useNavMenuKeys(options: NavMenuKeysOptions): (event: KeyboardEvent) => void {
  function rows(): Element[] {
    return Array.from(options.list.value?.children ?? []);
  }

  function topLevel(): TopLevel[] {
    const items: TopLevel[] = [];
    rows().forEach((row, position) => {
      const el = row.firstElementChild;
      if (el instanceof HTMLElement && el.matches('button, [href]')) {
        items.push({ el, index: options.indexAt(position) });
      }
    });
    return items;
  }

  function panelLinks(index: number): HTMLElement[] {
    const panel = options.panel(index);
    return panel === null ? [] : Array.from(panel.querySelectorAll<HTMLElement>(PANEL_FOCUSABLE));
  }

  // A panel is `v-show`n: focus it only once Vue has flushed it visible.
  function focusPanelEdge(index: number, edge: Edge): void {
    void nextTick(() => {
      const links = panelLinks(index);
      (edge === 'first' ? links[0] : links[links.length - 1])?.focus();
    });
  }

  function focusTopLevel(target: TopLevel): void {
    if (options.openIndex.value !== null) {
      if (options.panel(target.index) === null) options.close();
      else options.open(target.index);
    }
    target.el.focus();
  }

  function travel(index: number, event: KeyboardEvent): void {
    const items = topLevel();
    if (items.length === 0) return;
    const position = items.findIndex((item) => item.index === index);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft':
        if (position === -1) return;
        event.preventDefault();
        next = clamp(position + (event.key === 'ArrowRight' ? 1 : -1), items.length);
        if (next === position) return;
        break;
      case 'Home':
        event.preventDefault();
        next = 0;
        break;
      case 'End':
        event.preventDefault();
        next = items.length - 1;
        break;
      default:
        return;
    }
    focusTopLevel(items[next]!);
  }

  function onTriggerKey(index: number, event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      travel(index, event);
      return;
    }
    event.preventDefault();
    options.open(index);
    focusPanelEdge(index, event.key === 'ArrowDown' ? 'first' : 'last');
  }

  function onPanelKey(index: number, event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const down = event.key === 'ArrowDown';
        const links = panelLinks(index);
        const active = document.activeElement;
        const at = links.findIndex((link) => link === active || link.contains(active));
        if (at === -1) focusPanelEdge(index, down ? 'first' : 'last');
        else links[clamp(at + (down ? 1 : -1), links.length)]?.focus();
        return;
      }
      case 'Home':
      case 'End':
        event.preventDefault();
        focusPanelEdge(index, event.key === 'Home' ? 'first' : 'last');
        return;
      default:
        travel(index, event);
    }
  }

  return (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof Element) || target.matches(TYPING)) return;
    const row = target.closest('[data-part="item"]');
    const list = options.list.value;
    if (row === null || list === null || row.parentElement !== list) return;
    const index = options.indexAt(rows().indexOf(row));
    if (options.panel(index)?.contains(target) === true) onPanelKey(index, event);
    else if (target === row.firstElementChild) {
      if (target.matches('button')) onTriggerKey(index, event);
      else travel(index, event);
    }
  };
}
