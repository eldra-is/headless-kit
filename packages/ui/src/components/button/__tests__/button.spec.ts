import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconArrowRight, IconHeart, IconShoppingBag } from '@tabler/icons-vue';
import { computed, defineComponent, h, ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FORM_SUBMITTING_KEY } from '../../form-layout/context';
import Button from '../Button.vue';
import ButtonGroup from '../ButtonGroup.vue';
import type { ButtonProps, ButtonSize, ButtonVariant } from '../types';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'link', 'danger'];

/**
 * The press movement the scale replaced, matched as a pattern rather than written out as a class
 * name. Tailwind's source scan reads `src/` — specs included — to build `dist/style.css`, so
 * spelling that class out anywhere in this directory, prose included, emits a real CSS rule for a
 * class nothing uses. `source-scan.spec.ts` fails if one comes back.
 */
const PRESS_TRANSLATE = /active:-?(translate|top|mt)/;
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

describe('Button — as prop', () => {
  /** Where the fake router "navigated", newest last. Reset before every case that reads it. */
  const routed: string[] = [];

  /**
   * A stand-in for NuxtLink / RouterLink: it takes the destination as `to`, never as `href`, **and
   * it navigates the way those components actually do** — from its own click listener, installed
   * on its own root, which therefore runs before any handler a parent passes down through
   * fall-through attributes.
   *
   * That ordering is the whole point. A stub that only rendered an `<a>` could not tell a disabled
   * routed button from a working one: `Button`'s `preventDefault()` stops a *default action*, and a
   * router link's navigation is not one. The `defaultPrevented` check here is the real components'
   * own guard, so a `Button` that manages to stop the navigation stops it here too.
   */
  const FakeRouterLink = defineComponent({
    props: { to: { type: String, required: true } },
    setup(props, { slots }) {
      const onClick = (event: MouseEvent): void => {
        if (event.defaultPrevented) return;
        routed.push(props.to);
      };
      return () => h('a', { 'data-fake-router-link': props.to, onClick }, slots.default?.());
    },
  });

  it('uses a string as the tag and still passes href as href', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout', as: 'a' },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/checkout');
    expect(wrapper.attributes('data-part')).toBe('container');
    wrapper.unmount();
  });

  it('passes href as `to` when as is a component, never as href', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/collections/knitwear', as: FakeRouterLink },
      slots: { default: 'Shop all knitwear' },
    });
    expect(wrapper.attributes('data-fake-router-link')).toBe('/collections/knitwear');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.text()).toBe('Shop all knitwear');
    wrapper.unmount();
  });

  it('ignores as and renders a native button when there is no href', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', as: FakeRouterLink },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('type')).toBe('button');
    expect(wrapper.attributes('data-fake-router-link')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the link form styled as a button', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout', as: FakeRouterLink },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.classes()).toContain('eldra:bg-primary');
    expect(wrapper.classes()).toContain('eldra:eldra-focus');
    expect(wrapper.classes()).toContain('eldra:control-h');
    wrapper.unmount();
  });

  it('routes on click while it is enabled', async () => {
    routed.length = 0;
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/collections/knitwear', as: FakeRouterLink },
      slots: { default: 'Shop all knitwear' },
    });
    await wrapper.trigger('click');
    expect(routed).toEqual(['/collections/knitwear']);
    expect(wrapper.emitted('click')).toHaveLength(1);
    wrapper.unmount();
  });

  it('keeps the disabled-link semantics when routed through a component', async () => {
    routed.length = 0;
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout', as: FakeRouterLink, disabled: true },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.attributes('tabindex')).toBe('-1');
    expect(wrapper.attributes('disabled')).toBeUndefined();
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  /**
   * The defect: a router link navigates from its **own** click listener, not from the default
   * action, and that listener runs before the one `Button` passes down — so `preventDefault()`
   * arrived after `router.push()` had already run and a disabled call to action navigated.
   */
  it('does not navigate when it is disabled', async () => {
    routed.length = 0;
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout', as: FakeRouterLink, disabled: true },
      slots: { default: 'Checkout' },
    });
    await wrapper.trigger('click');
    expect(routed).toEqual([]);
    wrapper.unmount();
  });

  it('falls back to a plain anchor while disabled, and routes again once it is not', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout', as: FakeRouterLink, disabled: true },
      slots: { default: 'Checkout' },
    });
    // Not the router component: a plain `<a href>`, whose navigation IS a default action and can
    // therefore be prevented. The `href` stays so the element keeps `role="link"`.
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('data-fake-router-link')).toBeUndefined();
    expect(wrapper.attributes('href')).toBe('/checkout');

    routed.length = 0;
    await wrapper.setProps({ disabled: false });
    expect(wrapper.attributes('data-fake-router-link')).toBe('/checkout');
    expect(wrapper.attributes('href')).toBeUndefined();
    await wrapper.trigger('click');
    expect(routed).toEqual(['/checkout']);
    wrapper.unmount();
  });

  it('does not navigate while a form it submits into is submitting', async () => {
    // The other way a Button becomes disabled: a `FormLayout` in flight disables every action that
    // is not the submit. That path must stop a routed link too.
    routed.length = 0;
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/cart', as: FakeRouterLink },
      slots: { default: 'Back to cart' },
      global: { provide: { [FORM_SUBMITTING_KEY as symbol]: computed(() => true) } },
    });
    expect(wrapper.element.tagName).toBe('A');
    await wrapper.trigger('click');
    expect(routed).toEqual([]);
    wrapper.unmount();
  });

  it('keeps the icon-only and loading names when routed through a component', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        href: '/wishlist',
        as: FakeRouterLink,
        iconOnly: true,
        icon: IconHeart,
        label: 'Open your wishlist',
        loading: true,
      },
    });
    expect(wrapper.attributes('aria-label')).toBe('Open your wishlist');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('has no axe violations as a routed link', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/collections/knitwear', as: FakeRouterLink },
      slots: { default: 'Shop all knitwear' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Button — sizes', () => {
  it.each([
    ['sm', 'eldra:control-h-sm'],
    ['md', 'eldra:control-h'],
    ['lg', 'eldra:control-h-lg'],
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
    expect(wrapper.classes()).toContain('eldra:control-h');
    wrapper.unmount();
  });

  /**
   * Operator addition, 2026-09-25: "make all scales match so sm button = sm input, base button =
   * base input, large input = large button". The design spec's "Actions and forms" → Compact
   * controls grows an md primary button to `target-touch` (2.75rem) below a 48rem container; that
   * growth is overridden here (README Deviations) so a Button never leaves the shared
   * `control-h-sm`/`control-h`/`control-h-lg` scale the sized fields use, at any variant or size.
   * `src/__tests__/control-heights.spec.ts` guards the same rule across every sized component.
   */
  it.each(
    VARIANTS.filter((variant) => variant !== 'link').flatMap((variant) =>
      SIZES.map((size) => [variant, size] as [ButtonVariant, ButtonSize])
    )
  )(
    'gives the %s variant at size %s the shared control height, never target-touch',
    (variant, size) => {
      const wrapper = mountWith(Button, {
        props: { variant, size },
        slots: { default: 'Add to cart' },
      });
      const expected: Record<ButtonSize, string> = {
        sm: 'eldra:control-h-sm',
        md: 'eldra:control-h',
        lg: 'eldra:control-h-lg',
      };
      expect(wrapper.classes()).toContain(expected[size]);
      expect(wrapper.classes().join(' ')).not.toMatch(/target-touch/);
      wrapper.unmount();
    }
  );

  it('never grows the link variant to the touch target and keeps it above the target floor', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'link' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes().join(' ')).not.toMatch(/target-touch/);
    expect(wrapper.classes()).not.toContain('eldra:control-h');
    expect(wrapper.classes()).toContain('eldra:target-min');
    wrapper.unmount();
  });

  it.each(SIZES)('makes an icon-only %s button square with no horizontal padding', (size) => {
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', size, iconOnly: true, icon: IconHeart, label: 'Save for later' },
    });
    expect(wrapper.classes()).toContain('eldra:aspect-square');
    expect(wrapper.classes()).toContain('eldra:px-0');
    expect(wrapper.classes().join(' ')).not.toMatch(/target-touch/);
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
    expect(wrapper.classes()).toContain('eldra:bg-primary');
    expect(wrapper.classes()).toContain('eldra:text-primary-contrast');
    wrapper.unmount();
  });

  it('draws an outline button with the interactive boundary role', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline' },
      slots: { default: 'View details' },
    });
    expect(wrapper.classes()).toContain('eldra:border-border-strong');
    expect(wrapper.classes()).toContain('eldra:text-text');
    wrapper.unmount();
  });

  it('underlines the link variant at the spec offset', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'link' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes()).toContain('eldra:underline');
    expect(wrapper.classes()).toContain('eldra:underline-offset-[0.2em]');
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

  it.each(VARIANTS)(
    'shows cursor-pointer on the live %s variant (operator report, 2026-09-25)',
    (v) => {
      const wrapper = mountWith(Button, { props: { variant: v }, slots: { default: 'Label' } });
      expect(wrapper.classes()).toContain('eldra:cursor-pointer');
      wrapper.unmount();
    }
  );

  it('mixes the primary hover fill 14% toward background', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain(
      'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-primary),var(--eldra-color-background)_14%)]'
    );
    wrapper.unmount();
  });

  it('inverts the primary button on a primary section', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('eldra:section-primary:bg-primary-contrast');
    expect(wrapper.classes()).toContain('eldra:section-primary:text-primary');
    wrapper.unmount();
  });

  it('inverts the primary button on an accent section', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('eldra:section-accent:bg-accent-contrast');
    expect(wrapper.classes()).toContain('eldra:section-accent:text-accent');
    wrapper.unmount();
  });

  it('draws an outline button on a coloured section in the current colour', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline' },
      slots: { default: 'Our story' },
    });
    for (const section of ['primary', 'accent']) {
      expect(wrapper.classes()).toContain(`eldra:section-${section}:border-current`);
      expect(wrapper.classes()).toContain(`eldra:section-${section}:text-current`);
    }
    wrapper.unmount();
  });

  it.each(['ghost', 'link'] as ButtonVariant[])(
    'lets a %s button inherit the section text colour',
    (variant) => {
      const wrapper = mountWith(Button, { props: { variant }, slots: { default: 'Clear all' } });
      expect(wrapper.classes()).toContain('eldra:section-primary:text-current');
      expect(wrapper.classes()).toContain('eldra:section-accent:text-current');
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
    expect(wrapper.classes()).toContain('eldra:cursor-not-allowed');
    button.focus();
    expect(document.activeElement).not.toBe(button);
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps a disabled link button a link, and makes it inert', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/checkout', disabled: true },
      slots: { default: 'Checkout' },
    });
    // The href stays: without it the <a> is a generic element, so assistive technology stops
    // saying "link" at the moment the user most needs to hear what the thing is.
    expect(wrapper.attributes('href')).toBe('/checkout');
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    // ...and it is inert: out of the tab order, and it never navigates.
    expect(wrapper.attributes('tabindex')).toBe('-1');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrapper.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  it('leaves an enabled link button in the tab order', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/checkout' },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    expect(wrapper.attributes('aria-disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps the label in the DOM but invisible while loading, and centres the spinner', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    const label = wrapper.get('[data-part="label"]');
    expect(label.text()).toBe('Add to cart');
    expect(label.classes()).toContain('eldra:invisible');
    const spinner = wrapper.get('[data-part="spinner"]');
    expect(spinner.classes()).toContain('eldra:absolute');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.classes()).toContain('eldra:cursor-progress');
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
    expect(wrapper.get('[data-part="leadingIcon"]').classes()).toContain('eldra:invisible');
    expect(wrapper.get('[data-part="trailingIcon"]').classes()).toContain('eldra:invisible');
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
    expect(svg.classes()).toContain('eldra:animate-eldra-spin');
    expect(svg.classes()).toContain('eldra:motion-reduce:animate-eldra-pulse');
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

  it('warns in development when a loading button has no label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true },
      slots: { default: 'Add to cart' },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('label');
    wrapper.unmount();
  });

  it('does not warn when a loading button has a label', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    expect(warn).not.toHaveBeenCalled();
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
    expect(off.classes()).not.toContain('eldra:bg-surface-strong');
    off.unmount();

    const on = mountWith(Button, {
      props: { variant: 'outline', pressed: true },
      slots: { default: 'Grid' },
    });
    expect(on.attributes('aria-pressed')).toBe('true');
    // The pressed state is a fill, not only a hue (1.4.1).
    expect(on.classes()).toContain('eldra:bg-surface-strong');
    on.unmount();
  });

  it('never puts aria-pressed on a link button, and says why', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', href: '/collections', pressed: true },
      slots: { default: 'Grid' },
    });
    // `aria-pressed` is only valid on a button role; an <a href> is a link.
    expect(wrapper.attributes('aria-pressed')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('aria-pressed');
    wrapper.unmount();
  });

  it.each(['primary', 'secondary', 'link', 'danger'] as ButtonVariant[])(
    'warns that a pressed %s button shows no pressed state',
    (variant) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const wrapper = mountWith(Button, {
        props: { variant, pressed: true },
        slots: { default: 'Grid' },
      });
      // The state is still exposed — a screen reader must hear it — but the spec's states table
      // gives the toggle fill to `outline` alone, so nothing shows it.
      expect(wrapper.attributes('aria-pressed')).toBe('true');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('outline');
      wrapper.unmount();
    }
  );

  it.each(['outline', 'ghost'] as ButtonVariant[])(
    'draws the pressed fill on a pressed %s button, and only while pressed is true',
    (variant) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (const pressed of [undefined, false, true]) {
        const wrapper = mountWith(Button, {
          props: { variant, pressed },
          slots: { default: 'Bold' },
        });
        const drawn = pressed === true;
        expect(wrapper.classes().includes('eldra:bg-surface-strong')).toBe(drawn);
        expect(wrapper.classes().includes('eldra:border-border-strong')).toBe(
          drawn || variant === 'outline'
        );
        wrapper.unmount();
      }
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it('draws the pressed fill on a pressed ghost icon-only button', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', iconOnly: true, icon: IconHeart, label: 'Bold', pressed: true },
    });
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    expect(wrapper.classes()).toEqual(
      expect.arrayContaining(['eldra:bg-surface-strong', 'eldra:border-border-strong'])
    );
    expect(wrapper.classes()).not.toContain('eldra:bg-transparent');
    expect(wrapper.classes()).not.toContain('eldra:border-transparent');
    wrapper.unmount();
  });

  it('keeps a disabled pressed ghost button dead, without the pressed fill', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', pressed: true, disabled: true },
      slots: { default: 'Bold' },
    });
    expect(wrapper.classes()).not.toContain('eldra:bg-surface-strong');
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('says nothing about a pressed outline button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', pressed: true },
      slots: { default: 'Grid' },
    });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('goes full width when block is set', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', block: true },
      slots: { default: 'Checkout' },
    });
    expect(wrapper.classes()).toContain('eldra:w-full');
    expect(wrapper.classes()).not.toContain('eldra:w-fit');
    wrapper.unmount();
  });

  it('fits its content by default, and a width class widens it', () => {
    const fit = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Checkout' },
    });
    expect(fit.classes()).toContain('eldra:w-fit');
    fit.unmount();
    // A consumer width sits beside `eldra:w-fit` and wins by layer; a kit parent's replaces it.
    const wide = mountWith(Button, {
      props: { variant: 'primary' },
      attrs: { class: 'w-full' },
      slots: { default: 'Checkout' },
    });
    expect(wide.classes()).toContain('w-full');
    wide.unmount();
    const fromKit = mountWith(Button, {
      props: { variant: 'primary' },
      attrs: { class: 'eldra:w-full' },
      slots: { default: 'Checkout' },
    });
    expect(fromKit.classes()).toContain('eldra:w-full');
    expect(fromKit.classes()).not.toContain('eldra:w-fit');
    fromKit.unmount();
  });

  /**
   * The press is a scale, not a 1px move (operator decision, 2026-09-25 — README Deviations). The
   * spec's States table says "moves down 1px"; a 1px translate is below the threshold at which a
   * press reads as tactile, so the whole control shrinks to 98% instead.
   */
  it.each(VARIANTS.filter((variant) => variant !== 'link'))(
    'scales a live %s button down on press',
    (variant) => {
      const wrapper = mountWith(Button, { props: { variant }, slots: { default: 'Add to cart' } });
      expect(wrapper.classes()).toContain('eldra:active:scale-[0.98]');
      // The class it replaced must be gone, on every variant: both present would make the button
      // shrink *and* drop, which is neither state.
      expect(wrapper.classes().join(' ')).not.toMatch(PRESS_TRANSLATE);
      wrapper.unmount();
    }
  );

  it('never scales a link button, which has no box to press', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'link' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes()).not.toContain('eldra:active:scale-[0.98]');
    expect(wrapper.classes().join(' ')).not.toMatch(PRESS_TRANSLATE);
    wrapper.unmount();
  });

  it.each(VARIANTS)('gives a disabled %s button no press feedback at all', (variant) => {
    const dead = mountWith(Button, {
      props: { variant, disabled: true },
      slots: { default: 'Sold out' },
    });
    expect(dead.classes()).not.toContain('eldra:active:scale-[0.98]');
    expect(dead.classes().join(' ')).not.toMatch(PRESS_TRANSLATE);
    dead.unmount();
  });

  it('gives a loading button no press feedback either', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    // A loading button stays clickable (it keeps its name and its place in the tab order), so
    // nothing else would have taken the press class away — it is dropped explicitly, because the
    // action is already under way.
    expect(wrapper.classes().join(' ')).not.toMatch(/active:(scale|translate)/);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  /**
   * Reduced motion needs both halves. `eldra-focus`'s `transition: none` takes away the animation,
   * but the button would still jump 2% smaller the instant it is pressed, and an instant jump is
   * still motion — so the scale itself is reset there.
   */
  it('does not scale at all under reduced motion', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('eldra:motion-reduce:active:scale-100');
    wrapper.unmount();
  });

  it('leaves no press translate anywhere in the component source', async () => {
    // The whole point of the decision is that the 1px move is gone, and a single leftover variant
    // string would bring it back for exactly that variant — which no rendered-class assertion
    // above would notice if the variant is one nobody thought to list.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath, URL: NodeURL } = await import('node:url');
    const source = readFileSync(
      fileURLToPath(new NodeURL('../Button.vue', import.meta.url)),
      'utf8'
    );
    // Comments are stripped anyway: the component must not name the class even in prose (see
    // `source-scan.spec.ts`), but a future comment that described the movement in passing should
    // not fail *this* case, which is about the rendered classes.
    const code = source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/<!--[\s\S]*?-->/g, ' ');
    expect(code).not.toMatch(PRESS_TRANSLATE);
  });

  it('leaves the transition list to the focus ring utility', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    // `eldra-focus` declares one `transition` shorthand covering the colour and press changes at
    // `duration-fast` and the ring at `duration-base`, plus the reduced-motion rule. A second
    // shorthand from a `transition-*`/`duration-*` utility here would replace all of it, and the
    // ring would snap in rather than grow. `src/__tests__/focus-transition.spec.ts` enforces this
    // across every component; this keeps the reason next to the Button.
    expect(wrapper.classes()).toContain('eldra:eldra-focus');
    // `[^\s:]+` (not `\S+`) keeps the colon out of the repeated group: since a
    // variant token never contains one itself, this matches exactly the same
    // class strings, but without the ambiguous ways to split a long run of
    // `!:` that make `(\S+:)*` backtrack exponentially (CodeQL).
    expect(wrapper.classes().join(' ')).not.toMatch(/(^|\s)([^\s:]+:)*(transition|duration)-/);
    wrapper.unmount();
  });

  it('wears the one focus ring', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain('eldra:eldra-focus');
    expect(wrapper.classes()).not.toContain('eldra:outline-none');
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

  /**
   * happy-dom does not run a button's default activation behaviour: a `keydown` of `Enter` or
   * `Space` produces no `click`, so "press Enter, expect a click" cannot fail here and would be a
   * test of nothing. The two specs below therefore assert the *contract* that gives a user those
   * keys for free — which can fail, and would fail the moment someone reached for a keyboard
   * handler of their own. Activation as rendered is a manual check against the stories.
   */
  it('meets the native activation contract for Enter and Space', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    const button = wrapper.element as HTMLButtonElement;
    // A real <button>, in the tab order, is what the platform activates on Enter and Space.
    expect(button.tagName).toBe('BUTTON');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('tabindex')).toBeNull();
    button.focus();
    expect(document.activeElement).toBe(button);
    // Nothing cancels those keys, so the default action still runs...
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    // ...and the click it produces is the one the component re-emits.
    button.click();
    expect(wrapper.emitted('click')).toHaveLength(1);
    wrapper.unmount();
  });

  it('meets the link activation contract: Enter follows it, Space is left to the page', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', href: '/checkout' },
      slots: { default: 'Checkout' },
    });
    const anchor = wrapper.element as HTMLAnchorElement;
    // A real <a href> is what the platform follows on Enter and, by the same rule, never on Space.
    expect(anchor.tagName).toBe('A');
    expect(anchor.getAttribute('href')).toBe('/checkout');
    expect(anchor.getAttribute('role')).toBeNull();
    anchor.focus();
    // The component adds no key handling of its own, so Space keeps the page's own meaning
    // (scroll) rather than being turned into an activation.
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    anchor.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Button — form submitting context', () => {
  /**
   * What `FormLayout` does: provide the submitting flag the whole form reads. The spec's Form
   * layout row says "submitting: primary button loading, other actions disabled".
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
  /**
   * The border is `eldra-button-border`, not Tailwind's `border`: an attached `ButtonGroup`
   * overlaps its buttons by `--eldra-button-border-width`, so the border has to read the same
   * variable or a wider border would show as two lines between neighbours.
   */
  it('draws every bordered variant from the button border-width variable', () => {
    for (const variant of VARIANTS) {
      const wrapper = mountWith(Button, { props: { variant }, slots: { default: 'Save' } });
      expect(wrapper.classes()).not.toContain('eldra:border');
      if (variant === 'link') {
        expect(wrapper.classes()).toContain('eldra:border-0');
        expect(wrapper.classes()).not.toContain('eldra:eldra-button-border');
      } else {
        expect(wrapper.classes()).toContain('eldra:eldra-button-border');
      }
      wrapper.unmount();
    }
    const css = readFileSync(new NodeURL('../../../styles/utilities.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /@utility eldra-button-border \{\s*border-width: var\(--eldra-button-border-width, 1px\);/
    );
  });

  it('puts a consumer class on the button itself', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      attrs: { class: 'bg-accent' },
      slots: { default: 'Shop the sale' },
    });
    expect(wrapper.classes()).toContain('bg-accent');
    wrapper.unmount();
  });

  it("merges a parent's class over the container's own and keeps every other attribute on it", () => {
    const onFocus = vi.fn();
    const wrapper = mountWith(Button, {
      props: { variant: 'link', size: 'sm' },
      attrs: { class: 'eldra:px-2', 'data-test': 'clear', style: 'color: red', onFocus },
      slots: { default: 'Clear' },
    });
    expect(wrapper.classes()).toContain('eldra:px-2');
    expect(wrapper.classes()).not.toContain('eldra:px-0');
    expect(wrapper.attributes('data-test')).toBe('clear');
    expect(wrapper.attributes('style')).toContain('color: red');
    void wrapper.trigger('focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('appends an override to every other part', () => {
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
      'eldra:rounded-[var(--eldra-button-radius,var(--eldra-radius-md))]'
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
    expect(label.classes()).toContain('eldra:whitespace-nowrap');
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
    expect(wrapper.classes()).toContain('eldra:flex');
    expect(wrapper.classes()).toContain('eldra:flex-wrap');
    expect(wrapper.classes()).toContain('eldra:gap-3');
    expect(wrapper.classes()).toContain('eldra:items-center');
    wrapper.unmount();
  });

  it('is a container query context, which is what lets md buttons grow when narrow', () => {
    const wrapper = mountWith(ButtonGroup, { slots: buttons });
    expect(wrapper.classes()).toContain('eldra:@container');
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
    expect(wrapper.classes()).toContain('eldra:gap-0');
    // Inner corners square and neighbours overlapping by the button border width, in logical
    // properties: an RTL document squares the same *inner* ends, not the mirrored ones.
    expect(wrapper.classes()).toContain('eldra:[&>*:not(:first-child)]:rounded-s-none');
    expect(wrapper.classes()).toContain('eldra:[&>*:not(:last-child)]:rounded-e-none');
    expect(wrapper.classes()).toContain(
      'eldra:[&>*:not(:first-child)]:-ms-[var(--eldra-button-border-width,1px)]'
    );
    expect(wrapper.classes().join(' ')).not.toMatch(/rounded-[lr]-none|-ml-px/);
    // The focused button is raised so its ring is never covered by a neighbour. It has to be a
    // stacking raise: every Button is already `position: relative` (it positions its spinner), so
    // `[&>*:focus-visible]:relative` changed nothing and the next button kept painting over the
    // ring. `isolate` keeps the z-index from escaping into the page's own layers.
    expect(wrapper.classes()).toContain('eldra:[&>*:focus-visible]:z-10');
    expect(wrapper.classes()).toContain('eldra:isolate');
    expect(wrapper.classes()).not.toContain('eldra:[&>*:focus-visible]:relative');
    wrapper.unmount();
  });

  it('puts a consumer class on the group itself', () => {
    const wrapper = mountWith(ButtonGroup, {
      attrs: { class: 'gap-6' },
      slots: buttons,
    });
    expect(wrapper.classes()).toContain('gap-6');
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

describe('Button — a routed `as` component given `to`', () => {
  const routed: unknown[] = [];
  const RouteLink = defineComponent({
    props: { to: { type: [String, Object], required: true } },
    setup(props, { slots }) {
      const onClick = (event: MouseEvent): void => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        routed.push(props.to);
      };
      const href = () => (typeof props.to === 'string' ? props.to : '/resolved');
      return () => h('a', { href: href(), onClick }, slots.default?.());
    },
  });

  afterEach(() => {
    routed.length = 0;
  });

  it('renders the component with `to`, as a link with no button attributes, and routes', async () => {
    const to = { name: 'product', params: { slug: 'merino' } };
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', as: RouteLink, to, pressed: true },
      slots: { default: 'View product' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('type')).toBeUndefined();
    expect(wrapper.attributes('aria-pressed')).toBeUndefined();
    expect(wrapper.classes()).toContain('eldra:eldra-focus');
    await wrapper.trigger('click');
    expect(routed).toEqual([to]);
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is inert while disabled: aria-disabled, out of the tab order, and never routes', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', as: RouteLink, to: '/products', disabled: true },
      slots: { default: 'View products' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('aria-disabled')).toBe('true');
    expect(wrapper.attributes('tabindex')).toBe('-1');
    expect(wrapper.attributes('disabled')).toBeUndefined();
    await wrapper.trigger('click');
    expect(routed).toEqual([]);
    expect(wrapper.emitted('click')).toBeUndefined();
    wrapper.unmount();
  });

  it('ignores `to` without a component `as`', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', to: '/products' },
      slots: { default: 'View products' },
    });
    expect(wrapper.element.tagName).toBe('BUTTON');
    expect(wrapper.attributes('to')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Button — rich default-slot content', () => {
  it('keeps a plain-text label an inline run', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.find('[data-part="label"]').attributes('class')).toBe('eldra:whitespace-nowrap');
    wrapper.unmount();
  });

  it("lays an icon and text in the slot out in the button's own gap", async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline' },
      slots: { default: () => [h(IconHeart, { 'aria-hidden': 'true' }), 'Save'] },
    });
    const label = wrapper.find('[data-part="label"]');
    expect(label.classes()).toEqual(
      expect.arrayContaining(['eldra:inline-flex', 'eldra:items-center', 'eldra:gap-[inherit]'])
    );
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Button — spinnerPlacement', () => {
  it('keeps the overlay spinner by default', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, label: 'Adding to cart' },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.find('[data-part="spinner"]').classes()).toContain('eldra:absolute');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('eldra:invisible');
    expect(wrapper.attributes('aria-label')).toBe('Adding to cart');
    wrapper.unmount();
  });

  it('draws the spinner inline before a visible label with "start"', async () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        loading: true,
        spinnerPlacement: 'start',
        iconLeft: IconShoppingBag,
      },
      slots: { default: 'Add to cart' },
    });
    const parts = [...wrapper.element.children].map((el) => el.getAttribute('data-part'));
    expect(parts).toEqual(['spinner', 'label']);
    const spinner = wrapper.find('[data-part="spinner"]');
    expect(spinner.classes()).not.toContain('eldra:absolute');
    expect(wrapper.find('[data-part="label"]').classes()).not.toContain('eldra:invisible');
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.text()).toBe('Add to cart');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Button — the focus ring composes with a consumer shadow', () => {
  it("ends eldra-focus's box-shadow with Tailwind's shadow variables, each empty by default", () => {
    const css = readFileSync(
      fileURLToPath(new NodeURL('../../../styles/utilities.css', import.meta.url)),
      'utf8'
    );
    const start = css.indexOf('@utility eldra-focus {');
    const rule = css.slice(start, css.indexOf('transition:', start));
    for (const name of [
      '--tw-inset-shadow',
      '--tw-inset-ring-shadow',
      '--tw-ring-offset-shadow',
      '--tw-ring-shadow',
      '--tw-shadow',
    ]) {
      expect(rule).toContain(`var(${name}, 0 0 #0000)`);
    }
  });
});

