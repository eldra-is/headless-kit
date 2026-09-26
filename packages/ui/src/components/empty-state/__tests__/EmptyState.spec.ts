import { IconHeart } from '@tabler/icons-vue';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import EmptyState from '../EmptyState.vue';

/** Well over the spec's "one or two sentences" and its 36ch text measure. */
const LONG_TEXT =
  'The connection dropped while loading Ceramics, and we were not able to reach the server ' +
  'again after several attempts of retrying automatically in the background before giving up.';

describe('EmptyState — element and parts', () => {
  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'Your cart is empty', text: 'Start shopping' },
      slots: { actions: '<button type="button">Shop</button>' },
    });
    for (const part of ['root', 'icon', 'title', 'text', 'actions']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders the title in the default h3 element with the title text', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    const title = wrapper.get('[data-part="title"]');
    expect(title.element.tagName).toBe('H3');
    expect(title.text()).toBe('Your cart is empty');
    wrapper.unmount();
  });

  it.each([2, 3, 4, 5, 6] as const)('renders the title as h%s via headingLevel', (level) => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'Your cart is empty', headingLevel: level },
    });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe(`H${level}`);
    wrapper.unmount();
  });

  it('renders no text part when text is null (the default)', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(wrapper.find('[data-part="text"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the text part when text is given', () => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'Your cart is empty', text: 'Free shipping over $80' },
    });
    expect(wrapper.get('[data-part="text"]').text()).toBe('Free shipping over $80');
    wrapper.unmount();
  });
});

describe('EmptyState — roles', () => {
  it('is role="status" for the empty variant', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(wrapper.attributes('role')).toBe('status');
    wrapper.unmount();
  });

  it('is role="status" for the noResults variant', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'noResults', title: 'No results for "wool"' },
    });
    expect(wrapper.attributes('role')).toBe('status');
    wrapper.unmount();
  });

  it('is role="alert" for the error variant', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products" },
    });
    expect(wrapper.attributes('role')).toBe('alert');
    wrapper.unmount();
  });
});

describe('EmptyState — plain', () => {
  it('drops the border and background when plain', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'No saved items yet', plain: true } });
    expect(wrapper.classes()).not.toContain('border-dashed');
    expect(wrapper.classes()).not.toContain('bg-background');
    wrapper.unmount();
  });

  it('draws the dashed border and background by default', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(wrapper.classes()).toContain('border-dashed');
    expect(wrapper.classes()).toContain('bg-background');
    wrapper.unmount();
  });
});

describe('EmptyState — icons', () => {
  it('draws a built-in svg icon per variant when none is given', () => {
    const empty = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(empty.get('[data-part="icon"]').find('svg').exists()).toBe(true);
    empty.unmount();

    const noResults = mountWith(EmptyState, {
      props: { variant: 'noResults', title: 'No results' },
    });
    expect(noResults.get('[data-part="icon"]').find('svg').exists()).toBe(true);
    noResults.unmount();

    const error = mountWith(EmptyState, { props: { variant: 'error', title: 'Failed' } });
    expect(error.get('[data-part="icon"]').find('svg').exists()).toBe(true);
    error.unmount();
  });

  it('renders the built-in icons with different path data per variant', () => {
    const empty = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    const noResults = mountWith(EmptyState, {
      props: { variant: 'noResults', title: 'No results' },
    });
    const error = mountWith(EmptyState, { props: { variant: 'error', title: 'Failed' } });

    const paths = (w: typeof empty) => w.get('[data-part="icon"] svg').html();
    expect(paths(empty)).not.toBe(paths(noResults));
    expect(paths(noResults)).not.toBe(paths(error));
    expect(paths(empty)).not.toBe(paths(error));

    empty.unmount();
    noResults.unmount();
    error.unmount();
  });

  it('renders a caller-supplied icon component instead of the built-in default', () => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'No saved items yet', icon: IconHeart },
    });
    // The caller's component renders in place of the built-in default markup.
    expect(wrapper.findComponent(IconHeart).exists()).toBe(true);
    wrapper.unmount();
  });

  it('colours the icon text for empty and noResults', () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(wrapper.get('[data-part="icon"]').classes()).toContain('text-text');
    expect(wrapper.get('[data-part="icon"]').classes()).not.toContain('text-danger');
    wrapper.unmount();
  });

  it('colours the icon danger for error, default or caller-supplied icon alike', () => {
    const builtIn = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products" },
    });
    expect(builtIn.get('[data-part="icon"]').classes()).toContain('text-danger');
    builtIn.unmount();

    const custom = mountWith(EmptyState, {
      props: { variant: 'error', title: 'Failed', icon: IconHeart },
    });
    expect(custom.get('[data-part="icon"]').classes()).toContain('text-danger');
    custom.unmount();
  });
});

