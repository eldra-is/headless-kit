import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import LogoItem from '../LogoItem.vue';
import type { LogoItemProps } from '../types';
import type { ImageMedia } from '../../image/types';

const LOGO: ImageMedia = {
  src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  width: 200,
  height: 60,
};

/** Twice the length of a typical stockist name — the spec's own 1.4.10 wrapping criterion. */
const LONG_NAME = 'The Northern Ceramics and Homeware Collective of Porto and Lisbon';

/**
 * `LogoItem`'s root is a real `<li>` (see the component's own comment), and axe's `listitem` rule
 * flags a stray one with no `<ul>`/`<ol>`/`role="list"` ancestor — exactly the container the spec
 * itself puts every logo item in ("Render the cloud as `<ul role="list">`"). Every mount in this
 * file goes through this helper (or `mountNarrowInList`) rather than `mountWith`/`mountNarrow`
 * directly, so that container is never missing.
 */
function mountInList(props: LogoItemProps) {
  const Harness = defineComponent({
    setup: () => () => h('ul', { role: 'list' }, [h(LogoItem, props)]),
  });
  return mountWith(Harness);
}

function mountNarrowInList(props: LogoItemProps) {
  const Harness = defineComponent({
    setup: () => () => h('ul', { role: 'list' }, [h(LogoItem, props)]),
  });
  return mountNarrow(Harness);
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('LogoItem — element and semantics', () => {
  it('renders a real <li>, unlinked', () => {
    const wrapper = mountInList({ name: 'Kiln Street' });
    const li = wrapper.get('li');
    expect(li.attributes('data-part')).toBe('root');
    wrapper.unmount();
  });

  it('renders an <a> for the cell when linked, still inside a real <li>', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/stockists/kiln-street' });
    expect(wrapper.findAll('li').length).toBe(1);
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.element.tagName).toBe('A');
    expect(cell.attributes('href')).toBe('/stockists/kiln-street');
    wrapper.unmount();
  });

  it('is not focusable when unlinked', () => {
    const wrapper = mountInList({ name: 'Kiln Street' });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.get('li').attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('is reachable by Tab and activates with Enter when linked', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/stockists/kiln-street' });
    const anchor = wrapper.get('a').element as HTMLAnchorElement;
    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    wrapper.unmount();
  });
});

describe('LogoItem — image alt', () => {
  it('uses the company name as the image alt, never "logo"', () => {
    const wrapper = mountInList({ name: 'Kiln Street', logo: LOGO });
    const img = wrapper.get('[data-part="image"]');
    expect(img.attributes('alt')).toBe('Kiln Street');
    expect(img.attributes('alt')?.toLowerCase()).not.toContain('logo');
    wrapper.unmount();
  });

  it('ignores media.alt entirely — the name always wins', () => {
    const wrapper = mountInList({
      name: 'Kiln Street',
      logo: { ...LOGO, alt: 'Kiln Street logo' },
    });
    expect(wrapper.get('[data-part="image"]').attributes('alt')).toBe('Kiln Street');
    wrapper.unmount();
  });
});

describe('LogoItem — wordmark fallback', () => {
  it('renders the wordmark when there is no logo', () => {
    const wrapper = mountInList({ name: 'Kiln Street' });
    expect(wrapper.find('[data-part="image"]').exists()).toBe(false);
    const wordmark = wrapper.get('[data-part="wordmark"]');
    expect(wordmark.text()).toBe('Kiln Street');
    wrapper.unmount();
  });

  it('renders the image instead of the wordmark when a logo is given', () => {
    const wrapper = mountInList({ name: 'Kiln Street', logo: LOGO });
    expect(wrapper.find('[data-part="wordmark"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="image"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('never renders an empty cell', () => {
    const wrapper = mountInList({ name: 'Kiln Street', logo: null });
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.text().trim().length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('lets a long wordmark wrap instead of forcing no-wrap', () => {
    const wrapper = mountInList({ name: LONG_NAME });
    const wordmark = wrapper.get('[data-part="wordmark"]');
    expect(wordmark.classes()).not.toContain('whitespace-nowrap');
    expect(wordmark.classes()).toContain('text-balance');
    expect(wordmark.text()).toBe(LONG_NAME);
    wrapper.unmount();
  });
});

describe('LogoItem — link and context', () => {
  it('adds the default stockist-site context for an external href', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: 'https://kilnstreet.example' });
    const srText = wrapper.get('[data-part="srText"]');
    expect(srText.text()).toBe(enUS.stockistSite.trim());
    expect(wrapper.get('a').text()).toContain('Kiln Street');
    wrapper.unmount();
  });

  it('adds no context for an internal (root-relative) href', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/stockists/kiln-street' });
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds no context when unlinked', () => {
    const wrapper = mountInList({ name: 'Kiln Street' });
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('an explicit linkContext overrides the default, even internally', () => {
    const wrapper = mountInList({
      name: 'Kiln Street',
      href: '/stockists/kiln-street',
      linkContext: ' (flagship store)',
    });
    expect(wrapper.get('[data-part="srText"]').text()).toBe('(flagship store)');
    wrapper.unmount();
  });

  it('an explicit empty linkContext suppresses the automatic default', () => {
    const wrapper = mountInList({
      name: 'Kiln Street',
      href: 'https://kilnstreet.example',
      linkContext: '',
    });
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('treats a protocol-relative href as external too', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '//kilnstreet.example' });
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('LogoItem — as', () => {
  it('uses a string as the tag and still passes href as href', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/x', as: 'a' });
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.element.tagName).toBe('A');
    expect(cell.attributes('href')).toBe('/x');
    wrapper.unmount();
  });

  it('passes href as `to` when as is a component', () => {
    const FakeNuxtLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { 'data-fake-nuxt-link': props.to }, slots.default?.()),
    });
    const wrapper = mountInList({
      name: 'Kiln Street',
      href: '/stockists/kiln-street',
      as: FakeNuxtLink,
    });
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.attributes('data-fake-nuxt-link')).toBe('/stockists/kiln-street');
    expect(cell.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });

  it('ignores as and renders the bare cell when there is no href', () => {
    const FakeNuxtLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { to: props.to }, slots.default?.()),
    });
    const wrapper = mountInList({ name: 'Kiln Street', as: FakeNuxtLink });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.get('[data-part="root"]').element.tagName).toBe('LI');
    wrapper.unmount();
  });
});

