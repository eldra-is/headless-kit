import { DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { useToast } from '../../../composables/useToast';
import Dialog from '../../dialog/Dialog.vue';
import Toaster from '../Toaster.vue';

/**
 * `Toaster`'s entire template is a `<Teleport>`, so — exactly like the Select/MultiSelect/
 * SearchBar popover panels `src/test/popover.ts` documents — none of its rendered content is
 * inside `wrapper.element`'s own subtree; `wrapper.find()`/`.get()` would find nothing. Every
 * query here goes through plain DOM lookups instead, scoped to `document.body` (or, for the
 * inside-a-dialog spec, to the dialog element itself).
 */

const mounted: VueWrapper[] = [];

function mount(): VueWrapper {
  const wrapper = mountWith(Toaster) as unknown as VueWrapper;
  mounted.push(wrapper);
  return wrapper;
}

function mountDialog(open: boolean): VueWrapper {
  const wrapper = mountWith(Dialog, {
    props: { title: 'Remove from cart?', modelValue: open },
  }) as unknown as VueWrapper;
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  useToast().clear();
  vi.useRealTimers();
});

function list(): DOMWrapper<HTMLElement> {
  return new DOMWrapper(document.querySelector<HTMLElement>('[data-part="list"]')!);
}

function region(): DOMWrapper<HTMLElement> {
  return new DOMWrapper(list().element.parentElement as HTMLElement);
}

/** Every rendered `Toast`'s title text, in document order, under `scope`. `[data-part="icon"]` is
 *  unique to `Toast` (`Toaster`/`Dialog` have no icon part), so counting it counts toasts only. */
function toastTitles(scope: ParentNode = document.body): string[] {
  return [...scope.querySelectorAll('[data-part="icon"]')].map((icon) => {
    const toastRoot = icon.closest('[data-part="root"]');
    return toastRoot?.querySelector('[data-part="title"]')?.textContent ?? '';
  });
}

/** A `Toast`'s own close button(s) under `scope` — excludes a `Dialog`'s (same `data-part`, no
 *  sibling `[data-part="icon"]` inside its own root) for the one spec that mounts both. */
function toastCloseButtons(scope: ParentNode = document.body): DOMWrapper<Element>[] {
  return [...scope.querySelectorAll('[data-part="close"]')]
    .filter((button) => button.closest('[data-part="root"]')?.querySelector('[data-part="icon"]'))
    .map((button) => new DOMWrapper(button));
}

describe('Toaster — the region', () => {
  it('is present and empty at page load: role="status" aria-live="polite" aria-label="Notifications"', () => {
    mount();
    expect(list().attributes('role')).toBe('status');
    expect(list().attributes('aria-live')).toBe('polite');
    expect(list().attributes('aria-label')).toBe('Notifications');
    expect(toastTitles()).toEqual([]);
  });

  it('renders a raised toast, inside the polite region', async () => {
    mount();
    useToast().show({ title: 'Added to cart' });
    await nextTick();
    expect(toastTitles()).toEqual(['Added to cart']);
    expect(list().element.textContent).toContain('Added to cart');
  });

  it('shows at most 3 toasts, the oldest leaving first', async () => {
    mount();
    const toast = useToast();
    toast.show({ id: '1', title: 'One' });
    toast.show({ id: '2', title: 'Two' });
    toast.show({ id: '3', title: 'Three' });
    toast.show({ id: '4', title: 'Four' });
    await nextTick();
    expect(toastTitles()).toEqual(['Two', 'Three', 'Four']);
  });

  it('applies its own width utility, capped at 100vw - 2rem on any viewport', () => {
    mount();
    expect(region().classes()).toContain('eldra-toast-width');
  });
});

describe('Toaster — the two live regions are never nested', () => {
  it('keeps a danger toast out of the polite list, as a sibling of it inside the fixed region', async () => {
    mount();
    const toast = useToast();
    toast.show({ id: 'ok', title: 'Added to cart' });
    toast.show({ id: 'bad', variant: 'danger', title: "Couldn't update your cart" });
    await nextTick();

    const alert = document.querySelector('[role="alert"]') as HTMLElement;
    expect(alert).not.toBeNull();
    expect(list().element.contains(alert)).toBe(false);
    expect(region().element.contains(alert)).toBe(true);
    expect(list().element.textContent).toContain('Added to cart');
    expect(list().element.textContent).not.toContain("Couldn't update your cart");
  });

  it('collapses the polite list out of the layout while it holds nothing (a danger-only stack)', async () => {
    mount();
    useToast().show({ variant: 'danger', title: "Couldn't update your cart" });
    await nextTick();
    expect(list().classes()).toContain('hidden');
  });
});

