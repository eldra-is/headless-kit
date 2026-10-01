// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { Button } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** No media fields, so — like `stats` — there is no `preview.json` to merge onto `mock.json`.
 *  `mock.json` is the block's one full content fixture; `bare` below is the genuinely minimal one,
 *  only the fields the block requires. */
const bare = {
  heading: 'Membership plans',
  featureRows: [{ label: 'Free shipping' }],
  plans: [
    {
      name: 'Basic',
      price: '$10',
      period: '/ month',
      ctaLabel: 'Join',
      ctaHref: '/join',
      included: [true],
    },
  ],
};

/** `mock.json`'s `plans[].ctaHref` ship empty (no dead demo link — see `docs/starter-kit.md`'s
 *  seed-href ruling), so tests whose whole point is exercising a working call-to-action supply
 *  their own, the same real-looking demo paths the seed used to carry. */
const DEMO_CTA_HREFS = [
  '/products/pantry-club-monthly',
  '/products/pantry-club-seasonal',
  '/products/pantry-club-annual',
];
const mockWithCta = {
  ...mock,
  plans: mock.plans.map((plan, index) => ({ ...plan, ctaHref: DEMO_CTA_HREFS[index] })),
};

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

/** The outer plans `<ul>` is the first `<ul>` in document order; its direct `<li>` children are
 *  the plan cards, not the feature-row `<li>`s nested two levels inside them. */
function planItems(wrapper: ReturnType<typeof mountBlock>) {
  return Array.from(wrapper.get('ul').element.querySelectorAll(':scope > li'));
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve));
}

