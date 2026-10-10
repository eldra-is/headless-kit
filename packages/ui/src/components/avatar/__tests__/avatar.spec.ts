import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Avatar from '../Avatar.vue';
import type { AvatarSize } from '../types';

const SRC = '/demo/maya.jpg';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Avatar — element and parts', () => {
  it('renders a root span with the image part when src is given', () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('data-part')).toBe('root');
    const image = wrapper.get('[data-part="image"]');
    expect(image.element.tagName).toBe('IMG');
    expect(image.attributes('src')).toBe(SRC);
    wrapper.unmount();
  });

  it('accepts a bare string src, the same as ImageMedia.src', () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC } });
    expect(wrapper.get('[data-part="image"]').attributes('src')).toBe(SRC);
    wrapper.unmount();
  });

  it('accepts an ImageMedia object src', () => {
    const wrapper = mountWith(Avatar, { props: { src: { src: SRC, alt: 'ignored' } } });
    expect(wrapper.get('[data-part="image"]').attributes('src')).toBe(SRC);
    wrapper.unmount();
  });

  it('renders the image with an empty alt, always — the root carries the accessible name', () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    expect(wrapper.get('[data-part="image"]').attributes('alt')).toBe('');
    wrapper.unmount();
  });
});

describe('Avatar — fallback order', () => {
  it('falls back to initials when there is no src', () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor' } });
    expect(wrapper.find('[data-part="image"]').exists()).toBe(false);
    expect(wrapper.get('[data-part="initials"]').text()).toBe('MO');
    wrapper.unmount();
  });

  it("takes the first letter of the given and family name ('Jonas Lindqvist' -> 'JL')", () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Jonas Lindqvist' } });
    expect(wrapper.get('[data-part="initials"]').text()).toBe('JL');
    wrapper.unmount();
  });

  it('falls back to the generic user icon when there is neither src nor name', () => {
    const wrapper = mountWith(Avatar, { props: {} });
    expect(wrapper.find('[data-part="image"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="initials"]').exists()).toBe(false);
    const icon = wrapper.get('[data-part="icon"]');
    expect(icon.element.tagName.toLowerCase()).toBe('svg');
    wrapper.unmount();
  });

  it('renders the icon, not initials, when name is an empty string', () => {
    const wrapper = mountWith(Avatar, { props: { name: '' } });
    expect(wrapper.find('[data-part="initials"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('the initials/icon parts are always aria-hidden, whatever `decorative` is', () => {
    const initials = mountWith(Avatar, {
      props: { name: 'Maya Okafor', decorative: false },
    }).get('[data-part="initials"]');
    expect(initials.attributes('aria-hidden')).toBe('true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const icon = mountWith(Avatar, { props: { decorative: false } }).get('[data-part="icon"]');
    warn.mockRestore();
    expect(icon.attributes('aria-hidden')).toBe('true');
  });
});

describe('Avatar — image error fallback', () => {
  it('falls back to initials after the image fires an error event', async () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    expect(wrapper.find('[data-part="image"]').exists()).toBe(true);
    await wrapper.get('[data-part="image"]').trigger('error');
    expect(wrapper.find('[data-part="image"]').exists()).toBe(false);
    expect(wrapper.get('[data-part="initials"]').text()).toBe('MO');
    wrapper.unmount();
  });

  it('falls back to the icon after an error when there is no name either', async () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC } });
    await wrapper.get('[data-part="image"]').trigger('error');
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('recovers once a working src replaces the errored one', async () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    await wrapper.get('[data-part="image"]').trigger('error');
    expect(wrapper.find('[data-part="image"]').exists()).toBe(false);
    await wrapper.setProps({ src: '/demo/other.jpg' });
    expect(wrapper.find('[data-part="image"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Avatar — decorative and standalone accessibility', () => {
  it('defaults to decorative: aria-hidden, no role', () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor' } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('decorative: true is explicit-safe too', () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor', decorative: true } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('standalone (decorative: false) gets role="img" and aria-label set to name', () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor', decorative: false } });
    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Maya Okafor');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    wrapper.unmount();
  });

  it('warns in development when standalone and given no name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Avatar, { props: { decorative: false } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('name');
    wrapper.unmount();
  });

  it('does not warn when standalone and given a name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor', decorative: false } });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not warn while decorative, even with no name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Avatar, { props: {} });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Avatar — sizes', () => {
  const SIZES: Array<[AvatarSize, string, string]> = [
    ['sm', 'size-8', 'text-avatar-initials-sm'],
    ['md', 'size-10', 'text-avatar-initials-md'],
    ['lg', 'size-14', 'text-avatar-initials-lg'],
    ['xl', 'size-24', 'text-avatar-initials-xl'],
  ];

  it.each(SIZES)('renders %s as %s diameter with %s initials type', (size, diameter, initials) => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor', size } });
    expect(wrapper.classes()).toContain(diameter);
    expect(wrapper.get('[data-part="initials"]').classes()).toContain(initials);
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor' } });
    expect(wrapper.classes()).toContain('size-10');
    wrapper.unmount();
  });
});

describe('Avatar — axe', () => {
  it('has no violations with an image', async () => {
    const wrapper = mountWith(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations with initials', async () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations with the icon', async () => {
    const wrapper = mountWith(Avatar, { props: {} });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations standalone', async () => {
    const wrapper = mountWith(Avatar, { props: { name: 'Maya Okafor', decorative: false } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Avatar — narrow container', () => {
  it('renders in a 20rem container without overflowing', () => {
    const wrapper = mountNarrow(Avatar, { props: { src: SRC, name: 'Maya Okafor' } });
    const host = wrapper.element.closest('[data-eldra-narrow-host]') as HTMLElement;
    expect(host).not.toBeNull();
    expect(wrapper.find('[data-part="image"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
