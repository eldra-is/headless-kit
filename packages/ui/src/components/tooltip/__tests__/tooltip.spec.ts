import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Button from '../../button/Button.vue';
import Input from '../../input/Input.vue';
import * as supportsFocusVisibleModule from '../supportsFocusVisible';
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

describe('Tooltip — pointer activation dismisses it (operator report / controller ruling)', () => {
  /**
   * The bug: hovering a trigger shows the tooltip; a mouse click also focuses the trigger, and
   * `focusWithin` alone used to count that as "focus within the wrapper" — so leaving with the
   * pointer afterwards no longer hid it. Mutation check: reverting `wantsOpen` to read `focusWithin`
   * instead of `keyboardFocusWithin` (this spec's original defect) turns this red — the tooltip is
   * still visible after the final `mouseleave` — which is what proves this test actually guards it,
   * not merely that a click hides *something*.
   */
  it('hides once the pointer leaves after a click, even though the click itself focused the trigger', async () => {
    vi.spyOn(supportsFocusVisibleModule, 'supportsFocusVisible').mockReturnValue(false);
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    // A real click: pointerdown, the focus a browser gives a clicked button, then click — all
    // still while the pointer sits over the trigger.
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger.focus();
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    // Dismissed by the click alone — the operator's exact complaint ("gets stuck") never gets the
    // chance to happen, even before the pointer moves.
    expect(isVisible(bubble)).toBe(false);

    root.dispatchEvent(new MouseEvent('mouseleave'));
    await nextTick();
    expect(isVisible(bubble)).toBe(false);

    vi.restoreAllMocks();
  });

  /**
   * Mutation check: deleting `onRootPointerDown`'s `dismissed.value = true` (leaving only the
   * `click` and `keydown` listeners) turns this specific test red at the pointerdown assertion,
   * proving it is `pointerdown` itself doing the work there, not the `click` that follows.
   */
  it('a bare pointerdown (no click yet) already dismisses a shown tooltip', async () => {
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    root.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
  });
});

