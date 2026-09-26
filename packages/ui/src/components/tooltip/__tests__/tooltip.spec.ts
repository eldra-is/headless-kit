import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Tooltip from '../Tooltip.vue';

/**
 * `Tooltip` (design spec "Tooltip", lines 4356-4463): a short, non-modal text label naming or
 * describing an icon-only trigger on hover and keyboard focus. Built on `useFloating` +
 * `useOverlay` directly — never `usePopover` — so it never joins the "only one open at a time"
 * registry: showing a tooltip must never close somebody else's open `Select`.
 *
 * The bubble is teleported to `document.body` and stays permanently mounted (see `Tooltip.vue`'s
 * own comment on why — a CSS transition, unlike `usePopover`'s replayed keyframe, needs an element
 * already in the DOM to animate a change on), so every test that needs it reads
 * `document.getElementById` rather than `wrapper.find`.
 */

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** `computePosition` is a promise; `autoUpdate` schedules it. Let both settle. */
async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mountTooltip(
  props: Record<string, unknown> = {},
  slotHtml = '<button type="button">♡</button>'
) {
  const wrapper = mountWith(Tooltip, {
    props: { text: 'Add to wishlist', ...props },
    slots: { default: slotHtml },
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

const triggerOf = (wrapper: VueWrapper) => wrapper.get('button');

/**
 * The bubble is teleported, so it is found through the trigger's own ARIA pointer, not `find`.
 * Either attribute may hold more than one id (an existing `aria-describedby` joined with the
 * tooltip's own), so every id is tried and the one that actually resolves — the bubble carries
 * `role="tooltip"` — wins.
 */
function bubbleOf(trigger: { element: Element }): HTMLElement {
  const value =
    trigger.element.getAttribute('aria-labelledby') ??
    trigger.element.getAttribute('aria-describedby');
  expect(value).not.toBeNull();
  const bubble = (value as string)
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .find((element) => element?.getAttribute('role') === 'tooltip');
  expect(bubble).not.toBeUndefined();
  return bubble as HTMLElement;
}

const isVisible = (bubble: HTMLElement): boolean => bubble.className.includes('opacity-100');

// ---------------------------------------------------------------------------------------------

describe('Tooltip — showing, with no delay', () => {
  it('shows on focus immediately, with fake timers proving there is no delay', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper);
    const bubble = bubbleOf(trigger);
    expect(isVisible(bubble)).toBe(false);

    trigger.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    (trigger.element as HTMLElement).focus();
    // Not one tick of fake time has passed, and it is already visible: the spec's "no delay on
    // focus" is not a fast timer, it is no timer.
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
  });

  it('shows on hover immediately, with fake timers proving there is no delay', async () => {
    vi.useFakeTimers();
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(isVisible(bubble)).toBe(false);

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
    // Confirms it was never pending on a timer that fake time is now skipping past.
    await vi.advanceTimersByTimeAsync(2000);
    expect(isVisible(bubble)).toBe(true);
  });
});

describe('Tooltip — hiding', () => {
  it('hides when the pointer leaves and the trigger is not focused', async () => {
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    root.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
  });

  it('hides on blur (focus leaving the wrapper)', async () => {
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));
    const outside = document.createElement('button');
    document.body.append(outside);

    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    outside.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
  });

  it('Esc hides it without moving focus, and leaving/re-entering shows it again', async () => {
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
    // "without moving focus": the trigger keeps it.
    expect(document.activeElement).toBe(trigger);

    // Still focused, dismissed: nothing brings it back until focus (or hover) actually leaves.
    await nextTick();
    expect(isVisible(bubble)).toBe(false);

    // "Leaving ... clears the dismissed state" — blur then refocus shows it again.
    trigger.blur();
    await nextTick();
    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
  });

  it('Esc dismissal on hover clears when the pointer leaves and re-enters', async () => {
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await nextTick();
    expect(isVisible(bubble)).toBe(false);

    root.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
  });
});

describe('Tooltip — hoverable (WCAG 1.4.13)', () => {
  it('stays open when the pointer moves from the trigger onto the bubble', async () => {
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    // The pointer crosses onto the bubble before leaving the trigger — the bridge in a real
    // browser is what makes this always true; here it is simulated directly.
    bubble.dispatchEvent(new MouseEvent('mouseenter'));
    root.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    // And it still closes once the pointer actually leaves the bubble too.
    bubble.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
  });

  it('stays open while focused even if the pointer never touches the bubble', async () => {
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    // A stray mouseleave (the pointer was never really over it) must not hide a focus-shown tip.
    wrapper.element.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
  });
});

