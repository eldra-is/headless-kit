// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiTabs from '../UiTabs.vue';
import UiTab from '../UiTab.vue';
import UiTabPanel from '../UiTabPanel.vue';

function mountTabs(modelValue = 'details', attach = false) {
  return mount(UiTabs, {
    props: { modelValue, label: 'Product information' },
    ...(attach ? { attachTo: document.body } : {}),
    slots: {
      tabs: () => [
        h(UiTab, { id: 'details' }, () => 'Details'),
        h(UiTab, { id: 'shipping' }, () => 'Shipping'),
        h(UiTab, { id: 'reviews' }, () => 'Reviews'),
      ],
      default: () => [
        h(UiTabPanel, { id: 'details' }, () => 'Detail copy'),
        h(UiTabPanel, { id: 'shipping' }, () => 'Shipping copy'),
        h(UiTabPanel, { id: 'reviews' }, () => 'Reviews copy'),
      ],
    },
  });
}

describe('UiTabs', () => {
  it('renders a tablist with the given accessible label', () => {
    const wrapper = mountTabs();
    expect(wrapper.find('[role="tablist"]').attributes('aria-label')).toBe('Product information');
  });

  it('marks the selected tab aria-selected and the others not', () => {
    const wrapper = mountTabs('shipping');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]!.attributes('aria-selected')).toBe('false');
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    expect(tabs[2]!.attributes('aria-selected')).toBe('false');
  });

  it('gives only the selected tab tabindex 0, others -1 (roving tabindex)', () => {
    const wrapper = mountTabs('shipping');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]!.attributes('tabindex')).toBe('-1');
    expect(tabs[1]!.attributes('tabindex')).toBe('0');
    expect(tabs[2]!.attributes('tabindex')).toBe('-1');
  });

  it('hides the panels that are not selected', () => {
    const wrapper = mountTabs('shipping');
    const panels = wrapper.findAll('[role="tabpanel"]');
    expect(panels[0]!.attributes('hidden')).toBeDefined();
    expect(panels[1]!.attributes('hidden')).toBeUndefined();
    expect(panels[2]!.attributes('hidden')).toBeDefined();
  });

  it('selects a tab and updates aria-selected on click', async () => {
    const wrapper = mountTabs('details');
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['shipping']);
  });

  it('moves focus and selection to the next tab on ArrowRight, wrapping at the end', async () => {
    const wrapper = mountTabs('reviews', true);
    const tabs = wrapper.findAll('[role="tab"]');
    (tabs[2]!.element as HTMLElement).focus();
    await tabs[2]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]!.element);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['details']);
    wrapper.unmount();
  });

  it('moves focus and selection to the previous tab on ArrowLeft, wrapping at the start', async () => {
    const wrapper = mountTabs('details', true);
    const tabs = wrapper.findAll('[role="tab"]');
    (tabs[0]!.element as HTMLElement).focus();
    await tabs[0]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]!.element);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['reviews']);
    wrapper.unmount();
  });

  it('Home moves to the first tab and End to the last', async () => {
    const wrapper = mountTabs('shipping', true);
    const tabs = wrapper.findAll('[role="tab"]');
    (tabs[1]!.element as HTMLElement).focus();

    await tabs[1]!.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]!.element);

    (tabs[2]!.element as HTMLElement).focus();
    await tabs[2]!.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]!.element);

    wrapper.unmount();
  });

  it('skips disabled tabs when navigating with arrow keys', async () => {
    const wrapper = mount(UiTabs, {
      props: { modelValue: 'details', label: 'Info' },
      attachTo: document.body,
      slots: {
        tabs: () => [
          h(UiTab, { id: 'details' }, () => 'Details'),
          h(UiTab, { id: 'shipping', disabled: true }, () => 'Shipping'),
          h(UiTab, { id: 'reviews' }, () => 'Reviews'),
        ],
        default: () => [],
      },
    });
    const tabs = wrapper.findAll('[role="tab"]');
    (tabs[0]!.element as HTMLElement).focus();
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[2]!.element);
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountTabs();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