describe('EmptyState — actions and the built-in Try again button', () => {
  it('renders no actions row for empty/noResults with no actions slot', () => {
    const empty = mountWith(EmptyState, { props: { title: 'Your cart is empty' } });
    expect(empty.find('[data-part="actions"]').exists()).toBe(false);
    empty.unmount();

    const noResults = mountWith(EmptyState, {
      props: { variant: 'noResults', title: 'No results' },
    });
    expect(noResults.find('[data-part="actions"]').exists()).toBe(false);
    noResults.unmount();
  });

  it('renders the actions row when the actions slot is given, whatever the variant', () => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'Your cart is empty' },
      slots: { actions: '<button type="button">Shop</button>' },
    });
    expect(wrapper.find('[data-part="actions"]').exists()).toBe(true);
    expect(wrapper.get('[data-part="actions"]').text()).toBe('Shop');
    wrapper.unmount();
  });

  it('renders a built-in "Try again" button for error with no actions slot', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products" },
    });
    const actions = wrapper.get('[data-part="actions"]');
    const button = actions.get('button');
    expect(button.text()).toBe('Try again');
    wrapper.unmount();
  });

  it('emits retry when the built-in button is activated', async () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products" },
    });
    await wrapper.get('[data-part="actions"] button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
    wrapper.unmount();
  });

  it('marks the built-in button aria-busy while retrying', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: 'Failed', retrying: true },
    });
    expect(wrapper.get('[data-part="actions"] button').attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  it('does not set aria-busy on the built-in button while not retrying', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: 'Failed' },
    });
    expect(wrapper.get('[data-part="actions"] button').attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes retrying to a caller-supplied actions slot via its scope', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: 'Failed', retrying: true },
      slots: {
        actions: `<template #actions="{ retrying }">
          <button type="button" :aria-busy="retrying">Try again</button>
        </template>`,
      },
    });
    expect(wrapper.get('[data-part="actions"] button').attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });
});

describe('EmptyState — long content and narrow container', () => {
  it('renders long text without throwing, still inside the text part', () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products", text: LONG_TEXT },
    });
    expect(wrapper.get('[data-part="text"]').text()).toBe(LONG_TEXT);
    expect(wrapper.get('[data-part="text"]').classes()).toContain('max-w-[36ch]');
    wrapper.unmount();
  });

  it('renders inside a 20rem container without throwing', () => {
    const wrapper = mountNarrow(EmptyState, {
      props: {
        variant: 'noResults',
        title: 'No results for "hand-thrown ceramics"',
        text: 'Check the spelling or try a broader word.',
      },
      slots: {
        actions:
          '<button type="button">Clear filters</button><button type="button">Browse all</button>',
      },
    });
    // `.get()` throws if the root part is missing; reaching this assertion is proof it rendered.
    expect(wrapper.get('[data-part="root"]').element.tagName).toBe('DIV');
    wrapper.unmount();
  });
});

describe('EmptyState — accessibility', () => {
  it('has no axe violations for empty', async () => {
    const wrapper = mountWith(EmptyState, {
      props: { title: 'Your cart is empty', text: 'Free shipping on orders over $80.' },
      slots: { actions: '<button type="button">Shop bestsellers</button>' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for noResults', async () => {
    const wrapper = mountWith(EmptyState, {
      props: { variant: 'noResults', title: 'No results for "alpaca mittens"' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for error, with and without the built-in Try again button', async () => {
    const withDefault = mountWith(EmptyState, {
      props: { variant: 'error', title: "We couldn't load these products" },
    });
    expect(await axe(withDefault.element)).toHaveNoViolations();
    withDefault.unmount();

    const retrying = mountWith(EmptyState, {
      props: { variant: 'error', title: 'Failed', retrying: true },
    });
    expect(await axe(retrying.element)).toHaveNoViolations();
    retrying.unmount();
  });

  it('has no axe violations when plain', async () => {
    const wrapper = mountWith(EmptyState, { props: { title: 'No saved items yet', plain: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
