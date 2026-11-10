import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Container from '../Container.vue';
import type { ContainerWidth } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Container — element', () => {
  it('renders a div by default, named as its own part', () => {
    const wrapper = mountWith(Container, { slots: { default: 'content' } });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.text()).toBe('content');
    wrapper.unmount();
  });

  it('renders as a different tag through as', () => {
    const wrapper = mountWith(Container, { props: { as: 'figure' } });
    expect(wrapper.element.tagName).toBe('FIGURE');
    wrapper.unmount();
  });
});

describe('Container — widths', () => {
  it.each<[ContainerWidth, string]>([
    ['narrow', 'eldra:eldra-container-narrow'],
    ['content', 'eldra:eldra-container-content'],
    ['wide', 'eldra:eldra-container-wide'],
  ])('caps %s at its token max-width', (width, className) => {
    const wrapper = mountWith(Container, { props: { width } });
    expect(wrapper.classes()).toContain(className);
    wrapper.unmount();
  });

  it('defaults to content', () => {
    const wrapper = mountWith(Container);
    expect(wrapper.classes()).toContain('eldra:eldra-container-content');
    wrapper.unmount();
  });

  it('full has no maximum and no gutters', () => {
    const wrapper = mountWith(Container, { props: { width: 'full' } });
    expect(wrapper.classes()).toContain('eldra:max-w-none');
    expect(wrapper.classes().join(' ')).not.toMatch(/gutter/);
    expect(wrapper.classes()).not.toContain('eldra:px-[var(--eldra-gutter-mobile)]');
    wrapper.unmount();
  });

  it.each<ContainerWidth>(['narrow', 'content', 'wide'])(
    'gives %s the gutter scale, breakpointed on the block width',
    (width) => {
      const wrapper = mountWith(Container, { props: { width } });
      expect(wrapper.classes()).toContain('eldra:px-[var(--eldra-gutter-mobile)]');
      expect(wrapper.classes()).toContain('eldra:@tablet:px-[var(--eldra-gutter-tablet)]');
      expect(wrapper.classes()).toContain('eldra:@content:px-[var(--eldra-gutter-desktop)]');
      wrapper.unmount();
    }
  );

  it('centres the box', () => {
    const wrapper = mountWith(Container);
    expect(wrapper.classes()).toContain('eldra:mx-auto');
    expect(wrapper.classes()).toContain('eldra:w-full');
    wrapper.unmount();
  });
});

describe('Container — customisation', () => {
  it('takes a consumer class on the root', () => {
    const wrapper = mountWith(Container, {
      props: { width: 'narrow' },
      attrs: { class: 'max-w-2xl' },
    });
    expect(wrapper.classes()).toContain('max-w-2xl');
    wrapper.unmount();
  });
});

describe('Container — content', () => {
  it('renders inside a narrow host without throwing', () => {
    const wrapper = mountNarrow(Container, { props: { width: 'wide' }, slots: { default: 'x' } });
    expect(wrapper.text()).toBe('x');
    wrapper.unmount();
  });
});

describe('Container — accessibility', () => {
  it.each<ContainerWidth>(['narrow', 'content', 'wide', 'full'])(
    'has no axe violations at %s',
    async (width) => {
      const wrapper = mountWith(Container, { props: { width }, slots: { default: 'Content' } });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  );
});
