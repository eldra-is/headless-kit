import { beforeEach, describe, expect, it } from 'vitest';
import { useToast } from '../useToast';

describe('useToast — the queue', () => {
  beforeEach(() => {
    useToast().clear();
  });

  it('defaults to variant "success" and its 6s duration', () => {
    const toast = useToast();
    const id = toast.show({ title: 'Added to cart' });
    const item = toast.toasts.value.find((t) => t.id === id);
    expect(item?.variant).toBe('success');
    expect(item?.duration).toBe(6000);
  });

  it('gives warning its own 10s duration', () => {
    const toast = useToast();
    toast.show({ variant: 'warning', title: 'Only 2 left in stock' });
    expect(toast.toasts.value[0]?.duration).toBe(10000);
  });

  it('never auto-dismisses a danger toast, even with an explicit duration', () => {
    const toast = useToast();
    toast.show({ variant: 'danger', title: "Couldn't update your cart", duration: 5000 });
    expect(toast.toasts.value[0]?.duration).toBe(0);
  });

  it('honours an explicit duration for success/warning', () => {
    const toast = useToast();
    toast.show({ title: 'Code WELCOME10 copied', duration: 1500 });
    expect(toast.toasts.value[0]?.duration).toBe(1500);
  });

  it('treats an explicit duration of 0 as "stays until closed" for any non-danger variant', () => {
    const toast = useToast();
    toast.show({ variant: 'warning', title: 'Only 2 left', duration: 0 });
    expect(toast.toasts.value[0]?.duration).toBe(0);
  });

  it('generates a unique id for every toast that does not supply its own', () => {
    const toast = useToast();
    const a = toast.show({ title: 'One' });
    const b = toast.show({ title: 'Two' });
    expect(a).not.toBe(b);
    expect(toast.toasts.value.map((t) => t.id)).toEqual([a, b]);
  });

  it('a new toast with the same id replaces the old one, in place', () => {
    const toast = useToast();
    toast.show({ id: 'cart', title: 'Adding…' });
    toast.show({ id: 'between', title: 'Between' });
    toast.show({ id: 'cart', title: 'Added to cart' });
    expect(toast.toasts.value.map((t) => t.id)).toEqual(['cart', 'between']);
    expect(toast.toasts.value[0]?.title).toBe('Added to cart');
  });

  it('keeps at most 3 toasts, the oldest leaving when a fourth arrives', () => {
    const toast = useToast();
    toast.show({ id: '1', title: 'One' });
    toast.show({ id: '2', title: 'Two' });
    toast.show({ id: '3', title: 'Three' });
    toast.show({ id: '4', title: 'Four' });
    expect(toast.toasts.value.map((t) => t.id)).toEqual(['2', '3', '4']);
  });

  it('dismiss removes exactly one toast by id, and is a no-op for an id not in the queue', () => {
    const toast = useToast();
    toast.show({ id: 'a', title: 'A' });
    toast.show({ id: 'b', title: 'B' });
    toast.dismiss('a');
    expect(toast.toasts.value.map((t) => t.id)).toEqual(['b']);
    expect(() => toast.dismiss('nope')).not.toThrow();
    expect(toast.toasts.value).toHaveLength(1);
  });

  it('clear empties the queue', () => {
    const toast = useToast();
    toast.show({ title: 'One' });
    toast.show({ title: 'Two' });
    toast.clear();
    expect(toast.toasts.value).toEqual([]);
  });

  it('carries text and either action shape through unchanged', () => {
    const toast = useToast();
    const onActivate = (): void => {};
    toast.show({
      id: 'link',
      title: 'Added to cart',
      text: 'Merino crew sweater · Oatmeal · M',
      action: { label: 'View cart (3)', href: '/cart' },
    });
    toast.show({
      id: 'button',
      title: "Couldn't update your cart",
      action: { label: 'Try again', onActivate },
    });
    const [link, button] = toast.toasts.value;
    expect(link?.text).toBe('Merino crew sweater · Oatmeal · M');
    expect(link?.action).toEqual({ label: 'View cart (3)', href: '/cart' });
    expect(button?.action).toEqual({ label: 'Try again', onActivate });
  });

  it('every call to useToast() shares the one queue', () => {
    useToast().show({ id: 'shared', title: 'One queue' });
    expect(useToast().toasts.value.map((t) => t.id)).toEqual(['shared']);
  });
});
