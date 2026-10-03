// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import ShippingBar from '../parts/ShippingBar.vue';
import { mountOptions } from '../../../test/support/mountBlock';

const trackedWrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

/** `mountOptions` supplies the same currency/locale/messages provides a real page does, which is
 *  what the `<Price>` inside the sentence reads. */
function mountBar(props: { threshold?: string; subtotal: number; panel?: 'edge' | 'card' }) {
  const base = mountOptions({ entry: { id: 'cart', data: {} } });
  const wrapper = mount(ShippingBar, {
    props,
    global: base.global,
  });
  trackedWrappers.push(wrapper);
  return wrapper;
}

function barWidth(wrapper: ReturnType<typeof mountBar>): string | undefined {
  return wrapper.get('[aria-hidden="true"] > div').attributes('style');
}

describe('cart shipping bar', () => {
  it('says how much is left in words, with the amount as a formatted price', async () => {
    // $80 threshold, $68 subtotal — the spec's own drawer example.
    const wrapper = mountBar({ threshold: '80.00', subtotal: 68 });
    const status = wrapper.get('[role="status"]');
    expect(status.text()).toContain("You're");
    expect(status.text()).toContain('$12');
    expect(status.text()).toContain('away from free shipping');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('fills the bar to the share of the threshold already reached, and hides it from assistive tech', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 68 });
    const track = wrapper.get('[aria-hidden="true"]');
    expect(track.exists()).toBe(true);
    expect(barWidth(wrapper)).toContain('width: 85%');
    // The words, never only the bar: no ARIA progress role that could report a number instead.
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  });

  it('switches to the unlocked message once the subtotal reaches the threshold', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 210 });
    const status = wrapper.get('[role="status"]');
    expect(status.text()).toBe('Free shipping unlocked');
    expect(status.classes()).toContain('text-success');
    expect(barWidth(wrapper)).toContain('width: 100%');
  });

  it('treats the threshold as reached exactly at the threshold', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 80 });
    expect(wrapper.get('[role="status"]').text()).toBe('Free shipping unlocked');
  });

  it('renders nothing at all without a usable threshold', () => {
    for (const threshold of [undefined, '', '   ', 'free', '0', '-10']) {
      const wrapper = mountBar({ threshold, subtotal: 68 });
      expect(wrapper.find('[role="status"]').exists(), `threshold: ${String(threshold)}`).toBe(
        false
      );
      expect(wrapper.text()).toBe('');
    }
  });

  it('reads the threshold in the same major units the cart’s own amounts use', () => {
    // "80" and a $68 subtotal are both major units, so the shopper is $12 short — the
    // amount itself is a `<Price>`, which takes minor units, so it is converted on the way in.
    const wrapper = mountBar({ threshold: '80', subtotal: 68 });
    expect(wrapper.get('[role="status"]').text()).toContain('$12');
  });
});