describe('Tooltip — role modes and the trigger’s ARIA', () => {
  it('role="label" (default) names the trigger via aria-labelledby, once', async () => {
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(trigger.getAttribute('aria-labelledby')).toBe(bubble.id);
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    expect(bubble.getAttribute('role')).toBe('tooltip');
  });

  it('role="description" describes a trigger that already has a visible name', async () => {
    const wrapper = mountTooltip(
      { role: 'description' },
      '<button type="button">Copy code</button>'
    );
    const trigger = triggerOf(wrapper).element;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(trigger.getAttribute('aria-describedby')).toBe(bubble.id);
    expect(trigger.getAttribute('aria-labelledby')).toBeNull();
  });

  it('joins the tooltip id onto an aria-describedby the trigger already carries', async () => {
    const wrapper = mountTooltip(
      { role: 'description' },
      '<button type="button" aria-describedby="existing-hint">Copy code</button>'
    );
    const trigger = triggerOf(wrapper).element;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(trigger.getAttribute('aria-describedby')).toBe(`existing-hint ${bubble.id}`);
  });

  it('keeps the same trigger element across re-renders (no remount on prop change)', async () => {
    const wrapper = mountTooltip({ text: 'Add to wishlist' });
    const trigger = triggerOf(wrapper).element;
    await wrapper.setProps({ text: 'Remove from wishlist' });
    await nextTick();
    expect(triggerOf(wrapper).element).toBe(trigger);
  });
});

describe('Tooltip — placement and align', () => {
  it.each([
    ['top', 'center', 'top', 'left-1/2'],
    ['bottom', 'center', 'bottom', 'left-1/2'],
    ['top', 'start', 'top-start', 'left-5'],
    ['top', 'end', 'top-end', 'right-5'],
    ['bottom', 'start', 'bottom-start', 'left-5'],
    ['bottom', 'end', 'bottom-end', 'right-5'],
  ])(
    'placement=%s align=%s resolves to data-placement=%s with arrow class %s',
    async (placement, align, expectedPlacement, arrowAlignClass) => {
      const wrapper = mountTooltip({ placement, align });
      await flush();
      const bubble = bubbleOf(triggerOf(wrapper));
      expect(bubble.getAttribute('data-placement')).toBe(expectedPlacement);
      const arrow = bubble.querySelector('[data-part="arrow"]');
      expect(arrow).not.toBeNull();
      expect(arrow?.className).toContain(arrowAlignClass);
      // The bridge and the arrow both key off which edge the bubble sits on.
      const above = expectedPlacement.startsWith('top');
      expect(bubble.className).toContain(above ? 'before:-bottom-2' : 'before:-top-2');
    }
  );
});

describe('Tooltip — teleport', () => {
  it('teleports the bubble onto document.body, outside the component root', async () => {
    const wrapper = mountTooltip();
    await flush();
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(bubble.parentElement).toBe(document.body);
    expect(wrapper.element.contains(bubble)).toBe(false);
  });

  it('positions the bubble against the viewport (fixed strategy)', async () => {
    const wrapper = mountTooltip();
    await flush();
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(bubble.getAttribute('style')).toContain('position: fixed');
  });

  it('never registers with the Select/MultiSelect open registry', () => {
    // Regression guard for the controller ruling: a Tooltip must never join the "only one open at
    // a time" registry `Select`/`MultiSelect`/`SearchBar` share — showing one must never close
    // somebody else's open Select. Read statically (an `import` line, not just a prose mention —
    // this file's own doc comment names both by design), since importing either module at all,
    // even unused, would be the defect this guards against.
    const path = fileURLToPath(new NodeURL('../Tooltip.vue', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).not.toMatch(/^\s*import[^\n]*openRegistry/m);
    expect(source).not.toMatch(/^\s*import[^\n]*usePopover/m);
  });
});

describe('Tooltip — content', () => {
  it('renders long text on one line, without wrapping', async () => {
    const long =
      'This is a much longer tooltip label than the spec wants, used only to prove the bubble ' +
      'never wraps onto a second line no matter how long the text given to it is';
    const wrapper = mountTooltip({ text: long });
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(bubble.textContent?.trim()).toContain(long);
    expect(bubble.className).toContain('whitespace-nowrap');
  });

  it('renders inside a narrow (20rem) container without throwing', () => {
    const wrapper = mountNarrow(Tooltip, {
      props: { text: 'Add to wishlist' },
      slots: { default: '<button type="button">♡</button>' },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(triggerOf(wrapper).element.tagName).toBe('BUTTON');
  });
});

describe('Tooltip — classes prop', () => {
  it('merges classes.root/bubble/arrow with tailwind-merge', async () => {
    const wrapper = mountTooltip({ classes: { root: 'gap-1', bubble: 'py-4', arrow: 'size-2' } });
    await flush();
    expect(wrapper.attributes('class')).toContain('gap-1');
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(bubble.className).toContain('py-4');
    expect(bubble.className).not.toContain('py-1.5');
    const arrow = bubble.querySelector('[data-part="arrow"]');
    expect(arrow?.className).toContain('size-2');
  });
});

describe('Tooltip — accessibility', () => {
  it('has no axe violations hidden or shown', async () => {
    const wrapper = mountTooltip();
    expect(await axe(wrapper.element)).toHaveNoViolations();

    const root = wrapper.element as HTMLElement;
    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations in role="description" mode', async () => {
    const wrapper = mountTooltip(
      { role: 'description' },
      '<button type="button">Copy code</button>'
    );
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('Tooltip — dev warnings', () => {
  it('warns when the trigger is not focusable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mountTooltip({}, '<span>♡</span>');
    await nextTick();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not focusable'));
  });

  it('does not warn when the trigger is a real button', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mountTooltip();
    await nextTick();
    expect(warn).not.toHaveBeenCalled();
  });
});