describe('Button — a static tag', () => {
  it('renders a string as with no href as that tag, with the look and nothing interactive', async () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'outline', as: 'span', pressed: true, disabled: true, label: 'Edit' },
      slots: { default: 'Edit' },
    });
    expect(wrapper.element.tagName).toBe('SPAN');
    for (const attr of [
      'type',
      'disabled',
      'tabindex',
      'role',
      'aria-pressed',
      'aria-disabled',
      'aria-label',
      'href',
    ]) {
      expect(wrapper.attributes(attr)).toBeUndefined();
    }
    expect(wrapper.attributes('data-part')).toBe('container');
    expect(wrapper.classes()).toContain(
      'eldra:rounded-[var(--eldra-button-radius,var(--eldra-radius-md))]'
    );
    expect(wrapper.text()).toBe('Edit');
    const row = mountWith(
      defineComponent(
        () => () =>
          h('button', { type: 'button' }, [
            h('span', 'Merino crew sweater'),
            h(Button, { variant: 'outline', as: 'span' }, () => 'Edit'),
          ])
      )
    );
    expect(await axe(row.element)).toHaveNoViolations();
    row.unmount();
    wrapper.unmount();
  });

  it('draws the live variant look on the static tag', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', as: 'div' },
      slots: { default: 'Shop' },
    });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.classes()).toContain('eldra:bg-primary');
    wrapper.unmount();
  });

  it("keeps 'button' and 'a' without href a native button", () => {
    for (const as of ['button', 'a']) {
      const wrapper = mountWith(Button, {
        props: { variant: 'primary', as },
        slots: { default: 'Add to cart' },
      });
      expect(wrapper.element.tagName).toBe('BUTTON');
      expect(wrapper.attributes('type')).toBe('button');
      wrapper.unmount();
    }
  });

  it('keeps a string as with href the link form', () => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', as: 'span', href: '/cart' },
      slots: { default: 'Cart' },
    });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('href')).toBe('/cart');
    wrapper.unmount();
  });

  it('does not warn about a name on a static icon-only tag', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'ghost', as: 'span', iconOnly: true, icon: IconHeart },
    });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Button — keepNameWhileLoading', () => {
  it('keeps slot content naming a loading button with no label', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', loading: true, keepNameWhileLoading: true },
      slots: { default: 'Add to cart' },
    });
    const label = wrapper.get('[data-part="label"]');
    expect(label.classes()).toContain('eldra:opacity-0');
    expect(label.classes()).not.toContain('eldra:invisible');
    expect(label.attributes('aria-hidden')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    expect(wrapper.text()).toBe('Add to cart');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(warn).not.toHaveBeenCalled();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('still lets label win as the loading name', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        loading: true,
        keepNameWhileLoading: true,
        label: 'Adding to cart',
      },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.attributes('aria-label')).toBe('Adding to cart');
    wrapper.unmount();
  });

  it('keeps the icons hidden and changes nothing when not loading', () => {
    const wrapper = mountWith(Button, {
      props: {
        variant: 'primary',
        loading: true,
        keepNameWhileLoading: true,
        iconLeft: IconShoppingBag,
      },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.get('[data-part="leadingIcon"]').classes()).toContain('eldra:invisible');
    wrapper.unmount();
    const idle = mountWith(Button, {
      props: { variant: 'primary', keepNameWhileLoading: true },
      slots: { default: 'Add to cart' },
    });
    expect(idle.get('[data-part="label"]').classes()).not.toContain('eldra:opacity-0');
    idle.unmount();
  });
});
