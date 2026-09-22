// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiAccordionItem from '../UiAccordionItem.vue';

describe('UiAccordionItem', () => {
  it('renders a native details/summary with the title', () => {
    const wrapper = mount(UiAccordionItem, {
      props: { title: 'What is your return policy?' },
      slots: { default: '30 days, no questions asked.' },
    });
    expect(wrapper.find('details').exists()).toBe(true);
    expect(wrapper.find('summary').text()).toContain('What is your return policy?');
  });

  it('is closed by default', () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q' } });
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
  });

  it('opens when defaultOpen is set', () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q', defaultOpen: true } });
    expect(wrapper.find('details').attributes('open')).toBe('');
  });

  it('the summary is keyboard-focusable (default tab order, native Enter/Space activation)', () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q' } });
    // jsdom does not simulate the browser's native "Enter/Space activates
    // summary" behaviour (it only implements the click-based toggle), so
    // real keyboard activation is exercised as the click it produces below;
    // this asserts the element a screen reader / keyboard user reaches is
    // actually in the tab order (no explicit -1).
    expect((wrapper.find('summary').element as HTMLElement).tabIndex).toBe(0);
  });

  it('toggles open when the summary is activated (click — the effect of a native Enter/Space press)', async () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q' } });
    await wrapper.find('summary').trigger('click');
    expect(wrapper.find('details').attributes('open')).toBe('');
    await wrapper.find('summary').trigger('click');
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
  });

  it('rotates the chevron via group-open when opened', async () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q' } });
    expect(wrapper.find('svg').classes()).toContain('group-open:rotate-180');
  });

  it('connects the summary and panel via aria-controls/id', () => {
    const wrapper = mount(UiAccordionItem, { props: { title: 'Q' } });
    const controls = wrapper.find('summary').attributes('aria-controls');
    expect(wrapper.find(`#${controls}`).exists()).toBe(true);
  });

  it('has no axe violations open and closed', async () => {
    const closed = mount(UiAccordionItem, { props: { title: 'Q' }, slots: { default: 'A' } });
    expect(await axe(closed.element)).toHaveNoViolations();
    const open = mount(UiAccordionItem, {
      props: { title: 'Q', defaultOpen: true },
      slots: { default: 'A' },
    });
    expect(await axe(open.element)).toHaveNoViolations();
  });
});
