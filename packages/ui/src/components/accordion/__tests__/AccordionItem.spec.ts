import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import AccordionItem from '../AccordionItem.vue';

const LONG_CONTENT =
  'Hand-finished merino wool crew neck sweater in a relaxed fit with ribbed cuffs and hem, ' +
  'knitted from traceable New Zealand wool and finished by hand at our studio. Machine wash ' +
  'cold on a wool cycle, reshape while damp and dry flat away from direct heat.';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * `animatePanelHeight` (`heightTransition.ts`) only ever animates once `--eldra-duration-base`/
 * `--eldra-ease-out`/`--eldra-ease-in` resolve to real values through `getComputedStyle` — true in
 * any real consumer, which always ships `tokens.css`, but not in this suite, which mounts the
 * component with no stylesheet at all. Every other spec in this file relies on exactly that gap to
 * stay a synchronous, un-animated assertion of the `<details>`/`modelValue`/`toggle` contract (see
 * the "height animation" describe block below for the specs that turn the animation on on purpose,
 * this same way).
 */
function giveMotionTokens(el: HTMLElement): void {
  el.style.setProperty('--eldra-duration-base', '20ms');
  el.style.setProperty('--eldra-ease-out', 'cubic-bezier(0.2,0,0,1)');
  el.style.setProperty('--eldra-ease-in', 'cubic-bezier(0.4,0,1,1)');
}

/**
 * Waits past both the `20ms` `giveMotionTokens` duration (real, un-stubbed `Element.animate` runs
 * on happy-dom's own timer) and the microtask hops after it settles — `animatePanelHeight`'s own
 * `.then()` plus whichever `AccordionItem.vue` handler chains onto that. `250ms` is a generous
 * margin over the `20ms` animation itself, not a tuned minimum, so this stays robust under a slow
 * or loaded CI runner rather than flaking on timing.
 */
function flushAnimationSettling(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

describe('AccordionItem — disclosure semantics', () => {
  it('is a native <details><summary>, closed by default, with a data-part on every part', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: '100% organic cotton.' },
    });
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(wrapper.get('[data-part="summary"]').element.tagName).toBe('SUMMARY');
    expect(wrapper.get('[data-part="title"]').text()).toBe('Materials & care');
    // SVG elements keep a lowercase `tagName` (they live in the SVG namespace, unlike HTML
    // elements, which are always uppercased).
    expect(wrapper.get('[data-part="chevron"]').element.tagName).toBe('svg');
    expect(wrapper.get('[data-part="panel"]').text()).toBe('100% organic cotton.');
    expect(wrapper.find('[data-part="help"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens when `modelValue` starts true', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(true);
    wrapper.unmount();
  });

  it('the chevron is aria-hidden and decorative', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="chevron"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('hides the native disclosure marker and shows the chevron instead', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="summary"]').classes()).toContain('list-none');
    wrapper.unmount();
  });

  it('carries the chevron rotation utility, self-conditioned on the native [open] attribute', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="chevron"]').classes()).toContain('eldra-accordion-chevron');
    wrapper.unmount();
  });

  it('carries no custom keydown handling: Enter/Space activation is entirely native (untestable in happy-dom, which does not implement the browser default action for a keyboard activation of <summary>)', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    const summary = wrapper.get('[data-part="summary"]');
    // No explicit `tabindex` overriding a native <summary>'s own default focusability, which is as
    // far as this spec can go: happy-dom does not implement the browser's own default action that
    // converts an Enter/Space keypress on a focused <summary> into a click, so that part of the
    // acceptance criteria (Tab reaches every summary; Enter/Space toggles the focused one) is
    // native browser behaviour this component adds no code for — `AccordionItem.vue` has no
    // `@keydown` at all, and `<summary>` is focusable by default with no `tabindex` needed.
    expect(summary.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('clicking the summary opens it, mirrors modelValue, and emits update:modelValue and toggle', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: false },
      slots: { default: 'Body' },
    });
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('clicking again closes it and emits false', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect((wrapper.get('[data-part="root"]').element as HTMLDetailsElement).open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('a real v-model round trip: closing via click updates the bound ref, and the parent can reopen it', async () => {
    const wrapper = mountWith(
      {
        components: { AccordionItem },
        setup: () => ({ open: ref(true) }),
        template: `<AccordionItem title="Materials & care" v-model="open">Body</AccordionItem>`,
      },
      {}
    );
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    expect(details.open).toBe(true);
    await wrapper.get('[data-part="summary"]').trigger('click');
    expect(details.open).toBe(false);
    expect((wrapper.vm as unknown as { open: boolean }).open).toBe(false);
    (wrapper.vm as unknown as { open: boolean }).open = true;
    await wrapper.vm.$nextTick();
    expect(details.open).toBe(true);
    wrapper.unmount();
  });
});

