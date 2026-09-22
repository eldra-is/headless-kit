// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiInput from '../UiInput.vue';

describe('UiInput', () => {
  it('associates the label with the input via a matching id/for pair', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email' } });
    const label = wrapper.find('label');
    const input = wrapper.find('input');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(label.text()).toContain('Email');
  });

  it('generates a stable id when none is given', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email' } });
    expect(wrapper.find('input').attributes('id')).toBeTruthy();
  });

  it('uses the given id instead of generating one', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', id: 'custom-email' } });
    expect(wrapper.find('input').attributes('id')).toBe('custom-email');
    expect(wrapper.find('label').attributes('for')).toBe('custom-email');
  });

  it('visually hides the label but keeps it accessible when hideLabel is set', () => {
    const wrapper = mount(UiInput, { props: { label: 'Search', hideLabel: true } });
    expect(wrapper.find('label').classes()).toContain('sr-only');
    expect(wrapper.find('label').text()).toContain('Search');
  });

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', modelValue: '' } });
    await wrapper.find('input').setValue('a@b.com');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a@b.com']);
  });

  it('sets aria-invalid and aria-describedby pointing at the error id when error is set', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', error: 'Required' } });
    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    const errorId = input.attributes('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(wrapper.find(`#${errorId}`).text()).toBe('Required');
  });

  it('includes the description id in aria-describedby alongside the error id', () => {
    const wrapper = mount(UiInput, {
      props: { label: 'Email', description: 'We never share it', error: 'Required' },
    });
    const describedBy = wrapper.find('input').attributes('aria-describedby')!.split(' ');
    expect(describedBy).toHaveLength(2);
    expect(wrapper.find(`#${describedBy[0]}`).text()).toBe('We never share it');
    expect(wrapper.find(`#${describedBy[1]}`).text()).toBe('Required');
  });

  it('omits aria-invalid and aria-describedby when there is no error or description', () => {
    const wrapper = mount(UiInput, { props: { label: 'Email' } });
    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBeUndefined();
    expect(input.attributes('aria-describedby')).toBeUndefined();
  });

  it('forwards class and other attrs to the input element, not the wrapper', () => {
    const wrapper = mount(UiInput, {
      props: { label: 'Email' },
      attrs: { class: 'w-64', maxlength: 10, 'data-testid': 'email-input' },
    });
    const input = wrapper.find('input');
    expect(input.classes()).toContain('w-64');
    expect(input.attributes('maxlength')).toBe('10');
    expect(input.attributes('data-testid')).toBe('email-input');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', required: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations with an error set', async () => {
    const wrapper = mount(UiInput, { props: { label: 'Email', error: 'Required' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
