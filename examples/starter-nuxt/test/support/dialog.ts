/**
 * jsdom (the version this repo pins, 30.x) reflects `<dialog>`'s `open`
 * attribute but implements neither `showModal()` nor `close()` — both throw
 * "is not a function". `UiDialog` (and `UiDrawer`, which composes it) calls
 * both directly, matching real browser usage: Storybook and the deployed
 * site run in real Chromium, where the native implementation applies
 * unchanged, so this file only matters for `vitest.config.ts`'s jsdom test
 * runs. Imported once for its side effect via `setupFiles`.
 *
 * Scope kept deliberately small — just enough for `UiDialog`'s own `close`
 * and `cancel` listeners to run the same code path under test as in a real
 * browser: `showModal()`/`close()` set/remove the `open` attribute and
 * `close()` dispatches a `close` event; a document-level Escape handler
 * dispatches `cancel` (cancelable) on the top-most open `<dialog>` and, if
 * not prevented, closes it — mirroring the native default action. This does
 * not implement the browser's top-layer stacking or inert-background
 * behaviour; `UiDialog`'s own `useFocusTrap` covers focus containment
 * instead.
 */
export function installDialogPolyfill(): void {
  const ctor = (globalThis as { HTMLDialogElement?: typeof HTMLDialogElement }).HTMLDialogElement;
  if (!ctor) return; // not a DOM environment (e.g. a node-environment spec file)

  const proto = ctor.prototype as HTMLDialogElement & {
    showModal?: () => void;
    close?: (returnValue?: string) => void;
  };
  if (typeof proto.showModal === 'function') return; // already implemented (real browser)

  proto.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };

  proto.close = function close(this: HTMLDialogElement, returnValue?: string): void {
    if (!this.hasAttribute('open')) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openDialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
    const topmost = openDialogs[openDialogs.length - 1];
    if (!topmost) return;
    const notCancelled = topmost.dispatchEvent(new Event('cancel', { cancelable: true }));
    if (notCancelled) topmost.close();
  });
}

installDialogPolyfill();
