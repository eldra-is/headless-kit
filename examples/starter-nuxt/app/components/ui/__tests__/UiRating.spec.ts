// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiRating from '../UiRating.vue';
import { mountOptions } from '../../../../test/support/mountBlock';

// Only `provide` is needed (for `useT()`'s Eldra context) — see the same
// note in UiPrice.spec.ts on why `.global` isn't spread wholesale.
const eldraGlobal = { provide: mountOptions({ entry: { id: 'test', data: {} } }).global.provide };

describe('UiRating', () => {
  it('renders 5 stars', () => {
    const wrapper = mount(UiRating, { props: { value: 3 }, global: eldraGlobal });
    expect(wrapper.findAll('svg')).toHaveLength(5);
  });

  it('sets an aria-label with the value and max via role="img"', () => {
    const wrapper = mount(UiRating, { props: { value: 4 }, global: eldraGlobal });
    const img = wrapper.find('[role="img"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('aria-label')).toBe('4 of 5');
  });

  it('fills the number of stars matching the rounded value', () => {
    const wrapper = mount(UiRating, { props: { value: 3.6 }, global: eldraGlobal });
    const stars = wrapper.findAll('svg');
    const filled = stars.filter((s) => s.classes().includes('text-warning'));
    expect(filled).toHaveLength(4);
  });

  it('renders the optional visible count', () => {
    const wrapper = mount(UiRating, { props: { value: 4, count: 128 }, global: eldraGlobal });
    expect(wrapper.text()).toContain('(128)');
  });

  it('omits the count element when not given', () => {
    const wrapper = mount(UiRating, { props: { value: 4 }, global: eldraGlobal });
    expect(wrapper.text()).toBe('');
  });

  it('marks each star svg as decorative', () => {
    const wrapper = mount(UiRating, { props: { value: 4 }, global: eldraGlobal });
    for (const svg of wrapper.findAll('svg')) {
      expect(svg.attributes('aria-hidden')).toBe('true');
    }
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiRating, { props: { value: 4, count: 128 }, global: eldraGlobal });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
