import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import LoadMore from '../LoadMore.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('LoadMore — status', () => {
  it('renders the status sentence via showingOf(shown, total, noun)', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const status = wrapper.get('[data-part="status"]').element;
    expect(status.textContent?.trim()).toBe('Showing 24 of 96 products');
    wrapper.unmount();
  });

  it('uses a custom noun', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 3, total: 12, noun: 'articles' } });
    expect(wrapper.get('[data-part="status"]').text()).toBe('Showing 3 of 12 articles');
    wrapper.unmount();
  });

  it('the status is a polite live region', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const status = wrapper.get('[data-part="status"]').element;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    wrapper.unmount();
  });

  it('re-renders the status when shown changes, for the live announcement', async () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    await wrapper.setProps({ shown: 48 });
    expect(wrapper.get('[data-part="status"]').text()).toBe('Showing 48 of 96 products');
    wrapper.unmount();
  });
});

describe('LoadMore — the button hides once shown reaches total', () => {
  it('shows the button while shown < total', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    expect(wrapper.find('[data-part="button"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the button once shown === total', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 96, total: 96 } });
    expect(wrapper.find('[data-part="button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('also hides it defensively if shown somehow exceeds total', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 100, total: 96 } });
    expect(wrapper.find('[data-part="button"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('the button is a real <button type="button"> named "Load more"', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const button = wrapper.get('[data-part="button"]').element as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.textContent?.trim()).toBe('Load more');
    wrapper.unmount();
  });

  it('the button is aria-describedby the status', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const button = wrapper.get('[data-part="button"]').element;
    const status = wrapper.get('[data-part="status"]').element;
    expect(button.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.id).not.toBe('');
    wrapper.unmount();
  });

  it('emits load when the button is activated', async () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    await wrapper.get('[data-part="button"]').trigger('click');
    expect(wrapper.emitted('load')).toHaveLength(1);
    wrapper.unmount();
  });

  it('carries cursor-pointer and the standard focus ring', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const cls = wrapper.get('[data-part="button"]').classes();
    expect(cls).toContain('cursor-pointer');
    expect(cls).toContain('eldra-focus');
    wrapper.unmount();
  });
});

describe('LoadMore — pending (busy) state', () => {
  it('sets aria-busy and shows a spinner while pending', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96, pending: true } });
    const button = wrapper.get('[data-part="button"]').element;
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(wrapper.find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('has no aria-busy and no spinner while idle', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96, pending: false } });
    const button = wrapper.get('[data-part="button"]').element;
    expect(button.hasAttribute('aria-busy')).toBe(false);
    expect(wrapper.find('svg').exists()).toBe(false);
    wrapper.unmount();
  });

  it("the button stays clickable while pending, like Button's own loading state", () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96, pending: true } });
    const button = wrapper.get('[data-part="button"]').element as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    wrapper.unmount();
  });
});

describe('LoadMore — the meter', () => {
  it('is a decorative, aria-hidden element', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    expect(wrapper.find('[aria-hidden="true"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('fills proportionally to shown/total', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    const fill = wrapper.find('[aria-hidden="true"] > div').element as HTMLElement;
    expect(fill.style.width).toBe('25%');
    wrapper.unmount();
  });

  it('clamps to 100% rather than overflowing when shown exceeds total', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 120, total: 96 } });
    const fill = wrapper.find('[aria-hidden="true"] > div').element as HTMLElement;
    expect(fill.style.width).toBe('100%');
    wrapper.unmount();
  });

  it('never divides by zero when total is 0', () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 0, total: 0 } });
    const fill = wrapper.find('[aria-hidden="true"] > div').element as HTMLElement;
    expect(fill.style.width).toBe('0%');
    wrapper.unmount();
  });
});

describe('LoadMore — classes prop', () => {
  it('merges a classes override onto a named part instead of landing beside it', () => {
    const wrapper = mountWith(LoadMore, {
      props: { shown: 24, total: 96, classes: { root: 'gap-6', status: 'text-body' } },
    });
    expect(wrapper.get('[data-part="root"]').classes()).toContain('gap-6');
    const statusClasses = wrapper.get('[data-part="status"]').classes();
    expect(statusClasses).toContain('text-body');
    expect(statusClasses).not.toContain('text-body-sm');
    wrapper.unmount();
  });
});

describe('LoadMore — accessibility', () => {
  it('is axe-clean with the button showing', async () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean pending', async () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 24, total: 96, pending: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is axe-clean once complete (button hidden)', async () => {
    const wrapper = mountWith(LoadMore, { props: { shown: 96, total: 96 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('LoadMore — narrow container', () => {
  it('renders in a 20rem host without overflowing (the meter caps at min(14rem, 100%))', () => {
    const wrapper = mountNarrow(LoadMore, { props: { shown: 24, total: 96 } });
    expect(wrapper.find('[data-part="root"]').exists()).toBe(true);
    const track = wrapper.find('[aria-hidden="true"]').element as HTMLElement;
    expect(track.className).toContain('w-full');
    expect(track.className).toContain('max-w-56');
    wrapper.unmount();
  });
});
