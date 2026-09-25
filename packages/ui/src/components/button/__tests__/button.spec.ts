import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconArrowRight, IconHeart, IconShoppingBag } from '@tabler/icons-vue';
import { defineComponent, h, ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FORM_SUBMITTING_KEY } from '../../form-layout/context';
import Button from '../Button.vue';
import ButtonGroup from '../ButtonGroup.vue';
import type { ButtonProps, ButtonSize, ButtonVariant } from '../types';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'link', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];

/** Twice the length of the spec's own example label ("Add to cart"). */
const LONG_LABEL = 'Add the Merino crew sweater in Oat to your cart and keep shopping';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Button — element and type', () => {
  it('renders a native button of type button by default', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('data-part')).toBe('container');
    expect(wrapper.text()).toBe('Add to cart');
    wrapper.unmount();
  });

  it('renders an anchor with no type when href is set', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/collections/knitwear' },
      slots: { default: 'Shop knitwear' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/collections/knitwear');
    expect(wrapper.attributes('type')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes type="submit" through to the native button', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', type: 'submit' },
      slots: { default: 'Subscribe' },
    });
    expect(wrapper.attributes('type')).toBe('submit');
    wrapper.unmount();
  });

  it('ignores type when href is set, as the spec says', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', type: 'submit', href: '/checkout' },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('type')).toBeUndefined();
    wrapper.unmount();
  });

  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        iconLeft: IconShoppingBag,
        iconRight: IconArrowRight,
        loading: true,
        label: 'Adding to cart',
      },
      slots: { default: 'Add to cart' },
    });
    for (const part of ['container', 'leadingIcon', 'label', 'trailingIcon', 'spinner']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });
});

describe('Button — sizes', () => {
  it.each([
    ['sm', 'control-h-sm'],
    ['md', 'control-h'],
    ['lg', 'control-h-lg'],
  ] as Array<[ButtonSize, string]>)('gives %s the %s box', (size, expected) => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', size },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain(expected);
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('control-h');
    wrapper.unmount();
  });

  it('grows md to the touch target when its container is narrower than 48rem', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('@max-tablet:target-touch');
    wrapper.unmount();
  });

  it.each(['sm', 'lg'] as ButtonSize[])('never grows %s to the touch target', (size) => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', size },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).not.toContain('@max-tablet:target-touch');
    wrapper.unmount();
  });

  it('never grows the link variant to the touch target and keeps it above the target floor', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'link' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes()).not.toContain('@max-tablet:target-touch');
    expect(wrapper.classes()).not.toContain('control-h');
    expect(wrapper.classes()).toContain('target-min');
    wrapper.unmount();
  });

  it.each(SIZES)('makes an icon-only %s button square with no horizontal padding', (size) => {
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', size, iconOnly: true, icon: IconHeart, label: 'Save for later' },
    });
    expect(wrapper.classes()).toContain('aspect-square');
    expect(wrapper.classes()).toContain('px-0');
    expect(wrapper.find('[data-part="label"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Button — variants', () => {
  it('fills a primary button with the primary role', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.classes()).toContain('text-primary-contrast');
    wrapper.unmount();
  });

  it('draws an outline button with the interactive boundary role', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline' },
      slots: { default: 'View details' },
    });
    expect(wrapper.classes()).toContain('border-border-strong');
    expect(wrapper.classes()).toContain('text-text');
    wrapper.unmount();
  });

  it('underlines the link variant at the spec offset', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'link' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes()).toContain('underline');
    expect(wrapper.classes()).toContain('underline-offset-[0.2em]');
    wrapper.unmount();
  });

  it.each(VARIANTS)('derives the %s hover fill from the token values, never a new colour', (v) => {
    const wrapper = mountWith(Button, { props: { variant: v }, slots: { default: 'Label' } });
    const classes = wrapper.classes().join(' ');
    // Every hover rule is either a colour-mix of a token or a role utility; no literal colour.
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(classes).not.toMatch(/\brgba?\(/);
    wrapper.unmount();
  });

  it('mixes the primary hover fill 14% toward background', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain(
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]'
    );
    wrapper.unmount();
  });

  it('inverts the primary button on a primary section', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('group-data-[section=primary]/section:bg-primary-contrast');
    expect(wrapper.classes()).toContain('group-data-[section=primary]/section:text-primary');
    wrapper.unmount();
  });

  it('inverts the primary button on an accent section', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('group-data-[section=accent]/section:bg-accent-contrast');
    expect(wrapper.classes()).toContain('group-data-[section=accent]/section:text-accent');
    wrapper.unmount();
  });

  it('draws an outline button on a coloured section in the current colour', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline' },
      slots: { default: 'Our story' },
    });
    for (const section of ['primary', 'accent']) {
      expect(wrapper.classes()).toContain(`group-data-[section=${section}]/section:border-current`);
      expect(wrapper.classes()).toContain(`group-data-[section=${section}]/section:text-current`);
    }
    wrapper.unmount();
  });

  it.each(['ghost', 'link'] as ButtonVariant[])(
    'lets a %s button inherit the section text colour',
    (variant) => {
      const wrapper = mountWith(Button, { props: { variant }, slots: { default: 'Clear all' } });
      expect(wrapper.classes()).toContain('group-data-[section=primary]/section:text-current');
      expect(wrapper.classes()).toContain('group-data-[section=accent]/section:text-current');
      wrapper.unmount();
    }
  );
});