describe('Toaster — durations per variant', () => {
  it('auto-dismisses success after 6s, emitting dismiss("timeout")', async () => {
    vi.useFakeTimers();
    const wrapper = mount();
    useToast().show({ id: 't', title: 'Added to cart' });
    await nextTick();
    vi.advanceTimersByTime(5999);
    await nextTick();
    expect(toastTitles()).toEqual(['Added to cart']);

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(toastTitles()).toEqual([]);
    expect(wrapper.emitted('dismiss')).toEqual([['t', 'timeout']]);
  });

  it('auto-dismisses warning after 10s, not 6s', async () => {
    vi.useFakeTimers();
    mount();
    useToast().show({ id: 't', variant: 'warning', title: 'Only 2 left in stock' });
    await nextTick();
    vi.advanceTimersByTime(6000);
    await nextTick();
    expect(toastTitles()).toEqual(['Only 2 left in stock']);

    vi.advanceTimersByTime(4000);
    await nextTick();
    expect(toastTitles()).toEqual([]);
  });

  it('never auto-dismisses a danger toast', async () => {
    vi.useFakeTimers();
    const wrapper = mount();
    useToast().show({ id: 't', variant: 'danger', title: "Couldn't update your cart" });
    await nextTick();
    vi.advanceTimersByTime(120_000);
    await nextTick();
    expect(toastTitles()).toEqual(["Couldn't update your cart"]);
    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });
});

describe('Toaster — pause on hover/focus', () => {
  it('pauses on hover and resumes on leave, for the time actually left', async () => {
    vi.useFakeTimers();
    mount();
    useToast().show({ id: 't', title: 'Added to cart' });
    await nextTick();

    vi.advanceTimersByTime(3000);
    await region().trigger('mouseenter');
    vi.advanceTimersByTime(10_000); // far past the remaining 3000ms, but paused
    await nextTick();
    expect(toastTitles()).toEqual(['Added to cart']);

    await region().trigger('mouseleave');
    vi.advanceTimersByTime(2999);
    await nextTick();
    expect(toastTitles()).toEqual(['Added to cart']);

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(toastTitles()).toEqual([]);
  });

  it('pauses while focus is inside the stack, independently of the pointer', async () => {
    vi.useFakeTimers();
    mount();
    useToast().show({ id: 't', title: 'Added to cart' });
    await nextTick();

    const close = toastCloseButtons()[0]!;
    await close.trigger('focusin');
    vi.advanceTimersByTime(6000);
    await nextTick();
    expect(toastTitles()).toEqual(['Added to cart']);

    await close.trigger('focusout');
    vi.advanceTimersByTime(6000);
    await nextTick();
    expect(toastTitles()).toEqual([]);
  });

  it('does not resume when focus merely moves between two toasts in the stack', async () => {
    vi.useFakeTimers();
    mount();
    const toast = useToast();
    toast.show({ id: 'a', title: 'A' });
    toast.show({ id: 'b', title: 'B' });
    await nextTick();

    const [first, second] = toastCloseButtons();
    await first!.trigger('focusin');
    const event = new FocusEvent('focusout', { bubbles: true, relatedTarget: second!.element });
    first!.element.dispatchEvent(event);
    await second!.trigger('focusin');
    vi.advanceTimersByTime(6000);
    await nextTick();
    expect(toastTitles()).toEqual(['A', 'B']);
  });
});

describe('Toaster — Esc closes only the focused toast', () => {
  it('leaves the other toast running', async () => {
    const wrapper = mount();
    const toast = useToast();
    toast.show({ id: 'a', title: 'A' });
    toast.show({ id: 'b', title: 'B' });
    await nextTick();

    await toastCloseButtons()[0]!.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(toastTitles()).toEqual(['B']);
    expect(wrapper.emitted('dismiss')).toEqual([['a', 'escape']]);
  });
});

describe('Toaster — action', () => {
  it('re-emits the toast id when an action activates, without dismissing it on its own', async () => {
    const wrapper = mount();
    useToast().show({
      id: 't',
      title: "Couldn't update your cart",
      action: { label: 'Try again', onActivate: () => {} },
    });
    await nextTick();
    const action = new DOMWrapper(document.querySelector('[data-part="action"]') as Element);
    await action.trigger('click');
    expect(wrapper.emitted('action')).toEqual([['t']]);
    expect(toastTitles()).toEqual(["Couldn't update your cart"]);
  });
});

describe('Toaster — inside an open dialog (TOAST_HOST_KEY)', () => {
  it('teleports its region into the open dialog, and back to <body> once it closes', async () => {
    const dialog = mountDialog(true);
    const dialogEl = document.querySelector('dialog') as HTMLDialogElement;
    mount();

    useToast().show({ title: 'Added to cart' });
    await nextTick();

    expect(toastTitles(dialogEl)).toEqual(['Added to cart']);
    expect(dialogEl.contains(region().element)).toBe(true);
    expect(region().element.parentElement).toBe(dialogEl);

    await dialog.setProps({ modelValue: false });
    await nextTick();

    useToast().show({ id: 'after-close', title: 'Link copied' });
    await nextTick();
    expect(dialogEl.contains(region().element)).toBe(false);
    expect(region().element.parentElement).toBe(document.body);
  });
});

describe('Toaster — accessibility', () => {
  it('has no axe violations with a mixed stack of toasts', async () => {
    mount();
    const toast = useToast();
    toast.show({
      id: 's',
      title: 'Added to cart',
      action: { label: 'View cart (3)', href: '/cart' },
    });
    toast.show({ id: 'w', variant: 'warning', title: 'Only 2 left in stock' });
    toast.show({ id: 'd', variant: 'danger', title: "Couldn't update your cart" });
    await nextTick();
    expect(await axe(region().element)).toHaveNoViolations();
  });
});
