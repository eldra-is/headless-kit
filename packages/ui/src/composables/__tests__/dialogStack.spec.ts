import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDialog,
  currentDialog,
  isOpenDialog,
  openDialog,
  TOAST_HOST_KEY,
} from '../dialogStack';

/**
 * `useDialog`/`Dialog.vue`'s own specs exercise this module through a real dialog end to end
 * (including the stacked-dialog behaviours — Esc/backdrop top-only, focus return, and the
 * `StackedConfirm` story); these specs are the stack's own contract in isolation — push/pop
 * ordering, idempotent re-open, the toast hand-off and the scroll lock — with no component in the
 * way.
 */

function makeDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  document.body.append(dialog);
  return dialog;
}

afterEach(() => {
  // Every test either releases every entry it pushed itself or leaves dialogs that never claimed
  // one; this is a defensive reset so a test that throws mid-way cannot leak state into the next.
  let leftover = currentDialog();
  while (leftover !== null) {
    closeDialog(leftover);
    leftover = currentDialog();
  }
  document.body.innerHTML = '';
  document.documentElement.style.overflow = '';
});

describe('dialogStack — the stack', () => {
  it('starts with no dialog registered', () => {
    expect(currentDialog()).toBeNull();
  });

  it('claims the top for the first dialog', () => {
    const dialog = makeDialog();
    openDialog(dialog);
    expect(currentDialog()).toBe(dialog);
    expect(isOpenDialog(dialog)).toBe(true);
  });

  it('a second dialog opening while one is already open is pushed on top — no refusal', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    openDialog(second);
    expect(currentDialog()).toBe(second);
    expect(isOpenDialog(second)).toBe(true);
    // The first is still open, just no longer the top — `isOpenDialog` (and `useDialog`'s own
    // `isTop`) means "topmost", not "the only one".
    expect(isOpenDialog(first)).toBe(false);
  });

  it('a third dialog goes on top of the second, which stays open underneath both', () => {
    const first = makeDialog();
    const second = makeDialog();
    const third = makeDialog();
    openDialog(first);
    openDialog(second);
    openDialog(third);
    expect(currentDialog()).toBe(third);
    expect(isOpenDialog(second)).toBe(false);
    expect(isOpenDialog(first)).toBe(false);
  });

  it('re-registering the dialog that already holds the top is a no-op, not a duplicate entry', () => {
    const dialog = makeDialog();
    openDialog(dialog);
    openDialog(dialog);
    expect(currentDialog()).toBe(dialog);
    // A duplicate push would need two pops to clear it; one is enough if it was a no-op.
    closeDialog(dialog);
    expect(currentDialog()).toBeNull();
  });

  it('re-registering a dialog that is open but not the top does not move it', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    openDialog(second);
    openDialog(first);
    expect(currentDialog()).toBe(second);
  });

  it('closeDialog pops whichever entry it names, wherever it sits in the stack', () => {
    const first = makeDialog();
    const second = makeDialog();
    const third = makeDialog();
    openDialog(first);
    openDialog(second);
    openDialog(third);
    // The middle one closes (e.g. a consumer sets its own modelValue to false directly) while the
    // top stays open and on top.
    closeDialog(second);
    expect(currentDialog()).toBe(third);
    expect(isOpenDialog(first)).toBe(false);
  });

  it('closing the top uncovers whichever is now the top', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    openDialog(second);
    closeDialog(second);
    expect(currentDialog()).toBe(first);
    expect(isOpenDialog(first)).toBe(true);
  });

  it('closeDialog on a dialog that never held a slot does nothing', () => {
    const first = makeDialog();
    const other = makeDialog();
    openDialog(first);
    closeDialog(other);
    expect(currentDialog()).toBe(first);
  });

  it('closing everything empties the stack, freeing it for a fresh top', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    openDialog(second);
    closeDialog(second);
    closeDialog(first);
    expect(currentDialog()).toBeNull();

    const third = makeDialog();
    openDialog(third);
    expect(currentDialog()).toBe(third);
  });
});

describe('dialogStack — TOAST_HOST_KEY', () => {
  it('points at the open dialog, and back to null once it closes', () => {
    const dialog = makeDialog();
    expect(TOAST_HOST_KEY.value).toBeNull();
    openDialog(dialog);
    expect(TOAST_HOST_KEY.value).toBe(dialog);
    closeDialog(dialog);
    expect(TOAST_HOST_KEY.value).toBeNull();
  });

  it('follows the top of the stack as dialogs push and pop', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    expect(TOAST_HOST_KEY.value).toBe(first);

    openDialog(second);
    expect(TOAST_HOST_KEY.value).toBe(second);

    closeDialog(second);
    expect(TOAST_HOST_KEY.value).toBe(first);

    closeDialog(first);
    expect(TOAST_HOST_KEY.value).toBeNull();
  });
});

describe('dialogStack — scroll lock', () => {
  it('sets <html> overflow to hidden while a dialog is open, restoring it on close', () => {
    document.documentElement.style.overflow = 'scroll';
    const dialog = makeDialog();
    openDialog(dialog);
    expect(document.documentElement.style.overflow).toBe('hidden');
    closeDialog(dialog);
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  it('stays locked while a second dialog opens and closes, releasing only once both have', () => {
    document.documentElement.style.overflow = 'scroll';
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    expect(document.documentElement.style.overflow).toBe('hidden');

    openDialog(second);
    expect(document.documentElement.style.overflow).toBe('hidden');

    closeDialog(second);
    expect(document.documentElement.style.overflow).toBe('hidden');

    closeDialog(first);
    expect(document.documentElement.style.overflow).toBe('scroll');
  });
});