describe('Button — states', () => {
  it('disables the native button and takes it out of the tab order', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', disabled: true },
      slots: { default: 'Sold out' },
    });
    const button = wrapper.element as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(wrapper.classes()).toContain('cursor-not-allowed');
    button.focus();
    expect(document.activeElement).not.toBe(button);
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  it('drops the href of a disabled link button so it is not focusable either', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/checkout', disabled: true },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the label in the DOM but invisible while loading, and centres the spinner', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    const label = wrapper.get('[data-part="label"]');
    expect(label.text()).toBe('Add to cart');
    expect(label.classes()).toContain('invisible');
    const spinner = wrapper.get('[data-part="spinner"]');
    expect(spinner.classes()).toContain('absolute');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.classes()).toContain('cursor-progress');
    wrapper.unmount();
  });

  it('hides the icons while loading without losing their width', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        loading: true,
        label: 'Adding to cart',
        iconLeft: IconShoppingBag,
        iconRight: IconArrowRight,
      },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.get('[data-part="leadingIcon"]').classes()).toContain('invisible');
    expect(wrapper.get('[data-part="trailingIcon"]').classes()).toContain('invisible');
    wrapper.unmount();
  });

  it('makes the accessible name the loading label', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.attributes('aria-label')).toBe('Adding to cart');
    wrapper.unmount();
  });

  it('spins the spinner once every 700ms and pulses it under reduced motion', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    const svg = wrapper.get('[data-part="spinner"] svg');
    expect(svg.classes()).toContain('animate-eldra-spin');
    expect(svg.classes()).toContain('motion-reduce:animate-eldra-pulse');
    expect(svg.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('renders no spinner when it is not loading', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });

  it('warns in development when an icon-only button has no label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', iconOnly: true, icon: IconHeart },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('label');
    wrapper.unmount();
  });

  it('names an icon-only button with its label and hides the icon from assistive tech', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: {
        variant: 'ghost',
        iconOnly: true,
        icon: IconHeart,
        label: 'Add Merino crew sweater to wishlist',
      },
    });
    expect(wrapper.attributes('aria-label')).toBe('Add Merino crew sweater to wishlist');
    expect(wrapper.get('[data-part="leadingIcon"] svg').attributes('aria-hidden')).toBe('true');
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('exposes aria-pressed only for a toggle button', () => {
    const plain = mountWith(Button, { props: { variant: 'outline' }, slots: { default: 'Grid' } });
    expect(plain.attributes('aria-pressed')).toBeUndefined();
    plain.unmount();

    const off = mountWith(Button, {
      props: { variant: 'outline', pressed: false },
      slots: { default: 'Grid' },
    });
    expect(off.attributes('aria-pressed')).toBe('false');
    expect(off.classes()).not.toContain('bg-surface-strong');
    off.unmount();

    const on = mountWith(Button, {
      props: { variant: 'outline', pressed: true },
      slots: { default: 'Grid' },
    });
    expect(on.attributes('aria-pressed')).toBe('true');
    // The pressed state is a fill, not only a hue (1.4.1).
    expect(on.classes()).toContain('bg-surface-strong');
    on.unmount();
  });

  it('goes full width when block is set', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', block: true },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.classes()).toContain('w-full');
    wrapper.unmount();
  });

  it('presses down 1px on a live button and never on a disabled one', () => {
    const live = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(live.classes()).toContain('active:translate-y-px');
    live.unmount();

    const dead = mountWith(Button, {
      props: { variant: 'primary', disabled: true },
      slots: { default: 'Sold out' },
    });
    expect(dead.classes()).not.toContain('active:translate-y-px');
    dead.unmount();
  });

  it('holds every colour change to the fast duration and drops it under reduced motion', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('duration-fast');
    expect(wrapper.classes()).toContain('ease-out');
    expect(wrapper.classes()).toContain('motion-reduce:transition-none');
    wrapper.unmount();
  });

  it('wears the one focus ring', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('eldra-focus');
    expect(wrapper.classes()).not.toContain('outline-none');
    wrapper.unmount();
  });
});

