// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiCheckbox from '../UiCheckbox.vue';

describe('UiCheckbox', () => {
  it('associates the label with the checkbox via a matching id/for pair', () => {
    const wrapper = mount(UiCheckbox, { props: { label: 'Subscribe' } });
    const label = wrapper.find('label');
    const input = wrapper.find('input[type="checkbox"]');
    expect(label.attributes('for')).toBe(input.attributes('id'));
  });

  it('reflects modelValue as checked', () => {
    const wrapper = mount(UiCheckbox, { props: { label: 'Subscribe', modelValue: true } });
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(true);
  });

  it('emits update:modelValue on change', async () => {
    const wrapper = mount(UiCheckbox, { props: { label: 'Subscribe', modelValue: false } });
    await wrapper.find('input').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });

  it('sets aria-invalid and aria-describedby when error is set', () => {
    const wrapper = mount(UiCheckbox, { props: { label: 'Subscribe', error: 'Required' } });
    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    const errorId = input.attributes('aria-describedby');
    expect(wrapper.find(`#${errorId}`).text()).toBe('Required');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiCheckbox, { props: { label: 'Subscribe to newsletter' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
