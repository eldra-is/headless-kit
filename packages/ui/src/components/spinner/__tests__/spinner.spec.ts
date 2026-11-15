import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import Spinner from '../Spinner.vue';

describe('Spinner — decorative by default', () => {
  it('is an aria-hidden svg with no role and no name', () => {
    const wrapper = mountWith(Spinner);
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('treats an empty label as no label', () => {
    const wrapper = mountWith(Spinner, { props: { label: '' } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountWith(Spinner);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Spinner — named', () => {
  it('is role="img" named by the label, and no longer hidden', () => {
    const wrapper = mountWith(Spinner, { props: { label: 'Loading' } });
    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Loading');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    wrapper.unmount();
  });

  it('is never a live region of its own', () => {
    const wrapper = mountWith(Spinner, { props: { label: 'Loading' } });
    expect(wrapper.attributes('aria-live')).toBeUndefined();
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountWith(Spinner, { props: { label: 'Loading' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Spinner — size and motion', () => {
  it('draws at 1.125rem with no class of its own', () => {
    const wrapper = mountWith(Spinner);
    expect(wrapper.classes()).toContain('eldra:size-4.5');
    wrapper.unmount();
  });

  it('lets a size class replace the default instead of sitting beside it', () => {
    const wrapper = mountWith(Spinner, { attrs: { class: 'eldra:size-8' } });
    expect(wrapper.classes()).toContain('eldra:size-8');
    expect(wrapper.classes()).not.toContain('eldra:size-4.5');
    wrapper.unmount();
  });

  it('turns, and pulses instead under reduced motion', () => {
    const wrapper = mountWith(Spinner);
    expect(wrapper.classes()).toContain('eldra:animate-eldra-spin');
    expect(wrapper.classes()).toContain('eldra:motion-reduce:animate-eldra-pulse');
    wrapper.unmount();
  });
});

describe('Spinner — keyboard', () => {
  it('is not focusable: no tabindex, and focusable="false" for legacy SVG focus', () => {
    const wrapper = mountWith(Spinner, { props: { label: 'Loading' } });
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    expect(wrapper.attributes('focusable')).toBe('false');
    wrapper.unmount();
  });

  it('forwards other attributes to the svg', () => {
    const wrapper = mountWith(Spinner, { attrs: { 'data-testid': 'wait' } });
    expect(wrapper.attributes('data-testid')).toBe('wait');
    expect(wrapper.attributes('data-eldra-ui')).toBeDefined();
    wrapper.unmount();
  });
});