describe('Button — events and keyboard', () => {
  it('emits the native click', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')?.[0]?.[0]).toBeInstanceOf(MouseEvent);
    wrapper.unmount();
  });

  it('leaves Enter and Space to the platform on a native button', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    // happy-dom does not run a button's default activation behaviour, so what is asserted is the
    // contract that gives a user Enter/Space for free: a real <button> that is focusable and whose
    // keydown is never cancelled. The rendered activation itself is covered by the Storybook story.
    const button = wrapper.element as HTMLButtonElement;
    button.focus();
    expect(document.activeElement).toBe(button);
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(wrapper.emitted('click')).toBeUndefined();
    button.click();
    expect(wrapper.emitted('click')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not follow a link button on Space', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout' },
      slots: { default: 'Checkout' },
    });
    const anchor = wrapper.element as HTMLAnchorElement;
    anchor.focus();
    await wrapper.trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Button — form submitting context', () => {
  /**
   * What Task 7's `FormLayout` will do: provide the submitting flag the whole form reads. The
   * spec's Form layout row says "submitting: primary button loading, other actions disabled".
   */
  function mountInForm(props: ButtonProps, submitting: boolean) {
    const state = ref(submitting);
    const Form = defineComponent({
      provide: () => ({ [FORM_SUBMITTING_KEY as symbol]: state }),
      render: () => h('form', [h(Button, props, { default: () => 'Label' })]),
    });
    return mountWith(Form);
  }

  it('turns the submit button into a loading button while the form submits', () => {
    const wrapper = mountInForm({ variant: 'primary', type: 'submit', label: 'Subscribing' }, true);
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('disables every other action while the form submits', () => {
    const wrapper = mountInForm({ variant: 'ghost' }, true);
    expect((wrapper.get('button').element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('leaves both alone when the form is not submitting', () => {
    const submit = mountInForm({ variant: 'primary', type: 'submit' }, false);
    expect(submit.get('button').attributes('aria-busy')).toBeUndefined();
    submit.unmount();

    const other = mountInForm({ variant: 'ghost' }, false);
    expect((other.get('button').element as HTMLButtonElement).disabled).toBe(false);
    other.unmount();
  });
});

describe('Button — customisation', () => {
  it('lets classes.container replace a colour utility instead of landing beside it', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', classes: { container: 'bg-accent' } },
      slots: { default: 'Shop the sale' },
    });
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.classes()).not.toContain('bg-primary');
    wrapper.unmount();
  });

  it('merges an override onto every other part', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        loading: true,
        label: 'Adding',
        iconLeft: IconShoppingBag,
        iconRight: IconArrowRight,
        classes: {
          leadingIcon: 'text-accent',
          label: 'uppercase',
          trailingIcon: 'text-accent',
          spinner: 'opacity-50',
        },
      },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.get('[data-part="leadingIcon"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="trailingIcon"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="spinner"]').classes()).toContain('opacity-50');
    wrapper.unmount();
  });

  it('takes its radius from a per-component variable with a token default', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain(
      'rounded-[var(--eldra-button-radius,var(--eldra-radius-md))]'
    );
    wrapper.unmount();
  });

  it('renders the leading and trailing icon slots in place of the icon props', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: {
        default: 'Add to cart',
        leadingIcon: '<span data-testid="leading">L</span>',
        trailingIcon: '<span data-testid="trailing">T</span>',
      },
    });
    expect(wrapper.find('[data-part="leadingIcon"] [data-testid="leading"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="trailingIcon"] [data-testid="trailing"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('falls back to the label prop when no default slot is given', () => {
    const wrapper = mountWith(Button, { props: { variant: 'primary', label: 'Add to cart' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Add to cart');
    wrapper.unmount();
  });
});

describe('Button — content', () => {
  it('never wraps a long label', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: LONG_LABEL },
    });
    const label = wrapper.get('[data-part="label"]');
    expect(label.classes()).toContain('whitespace-nowrap');
    expect(label.text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });

  it('renders with no optional content at all', () => {
    const wrapper = mountWith(Button, { props: { variant: 'primary' } });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="trailingIcon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders inside a narrow container', () => {
    const wrapper = mountNarrow(Button, {
      props: { variant: 'primary', block: true },
      slots: { default: LONG_LABEL },
    });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });
});

