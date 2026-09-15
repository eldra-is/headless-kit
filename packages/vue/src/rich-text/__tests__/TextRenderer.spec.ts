import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import TextRenderer from '../TextRenderer.vue';
import type { RichTextDocument } from '../types';

const content: RichTextDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Plain text heading' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
        { type: 'hardBreak' },
        { type: 'text', text: 'from TipTap content.' },
      ],
    },
  ],
};

function mountTextRenderer(
  props: Partial<InstanceType<typeof TextRenderer>['$props']> = {},
  options: Omit<NonNullable<Parameters<typeof mount>[1]>, 'props'> = {}
) {
  return mount(TextRenderer, { props: { content, ...props }, ...options });
}

describe('TextRenderer', () => {
  it('renders as a span by default', () => {
    const wrapper = mountTextRenderer();

    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.text()).toBe('Plain text heading Hello world from TipTap content.');

    wrapper.unmount();
  });

  it('supports a custom wrapper element and custom ellipsis', () => {
    const wrapper = mountTextRenderer({ as: 'p', wordCount: 3, ellipsis: ' [more]' });

    expect(wrapper.element.tagName).toBe('P');
    expect(wrapper.text()).toBe('Plain text heading [more]');

    wrapper.unmount();
  });

  it('renders empty text for missing content', () => {
    const wrapper = mountTextRenderer({ content: null });

    expect(wrapper.text()).toBe('');

    wrapper.unmount();
  });

  it('has no axe violations (WCAG 2.2 AA)', async () => {
    const wrapper = mountTextRenderer({}, { attachTo: document.body });

    expect(await axe(wrapper.element)).toHaveNoViolations();

    wrapper.unmount();
  });
});