describe('pricing-table block', () => {
  it('renders the full mock.json content with no axe violations', async () => {
    const wrapper = mountBlock(mockWithCta);
    await flush();
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.intro);
    expect(wrapper.text()).toContain(mock.footnote);
    for (const plan of mock.plans) {
      expect(wrapper.text()).toContain(plan.name);
      expect(wrapper.text()).toContain(plan.price);
      expect(wrapper.text()).toContain(plan.ctaLabel);
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders no call-to-action button for a plan whose ctaHref is empty — the seeded state', async () => {
    const wrapper = mountBlock(mock);
    await flush();
    expect(wrapper.findAll('a')).toHaveLength(0);
    for (const plan of mock.plans) expect(wrapper.text()).not.toContain(plan.ctaLabel);
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    await flush();
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.plans[0]!.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['none', 'surface', 'surface-strong'] as const)(
    'renders the %s section background with no axe violations',
    async (sectionBackground) => {
      const wrapper = mountBlock({ ...mock, sectionBackground });
      await flush();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('roots the block in a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'));
  });

  it('plans are a ul whose items are labelled by their own h3', () => {
    const wrapper = mountBlock(mock);
    const items = planItems(wrapper);
    expect(items).toHaveLength(mock.plans.length);
    items.forEach((item, index) => {
      const labelledBy = item.getAttribute('aria-labelledby')!;
      const name = wrapper.get(`#${labelledBy}`);
      expect(name.element.tagName).toBe('H3');
      expect(name.text()).toBe(mock.plans[index]!.name);
    });
  });

  it('each feature list is named "What\'s included in {name}"', () => {
    const wrapper = mountBlock(mock);
    for (const plan of mock.plans) {
      const list = wrapper.get(`ul[aria-label="What's included in ${plan.name}"]`);
      expect(list.exists()).toBe(true);
    }
  });

  it('every feature row exposes "Included:"/"Not included:" text, matching its own inclusion', async () => {
    const wrapper = mountBlock(mock);
    await flush();
    mock.plans.forEach((plan, planIndex) => {
      const item = planItems(wrapper)[planIndex]!;
      const rows = Array.from(item.querySelectorAll('ul[aria-label] > li'));
      expect(rows).toHaveLength(mock.featureRows.length);
      rows.forEach((row, rowIndex) => {
        const included = plan.included[rowIndex] === true;
        expect(row.textContent).toContain(included ? 'Included:' : 'Not included:');
        expect(row.querySelector('svg')).not.toBeNull();
      });
    });
  });

  it('an included row and an excluded row render a differing icon', async () => {
    // Monthly: included = [true, false, ...] — row 0 is included, row 1 is not.
    const wrapper = mountBlock(mock);
    await flush();
    const monthly = planItems(wrapper)[0]!;
    const rows = Array.from(monthly.querySelectorAll('ul[aria-label] > li'));
    const includedSvg = rows[0]!.querySelector('svg')!;
    const excludedSvg = rows[1]!.querySelector('svg')!;
    expect(includedSvg.innerHTML).not.toBe(excludedSvg.innerHTML);
  });

  /**
   * Field `helpText`: "a short list is treated as 'not included' for the
   * missing rows." Mutation check (manual): changing `isIncluded` to
   * `return plan.included?.[index] !== false;` (treating a missing/`undefined` entry as included
   * rather than not) leaves every earlier test passing — the mock fixture's `included` arrays are
   * always exactly `featureRows.length` long — and only fails this test, which is the one that
   * actually exercises a shorter `included` array.
   */
  it('a plan with fewer `included` entries than featureRows treats the missing rows as not included', () => {
    const wrapper = mountBlock({
      ...mock,
      featureRows: [...mock.featureRows, { label: 'A sixth row with no included entry' }],
    });
    const monthly = planItems(wrapper)[0]!; // Monthly's `included` has only 5 entries.
    const rows = Array.from(monthly.querySelectorAll('ul[aria-label] > li'));
    expect(rows).toHaveLength(6);
    const lastRow = rows[5]!;
    expect(lastRow.textContent).toContain('Not included:');
    expect(lastRow.className).toContain('text-muted');
  });

  it('excluded rows are also muted — colour, shape and hidden text all carry the state', () => {
    const wrapper = mountBlock(mock);
    const monthly = planItems(wrapper)[0]!; // Monthly: included = [true, false, true, false, false]
    const rows = Array.from(monthly.querySelectorAll('ul[aria-label] > li'));
    expect(rows[1]!.className).toContain('text-muted');
    expect(rows[0]!.className).not.toContain('text-muted');
  });

  it('the highlighted plan is carried by badge text, a thicker border and a filled button — never colour alone', () => {
    const wrapper = mountBlock(mockWithCta);
    const items = planItems(wrapper);
    const highlightedIndex = mock.plans.findIndex((p) => p.name === mock.highlightedPlan);
    items.forEach((item, index) => {
      const buttons = wrapper.findAllComponents(Button).filter((b) => item.contains(b.element));
      expect(buttons).toHaveLength(1);
      if (index === highlightedIndex) {
        expect(item.className).toContain('border-2');
        expect(buttons[0]!.props('variant')).toBe('primary');
        expect(item.textContent).toContain(mock.highlightLabel);
      } else {
        expect(item.className).not.toContain('border-2');
        expect(item.className).toContain('border');
        expect(buttons[0]!.props('variant')).toBe('outline');
      }
    });
  });

  it('an empty highlightedPlan gives every plan the outline button', () => {
    const wrapper = mountBlock({ ...mockWithCta, highlightedPlan: '' });
    const buttons = wrapper.findAllComponents(Button);
    expect(buttons).toHaveLength(mock.plans.length);
    for (const button of buttons) expect(button.props('variant')).toBe('outline');
    for (const item of planItems(wrapper)) expect(item.className).not.toContain('border-2');
  });

  it('a highlightedPlan that matches no plan name highlights nothing', () => {
    const wrapper = mountBlock({ ...mockWithCta, highlightedPlan: 'Lifetime' });
    for (const button of wrapper.findAllComponents(Button)) {
      expect(button.props('variant')).toBe('outline');
    }
  });

  /**
   * Guards `isHighlighted`'s `highlightedPlanName.value !== ''` check: without it, an empty
   * `highlightedPlan` (`''`) would equality-match a plan whose own `name` is also still empty
   * (an in-progress, editor-only plan) and wrongly highlight it. Mutation check (manual):
   * changing `isHighlighted` to `return name === highlightedPlanName.value;` (dropping the
   * empty-string guard) leaves this test passing only because none of the *other* fixtures have
   * an empty plan name — this test is the one that actually exercises the guard, and fails
   * without it (the unnamed plan's Button renders `primary` instead of `outline`).
   */
  it('an empty highlightedPlan never highlights a plan with an empty name', () => {
    const wrapper = mountBlock({
      ...mockWithCta,
      highlightedPlan: '',
      plans: [...mockWithCta.plans, { name: '', price: '$1', period: '/ month', included: [] }],
    });
    for (const button of wrapper.findAllComponents(Button)) {
      expect(button.props('variant')).toBe('outline');
    }
    for (const item of planItems(wrapper)) {
      expect(item.className).not.toContain('border-2');
    }
  });

  it('a single plan renders full width', () => {
    const wrapper = mountBlock({ ...mock, plans: [mock.plans[0]!] });
    const items = planItems(wrapper);
    expect(items).toHaveLength(1);
    expect(items[0]!.className).toContain('col-span-full');
  });

  it('does not span the full width when there is more than one plan', () => {
    const wrapper = mountBlock(mockWithCta);
    for (const item of planItems(wrapper)) {
      expect(item.className).not.toContain('col-span-full');
    }
  });

  it('renders 4 plans as 4 list items', () => {
    const plans = Array.from({ length: 4 }, (_, index) => ({
      name: `Plan ${index + 1}`,
      price: '$10',
      period: '/ month',
      ctaLabel: 'Choose',
      ctaHref: `/plan-${index + 1}`,
      included: [true],
    }));
    const wrapper = mountBlock({ ...mock, plans, highlightedPlan: '' });
    expect(planItems(wrapper)).toHaveLength(4);
  });

  describe('keyboard path', () => {
    it('Tab visits the calls to action plan by plan, in the visible order; feature rows are not focusable', () => {
      const wrapper = mountBlock(mockWithCta);
      const links = wrapper.findAll('a');
      expect(links.map((link) => link.text())).toEqual(mock.plans.map((p) => p.ctaLabel));
      for (const link of links) expect(link.attributes('tabindex')).toBeUndefined();

      // Nothing anywhere in the block carries an explicit tabindex, and no feature row contains
      // an interactive element of its own.
      expect(wrapper.findAll('[tabindex]')).toHaveLength(0);
      for (const item of planItems(wrapper)) {
        const featureRows = Array.from(item.querySelectorAll('ul[aria-label] > li'));
        for (const row of featureRows) {
          expect(row.querySelector('a, button, input')).toBeNull();
        }
      }
    });

    /**
     * jsdom does not run a native `<a href>`'s default Enter activation (see `cta`'s own spec
     * for the same note). This asserts the contract that gives Enter its meaning: nothing in this
     * block cancels the keydown, so the platform's own default action still runs.
     */
    it('activates a call to action with a native Enter contract', () => {
      const base = mountOptions({ entry: { id: 'e1', data: mockWithCta } });
      const wrapper = mount(Block, {
        ...base,
        attachTo: document.body,
      });
      const link = wrapper.get(`a[href="${mockWithCta.plans[0]!.ctaHref}"]`)
        .element as HTMLAnchorElement;
      link.focus();
      expect(document.activeElement).toBe(link);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      link.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBe(false);
      wrapper.unmount();
    });
  });

  describe('editor hints (spec "Empty (freshly inserted)")', () => {
    it('shows the heading hint only in the editor when heading is empty, with no axe violations', async () => {
      const data = { ...mock, heading: '' };
      const live = mountBlock(data);
      expect(live.text()).not.toContain('Add a heading');
      expect(live.find('h2').exists()).toBe(false);

      const editing = mountBlock(data, { editing: true });
      expect(editing.text()).toContain('Add a heading');
      expect(await axe(editing.element)).toHaveNoViolations();
    });

    it('shows the intro hint only in the editor when intro is empty', () => {
      const data = { ...mock, intro: '' };
      const live = mountBlock(data);
      expect(live.text()).not.toContain('Add an intro');

      const editing = mountBlock(data, { editing: true });
      expect(editing.text()).toContain('Add an intro (optional)');
    });

    it('shows a per-plan hint in the editor for an empty plan, and renders it live as nothing', async () => {
      const emptyPlan = { name: '', price: '' };
      const data = { ...mock, plans: [...mock.plans, emptyPlan] };
      const live = mountBlock(data);
      expect(planItems(live)).toHaveLength(mock.plans.length);

      const editing = mountBlock(data, { editing: true });
      expect(planItems(editing)).toHaveLength(mock.plans.length + 1);
      expect(editing.text()).toContain('Add a plan');
      expect(await axe(editing.element)).toHaveNoViolations();
    });
  });

  it('defaults sectionBackground to none when unset', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const wrapper = mountBlock(withoutBackground);
    const section = wrapper.get('section');
    expect(section.attributes('data-section-bg')).toBe('none');
  });

  it('omits the footnote paragraph entirely when empty', () => {
    const wrapper = mountBlock({ ...mock, footnote: '' });
    expect(wrapper.findAll('p').some((p) => p.text() === mock.footnote)).toBe(false);
  });
});
