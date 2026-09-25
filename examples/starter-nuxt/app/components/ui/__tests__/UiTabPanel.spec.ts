// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiTabs from '../UiTabs.vue';
import UiTabPanel from '../UiTabPanel.vue';
import { focusRing } from '../../../utils/classes';

function mountPanel(modelValue: string) {
  return mount(UiTabs, {
    props: { modelValue, label: 'Info' },
    slots: { default: () => h(UiTabPanel, { id: 'a' }, () => 'Panel content') },
  });
}

describe('UiTabPanel', () => {
  it('renders role="tabpanel" with matching id/aria-labelledby', () => {
    const wrapper = mountPanel('a');
    const panel = wrapper.find('[role="tabpanel"]');
    expect(panel.attributes('id')).toBe('ui-tabpanel-a');
    expect(panel.attributes('aria-labelledby')).toBe('ui-tab-a');
    expect(panel.text()).toBe('Panel content');
  });

  it('is visible when its id matches the selected tab', () => {
    const wrapper = mountPanel('a');
    expect(wrapper.find('[role="tabpanel"]').attributes('hidden')).toBeUndefined();
  });

  it('is hidden when its id does not match the selected tab', () => {
    const wrapper = mountPanel('b');
    expect(wrapper.find('[role="tabpanel"]').attributes('hidden')).toBeDefined();
  });

  // The panel is focusable (`tabindex="0"`), and since there is no blanket
  // `:focus-visible` base rule any more it has to carry the ring itself.
  it('carries the shared focus ring, being focusable', () => {
    const panel = mountPanel('a').find('[role="tabpanel"]');
    expect(panel.attributes('tabindex')).toBe('0');
    for (const cls of focusRing.split(' ')) expect(panel.classes()).toContain(cls);
  });

  it('throws when used outside UiTabs', () => {
    expect(() => mount(UiTabPanel, { props: { id: 'a' }, slots: { default: 'Panel' } })).toThrow();
  });

  it('has no axe violations', async () => {
    const wrapper = mountPanel('a');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