describe('Tooltip — keyboard focus vs. pointer focus (operator report / controller ruling)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Mutation check: reverting `onRootFocusIn` to set `keyboardFocusWithin.value = true`
   * unconditionally (ignoring `isKeyboardFocus`) leaves this test passing (focus still shows it) —
   * so the *real* guard is the pair with the "mouse focus" test below, which that same mutation
   * turns red.
   */
  it('a keyboard (Tab) focus keeps it open, via the :focus-visible fallback flag', async () => {
    vi.spyOn(supportsFocusVisibleModule, 'supportsFocusVisible').mockReturnValue(false);
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(isVisible(bubble)).toBe(false);

    // The keydown a real Tab press fires on whatever had focus before this trigger — simulated on
    // `document`, exactly where the fallback flag's own listener is attached.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);
  });

  /**
   * The operator's own repro, isolated from both hover and the click-dismissal handler above: the
   * pointerdown that flips the fallback flag happens on an unrelated element, never on the trigger
   * itself, so `onRootPointerDown`'s own dismissal (proven separately above) cannot be what keeps
   * this one hidden — only `keyboardFocusWithin` can be. Mutation check: this is the test the
   * `isKeyboardFocus`/`keyboardFocusWithin` split exists for — reverting `wantsOpen` to read plain
   * `focusWithin` turns it red (confirmed: reverting it makes the assertion below fail, `true`
   * where `false` is expected, while every other spec in this file still passes).
   */
  it('a mouse-focused trigger (no keydown beforehand) does not show the tooltip on focus alone', async () => {
    vi.spyOn(supportsFocusVisibleModule, 'supportsFocusVisible').mockReturnValue(false);
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));
    const outside = document.createElement('button');
    document.body.append(outside);

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(false);

    outside.remove();
  });

  /**
   * Mutation check: reverting `onRootFocusOut` to leave `keyboardFocusWithin` untouched (only
   * clearing `focusWithin`) turns this red — the tooltip would stay visible after `outside.focus()`
   * because nothing else re-reads `keyboardFocusWithin` at that point.
   */
  it('tabbing away from a keyboard-focused trigger hides it', async () => {
    vi.spyOn(supportsFocusVisibleModule, 'supportsFocusVisible').mockReturnValue(false);
    const wrapper = mountTooltip();
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));
    const outside = document.createElement('button');
    document.body.append(outside);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    outside.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(false);

    outside.remove();
  });

  /**
   * Activating a keyboard-focused trigger (here, the `Enter` that a screen-reader or keyboard user
   * presses to press the button) must not leave its own label floating over it — the same
   * click-dismissal as the mouse case above, proven here without any pointer ever touching the
   * trigger, and with focus never leaving it either. Mutation check: deleting `onRootKeyDown`'s
   * `dismissed.value = true` turns the first assertion red (the bubble stays visible through
   * `Enter`); reverting the `hoveringTrigger` watcher to its old falling-edge-only form (`!hovering
   * && wasHovering`) turns the *second* assertion red — the pointer never left, so a leave-only
   * watcher never clears the dismissal and re-hovering does nothing.
   */
  it('Enter on a keyboard-focused trigger dismisses it until it is hovered', async () => {
    vi.spyOn(supportsFocusVisibleModule, 'supportsFocusVisible').mockReturnValue(false);
    const wrapper = mountTooltip();
    const root = wrapper.element as HTMLElement;
    const trigger = triggerOf(wrapper).element as HTMLElement;
    const bubble = bubbleOf(triggerOf(wrapper));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    trigger.focus();
    await nextTick();
    expect(isVisible(bubble)).toBe(true);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(isVisible(bubble)).toBe(false);
    // Still focused — Enter activates the button, it does not move focus off it.
    expect(document.activeElement).toBe(trigger);

    // "Until it is hovered": the pointer entering, not a blur/refocus, is what clears it here.
    root.dispatchEvent(new MouseEvent('mouseenter'));
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

  it('joins the tooltip id onto an aria-labelledby the trigger already carries', async () => {
    const wrapper = mountTooltip(
      {},
      '<button type="button" aria-labelledby="existing-label">♡</button>'
    );
    const trigger = triggerOf(wrapper).element;
    const bubble = bubbleOf(triggerOf(wrapper));
    expect(trigger.getAttribute('aria-labelledby')).toBe(`existing-label ${bubble.id}`);
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

  it('warns that content beyond the first element is dropped, not merely un-wired, for a multi-element slot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wrapper = mountTooltip({}, '<button type="button">♡</button><span>Extra</span>');
    await nextTick();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('everything after it is dropped, not merely left un-wired')
    );
    // The claim the new wording makes is true: the second element never renders at all.
    expect(wrapper.text()).not.toContain('Extra');
  });

  /**
   * Final review M5: a component trigger whose focusable root receives `$attrs` (the default —
   * `Button` declares no `inheritAttrs: false`) works exactly like a plain element, so the graft
   * both lands on the DOM and raises no warning.
   */
  it('grafts the aria attribute onto a component trigger whose root forwards $attrs (e.g. Button)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wrapper = mountWith(Tooltip, {
      props: { text: 'Add to wishlist' },
      slots: { default: () => h(Button, { variant: 'ghost' }, () => '♡') },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    const trigger = wrapper.get('button').element;
    const bubble = bubbleOf(wrapper.get('button'));
    expect(trigger.getAttribute('aria-labelledby')).toBe(bubble.id);
    expect(warn).not.toHaveBeenCalled();
  });

  /**
   * Final review M5: `Input` declares `inheritAttrs: false` and binds its own `aria-describedby`
   * (from `FieldWrapper` context, `undefined` here) after `v-bind="$attrs"` on its inner control —
   * so the grafted attribute never reaches the DOM at all, and this component warns about it,
   * naming the fix.
   */
  it('warns when a component trigger with inheritAttrs: false overwrites the grafted attribute (Input)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const wrapper = mountWith(Tooltip, {
      props: { text: 'Digits only', role: 'description' },
      slots: { default: () => h(Input, {}) },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    const control = wrapper.get('[data-part="control"]').element;
    expect(control.getAttribute('aria-describedby')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('could not find its own aria-describedby on the trigger element')
    );
  });
});
