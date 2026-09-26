import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import AccordionItem from '../AccordionItem.vue';

const LONG_CONTENT =
  'Hand-finished merino wool crew neck sweater in a relaxed fit with ribbed cuffs and hem, ' +
  'knitted from traceable New Zealand wool and finished by hand at our studio. Machine wash ' +
  'cold on a wool cycle, reshape while damp and dry flat away from direct heat.';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AccordionItem — disclosure semantics', () => {
  it('is a native <details><summary>, closed by default, with a data-part on every part', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: '100% organic cotton.' },
    });
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(wrapper.get('[data-part="summary"]').element.tagName).toBe('SUMMARY');
    expect(wrapper.get('[data-part="title"]').text()).toBe('Materials & care');
    // SVG elements keep a lowercase `tagName` (they live in the SVG namespace, unlike HTML
    // elements, which are always uppercased).
    expect(wrapper.get('[data-part="chevron"]').element.tagName).toBe('svg');
    expect(wrapper.get('[data-part="panel"]').text()).toBe('100% organic cotton.');
    expect(wrapper.find('[data-part="help"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens when `modelValue` starts true', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(true);
    wrapper.unmount();
  });

  it('the chevron is aria-hidden and decorative', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="chevron"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('hides the native disclosure marker and shows the chevron instead', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="summary"]').classes()).toContain('list-none');
    wrapper.unmount();
  });

  it('carries the chevron rotation utility, self-conditioned on the native [open] attribute', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="chevron"]').classes()).toContain('eldra-accordion-chevron');
    wrapper.unmount();
  });

  it('carries no custom keydown handling: Enter/Space activation is entirely native (untestable in happy-dom, which does not implement the browser default action for a keyboard activation of <summary>)', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    const summary = wrapper.get('[data-part="summary"]');
    // No explicit `tabindex` overriding a native <summary>'s own default focusability, which is as
    // far as this spec can go: happy-dom does not implement the browser's own default action that
    // converts an Enter/Space keypress on a focused <summary> into a click, so that part of the
    // acceptance criteria (Tab reaches every summary; Enter/Space toggles the focused one) is
    // native browser behaviour this component adds no code for — `AccordionItem.vue` has no
    // `@keydown` at all, and `<summary>` is focusable by default with no `tabindex` needed.
    expect(summary.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('clicking the summary opens it, mirrors modelValue, and emits update:modelValue and toggle', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: false },
      slots: { default: 'Body' },
    });
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('clicking again closes it and emits false', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('a real v-model round trip: closing via click updates the bound ref, and the parent can reopen it', async () => {
    const wrapper = mountWith(
      {
        components: { AccordionItem },
        setup: () => ({ open: ref(true) }),
        template: `<AccordionItem title="Materials & care" v-model="open">Body</AccordionItem>`,
      },
      {}
    );
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    expect(details.open).toBe(true);
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect(details.open).toBe(false);
    expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false);
    (wrapper.vm as unknown as { open: boolean }).open = true;
    await wrapper.vm.$nextTick();
    expect(details.open).toBe(true);
    wrapper.unmount();
  });
});

describe('AccordionItem — help text', () => {
  it('renders the help line under the label when given', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="help"]').text()).toBe('Machine washable at 30°C');
    wrapper.unmount();
  });

  it('is part of the summary’s accessible name (plain text alongside the title)', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body' },
    });
    const summaryText = wrapper.get('[data-part="summary"]').text();
    expect(summaryText).toContain('Materials & care');
    expect(summaryText).toContain('Machine washable at 30°C');
    wrapper.unmount();
  });
});

describe('AccordionItem — headingLevel', () => {
  it('renders plain text with no heading by default', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    const title = wrapper.get('[data-part="title"]').element;
    expect(title.tagName).toBe('SPAN');
    wrapper.unmount();
  });

  it('wraps the title in the requested heading level', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', headingLevel: 3 },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('H3');
    wrapper.unmount();
  });
});

describe('AccordionItem — link row (`href`)', () => {
  it('renders a plain <a>, no summary, chevron or panel', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', href: '/pages/size-guide' },
    });
    const root = wrapper.get('[data-part="root"]').element;
    expect(root.tagName).toBe('A');
    expect(root.getAttribute('href')).toBe('/pages/size-guide');
    expect(wrapper.find('[data-part="summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="chevron"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(false);
    expect(wrapper.find('details').exists()).toBe(false);
    wrapper.unmount();
  });

  it('still renders title and help', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', help: 'cm and in', href: '/pages/size-guide' },
    });
    expect(wrapper.get('[data-part="title"]').text()).toBe('Size guide');
    expect(wrapper.get('[data-part="help"]').text()).toBe('cm and in');
    wrapper.unmount();
  });
});

describe('AccordionItem — long content and narrow', () => {
  it('renders long panel content inside the max-width clamp with no overflow error', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: LONG_CONTENT },
    });
    const panel = wrapper.get('[data-part="panel"]');
    expect(panel.classes()).toContain('max-w-[65ch]');
    expect(panel.text()).toBe(LONG_CONTENT);
    wrapper.unmount();
  });

  it('renders in a 20rem-wide container with the chevron still present', () => {
    const wrapper = mountNarrow(AccordionItem, {
      props: {
        title: 'Hand-finished merino wool crew neck sweater in a relaxed fit',
        help: 'Machine wash cold on a wool cycle, reshape while damp',
      },
      slots: { default: 'Body' },
    });
    expect(wrapper.find('[data-part="chevron"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('AccordionItem — accessibility', () => {
  it('has no axe violations when closed', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body copy.' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations when open', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true, headingLevel: 3 },
      slots: { default: 'Body copy.' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations on a link row', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', href: '/pages/size-guide' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
