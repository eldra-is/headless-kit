// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiTabs from '../UiTabs.vue';
import UiTab from '../UiTab.vue';
import UiTabPanel from '../UiTabPanel.vue';

// UiTab requires an ancestor UiTabs providing tab context (it throws
// otherwise, see UiTab.vue) — mounted through a minimal UiTabs harness
// rather than a raw `provide`, since UiTabs' own `provide()` call, not a
// hand-built context object, is the contract this test should exercise.
function mountTab(props: { id: string; disabled?: boolean } = { id: 'a' }) {
  return mount(UiTabs, {
    props: { modelValue: 'a', label: 'Info' },
    slots: { tabs: () => h(UiTab, props, () => 'Tab label') },
  });
}

// `aria-controls` on a tab points at its panel's id — axe flags a
// reference to a non-existent element, so this pairs a real UiTabPanel
// alongside it, matching how the two are actually used together.
function mountTabWithPanel(props: { id: string; disabled?: boolean } = { id: 'a' }) {
  return mount(UiTabs, {
    props: { modelValue: 'a', label: 'Info' },
    slots: {
      tabs: () => h(UiTab, props, () => 'Tab label'),
      default: () => h(UiTabPanel, { id: props.id }, () => 'Panel'),
    },
  });
}

describe('UiTab', () => {
  it('renders a button with role="tab"', () => {
    const wrapper = mountTab();
    const tab = wrapper.find('[role="tab"]');
    expect(tab.element.tagName).toBe('BUTTON');
    expect(tab.attributes('type')).toBe('button');
    expect(tab.text()).toBe('Tab label');
  });

  it('throws when used outside UiTabs', () => {
    expect(() => mount(UiTab, { props: { id: 'a' }, slots: { default: 'Tab' } })).toThrow();
  });

  it('is disabled and excluded from the tab order style when disabled is set', () => {
    const wrapper = mountTab({ id: 'a', disabled: true });
    expect(wrapper.find('[role="tab"]').attributes('disabled')).toBeDefined();
  });

  it('has no axe violations', async () => {
    const wrapper = mountTabWithPanel();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
