import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import CountryFlag from '../CountryFlag.vue';
import { preloadCountryFlags } from '../flags';

describe('CountryFlag', () => {
  it('draws the flag in the element it rendered empty, without being told to load', async () => {
    const wrapper = mount(CountryFlag, { props: { country: 'IS' }, attachTo: document.body });
    const flag = wrapper.element;
    expect(flag.getAttribute('data-part')).toBe('flag');
    // Mounting started the load; awaiting the same promise is how a test waits for it.
    await preloadCountryFlags();
    await nextTick();
    expect(wrapper.element).toBe(flag);
    expect(flag.getAttribute('viewBox')).toBe('0 0 513 342');
    expect(flag.innerHTML).toContain('<path');
    wrapper.unmount();
  });

  it('is decorative by default, and an image with a name when given a label', async () => {
    await preloadCountryFlags();
    const plain = mount(CountryFlag, { props: { country: 'NO' } });
    expect(plain.attributes('aria-hidden')).toBe('true');
    expect(plain.attributes('role')).toBeUndefined();

    const named = mount(CountryFlag, { props: { country: 'NO', label: 'Norway' } });
    expect(named.attributes('role')).toBe('img');
    expect(named.attributes('aria-label')).toBe('Norway');
    expect(named.attributes('aria-hidden')).toBeUndefined();
  });

  it('takes the code in either case, and follows a change of country', async () => {
    await preloadCountryFlags();
    const wrapper = mount(CountryFlag, { props: { country: 'no' } });
    const norway = wrapper.element.innerHTML;
    expect(norway).toContain('<path');
    await wrapper.setProps({ country: 'DK' });
    expect(wrapper.element.innerHTML).toContain('<path');
    expect(wrapper.element.innerHTML).not.toBe(norway);
  });

  it('stays an empty box of the same size for a code with no flag', async () => {
    await preloadCountryFlags();
    const wrapper = mount(CountryFlag, { props: { country: 'ZZ' } });
    expect(wrapper.element.innerHTML).toBe('');
    expect(wrapper.attributes('viewBox')).toBeUndefined();
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['eldra:h-3.5', 'eldra:w-5', 'eldra:eldra-phone-flag'])
    );
  });

  it('takes a class of the consumer’s own', () => {
    const wrapper = mount(CountryFlag, { props: { country: 'IS' }, attrs: { class: 'mine' } });
    expect(wrapper.classes()).toContain('mine');
  });
});
