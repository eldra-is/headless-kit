import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { giveMotionTokens, recordAnimations, stubReducedMotion } from '../../../test/motion';
import { mountNarrow, mountWith } from '../../../test/mount';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { isIS } from '../../../messages/is-IS';
import StockBadge from '../StockBadge.vue';
import type { StockBadgeProps, StockLevel } from '../types';
import { defineComponent, h } from 'vue';

const LEVELS: StockLevel[] = ['in', 'low', 'out', 'preorder'];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('StockBadge — element and parts', () => {
  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    for (const part of ['root', 'icon', 'label']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('draws no container fill, only text and an icon', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    const classes = wrapper.classes().join(' ');
    expect(classes).not.toMatch(/\bbg-/);
    wrapper.unmount();
  });

  it('hides the icon from assistive technology', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'out' } });
    expect(wrapper.get('[data-part="icon"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('StockBadge — default copy per level', () => {
  it('reads the in-stock default', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('In stock, ships in 1–2 days');
    wrapper.unmount();
  });

  it('reads the low-stock default with the quantity', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'low', quantity: 3 } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Low stock: only 3 left');
    wrapper.unmount();
  });

  it('drops the count when quantity is not given', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'low' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Low stock');
    wrapper.unmount();
  });

  it('reads the sold-out default', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'out' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Sold out');
    wrapper.unmount();
  });

  /**
   * M15: `out` reads the shared `soldOut` message key, not a separate `stockOut` — proven by
   * overriding only `soldOut` and checking the level picks up the override, rather than by string
   * equality alone (which a coincidentally-identical `stockOut` string could also satisfy).
   */
  it("reads the shared soldOut key, not a separate stockOut key, for level 'out'", () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages({ soldOut: 'Discontinued' });
        return () => h(StockBadge, { level: 'out' });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="label"]').text()).toBe('Discontinued');
    wrapper.unmount();
  });

  it('reads the pre-order default with no date', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'preorder' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Pre-order');
    wrapper.unmount();
  });

  it('overrides the default copy entirely with `message`', () => {
    const wrapper = mountWith(StockBadge, {
      props: { level: 'preorder', message: 'Pre-order, ships 14 Nov' },
    });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Pre-order, ships 14 Nov');
    wrapper.unmount();
  });

  it('reads the Icelandic catalogue when provided', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(StockBadge, { level: 'low', quantity: 1 });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="label"]').text()).toBe('Lítið til: aðeins 1 eintak eftir');
    wrapper.unmount();
  });
});

