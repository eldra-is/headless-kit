import type { Ref } from 'vue';

/**
 * Keeps Tab/Shift+Tab cycling inside `el` while active, and restores focus to
 * whatever was focused before `activate()` was called when `deactivate()`
 * runs. Used by `UiDialog` (and, through it, `UiDrawer`) — real browsers
 * already contain focus inside a modal `<dialog>`, but jsdom (this starter's
 * unit test environment) does not implement that, and Storybook/tests still
 * need deterministic, assertable Tab-cycling behaviour either way.
 *
 * `getFocusable()` deliberately does not filter by `offsetParent`/computed
 * style: jsdom performs no layout, so every element's `offsetParent` is
 * always `null` there, which would filter out genuinely visible elements
 * under test. It does skip elements marked `hidden` (or inside a `hidden`
 * ancestor) since that's a plain attribute check, not a layout one.
 */
export function useFocusTrap(el: Ref<HTMLElement | null>): {
  activate: () => void;
  deactivate: () => void;
} {
  let active = false;
  let previouslyFocused: HTMLElement | null = null;

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !el.value) return;
    const focusable = getFocusable(el.value);
    if (focusable.length === 0) {
      event.preventDefault();
      el.value.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const current = document.activeElement;
    const currentIsInside = current instanceof HTMLElement && el.value.contains(current);
    if (event.shiftKey) {
      if (!currentIsInside || current === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!currentIsInside || current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function activate(): void {
    if (active || !el.value) return;
    active = true;
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('keydown', handleKeydown, true);
    const focusable = getFocusable(el.value);
    (focusable[0] ?? el.value).focus();
  }

  function deactivate(): void {
    if (!active) return;
    active = false;
    document.removeEventListener('keydown', handleKeydown, true);
    previouslyFocused?.focus();
    previouslyFocused = null;
  }

  return { activate, deactivate };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hidden && node.closest('[hidden]') === null
  );
}
