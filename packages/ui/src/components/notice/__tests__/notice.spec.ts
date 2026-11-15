import { IconMapPin } from '@tabler/icons-vue';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Notice from '../Notice.vue';
import type { NoticeTone } from '../types';

const TONES: NoticeTone[] = ['info', 'success', 'warning', 'danger'];

/** Twice the length of a typical notice. */
const LONG_TEXT =
  'We send every order as soon as the roads open again and email you a tracking link when it ' +
  'leaves the warehouse. If you would rather collect your order from the studio, reply to your ' +
  'confirmation email and we will hold it for you for up to fourteen days.';

describe('Notice — element and parts', () => {
  it('renders a div with the body text and the tone on the root', () => {
    const wrapper = mountWith(Notice, { props: { text: 'Prices include tax.' } });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('data-tone')).toBe('info');
    expect(wrapper.attributes('data-eldra-ui')).toBeDefined();
    expect(wrapper.get('[data-part="text"]').text()).toBe('Prices include tax.');
    wrapper.unmount();
  });

  it('names every part', () => {
    const wrapper = mountWith(Notice, {
      props: { title: 'Saved', text: 'All done.' },
      slots: { actions: () => h('button', { type: 'button' }, 'Undo') },
    });
    for (const part of ['root', 'icon', 'content', 'title', 'text', 'actions']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders no title, text or actions part without their content', () => {
    const wrapper = mountWith(Notice, { props: { title: 'Saved' } });
    expect(wrapper.find('[data-part="text"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="actions"]').exists()).toBe(false);
    wrapper.unmount();

    const bodyOnly = mountWith(Notice, { props: { text: 'All done.' } });
    expect(bodyOnly.find('[data-part="title"]').exists()).toBe(false);
    bodyOnly.unmount();
  });

  it('prefers the default and title slots over the props', () => {
    const wrapper = mountWith(Notice, {
      props: { title: 'Ignored', text: 'Ignored' },
      slots: { default: 'Slot body', title: 'Slot title' },
    });
    expect(wrapper.get('[data-part="title"]').text()).toBe('Slot title');
    expect(wrapper.get('[data-part="text"]').text()).toBe('Slot body');
    wrapper.unmount();
  });

  it('appends `classes` to their parts', () => {
    const wrapper = mountWith(Notice, {
      props: {
        title: 'Saved',
        text: 'All done.',
        classes: { icon: 'x-icon', content: 'x-content', title: 'x-title', text: 'x-text' },
      },
    });
    for (const part of ['icon', 'content', 'title', 'text']) {
      expect(wrapper.get(`[data-part="${part}"]`).classes()).toContain(`x-${part}`);
    }
    wrapper.unmount();
  });
});

describe('Notice — title element', () => {
  it('is a paragraph by default, not a heading', () => {
    const wrapper = mountWith(Notice, { props: { title: 'Saved' } });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('P');
    wrapper.unmount();
  });

  it('is a heading of the given level with `headingLevel`', () => {
    const wrapper = mountWith(Notice, { props: { title: 'Saved', headingLevel: 3 } });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('H3');
    wrapper.unmount();
  });
});

describe('Notice — icon', () => {
  it.each(TONES)('draws a decorative default icon for %s', (tone) => {
    const wrapper = mountWith(Notice, { props: { tone, text: 'Message' } });
    const icon = wrapper.get('[data-part="icon"]');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('draws a different default icon for each tone', () => {
    const drawn = TONES.map((tone) => {
      const wrapper = mountWith(Notice, { props: { tone, text: 'Message' } });
      const paths = wrapper
        .findAll('[data-part="icon"] path')
        .map((path) => path.attributes('d'))
        .join('|');
      wrapper.unmount();
      return paths;
    });
    expect(new Set(drawn).size).toBe(TONES.length);
  });

  it('colours the icon with the tone, and info with the text colour', () => {
    const expected: Record<NoticeTone, string> = {
      info: 'eldra:text-text',
      success: 'eldra:text-success',
      warning: 'eldra:text-warning',
      danger: 'eldra:text-danger',
    };
    for (const tone of TONES) {
      const wrapper = mountWith(Notice, { props: { tone, text: 'Message' } });
      expect(wrapper.get('[data-part="icon"]').classes()).toContain(expected[tone]);
      wrapper.unmount();
    }
  });

  it("draws a caller's icon in place of the default", () => {
    const wrapper = mountWith(Notice, { props: { icon: IconMapPin, text: 'Message' } });
    const svg = wrapper.get('[data-part="icon"] svg');
    expect(svg.classes()).toContain('tabler-icon-map-pin');
    expect(svg.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('draws no icon with `icon: null`', () => {
    const wrapper = mountWith(Notice, { props: { icon: null, text: 'Message' } });
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Notice — live region', () => {
  it.each(['info', 'success', 'warning'] as const)('%s is a polite status', (tone) => {
    const wrapper = mountWith(Notice, { props: { tone, text: 'Message' } });
    expect(wrapper.attributes('role')).toBe('status');
    wrapper.unmount();
  });

  it('danger is an alert, the only assertive tone', () => {
    const wrapper = mountWith(Notice, { props: { tone: 'danger', text: 'Message' } });
    expect(wrapper.attributes('role')).toBe('alert');
    wrapper.unmount();
  });

  it('writes no aria-live of its own: the role carries it', () => {
    for (const tone of TONES) {
      const wrapper = mountWith(Notice, { props: { tone, text: 'Message' } });
      expect(wrapper.attributes('aria-live')).toBeUndefined();
      wrapper.unmount();
    }
  });

  it.each(TONES)('%s has no role with `announce: false`', (tone) => {
    const wrapper = mountWith(Notice, { props: { tone, text: 'Message', announce: false } });
    expect(wrapper.attributes('role')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Notice — keyboard', () => {
  it('adds no tab stop and no key handling of its own', () => {
    const wrapper = mountWith(Notice, { props: { title: 'Saved', text: 'All done.' } });
    expect(wrapper.element.querySelectorAll('[tabindex], button, a, input').length).toBe(0);
    wrapper.unmount();
  });

  it('Tab reaches a control in the actions slot, in document order, and its own key still works', async () => {
    let activated = 0;
    const wrapper = mountWith(Notice, {
      props: { text: 'All done.' },
      slots: {
        actions: () => h('button', { type: 'button', onKeydown: () => activated++ }, 'Undo'),
      },
    });
    const button = wrapper.get('[data-part="actions"] button');
    expect(button.attributes('tabindex')).toBeUndefined();
    (button.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(button.element);
    await button.trigger('keydown', { key: 'Enter' });
    expect(activated).toBe(1);
    wrapper.unmount();
  });
});

describe('Notice — accessibility', () => {
  it.each(TONES)('%s has no axe violations', async (tone) => {
    const wrapper = mountWith(Notice, { props: { tone, title: 'Title', text: 'Message' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('body only, no icon, not announced: no axe violations', async () => {
    const wrapper = mountWith(Notice, {
      props: { text: 'Message', icon: null, announce: false },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('heading title with actions: no axe violations', async () => {
    const wrapper = mountWith(Notice, {
      props: { tone: 'success', title: 'Thank you', headingLevel: 2, text: 'We reply soon.' },
      slots: { actions: () => h('button', { type: 'button' }, 'Back') },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('long content in a narrow container: no axe violations', async () => {
    const wrapper = mountNarrow(Notice, {
      props: { tone: 'warning', title: LONG_TEXT, text: LONG_TEXT },
    });
    expect(wrapper.get('[data-part="text"]').text()).toBe(LONG_TEXT);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
