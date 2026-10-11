import { IconPlus } from '@tabler/icons-vue';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import EditorPlaceholder from '../EditorPlaceholder.vue';

/** Well over the spec's example guidance sentences. */
const LONG_HELP =
  'Pick a collection, or choose up to twelve individual products, to show in this grid — ' +
  'mixing a collection with individual products is not supported for this block.';

describe('EditorPlaceholder — element and parts', () => {
  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { icon: IconPlus, label: 'Add products', help: 'Pick a collection.' },
    });
    for (const part of ['root', 'icon', 'label', 'help']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders the label text', () => {
    const wrapper = mountWith(EditorPlaceholder, { props: { label: 'Add a heading' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Add a heading');
    wrapper.unmount();
  });

  it('renders no icon part when icon is null (the default)', () => {
    const wrapper = mountWith(EditorPlaceholder, { props: { label: 'Add a heading' } });
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the icon part when icon is given', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { icon: IconPlus, label: 'Add products' },
    });
    expect(wrapper.get('[data-part="icon"]').find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders no help part when help is null (the default)', () => {
    const wrapper = mountWith(EditorPlaceholder, { props: { label: 'Add a heading' } });
    expect(wrapper.find('[data-part="help"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the help part when help is given', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { label: 'Add products', help: 'Pick a collection or up to 12 products.' },
    });
    expect(wrapper.get('[data-part="help"]').text()).toBe(
      'Pick a collection or up to 12 products.'
    );
    wrapper.unmount();
  });
});

describe('EditorPlaceholder — no roles', () => {
  it('carries no ARIA role — editor hints never reach the live page', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { icon: IconPlus, label: 'Add products', help: 'Pick a collection.' },
    });
    expect(wrapper.attributes('role')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('EditorPlaceholder — inline', () => {
  it('uses the compact padding when inline', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { label: 'Add a heading', inline: true },
    });
    expect(wrapper.classes()).toContain('p-4');
    expect(wrapper.classes()).not.toContain('p-8');
    wrapper.unmount();
  });

  it('uses the full padding by default', () => {
    const wrapper = mountWith(EditorPlaceholder, { props: { label: 'Add products' } });
    expect(wrapper.classes()).toContain('p-8');
    expect(wrapper.classes()).not.toContain('p-4');
    wrapper.unmount();
  });
});

describe('EditorPlaceholder — long content and narrow container', () => {
  it('renders long help text without throwing', () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { label: 'Add products', help: LONG_HELP },
    });
    expect(wrapper.get('[data-part="help"]').text()).toBe(LONG_HELP);
    wrapper.unmount();
  });

  it('renders inside a 20rem container without throwing', () => {
    const wrapper = mountNarrow(EditorPlaceholder, {
      props: { icon: IconPlus, label: 'Add products', help: LONG_HELP },
    });
    // `.get()` throws if the root part is missing; reaching this assertion is proof it rendered.
    expect(wrapper.get('[data-part="root"]').element.tagName).toBe('DIV');
    wrapper.unmount();
  });
});

describe('EditorPlaceholder — accessibility', () => {
  it('has no axe violations with an icon and help', async () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { icon: IconPlus, label: 'Add products', help: 'Pick a collection.' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations inline with no icon or help', async () => {
    const wrapper = mountWith(EditorPlaceholder, {
      props: { label: 'Add a heading', inline: true },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
