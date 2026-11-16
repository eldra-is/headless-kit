import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { MESSAGES_KEY } from '../../../composables/useMessages';
import StepIndicator from '../StepIndicator.vue';
import type { StepIndicatorOrientation } from '../types';

const STEPS = [
  { label: 'Received', description: '3 Mar' },
  { label: 'In review', description: '4 Mar' },
  { label: 'Approved' },
  { label: 'Published' },
];

const ORIENTATIONS: StepIndicatorOrientation[] = ['horizontal', 'vertical'];

const LONG_STEPS = [
  { label: 'Application received and logged', description: 'Monday 3 March 2025 at 09:14' },
  { label: 'Under review by the selection committee', description: 'Tuesday 4 March 2025' },
  { label: 'Approved, waiting for a publication date' },
  { label: 'Published on the website and in the newsletter' },
];

function states(wrapper: ReturnType<typeof mountWith>): (string | undefined)[] {
  return wrapper.findAll('[data-part="step"]').map((step) => step.attributes('data-state'));
}

describe('StepIndicator — element and parts', () => {
  it('renders an ordered list with one item per step, in order', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1 } });
    expect(wrapper.element.tagName).toBe('OL');
    expect(wrapper.attributes('data-eldra-ui')).toBeDefined();
    expect(wrapper.attributes('data-orientation')).toBe('horizontal');
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.get('[data-part="label"]').text())).toEqual([
      'Received (completed)',
      'In review',
      'Approved (not started)',
      'Published (not started)',
    ]);
    wrapper.unmount();
  });

  it('names every part', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1 } });
    for (const part of [
      'root',
      'step',
      'marker',
      'content',
      'label',
      'labelIcon',
      'status',
      'description',
    ]) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders the secondary line only for a step that has one', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1 } });
    const steps = wrapper.findAll('[data-part="step"]');
    expect(steps[0]!.get('[data-part="description"]').text()).toBe('3 Mar');
    expect(steps[2]!.find('[data-part="description"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('passes attributes to the list, so it can be named', () => {
    const wrapper = mountWith(StepIndicator, {
      props: { steps: STEPS, current: 1 },
      attrs: { 'aria-label': 'Progress' },
    });
    expect(wrapper.attributes('aria-label')).toBe('Progress');
    wrapper.unmount();
  });

  it('appends `classes` to their parts', () => {
    const wrapper = mountWith(StepIndicator, {
      props: {
        steps: STEPS,
        current: 1,
        classes: { step: 'x-step', marker: 'x-marker', label: 'x-label', description: 'x-desc' },
      },
    });
    expect(wrapper.get('[data-part="step"]').classes()).toContain('x-step');
    expect(wrapper.get('[data-part="marker"]').classes()).toContain('x-marker');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('x-label');
    expect(wrapper.get('[data-part="description"]').classes()).toContain('x-desc');
    wrapper.unmount();
  });
});

describe('StepIndicator — states from `current`', () => {
  it('marks the steps before `current` done and the ones after it upcoming', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 2 } });
    expect(states(wrapper)).toEqual(['done', 'done', 'current', 'upcoming']);
    wrapper.unmount();
  });

  it('marks every step done when `current` is the number of steps', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 4 } });
    expect(states(wrapper)).toEqual(['done', 'done', 'done', 'done']);
    expect(wrapper.find('[aria-current]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('marks every step upcoming when `current` is negative', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: -1 } });
    expect(states(wrapper)).toEqual(['upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(wrapper.find('[aria-current]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('follows `current` when it changes', async () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 0 } });
    expect(states(wrapper)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    await wrapper.setProps({ current: 3 });
    expect(states(wrapper)).toEqual(['done', 'done', 'done', 'current']);
    wrapper.unmount();
  });
});