describe('AccordionItem — help text', () => {
  it('renders the help line under the label when given', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="help"]').text()).toBe('Machine washable at 30°C');
    wrapper.unmount();
  });

  it('is part of the summary’s accessible name (plain text alongside the title)', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body' },
    });
    const summaryText = wrapper.get('[data-part="summary"]').text();
    expect(summaryText).toContain('Materials & care');
    expect(summaryText).toContain('Machine washable at 30°C');
    wrapper.unmount();
  });
});

describe('AccordionItem — headingLevel', () => {
  it('renders plain text with no heading by default', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care' },
      slots: { default: 'Body' },
    });
    const title = wrapper.get('[data-part="title"]').element;
    expect(title.tagName).toBe('SPAN');
    wrapper.unmount();
  });

  it('wraps the title in the requested heading level', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', headingLevel: 3 },
      slots: { default: 'Body' },
    });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('H3');
    wrapper.unmount();
  });
});

describe('AccordionItem — link row (`href`)', () => {
  it('renders a plain <a>, no summary, chevron or panel', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', href: '/pages/size-guide' },
    });
    const root = wrapper.get('[data-part="root"]').element;
    expect(root.tagName).toBe('A');
    expect(root.getAttribute('href')).toBe('/pages/size-guide');
    expect(wrapper.find('[data-part="summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="chevron"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="panel"]').exists()).toBe(false);
    expect(wrapper.find('details').exists()).toBe(false);
    wrapper.unmount();
  });

  it('still renders title and help', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', help: 'cm and in', href: '/pages/size-guide' },
    });
    expect(wrapper.get('[data-part="title"]').text()).toBe('Size guide');
    expect(wrapper.get('[data-part="help"]').text()).toBe('cm and in');
    wrapper.unmount();
  });
});

