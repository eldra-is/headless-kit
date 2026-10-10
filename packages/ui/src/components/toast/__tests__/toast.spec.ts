import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import Toast from '../Toast.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Toast — element and parts', () => {
  it('has a data-part on every part the anatomy names', () => {
    const wrapper = mountWith(Toast, {
      props: {
        title: 'Added to cart',
        text: 'Merino crew sweater · Oatmeal · M',
        action: { label: 'View cart (3)', href: '/cart' },
      },
    });
    expect(wrapper.find('[data-part="root"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="title"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="text"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="action"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="close"]').exists()).toBe(true);
  });

  it('renders no text part without a text prop', () => {
    const wrapper = mountWith(Toast, { props: { title: 'Code WELCOME10 copied' } });
    expect(wrapper.find('[data-part="text"]').exists()).toBe(false);
  });

  it('renders no action part without an action prop', () => {
    const wrapper = mountWith(Toast, { props: { title: 'Code WELCOME10 copied' } });
    expect(wrapper.find('[data-part="action"]').exists()).toBe(false);
  });

  it('the title carries the visible text', () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to your wishlist' } });
    expect(wrapper.find('[data-part="title"]').text()).toBe('Added to your wishlist');
  });

  it('the icon is decorative — aria-hidden and not focusable', () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    const icon = wrapper.find('[data-part="icon"]');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.attributes('focusable')).toBe('false');
  });

  it('draws a different icon per variant', () => {
    const success = mountWith(Toast, { props: { title: 'Added to cart', variant: 'success' } });
    const warning = mountWith(Toast, { props: { title: 'Only 2 left', variant: 'warning' } });
    const danger = mountWith(Toast, { props: { title: "Couldn't update", variant: 'danger' } });
    const paths = (w: typeof success) => w.find('[data-part="icon"]').findAll('path').length;
    expect(paths(success)).toBe(2);
    expect(paths(warning)).toBe(3);
    expect(paths(danger)).toBe(3);
    // Warning and danger both draw 3 paths, but not the same three.
    expect(warning.find('[data-part="icon"]').html()).not.toBe(
      danger.find('[data-part="icon"]').html()
    );
  });
});

describe('Toast — roles', () => {
  it('success and warning carry no role of their own (the region around them is the live region)', () => {
    const success = mountWith(Toast, { props: { title: 'Added to cart', variant: 'success' } });
    const warning = mountWith(Toast, { props: { title: 'Only 2 left', variant: 'warning' } });
    expect(success.find('[data-part="root"]').attributes('role')).toBeUndefined();
    expect(warning.find('[data-part="root"]').attributes('role')).toBeUndefined();
  });

  it('danger is its own assertive role="alert" region', () => {
    const wrapper = mountWith(Toast, {
      props: { title: "Couldn't update your cart", variant: 'danger' },
    });
    expect(wrapper.find('[data-part="root"]').attributes('role')).toBe('alert');
  });
});

describe('Toast — action: link vs button', () => {
  it('renders a real anchor for an href action', () => {
    const wrapper = mountWith(Toast, {
      props: { title: 'Added to cart', action: { label: 'View cart (3)', href: '/cart' } },
    });
    const action = wrapper.find('[data-part="action"]');
    expect(action.element.tagName).toBe('A');
    expect(action.attributes('href')).toBe('/cart');
    expect(action.text()).toBe('View cart (3)');
  });

  it('renders a real button for an onActivate action, and calls it on click', async () => {
    const onActivate = vi.fn();
    const wrapper = mountWith(Toast, {
      props: {
        title: "Couldn't update your cart",
        variant: 'danger',
        action: { label: 'Try again', onActivate },
      },
    });
    const action = wrapper.find('[data-part="action"]');
    expect(action.element.tagName).toBe('BUTTON');
    expect(action.attributes('type')).toBe('button');
    await action.trigger('click');
    expect(onActivate).toHaveBeenCalledOnce();
    expect(wrapper.emitted('action')).toHaveLength(1);
  });

  it('emits "action" for a link action too, without throwing on an onActivate-less action', async () => {
    const wrapper = mountWith(Toast, {
      props: { title: 'Added to cart', action: { label: 'View cart (3)', href: '/cart' } },
    });
    await wrapper.find('[data-part="action"]').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });
});

describe('Toast — close', () => {
  it('is a real <button type="button"> named "Dismiss notification"', () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    const close = wrapper.find('[data-part="close"]');
    expect(close.element.tagName).toBe('BUTTON');
    expect(close.attributes('type')).toBe('button');
    expect(close.attributes('aria-label')).toBe('Dismiss notification');
  });

  it('honours a messages override for the close button name', () => {
    const wrapper = mountWith(Toast, {
      props: { title: 'Added to cart', messages: { dismissNotification: 'Loka tilkynningu' } },
    });
    expect(wrapper.find('[data-part="close"]').attributes('aria-label')).toBe('Loka tilkynningu');
  });

  it('emits close("button") when clicked', async () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    await wrapper.find('[data-part="close"]').trigger('click');
    expect(wrapper.emitted('close')).toEqual([['button']]);
  });
});

describe('Toast — Escape', () => {
  it('emits close("escape") when Escape is pressed while focus is inside it', async () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    const close = wrapper.find('[data-part="close"]').element as HTMLButtonElement;
    close.focus();
    await wrapper.find('[data-part="close"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toEqual([['escape']]);
  });

  /**
   * Mutation check for the comment in `Toast.vue#onKeydown`: without `preventDefault()`, a toast
   * teleported inside an open `Dialog` would also trigger the browser's own Escape-closes-the-
   * dialog default action. This cannot be exercised end-to-end in happy-dom (there is no real
   * "close request" algorithm to observe), so this asserts the one thing this component controls:
   * the native event's default gets prevented.
   */
  it('prevents the keydown default action, so a dialog behind it does not also close', async () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    const close = wrapper.find('[data-part="close"]').element as HTMLButtonElement;
    close.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const spy = vi.spyOn(event, 'preventDefault');
    close.dispatchEvent(event);
    expect(spy).toHaveBeenCalledOnce();
    expect(wrapper.emitted('close')).toEqual([['escape']]);
  });

  it('ignores every other key', async () => {
    const wrapper = mountWith(Toast, { props: { title: 'Added to cart' } });
    await wrapper.find('[data-part="close"]').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});

describe('Toast — accessibility', () => {
  it('has no axe violations, for every variant, with text and an action', async () => {
    for (const variant of ['success', 'warning', 'danger'] as const) {
      const wrapper = mountWith(Toast, {
        props: {
          variant,
          title: 'Added to cart',
          text: 'Merino crew sweater · Oatmeal · M',
          action: { label: 'View cart (3)', href: '/cart' },
        },
      });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  });
});