describe('StepIndicator — what assistive technology gets', () => {
  it.each(ORIENTATIONS)(
    '%s: aria-current="step" on the current step and no other',
    (orientation) => {
      const wrapper = mountWith(StepIndicator, {
        props: { steps: STEPS, current: 1, orientation },
      });
      const current = wrapper.findAll('[aria-current]');
      expect(current).toHaveLength(1);
      expect(current[0]!.attributes('aria-current')).toBe('step');
      expect(current[0]!.get('[data-part="label"]').text()).toBe('In review');
      wrapper.unmount();
    }
  );

  it.each(ORIENTATIONS)(
    '%s: says done and upcoming in hidden text, not the current',
    (orientation) => {
      const wrapper = mountWith(StepIndicator, {
        props: { steps: STEPS, current: 1, orientation },
      });
      const steps = wrapper.findAll('[data-part="step"]');
      expect(steps[0]!.get('[data-part="status"]').text()).toBe('(completed)');
      expect(steps[0]!.get('[data-part="status"]').classes()).toContain('eldra:sr-only');
      expect(steps[1]!.find('[data-part="status"]').exists()).toBe(false);
      expect(steps[2]!.get('[data-part="status"]').text()).toBe('(not started)');
      wrapper.unmount();
    }
  );

  it('reads the state words from the provided messages', () => {
    const wrapper = mountWith(StepIndicator, {
      props: { steps: STEPS, current: 1 },
      global: {
        provide: {
          [MESSAGES_KEY as symbol]: { stepCompleted: 'lokið', stepNotStarted: 'ekki hafið' },
        },
      },
    });
    const statuses = wrapper.findAll('[data-part="status"]').map((status) => status.text());
    expect(statuses).toEqual(['(lokið)', '(ekki hafið)', '(ekki hafið)']);
    wrapper.unmount();
  });

  it.each(ORIENTATIONS)('%s: hides every marker and icon', (orientation) => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1, orientation } });
    for (const marker of wrapper.findAll('[data-part="marker"]')) {
      expect(marker.attributes('aria-hidden')).toBe('true');
    }
    for (const icon of wrapper.findAll('[data-part="labelIcon"]')) {
      expect(icon.attributes('aria-hidden')).toBe('true');
    }
    wrapper.unmount();
  });
});

describe('StepIndicator — states are not colour alone', () => {
  it('horizontal: a check before a done label, bold on the current, neither on an upcoming', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1 } });
    const labels = wrapper.findAll('[data-part="label"]');
    expect(labels[0]!.find('[data-part="labelIcon"]').exists()).toBe(true);
    expect(labels[0]!.classes()).toContain('eldra:font-normal');
    expect(labels[1]!.find('[data-part="labelIcon"]').exists()).toBe(false);
    expect(labels[1]!.classes()).toContain('eldra:font-semibold');
    expect(labels[2]!.find('[data-part="labelIcon"]').exists()).toBe(false);
    expect(labels[2]!.classes()).toContain('eldra:font-normal');
    wrapper.unmount();
  });

  it('vertical: a check in a done marker, a dot in the current, an empty ring for an upcoming', () => {
    const wrapper = mountWith(StepIndicator, {
      props: { steps: STEPS, current: 1, orientation: 'vertical' },
    });
    const markers = wrapper.findAll('[data-part="marker"]');
    expect(markers[0]!.find('svg').exists()).toBe(true);
    expect(markers[1]!.find('svg').exists()).toBe(false);
    expect(markers[1]!.element.children).toHaveLength(1);
    expect(markers[2]!.element.children).toHaveLength(0);
    expect(wrapper.find('[data-part="labelIcon"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('StepIndicator — keyboard', () => {
  it.each(ORIENTATIONS)('%s: holds nothing focusable and no interactive role', (orientation) => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1, orientation } });
    expect(
      wrapper.element.querySelectorAll(
        'a, button, input, [tabindex], [role="button"], [role="tab"]'
      )
    ).toHaveLength(0);
    wrapper.unmount();
  });

  it('Tab passes over it: no element in it is in the tab order', () => {
    const wrapper = mountWith(StepIndicator, { props: { steps: STEPS, current: 1 } });
    const root = wrapper.element as HTMLElement;
    const all = [root, ...root.querySelectorAll<HTMLElement>('*')];
    expect(all.filter((element) => element.tabIndex >= 0)).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('StepIndicator — accessibility', () => {
  it.each(ORIENTATIONS)('%s, a step current: no axe violations', async (orientation) => {
    const wrapper = mountWith(StepIndicator, {
      props: { steps: STEPS, current: 1, orientation },
      attrs: { 'aria-label': 'Progress' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each([-1, 0, 3, 4])('current = %i: no axe violations', async (current) => {
    const wrapper = mountWith(StepIndicator, {
      props: { steps: STEPS, current },
      attrs: { 'aria-label': 'Progress' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each(ORIENTATIONS)(
    '%s, long content in a narrow container: no axe violations',
    async (orientation) => {
      const wrapper = mountNarrow(StepIndicator, {
        props: { steps: LONG_STEPS, current: 1, orientation },
        attrs: { 'aria-label': 'Progress' },
      });
      expect(wrapper.findAll('li')).toHaveLength(4);
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  );
});
