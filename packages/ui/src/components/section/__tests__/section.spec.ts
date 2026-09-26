import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, inject } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { SECTION_KEY } from '../context';
import Section from '../Section.vue';
import type { SectionBackground, SectionSpacing } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Section — element and aria naming', () => {
  it('renders a plain div with neither labelledBy nor label', () => {
    const wrapper = mountWith(Section, { slots: { default: 'content' } });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('aria-labelledby')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders a section named by aria-labelledby when labelledBy is set', () => {
    const wrapper = mountWith(Section, { props: { labelledBy: 'block-heading' } });
    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.attributes('aria-labelledby')).toBe('block-heading');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders a section named by aria-label when only label is set', () => {
    const wrapper = mountWith(Section, { props: { label: 'Newsletter' } });
    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.attributes('aria-label')).toBe('Newsletter');
    expect(wrapper.attributes('aria-labelledby')).toBeUndefined();
    wrapper.unmount();
  });

  it('prefers labelledBy over label when both are given', () => {
    const wrapper = mountWith(Section, {
      props: { labelledBy: 'block-heading', label: 'Newsletter' },
    });
    expect(wrapper.attributes('aria-labelledby')).toBe('block-heading');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('treats null labelledBy/label the same as absent', () => {
    const wrapper = mountWith(Section, { props: { labelledBy: null, label: null } });
    expect(wrapper.element.tagName).toBe('DIV');
    wrapper.unmount();
  });

  it('overrides the tag with as, keeping aria attributes independent of it', () => {
    const wrapper = mountWith(Section, { props: { as: 'footer' } });
    expect(wrapper.element.tagName).toBe('FOOTER');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();

    const labelled = mountWith(Section, { props: { as: 'header', label: 'Site header' } });
    expect(labelled.element.tagName).toBe('HEADER');
    expect(labelled.attributes('aria-label')).toBe('Site header');
    labelled.unmount();
  });

  it('names the root part', () => {
    const wrapper = mountWith(Section);
    expect(wrapper.attributes('data-part')).toBe('root');
    wrapper.unmount();
  });
});

describe('Section — background', () => {
  it.each<[SectionBackground, string[]]>([
    ['none', ['bg-background', 'text-text']],
    ['surface', ['bg-surface', 'text-text']],
    ['surface-strong', ['bg-surface-strong', 'text-text']],
    ['primary', ['bg-primary', 'text-primary-contrast']],
    ['accent', ['bg-accent', 'text-accent-contrast']],
  ])('applies the %s ground fill and text colour', (background, classNames) => {
    const wrapper = mountWith(Section, { props: { background } });
    for (const className of classNames) expect(wrapper.classes()).toContain(className);
    wrapper.unmount();
  });

  it('defaults to none', () => {
    const wrapper = mountWith(Section);
    expect(wrapper.classes()).toContain('bg-background');
    wrapper.unmount();
  });

  it.each<SectionBackground>(['primary', 'accent'])(
    'marks a %s ground with data-section and group/section for the inversion mechanism',
    (background) => {
      const wrapper = mountWith(Section, { props: { background } });
      expect(wrapper.attributes('data-section')).toBe(background);
      expect(wrapper.classes()).toContain('group/section');
      wrapper.unmount();
    }
  );

  it.each<SectionBackground>(['none', 'surface', 'surface-strong'])(
    'never marks a %s ground with data-section or group/section',
    (background) => {
      const wrapper = mountWith(Section, { props: { background } });
      expect(wrapper.attributes('data-section')).toBeUndefined();
      expect(wrapper.classes()).not.toContain('group/section');
      wrapper.unmount();
    }
  );

  it.each<SectionBackground>(['none', 'surface', 'surface-strong', 'primary', 'accent'])(
    'always marks its ground with data-section-bg, for the adjacent-background rule',
    (background) => {
      const wrapper = mountWith(Section, { props: { background } });
      expect(wrapper.attributes('data-section-bg')).toBe(background);
      wrapper.unmount();
    }
  );
});

describe('Section — spacing', () => {
  it.each<[SectionSpacing, string[]]>([
    ['sm', ['pt-[var(--eldra-section-sm)]', 'pb-[var(--eldra-section-sm)]']],
    ['md', ['pt-[var(--eldra-section-md)]', 'pb-[var(--eldra-section-md)]']],
    ['lg', ['pt-[var(--eldra-section-lg)]', 'pb-[var(--eldra-section-lg)]']],
  ])('applies the %s padding-block tokens', (spacing, classNames) => {
    const wrapper = mountWith(Section, { props: { spacing } });
    for (const className of classNames) expect(wrapper.classes()).toContain(className);
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Section);
    expect(wrapper.classes()).toContain('pt-[var(--eldra-section-md)]');
    wrapper.unmount();
  });

  it('applies no padding utility for none', () => {
    const wrapper = mountWith(Section, { props: { spacing: 'none' } });
    expect(wrapper.classes().join(' ')).not.toMatch(/(^|\s)p[tb]-/);
    wrapper.unmount();
  });
});

describe('Section — container context', () => {
  it('is a @container, so descendant container queries measure it, not the viewport', () => {
    const wrapper = mountWith(Section);
    expect(wrapper.classes()).toContain('@container');
    wrapper.unmount();
  });
});

describe('Section — SECTION_KEY', () => {
  it('provides SECTION_KEY to descendants', () => {
    let injected: unknown;
    const Probe = defineComponent({
      setup() {
        injected = inject(SECTION_KEY, undefined);
        return () => h('span', 'probe');
      },
    });
    const wrapper = mountWith(Section, { slots: { default: () => h(Probe) } });
    expect(injected).toBe(true);
    wrapper.unmount();
  });

  it('warns in development when mounted inside another Section', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Section, {
      slots: { default: () => h(Section, null, { default: () => 'nested' }) },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nested inside another'));
    wrapper.unmount();
  });

  it('does not warn for two Sections that are siblings, not nested', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Siblings = defineComponent({
      setup: () => () =>
        h('div', [
          h(Section, null, { default: () => 'one' }),
          h(Section, null, { default: () => 'two' }),
        ]),
    });
    const wrapper = mountWith(Siblings);
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Section — customisation', () => {
  it('lets classes.root replace a colour utility instead of landing beside it', () => {
    const wrapper = mountWith(Section, {
      props: { background: 'surface', classes: { root: 'bg-accent' } },
    });
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.classes()).not.toContain('bg-surface');
    wrapper.unmount();
  });
});

describe('Section — content', () => {
  it('renders inside a narrow host without throwing', () => {
    const wrapper = mountNarrow(Section, {
      props: { background: 'primary' },
      slots: { default: 'x' },
    });
    expect(wrapper.text()).toBe('x');
    wrapper.unmount();
  });
});

describe('Section — accessibility', () => {
  it.each<[string, Record<string, unknown>]>([
    ['default', {}],
    ['labelled by a heading id', { labelledBy: 'heading-id' }],
    ['labelled directly', { label: 'Newsletter' }],
    ['primary background', { background: 'primary' }],
    ['accent background', { background: 'accent' }],
    ['as a footer', { as: 'footer' }],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(Section, {
      props,
      slots: {
        default:
          props.labelledBy !== undefined
            ? () => h('h2', { id: props.labelledBy as string }, 'Heading')
            : 'Content',
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
