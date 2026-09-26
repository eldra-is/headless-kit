import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeDialog,
  currentDialog,
  isOpenDialog,
  openDialog,
  TOAST_HOST_KEY,
} from '../dialogStack';

/**
 * `useDialog`/`Dialog.vue`'s own specs exercise this module through a real dialog end to end;
 * these specs are the registry's own contract in isolation — the "never stack" refusal, the
 * idempotent re-open, the toast hand-off and the scroll lock — with no component in the way.
 */

function makeDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  document.body.append(dialog);
  return dialog;
}

afterEach(() => {
  // Every test either releases the slot itself or leaves a dialog that never claimed it; this is
  // a defensive reset so a test that throws mid-way cannot leak state into the next one.
  const leftover = currentDialog();
  if (leftover !== null) closeDialog(leftover);
  document.body.innerHTML = '';
  document.documentElement.style.overflow = '';
});

describe('dialogStack — the single modal slot', () => {
  it('starts with no dialog registered', () => {
    expect(currentDialog()).toBeNull();
  });

  it('claims the slot for the first dialog', () => {
    const dialog = makeDialog();
    expect(openDialog(dialog)).toBe(true);
    expect(currentDialog()).toBe(dialog);
    expect(isOpenDialog(dialog)).toBe(true);
  });

  it('refuses a second dialog while one is open, warning in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = makeDialog();
    const second = makeDialog();
    expect(openDialog(first)).toBe(true);
    expect(openDialog(second)).toBe(false);
    expect(currentDialog()).toBe(first);
    expect(isOpenDialog(second)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('stack');
  });

  it('re-registering the dialog that already holds the slot is a no-op, not a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dialog = makeDialog();
    expect(openDialog(dialog)).toBe(true);
    expect(openDialog(dialog)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('closeDialog releases the slot, letting the next dialog claim it', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    closeDialog(first);
    expect(currentDialog()).toBeNull();
    expect(openDialog(second)).toBe(true);
  });

  it('closeDialog on a dialog that never held the slot does nothing', () => {
    const first = makeDialog();
    const other = makeDialog();
    openDialog(first);
    closeDialog(other);
    expect(currentDialog()).toBe(first);
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

  it('stays put when a second dialog is refused', () => {
    const first = makeDialog();
    const second = makeDialog();
    openDialog(first);
    openDialog(second);
    expect(TOAST_HOST_KEY.value).toBe(first);
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
});