describe('LogoItem — greyscale/hover treatment', () => {
  it('renders the image greyscale, higher contrast, at 75% opacity by default', () => {
    const wrapper = mountInList({ name: 'Kiln Street', logo: LOGO });
    const img = wrapper.get('[data-part="image"]');
    expect(img.classes()).toContain('grayscale');
    expect(img.classes()).toContain('contrast-[1.1]');
    expect(img.classes()).toContain('opacity-75');
    wrapper.unmount();
  });

  it('raises the image to full opacity on hover only when linked', () => {
    const linked = mountInList({ name: 'Kiln Street', logo: LOGO, href: '/x' });
    expect(linked.get('[data-part="image"]').classes()).toContain('group-hover:opacity-100');
    linked.unmount();

    const unlinked = mountInList({ name: 'Kiln Street', logo: LOGO });
    expect(unlinked.get('[data-part="image"]').classes()).not.toContain('group-hover:opacity-100');
    unlinked.unmount();
  });

  it('turns the wordmark from muted to text on hover only when linked', () => {
    const linked = mountInList({ name: 'Kiln Street', href: '/x' });
    const linkedWordmark = linked.get('[data-part="wordmark"]');
    expect(linkedWordmark.classes()).toContain('text-muted');
    expect(linkedWordmark.classes()).toContain('group-hover:text-text');
    linked.unmount();

    const unlinked = mountInList({ name: 'Kiln Street' });
    const unlinkedWordmark = unlinked.get('[data-part="wordmark"]');
    expect(unlinkedWordmark.classes()).toContain('text-muted');
    expect(unlinkedWordmark.classes()).not.toContain('group-hover:text-text');
    unlinked.unmount();
  });

  it('puts the focus ring on the linked cell with radius-md corners', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/x' });
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.classes()).toContain('eldra-focus');
    expect(cell.classes()).toContain('rounded-md');
    wrapper.unmount();
  });

  it('carries no transition utility beside eldra-focus on the linked cell', () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: '/x' });
    const classes = wrapper.get('[data-part="root"]').classes();
    expect(classes.some((c) => c.startsWith('transition') || c.startsWith('duration'))).toBe(false);
    wrapper.unmount();
  });

  it('cells are at least 4rem tall', () => {
    const wrapper = mountInList({ name: 'Kiln Street' });
    expect(wrapper.get('li').classes()).toContain('min-h-16');
    const linked = mountInList({ name: 'Kiln Street', href: '/x' });
    expect(linked.get('[data-part="root"]').classes()).toContain('min-h-16');
    linked.unmount();
    wrapper.unmount();
  });
});

describe('LogoItem — customisation', () => {
  it('lets classes.root replace a layout utility instead of landing beside it', () => {
    const wrapper = mountInList({ name: 'Kiln Street', classes: { root: 'min-h-24' } });
    const cell = wrapper.get('[data-part="root"]');
    expect(cell.classes()).toContain('min-h-24');
    expect(cell.classes()).not.toContain('min-h-16');
    wrapper.unmount();
  });

  it('merges an override onto every other part', () => {
    const wrapper = mountInList({
      name: 'Kiln Street',
      logo: LOGO,
      href: 'https://kilnstreet.example',
      classes: { image: 'grayscale-0', srText: 'italic' },
    });
    expect(wrapper.get('[data-part="image"]').classes()).toContain('grayscale-0');
    expect(wrapper.get('[data-part="srText"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('LogoItem — accessibility and narrow', () => {
  it('has no axe violations unlinked, with a logo', async () => {
    const wrapper = mountInList({ name: 'Kiln Street', logo: LOGO });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations linked, with the wordmark and external context', async () => {
    const wrapper = mountInList({ name: 'Kiln Street', href: 'https://kilnstreet.example' });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders inside a narrow container without overflowing', () => {
    const wrapper = mountNarrowInList({ name: LONG_NAME, href: '/stockists/northern-ceramics' });
    expect(wrapper.get('a').text()).toContain(LONG_NAME);
    wrapper.unmount();
  });
});
