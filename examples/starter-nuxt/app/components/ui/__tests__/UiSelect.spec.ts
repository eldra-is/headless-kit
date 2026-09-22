// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiSelect from '../UiSelect.vue';

const OPTIONS = {
  slots: {
    default: '<option value="is">Iceland</option><option value="no">Norway</option>',
  },
};

describe('UiSelect', () => {
  it('associates the label with the select via a matching id/for pair', () => {
    const wrapper = mount(UiSelect, { props: { label: 'Country' }, ...OPTIONS });
    const label = wrapper.find('label');
    const select = wrapper.find('select');
    expect(label.attributes('for')).toBe(select.attributes('id'));
  });

  it('renders slotted options', () => {
    const wrapper = mount(UiSelect, { props: { label: 'Country' }, ...OPTIONS });
    expect(wrapper.findAll('option')).toHaveLength(2);
  });

  it('renders a disabled placeholder option when given', () => {
    const wrapper = mount(UiSelect, {
      props: { label: 'Country', placeholder: 'Choose a country' },
      ...OPTIONS,
    });
    const options = wrapper.findAll('option');
    expect(options).toHaveLength(3);
    expect(options[0]!.attributes('disabled')).toBeDefined();
    expect(options[0]!.text()).toBe('Choose a country');
  });

  it('emits update:modelValue on change', async () => {
    const wrapper = mount(UiSelect, { props: { label: 'Country' }, ...OPTIONS });
    await wrapper.find('select').setValue('no');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['no']);
  });

  it('sets aria-invalid and aria-describedby when error is set', () => {
    const wrapper = mount(UiSelect, { props: { label: 'Country', error: 'Required' }, ...OPTIONS });
    const select = wrapper.find('select');
    expect(select.attributes('aria-invalid')).toBe('true');
    const errorId = select.attributes('aria-describedby');
    expect(wrapper.find(`#${errorId}`).text()).toBe('Required');
  });

  it('forwards class and other attrs to the select element', () => {
    const wrapper = mount(UiSelect, {
      props: { label: 'Country' },
      attrs: { class: 'w-40', 'data-testid': 'country-select' },
      ...OPTIONS,
    });
    const select = wrapper.find('select');
    expect(select.classes()).toContain('w-40');
    expect(select.attributes('data-testid')).toBe('country-select');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiSelect, { props: { label: 'Country', required: true }, ...OPTIONS });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
