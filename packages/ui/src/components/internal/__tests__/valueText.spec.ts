import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWith } from '../../../test/mount';
import { giveMotionTokens, recordAnimations, stubReducedMotion } from '../../../test/motion';
import ValueText from '../ValueText.vue';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** The motion tokens as an inline style, so they are on the element from its very first render —
 *  which is what makes the "never on first paint" rule below a real assertion rather than a
 *  tautology about a token that had not arrived yet. */
const TOKENS = '--eldra-duration-base: 200ms; --eldra-ease-out: cubic-bezier(0.2, 0, 0, 1)';

function mountValue(text: string, style = TOKENS) {
  return mountWith(ValueText, {
    props: { text },
    attrs: { 'data-part': 'currentValue', class: 'text-accent', style },
  });
}

describe('ValueText', () => {
  it('renders a bare span and lets the caller own its data-part and class', () => {
    const wrapper = mountValue('$48.00');
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('data-part')).toBe('currentValue');
    expect(wrapper.classes()).toContain('text-accent');
    expect(wrapper.text()).toBe('$48.00');
    wrapper.unmount();
  });

  /**
   * The text is an ordinary interpolation on a stable element, so it is correct the instant the
   * prop changes and there is never a second copy of it. That is the whole reason this is not a
   * keyed `<Transition>` — see `src/utils/valueFade.ts`.
   */
  it('changes its text in the same tick, on the same element', async () => {
    const wrapper = mountValue('$48.00');
    const el = wrapper.element;
    await wrapper.setProps({ text: '$36.00' });
    expect(wrapper.text()).toBe('$36.00');
    expect(wrapper.element).toBe(el);
    expect(document.querySelectorAll('[data-part="currentValue"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('fades a changed value in, and never the value it mounts with', async () => {
    const played = recordAnimations();
    const wrapper = mountValue('$48.00');
    // The tokens are on the element from the first render, so an entrance animation would be
    // recorded here if one were played. A value that arrives with the component has not changed.
    expect(played.calls).toHaveLength(0);

    await wrapper.setProps({ text: '$36.00' });
    expect(played.calls).toHaveLength(1);
    expect(played.calls[0]!.el).toBe(wrapper.element);
    expect(played.calls[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played.calls[0]!.options.duration).toBe(200);
    wrapper.unmount();
    played.restore();
  });

  /** `flush: 'post'`: the element already holds the new text when the fade starts, so what fades
   *  in is the new value and never the old one. */
  it('plays the fade only once the element holds the new text', async () => {
    const played = recordAnimations();
    const wrapper = mountValue('$48.00');
    await wrapper.setProps({ text: '$36.00' });
    expect(played.calls[0]!.text).toBe('$36.00');
    wrapper.unmount();
    played.restore();
  });

  /**
   * Two values in quick succession — a refresh landing while an earlier fade is still running, a
   * visitor stepping a quantity twice — must leave one animation on the element, not a pile of
   * them driving the same `opacity` with the oldest free to finish last and show the wrong frame.
   */
  it('cancels the fade in flight before starting the next one', async () => {
    const played = recordAnimations();
    const wrapper = mountValue('$48.00');
    await wrapper.setProps({ text: '$36.00' });
    await wrapper.setProps({ text: '$12.00' });
    await wrapper.setProps({ text: '$9.00' });

    expect(played.calls).toHaveLength(3);
    expect(played.calls.map((call) => call.cancelled)).toEqual([true, true, false]);
    // The one still running is the newest value's, and the element shows that value.
    expect(played.calls.at(-1)!.text).toBe('$9.00');
    expect(wrapper.text()).toBe('$9.00');
    wrapper.unmount();
    played.restore();
  });

  it('plays nothing when the text is set to the value it already has', async () => {
    const played = recordAnimations();
    const wrapper = mountValue('6.990 kr.');
    await wrapper.setProps({ text: '6.990 kr.' });
    expect(played.calls).toHaveLength(0);
    wrapper.unmount();
    played.restore();
  });

  it.each([
    ['the visitor asked for reduced motion', TOKENS, true],
    ['the stylesheet zeroed the duration token', '--eldra-duration-base: 0ms', false],
    ['no stylesheet supplies the tokens', '', false],
  ])('plays nothing when %s, and still changes the text', async (_case, style, reduce) => {
    const played = recordAnimations();
    if (reduce) stubReducedMotion();
    const wrapper = mountValue('$48.00', style);
    await wrapper.setProps({ text: '$36.00' });
    expect(played.calls).toHaveLength(0);
    expect(wrapper.text()).toBe('$36.00');
    wrapper.unmount();
    played.restore();
  });

  it('survives an element the browser cannot animate', async () => {
    const wrapper = mountValue('$48.00');
    giveMotionTokens(wrapper.element);
    (wrapper.element as unknown as { animate: undefined }).animate = undefined;
    await wrapper.setProps({ text: '$36.00' });
    expect(wrapper.text()).toBe('$36.00');
    wrapper.unmount();
  });
});