describe('Button — accessibility', () => {
  it.each(VARIANTS)('has no axe violations for %s in its default state', async (variant) => {
    const wrapper = mountWith(Button, { props: { variant }, slots: { default: 'Add to cart' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each(VARIANTS)('has no axe violations for a disabled %s button', async (variant) => {
    const wrapper = mountWith(Button, {
      props: { variant, disabled: true },
      slots: { default: 'Sold out' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each(VARIANTS)('has no axe violations for a loading %s button', async (variant) => {
    const wrapper = mountWith(Button, {
      props: { variant, loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each(VARIANTS)('has no axe violations for a pressed %s button', async (variant) => {
    const wrapper = mountWith(Button, {
      props: { variant, pressed: true },
      slots: { default: 'Grid' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for an icon-only button', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', iconOnly: true, icon: IconHeart, label: 'Save for later' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('ButtonGroup', () => {
  const buttons = {
    default: [
      h(Button, { variant: 'primary' as const }, { default: () => 'Shop knitwear' }),
      h(Button, { variant: 'outline' as const }, { default: () => 'Our story' }),
    ],
  };

  it('lays the actions out in a wrapping row with the spec gap', () => {
    const wrapper = mountWith(ButtonGroup, { slots: buttons });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.classes()).toContain('flex');
    expect(wrapper.classes()).toContain('flex-wrap');
    expect(wrapper.classes()).toContain('gap-3');
    expect(wrapper.classes()).toContain('items-center');
    wrapper.unmount();
  });

  it('is a container query context, which is what lets md buttons grow when narrow', () => {
    const wrapper = mountWith(ButtonGroup, { slots: buttons });
    expect(wrapper.classes()).toContain('@container');
    wrapper.unmount();
  });

  it('has no group role unless it is attached', () => {
    const wrapper = mountWith(ButtonGroup, { slots: buttons });
    expect(wrapper.attributes('role')).toBeUndefined();
    wrapper.unmount();
  });

  it('becomes a segmented control when attached', () => {
    const wrapper = mountWith(ButtonGroup, {
      props: { attached: true },
      attrs: { 'aria-label': 'View' },
      slots: buttons,
    });
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.attributes('aria-label')).toBe('View');
    expect(wrapper.classes()).toContain('gap-0');
    // Inner corners square, neighbours overlapping by 1px.
    expect(wrapper.classes()).toContain('[&>*:not(:first-child)]:rounded-l-none');
    expect(wrapper.classes()).toContain('[&>*:not(:last-child)]:rounded-r-none');
    expect(wrapper.classes()).toContain('[&>*:not(:first-child)]:-ml-px');
    // The focused button is raised so its ring is never covered by a neighbour.
    expect(wrapper.classes()).toContain('[&>*:focus-visible]:relative');
    wrapper.unmount();
  });

  it('lets classes.root replace a utility', () => {
    const wrapper = mountWith(ButtonGroup, {
      props: { classes: { root: 'gap-6' } },
      slots: buttons,
    });
    expect(wrapper.classes()).toContain('gap-6');
    expect(wrapper.classes()).not.toContain('gap-3');
    wrapper.unmount();
  });

  it('has no axe violations, attached or not', async () => {
    const loose = mountWith(ButtonGroup, { slots: buttons });
    expect(await axe(loose.element)).toHaveNoViolations();
    loose.unmount();

    const attached = mountWith(ButtonGroup, {
      props: { attached: true },
      attrs: { 'aria-label': 'View' },
      slots: {
        default: [
          h(Button, { variant: 'outline' as const, pressed: true }, { default: () => 'Grid' }),
          h(Button, { variant: 'outline' as const, pressed: false }, { default: () => 'List' }),
        ],
      },
    });
    expect(await axe(attached.element)).toHaveNoViolations();
    attached.unmount();
  });

  it('renders in a narrow container', () => {
    const wrapper = mountNarrow(ButtonGroup, { slots: buttons });
    expect(wrapper.findAll('button')).toHaveLength(2);
    wrapper.unmount();
  });
});
