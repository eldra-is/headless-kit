// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiDrawer from '../UiDrawer.vue';
import { mountOptions } from '../../../../test/support/mountBlock';

const eldraGlobal = { provide: mountOptions({ entry: { id: 'test', data: {} } }).global.provide };

describe('UiDrawer', () => {
  it('defaults to a right-anchored panel', async () => {
    const wrapper = mount(UiDrawer, { props: { open: true, title: 'Menu' }, global: eldraGlobal });
    await nextTick();
    expect(wrapper.find('dialog').classes()).toContain('right-0');
  });

  it('anchors to the left when side="left"', async () => {
    const wrapper = mount(UiDrawer, {
      props: { open: true, title: 'Menu', side: 'left' },
      global: eldraGlobal,
    });
    await nextTick();
    const classes = wrapper.find('dialog').classes();
    expect(classes).toContain('left-0');
    expect(classes).not.toContain('right-0');
  });

  it('includes motion-safe transition-transform classes', async () => {
    const wrapper = mount(UiDrawer, { props: { open: true, title: 'Menu' }, global: eldraGlobal });
    await nextTick();
    expect(wrapper.find('dialog').classes()).toContain('motion-safe:transition-transform');
  });

  it('emits update:open when closed, same as UiDialog', async () => {
    const wrapper = mount(UiDrawer, { props: { open: true, title: 'Menu' }, global: eldraGlobal });
    await nextTick();
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });

  it('closes on Escape', async () => {
    const wrapper = mount(UiDrawer, {
      props: { open: true, title: 'Menu' },
      global: eldraGlobal,
      attachTo: document.body,
    });
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('has no axe violations while open', async () => {
    const wrapper = mount(UiDrawer, {
      props: { open: true, title: 'Menu' },
      slots: { default: '<nav>Links</nav>' },
      global: eldraGlobal,
    });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