describe('StockBadge — colour and icon per level', () => {
  it.each([
    ['in', 'text-success'],
    ['low', 'text-warning'],
    ['out', 'text-danger'],
    ['preorder', 'text-muted'],
  ] as Array<[StockLevel, string]>)('colours %s with %s', (level, expected) => {
    const wrapper = mountWith(StockBadge, { props: { level } });
    expect(wrapper.classes()).toContain(expected);
    wrapper.unmount();
  });

  it('renders a different icon path per level', () => {
    const paths = LEVELS.map((level) => {
      const wrapper = mountWith(StockBadge, { props: { level } });
      const d = wrapper
        .findAll('[data-part="icon"] path')
        .map((p) => p.attributes('d'))
        .join('|');
      wrapper.unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(LEVELS.length);
  });
});

describe('StockBadge — content', () => {
  it('renders inside a narrow container', () => {
    const wrapper = mountNarrow(StockBadge, { props: { level: 'low', quantity: 3 } });
    expect(wrapper.text()).toContain('Low stock');
    wrapper.unmount();
  });
});

describe('StockBadge — accessibility', () => {
  it.each(LEVELS)('has no axe violations for level %s', async (level) => {
    const wrapper = mountWith(StockBadge, { props: { level, quantity: 3 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

/**
 * The same refresh state `Price` carries, for the stock line: the built-in level stays on screen,
 * dimmed, with a small spinner beside it, while a live one is fetched.
 */
describe('StockBadge — revalidating', () => {
  function visibleText(wrapper: { element: Element }): string {
    const clone = wrapper.element.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-part="srStatus"]')?.remove();
    return clone.textContent ?? '';
  }

  it('keeps the level, marks the root busy and draws a spinner', () => {
    const wrapper = mountWith(StockBadge, {
      props: { level: 'low', quantity: 3, revalidating: true },
    });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Low stock: only 3 left');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  it('renders exactly the visible text a plain stock line renders, so nothing reflows', () => {
    const plain = mountWith(StockBadge, { props: { level: 'in' } });
    const busy = mountWith(StockBadge, { props: { level: 'in', revalidating: true } });
    expect(visibleText(busy)).toBe(visibleText(plain));
    const spinner = busy.get('[data-part="spinner"]');
    expect(spinner.text()).toBe('');
    expect(spinner.attributes('aria-hidden')).toBe('true');
    // Zero width, with the negative inline-start margin that cancels the root's own gap: the
    // spinner is drawn in the space after the value without reserving any of it.
    expect(spinner.classes()).toContain('w-0');
    expect(spinner.get('svg').classes()).toContain('absolute');
    plain.unmount();
    busy.unmount();
  });

  it('dims the icon and the label through the revalidating opacity token', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in', revalidating: true } });
    expect(wrapper.get('[data-part="icon"]').classes()).toContain('eldra-revalidating');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('eldra-revalidating');
    expect(wrapper.get('[data-part="spinner"]').classes()).not.toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('draws no spinner, no busy flag and no dimming when it is not revalidating', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    expect(wrapper.get('[data-part="label"]').classes()).not.toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('announces the refresh in a visually hidden polite live region', async () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    const status = wrapper.get('[data-part="srStatus"]');
    expect(status.text()).toBe('');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.classes()).toContain('sr-only');
    await wrapper.setProps({ revalidating: true });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('Updating stock');
    wrapper.unmount();
  });

  it('reads the refresh message from the catalogue', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(StockBadge, { level: 'in', revalidating: true });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe(isIS.updatingStock);
    wrapper.unmount();
  });

  it('turns the spinner, and pulses it under reduced motion', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in', revalidating: true } });
    const svg = wrapper.get('[data-part="spinner"] svg');
    expect(svg.classes()).toContain('animate-eldra-spin');
    expect(svg.classes()).toContain('motion-reduce:animate-eldra-pulse');
    wrapper.unmount();
  });

  /** See `Price`'s own `announce` spec: one page-level announcement instead of one per value. */
  it('renders no live region at all when announce is off, and stays busy', () => {
    const wrapper = mountWith(StockBadge, {
      props: { level: 'in', revalidating: true, announce: false },
    });
    expect(wrapper.find('[data-part="srStatus"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    expect(wrapper.get('[data-part="label"]').classes()).toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('announces by default, with no announce prop given', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in', revalidating: true } });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('Updating stock');
    wrapper.unmount();
  });

  it.each(LEVELS)('has no axe violations while revalidating level %s', async (level) => {
    const wrapper = mountWith(StockBadge, { props: { level, quantity: 3, revalidating: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

/**
 * The refresh's second half, the same treatment `Price` draws for a changed amount: once a fresher
 * level lands, its wording fades in rather than the line simply reading differently. One stable
 * element with the words interpolated into it, and an `Element.animate()` fade played on it after
 * the change — see `src/utils/valueFade.ts` and `Price`'s own specs for why not a `<Transition>`.
 */
describe('StockBadge — the status line changing', () => {
  const IN_STOCK = 'In stock, ships in 1–2 days';

  function readyBadge(props: Partial<StockBadgeProps>) {
    const wrapper = mountWith(StockBadge, { props: { level: 'in', ...props } });
    giveMotionTokens(wrapper.get('[data-part="labelValue"]').element);
    return wrapper;
  }

  it('renders the words in their own value node', () => {
    const wrapper = readyBadge({ revalidating: true });
    expect(wrapper.get('[data-part="labelValue"]').text()).toBe(IN_STOCK);
    wrapper.unmount();
  });

  /** The wording is correct the instant the props change, refreshed or not — see `Price`'s own
   *  spec for the regression that rule exists for. */
  it.each([
    ['a refreshing line', true],
    ['a line that has never refreshed', false],
  ])('changes the words in the same tick for %s', async (_case, revalidating) => {
    const wrapper = readyBadge({ revalidating });
    await wrapper.setProps({ level: 'out' });
    expect(wrapper.get('[data-part="labelValue"]').text()).toBe('Sold out');
    expect(wrapper.findAll('[data-part="labelValue"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('fades the new wording in over the token duration, and never on first paint', async () => {
    const played = recordAnimations();
    const wrapper = readyBadge({ revalidating: true });
    expect(played.calls).toHaveLength(0);

    await wrapper.setProps({ level: 'low', quantity: 3 });
    expect(wrapper.get('[data-part="labelValue"]').text()).toBe('Low stock: only 3 left');
    expect(played.calls).toHaveLength(1);
    expect(played.calls[0]!.el).toBe(wrapper.get('[data-part="labelValue"]').element);
    expect(played.calls[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played.calls[0]!.options.duration).toBe(200);
    wrapper.unmount();
    played.restore();
  });

  it('plays nothing when the refresh starts, and nothing under reduced motion', async () => {
    const played = recordAnimations();
    const starting = readyBadge({});
    await starting.setProps({ revalidating: true });
    expect(played.calls).toHaveLength(0);
    starting.unmount();

    const motion = stubReducedMotion();
    const reduced = readyBadge({ revalidating: true });
    await reduced.setProps({ level: 'out' });
    expect(played.calls).toHaveLength(0);
    expect(reduced.get('[data-part="labelValue"]').text()).toBe('Sold out');
    reduced.unmount();
    motion.restore();
    played.restore();
  });

  it('has no axe violations across a change', async () => {
    const wrapper = readyBadge({ revalidating: true });
    await wrapper.setProps({ level: 'out', revalidating: false });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
