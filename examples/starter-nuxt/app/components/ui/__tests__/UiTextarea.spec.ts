// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiTextarea from '../UiTextarea.vue';

describe('UiTextarea', () => {
  it('associates the label with the textarea via a matching id/for pair', () => {
    const wrapper = mount(UiTextarea, { props: { label: 'Message' } });
    const label = wrapper.find('label');
    const textarea = wrapper.find('textarea');
    expect(label.attributes('for')).toBe(textarea.attributes('id'));
  });

  it('defaults to 4 rows', () => {
    const wrapper = mount(UiTextarea, { props: { label: 'Message' } });
    expect(wrapper.find('textarea').attributes('rows')).toBe('4');
  });

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(UiTextarea, { props: { label: 'Message', modelValue: '' } });
    await wrapper.find('textarea').setValue('Hello there');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Hello there']);
  });

  it('sets aria-invalid and aria-describedby when error is set', () => {
    const wrapper = mount(UiTextarea, { props: { label: 'Message', error: 'Too short' } });
    const textarea = wrapper.find('textarea');
    expect(textarea.attributes('aria-invalid')).toBe('true');
    const errorId = textarea.attributes('aria-describedby');
    expect(wrapper.find(`#${errorId}`).text()).toBe('Too short');
  });

  it('forwards class and other attrs to the textarea element', () => {
    const wrapper = mount(UiTextarea, {
      props: { label: 'Message' },
      attrs: { class: 'w-full', rows: 8 },
    });
    const textarea = wrapper.find('textarea');
    expect(textarea.classes()).toContain('w-full');
    expect(textarea.attributes('rows')).toBe('8');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiTextarea, { props: { label: 'Message', description: 'Optional' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
