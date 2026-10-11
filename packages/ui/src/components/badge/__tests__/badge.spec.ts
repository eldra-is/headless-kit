import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconCircleCheck, IconLeaf } from '@tabler/icons-vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Badge from '../Badge.vue';
import type { BadgeTone } from '../types';

const TONES: BadgeTone[] = ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'];

/** Twice the length of a typical badge label. */
const LONG_LABEL = 'Hand-glazed stoneware, made to order in small batches over six weeks';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Badge — element and parts', () => {
  it('renders an inline span with no interactive role', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear' } });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    expect(wrapper.text()).toBe('Knitwear');
    wrapper.unmount();
  });

  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(Badge, {
      props: { label: '−20%', icon: IconLeaf, hiddenSuffix: ' off' },
    });
    for (const part of ['root', 'icon', 'label', 'hiddenSuffix']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders as a different element via `as`', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Paid', as: 'div' } });
    expect(wrapper.element.tagName).toBe('DIV');
    wrapper.unmount();
  });

  it('falls back to the label prop when no default slot is given', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Knitwear');
    wrapper.unmount();
  });

  it('prefers the default slot over the label prop', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Ignored' },
      slots: { default: 'Ceramics' },
    });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Ceramics');
    wrapper.unmount();
  });

  it('renders no icon or hidden suffix when neither is given', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Bestseller' } });
    expect(wrapper.find('[data-part="icon"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="hiddenSuffix"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Badge — tones', () => {
  it('fills a neutral badge with the surface-strong role', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Hand-glazed' } });
    expect(wrapper.classes()).toContain('bg-surface-strong');
    expect(wrapper.classes()).toContain('text-text');
    wrapper.unmount();
  });

  it('fills a primary badge with the primary role', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Bestseller', tone: 'primary' } });
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.classes()).toContain('text-primary-contrast');
    wrapper.unmount();
  });

  it('fills an accent badge with the accent role', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Gift ready', tone: 'accent' } });
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.classes()).toContain('text-accent-contrast');
    wrapper.unmount();
  });

  it.each(['success', 'warning', 'danger'] as BadgeTone[])(
    'fills a %s badge with a background-on-fill pair',
    (tone) => {
      const wrapper = mountWith(Badge, { props: { label: 'Paid', tone, icon: IconCircleCheck } });
      expect(wrapper.classes()).toContain(`bg-${tone}`);
      expect(wrapper.classes()).toContain('text-background');
      wrapper.unmount();
    }
  );

  it('defaults to the neutral tone', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear' } });
    expect(wrapper.classes()).toContain('bg-surface-strong');
    wrapper.unmount();
  });
});

describe('Badge — variant precedence', () => {
  it('renders sale like accent and overrides tone', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Sale', variant: 'sale', tone: 'success' },
    });
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.classes()).toContain('text-accent-contrast');
    expect(wrapper.classes()).not.toContain('bg-success');
    wrapper.unmount();
  });

  it('renders new like primary and overrides tone', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'New', variant: 'new', tone: 'danger' },
    });
    expect(wrapper.classes()).toContain('bg-primary');
    expect(wrapper.classes()).toContain('text-primary-contrast');
    expect(wrapper.classes()).not.toContain('bg-danger');
    wrapper.unmount();
  });

  it('leaves tone alone when variant is none', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Bestseller', tone: 'primary' } });
    expect(wrapper.classes()).toContain('bg-primary');
    wrapper.unmount();
  });
});

describe('Badge — outline', () => {
  it('replaces the fill with the background/border-strong boundary', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Sold out', outline: true } });
    expect(wrapper.classes()).toContain('bg-background');
    expect(wrapper.classes()).toContain('border-border-strong');
    expect(wrapper.classes()).toContain('text-text');
    expect(wrapper.classes()).not.toContain('bg-surface-strong');
    wrapper.unmount();
  });

  it('takes priority over tone and variant colouring', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Organic cotton', tone: 'accent', outline: true, icon: IconLeaf },
    });
    expect(wrapper.classes()).toContain('bg-background');
    expect(wrapper.classes()).not.toContain('bg-accent');
    wrapper.unmount();
  });

  it('draws the boundary inside the box with a real 1px border, not a fixed height', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Sold out', outline: true } });
    expect(wrapper.classes()).toContain('border');
    expect(wrapper.classes()).toContain('min-h-6');
    expect(wrapper.classes().join(' ')).not.toMatch(/(^|\s)h-6(\s|$)/);
    wrapper.unmount();
  });
});

describe('Badge — pill', () => {
  it('rounds fully and widens the padding', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear', pill: true } });
    expect(wrapper.classes()).toContain('rounded-full');
    expect(wrapper.classes()).toContain('px-2.5');
    expect(wrapper.classes()).not.toContain('rounded-sm');
    wrapper.unmount();
  });

  it('takes the small radius and narrower padding by default', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear' } });
    expect(wrapper.classes()).toContain('rounded-sm');
    expect(wrapper.classes()).toContain('px-2');
    wrapper.unmount();
  });

  it('combines with any tone or outline', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Gift ready', tone: 'accent', pill: true },
    });
    expect(wrapper.classes()).toContain('rounded-full');
    expect(wrapper.classes()).toContain('bg-accent');
    wrapper.unmount();
  });
});

