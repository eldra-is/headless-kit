// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import ShippingBar from '../parts/ShippingBar.vue';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

/** The truck icon resolves through `useEldraIcon`, which calls Nuxt's `/api/eldra-icon` route on a
 *  real page; outside Nuxt the specs inject the server helper directly instead. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

const trackedWrappers: ReturnType<typeof mount>[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

/** `mountOptions` supplies the same currency/locale/messages provides a real page does, which is
 *  what the major→minor threshold conversion and the `<Price>` inside the sentence both read. */
function mountBar(props: { threshold?: string; subtotal: number; panel?: 'edge' | 'card' }) {
  const base = mountOptions({ entry: { id: 'cart', data: {} } });
  const wrapper = mount(ShippingBar, {
    props,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
    },
  });
  trackedWrappers.push(wrapper);
  return wrapper;
}

function barWidth(wrapper: ReturnType<typeof mountBar>): string | undefined {
  return wrapper.get('[aria-hidden="true"] > div').attributes('style');
}

describe('cart shipping bar', () => {
  it('says how much is left in words, with the amount as a formatted price', async () => {
    // $80.00 threshold, $68.00 subtotal — the spec's own drawer example.
    const wrapper = mountBar({ threshold: '80.00', subtotal: 6800 });
    const status = wrapper.get('[role="status"]');
    expect(status.text()).toContain("You're");
    expect(status.text()).toContain('$12.00');
    expect(status.text()).toContain('away from free shipping');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('fills the bar to the share of the threshold already reached, and hides it from assistive tech', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 6800 });
    const track = wrapper.get('[aria-hidden="true"]');
    expect(track.exists()).toBe(true);
    expect(barWidth(wrapper)).toContain('width: 85%');
    // The words, never only the bar: no ARIA progress role that could report a number instead.
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  });

  it('switches to the unlocked message once the subtotal reaches the threshold', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 21000 });
    const status = wrapper.get('[role="status"]');
    expect(status.text()).toBe('Free shipping unlocked');
    expect(status.classes()).toContain('text-success');
    expect(barWidth(wrapper)).toContain('width: 100%');
  });

  it('treats the threshold as reached exactly at the threshold', () => {
    const wrapper = mountBar({ threshold: '80.00', subtotal: 8000 });
    expect(wrapper.get('[role="status"]').text()).toBe('Free shipping unlocked');
  });

  it('renders nothing at all without a usable threshold', () => {
    for (const threshold of [undefined, '', '   ', 'free', '0', '-10']) {
      const wrapper = mountBar({ threshold, subtotal: 6800 });
      expect(wrapper.find('[role="status"]').exists(), `threshold: ${String(threshold)}`).toBe(
        false
      );
      expect(wrapper.text()).toBe('');
    }
  });

  it('converts the major-unit threshold with the currency’s own minor units', () => {
    // en-US/USD has two: "80.00" is 8000 cents, so $68.00 is still $12.00 short.
    const wrapper = mountBar({ threshold: '80', subtotal: 6800 });
    expect(wrapper.get('[role="status"]').text()).toContain('$12.00');
  });
});