describe('AccordionItem — long content and narrow', () => {
  it('renders long panel content inside the max-width clamp with no overflow error', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: LONG_CONTENT },
    });
    const panel = wrapper.get('[data-part="panel"]');
    expect(panel.classes()).toContain('max-w-[65ch]');
    expect(panel.text()).toBe(LONG_CONTENT);
    wrapper.unmount();
  });

  it('renders in a 20rem-wide container with the chevron still present', () => {
    const wrapper = mountNarrow(AccordionItem, {
      props: {
        title: 'Hand-finished merino wool crew neck sweater in a relaxed fit',
        help: 'Machine wash cold on a wool cycle, reshape while damp',
      },
      slots: { default: 'Body' },
    });
    expect(wrapper.find('[data-part="chevron"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('AccordionItem — accessibility', () => {
  it('has no axe violations when closed', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', help: 'Machine washable at 30°C' },
      slots: { default: 'Body copy.' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations when open', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true, headingLevel: 3 },
      slots: { default: 'Body copy.' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations on a link row', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Size guide', href: '/pages/size-guide' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('AccordionItem — height animation (operator, 2026-09-26)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closing intercepts the click, animates the panel height down, and only flips `open`/emits once that settles', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    giveMotionTokens(wrapper.get('[data-part="panel"]').element as HTMLElement);

    await wrapper.get('[data-part="summary"]').trigger('click');
    // The click was intercepted (`preventDefault`): the browser's own default action never ran,
    // so `open` has not moved yet and nothing has been emitted — the whole point of animating the
    // collapse before applying it.
    expect(details.open).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('toggle')).toBeUndefined();

    await flushAnimationSettling();
    expect(details.open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('falls back to an instant close when `Element.prototype.animate` is unavailable', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
    giveMotionTokens(panel);
    // Simulates an engine (or a stricter DOM environment than happy-dom) with no Web Animations
    // API at all — `heightTransition.ts` feature-detects this per element rather than assuming it.
    Object.defineProperty(panel, 'animate', { value: undefined, configurable: true });

    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    await wrapper.get('[data-part="summary"]').trigger('click');
    // No animation to await: the fallback is synchronous, so this is already settled.
    expect(details.open).toBe(false);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    wrapper.unmount();
  });

  it('reduced motion closes instantly and never starts a height animation', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      const wrapper = mountWith(AccordionItem, {
        props: { title: 'Materials & care', modelValue: true },
        slots: { default: 'Body' },
      });
      const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
      giveMotionTokens(panel);
      const animateSpy = vi.spyOn(panel, 'animate');

      const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
      await wrapper.get('[data-part="summary"]').trigger('click');
      expect(details.open).toBe(false);
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
      expect(animateSpy).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('reduced motion opens instantly and never starts a height animation', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      const wrapper = mountWith(AccordionItem, {
        props: { title: 'Materials & care', modelValue: false },
        slots: { default: 'Body' },
      });
      const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
      giveMotionTokens(panel);
      const animateSpy = vi.spyOn(panel, 'animate');

      const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
      await wrapper.get('[data-part="summary"]').trigger('click');
      expect(details.open).toBe(true);
      expect(animateSpy).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('opening via an ordinary click animates the panel height from 0 to its measured scrollHeight', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: false },
      slots: { default: 'Body' },
    });
    const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
    giveMotionTokens(panel);
    const animateSpy = vi
      .spyOn(panel, 'animate')
      .mockReturnValue({ finished: Promise.resolve() } as unknown as Animation);

    await wrapper.get('[data-part="summary"]').trigger('click');
    expect(animateSpy).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animateSpy.mock.calls[0]!;
    expect(keyframes).toEqual([{ height: '0px' }, { height: `${panel.scrollHeight}px` }]);
    expect((options as KeyframeAnimationOptions).duration).toBe(20);
    expect((options as KeyframeAnimationOptions).easing).toBe('cubic-bezier(0.2,0,0,1)');
    wrapper.unmount();
  });

  it('a browser-forced open with no preceding click (find-in-page) still animates, via `toggle`', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: false },
      slots: { default: 'Body' },
    });
    const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
    giveMotionTokens(panel);
    const animateSpy = vi
      .spyOn(panel, 'animate')
      .mockReturnValue({ finished: Promise.resolve() } as unknown as Animation);

    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    // No `.trigger('click')` at all: this is what the browser does on its own when find-in-page
    // reveals a match inside a closed panel — it flips `open` and fires `toggle` with no click
    // event preceding it.
    details.open = true;
    expect(animateSpy).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animateSpy.mock.calls[0]!;
    expect(keyframes).toEqual([{ height: '0px' }, { height: `${panel.scrollHeight}px` }]);
    expect((options as KeyframeAnimationOptions).easing).toBe('cubic-bezier(0.2,0,0,1)');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    expect(wrapper.emitted('toggle')?.[0]).toEqual([true]);
    wrapper.unmount();
  });

  it('closing a second time in quick succession is ignored while the first close is still animating', async () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Materials & care', modelValue: true },
      slots: { default: 'Body' },
    });
    const panel = wrapper.get('[data-part="panel"]').element as HTMLElement;
    giveMotionTokens(panel);
    let resolveFinished!: () => void;
    const animateSpy = vi.spyOn(panel, 'animate').mockReturnValue({
      finished: new Promise<void>((resolve) => {
        resolveFinished = resolve;
      }),
    } as unknown as Animation);

    const summary = wrapper.get('[data-part="summary"]');
    await summary.trigger('click');
    await summary.trigger('click'); // still mid-animation: must not start a second one
    expect(animateSpy).toHaveBeenCalledTimes(1);

    resolveFinished();
    await flushAnimationSettling();
    const details = wrapper.get('[data-part="root"]').element as HTMLDetailsElement;
    expect(details.open).toBe(false);
    wrapper.unmount();
  });
});