describe('Badge — icon', () => {
  it('renders the icon hidden from assistive technology', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Paid', tone: 'success', icon: IconCircleCheck },
    });
    const icon = wrapper.get('[data-part="icon"]');
    expect(icon.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('renders the leading icon at the spec size and stroke', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Paid', tone: 'success', icon: IconCircleCheck },
    });
    const icon = wrapper.get('[data-part="icon"]');
    expect(icon.classes()).toContain('size-3.5');
    expect(icon.attributes('stroke-width')).toBe('2.25');
    wrapper.unmount();
  });

  it('warns in development when a success, warning or danger badge has no icon', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Badge, { props: { label: 'Paid', tone: 'success' } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('icon');
    wrapper.unmount();
  });

  it.each(['warning', 'danger'] as BadgeTone[])('warns for a %s badge with no icon too', (tone) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Badge, { props: { label: 'Back-order', tone } });
    expect(warn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('does not warn when the icon is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Badge, {
      props: { label: 'Paid', tone: 'success', icon: IconCircleCheck },
    });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not warn for neutral, primary or accent badges with no icon', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const tone of ['neutral', 'primary', 'accent'] as BadgeTone[]) {
      const wrapper = mountWith(Badge, { props: { label: 'Bestseller', tone } });
      wrapper.unmount();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for sale or new, which override tone away from success/warning/danger', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sale = mountWith(Badge, { props: { label: 'Sale', variant: 'sale', tone: 'danger' } });
    const isNew = mountWith(Badge, { props: { label: 'New', variant: 'new', tone: 'danger' } });
    expect(warn).not.toHaveBeenCalled();
    sale.unmount();
    isNew.unmount();
  });
});

describe('Badge — hidden suffix', () => {
  it('renders the suffix visually hidden and includes it in the accessible text', () => {
    const wrapper = mountWith(Badge, { props: { label: '−20%', hiddenSuffix: ' off' } });
    const suffix = wrapper.get('[data-part="hiddenSuffix"]');
    expect(suffix.classes()).toContain('sr-only');
    expect(suffix.text()).toBe('off');
    // The whole badge's text content is what a screen reader announces: label + hidden suffix.
    expect(wrapper.text().replace(/\s+/g, ' ')).toBe('−20% off');
    wrapper.unmount();
  });

  it('renders nothing when there is no suffix', () => {
    const wrapper = mountWith(Badge, { props: { label: 'Knitwear' } });
    expect(wrapper.find('[data-part="hiddenSuffix"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Badge — customisation', () => {
  it('lets classes.root replace a colour utility instead of landing beside it', () => {
    const wrapper = mountWith(Badge, {
      props: { label: 'Knitwear', classes: { root: 'bg-accent' } },
    });
    expect(wrapper.classes()).toContain('bg-accent');
    expect(wrapper.classes()).not.toContain('bg-surface-strong');
    wrapper.unmount();
  });

  it('merges an override onto every other part', () => {
    const wrapper = mountWith(Badge, {
      props: {
        label: 'Paid',
        tone: 'success',
        icon: IconCircleCheck,
        hiddenSuffix: ' off',
        classes: { icon: 'text-accent', label: 'uppercase', hiddenSuffix: 'italic' },
      },
    });
    expect(wrapper.get('[data-part="icon"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="hiddenSuffix"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('Badge — content', () => {
  it('never wraps a long label', () => {
    const wrapper = mountWith(Badge, { props: { label: LONG_LABEL } });
    expect(wrapper.classes()).toContain('whitespace-nowrap');
    expect(wrapper.get('[data-part="label"]').text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });

  it('renders inside a narrow container without overflowing to a fixed height', () => {
    const wrapper = mountNarrow(Badge, { props: { label: LONG_LABEL } });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });
});

describe('Badge — accessibility', () => {
  it.each(TONES)('has no axe violations for the %s tone', async (tone) => {
    const wrapper = mountWith(Badge, {
      props: {
        label: 'Paid',
        tone,
        icon: ['success', 'warning', 'danger'].includes(tone) ? IconCircleCheck : undefined,
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations outlined or as a pill', async () => {
    const outline = mountWith(Badge, { props: { label: 'Sold out', outline: true } });
    expect(await axe(outline.element)).toHaveNoViolations();
    outline.unmount();

    const pill = mountWith(Badge, { props: { label: 'Ceramics', pill: true } });
    expect(await axe(pill.element)).toHaveNoViolations();
    pill.unmount();
  });

  it('has no axe violations with an icon and a hidden suffix', async () => {
    const wrapper = mountWith(Badge, {
      props: { label: '−20%', hiddenSuffix: ' off', icon: IconLeaf },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
