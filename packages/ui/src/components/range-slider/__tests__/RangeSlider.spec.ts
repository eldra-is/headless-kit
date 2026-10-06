import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import RangeSlider from '../RangeSlider.vue';
import type { RangeSliderThumb, RangeSliderValue } from '../types';

type Wrapper = ReturnType<typeof mountWith<typeof RangeSlider>>;

/**
 * A mount whose parent actually applies what the control emits — `v-model`, in other words.
 *
 * A bare `modelValue` prop makes the control *controlled* by a parent that never writes back,
 * which is correct behaviour (a parent that refuses a value really does refuse it: see
 * `useControllableModel`) but leaves every second step of a multi-step assertion reading the same
 * starting value, and makes `change` report what is still on screen rather than where the move
 * ended. Anything that moves twice, or that checks `change`, mounts through here.
 */
function mountModel(props: Record<string, unknown>): Wrapper {
  const holder: { wrapper?: Wrapper } = {};
  holder.wrapper = mountWith(RangeSlider, {
    props: {
      ...props,
      'onUpdate:modelValue': (value: RangeSliderValue) => {
        void holder.wrapper?.setProps({ modelValue: value });
      },
    },
  });
  return holder.wrapper;
}

/** The tick that parent takes to hand the new value back. */
async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function thumb(wrapper: Wrapper, which: RangeSliderThumb): HTMLElement {
  return wrapper.find(`[data-thumb="${which}"]`).element as HTMLElement;
}

function field(wrapper: Wrapper, which: RangeSliderThumb): HTMLInputElement {
  return wrapper.find(`[data-input="${which}"]`).element as HTMLInputElement;
}

/**
 * A laid-out rail. happy-dom reports every rect as zero, and `rangePositionToValue` answers `min`
 * for a rect with no width (by design — see its own comment), so a pointer test has to say how
 * wide the rail is before it can say anything about where a press landed. 200px from x=0, so a
 * client x is a percentage doubled.
 */
function layOutRail(wrapper: Wrapper, width = 200, left = 0): void {
  const rail = wrapper.find('[data-part="rail"]').element;
  Object.defineProperty(rail, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left,
      width,
      right: left + width,
      top: 0,
      bottom: 20,
      height: 20,
      x: left,
      y: 0,
    }),
  });
}

/** A real event, so `defaultPrevented` can be read: VTU's `trigger` does not report it back. */
function press(element: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RangeSlider — parts, roles and names', () => {
  it('draws every named part and two sliders in one group', () => {
    const wrapper = mountWith(RangeSlider, { props: { label: 'Price' } });
    expect(wrapper.find('[data-part="root"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="label"]').text()).toBe('Price');
    expect(wrapper.find('[data-part="rail"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="track"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="range"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-part="thumb"]')).toHaveLength(2);

    const group = wrapper.find('[data-part="group"]').element;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-labelledby')).toBe(
      wrapper.find('[data-part="label"]').element.id
    );
    for (const which of ['min', 'max'] as const) {
      expect(thumb(wrapper, which).getAttribute('role')).toBe('slider');
      expect(thumb(wrapper, which).getAttribute('tabindex')).toBe('0');
    }
    wrapper.unmount();
  });

  it('names each thumb from the visible label', () => {
    const wrapper = mountWith(RangeSlider, { props: { label: 'price' } });
    expect(thumb(wrapper, 'min').getAttribute('aria-label')).toBe('Minimum price');
    expect(thumb(wrapper, 'max').getAttribute('aria-label')).toBe('Maximum price');
    wrapper.unmount();
  });

  it('falls back to the bare messages with no label, and takes explicit thumb names over both', () => {
    const bare = mountWith(RangeSlider);
    expect(thumb(bare, 'min').getAttribute('aria-label')).toBe('Minimum');
    expect(thumb(bare, 'max').getAttribute('aria-label')).toBe('Maximum');
    bare.unmount();

    const named = mountWith(RangeSlider, {
      props: { label: 'Price', minLabel: 'Cheapest', maxLabel: 'Dearest' },
    });
    expect(thumb(named, 'min').getAttribute('aria-label')).toBe('Cheapest');
    expect(thumb(named, 'max').getAttribute('aria-label')).toBe('Dearest');
    named.unmount();
  });

  it('takes the thumb names from the messages prop', () => {
    const wrapper = mountWith(RangeSlider, {
      props: {
        label: 'verð',
        messages: {
          minimumOf: (name: string) => `Lágmark ${name}`,
          maximumOf: (name: string) => `Hámark ${name}`,
        },
      },
    });
    expect(thumb(wrapper, 'min').getAttribute('aria-label')).toBe('Lágmark verð');
    expect(thumb(wrapper, 'max').getAttribute('aria-label')).toBe('Hámark verð');
    wrapper.unmount();
  });

  it('reports each thumb own limits, so the neighbour is the limit a reader hears', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 60] as [number, number], min: 0, max: 100 },
    });
    const min = thumb(wrapper, 'min');
    expect(min.getAttribute('aria-valuenow')).toBe('20');
    expect(min.getAttribute('aria-valuemin')).toBe('0');
    expect(min.getAttribute('aria-valuemax')).toBe('60');
    const max = thumb(wrapper, 'max');
    expect(max.getAttribute('aria-valuenow')).toBe('60');
    expect(max.getAttribute('aria-valuemin')).toBe('20');
    expect(max.getAttribute('aria-valuemax')).toBe('100');
    wrapper.unmount();
  });

  it('starts at the full span with no value bound', () => {
    const wrapper = mountWith(RangeSlider, { props: { min: 1200, max: 4800 } });
    expect(thumb(wrapper, 'min').getAttribute('aria-valuenow')).toBe('1200');
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('4800');
    wrapper.unmount();
  });

  it('positions the thumbs and the filled range as percentages of the bounds', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [25, 75] as [number, number], min: 0, max: 100 },
    });
    expect(thumb(wrapper, 'min').style.left).toBe('25%');
    expect(thumb(wrapper, 'max').style.left).toBe('75%');
    const range = wrapper.find('[data-part="range"]').element as HTMLElement;
    expect(range.style.left).toBe('25%');
    expect(range.style.width).toBe('50%');
    wrapper.unmount();
  });

  it('renders the typed row only with `inputs`', () => {
    const without = mountWith(RangeSlider, { props: { label: 'Price' } });
    expect(without.find('[data-part="inputs"]').exists()).toBe(false);
    without.unmount();

    const wrapper = mountWith(RangeSlider, { props: { label: 'Price', inputs: true } });
    expect(wrapper.findAll('[data-part="input"]')).toHaveLength(2);
    // The word between the fields is punctuation: both fields are already named.
    const separator = wrapper.find('[data-part="separator"]').element;
    expect(separator.textContent?.trim()).toBe('to');
    expect(separator.getAttribute('aria-hidden')).toBe('true');
    // The label joins as written, so a sentence-case name comes from a sentence-case label (or
    // from `minLabel`/`maxLabel`).
    expect(field(wrapper, 'min').getAttribute('aria-label')).toBe('Minimum Price');
    expect(field(wrapper, 'max').getAttribute('aria-label')).toBe('Maximum Price');
    wrapper.unmount();
  });
});

describe('RangeSlider — accessibility', () => {
  it('has no axe violations by default', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { label: 'Price', modelValue: [20, 60] as [number, number] },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations with the typed row', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { label: 'Price', inputs: true, modelValue: [20, 60] as [number, number] },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations while disabled', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { label: 'Price', inputs: true, disabled: true },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations with no label at all', async () => {
    const wrapper = mountWith(RangeSlider, { props: { inputs: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders in a narrow container', async () => {
    const wrapper = mountNarrow(RangeSlider, { props: { label: 'Price', inputs: true } });
    expect(wrapper.findAll('[data-part="thumb"]')).toHaveLength(2);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('RangeSlider — keyboard', () => {
  it('steps the focused thumb by the step, both arrow axes', async () => {
    const wrapper = mountModel({ modelValue: [20, 60], step: 5 });
    for (const [key, expected] of [
      ['ArrowRight', 25],
      ['ArrowUp', 30],
      ['ArrowLeft', 25],
      ['ArrowDown', 20],
    ] as const) {
      press(thumb(wrapper, 'min'), key);
      await settle();
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[expected, 60]]);
    }
    wrapper.unmount();
  });

  it('steps by the large step with Shift and with PageUp/PageDown', async () => {
    const wrapper = mountModel({ modelValue: [20, 60], step: 1, largeStep: 25 });
    press(thumb(wrapper, 'min'), 'ArrowRight', true);
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[45, 60]]);
    press(thumb(wrapper, 'max'), 'PageUp');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[45, 85]]);
    press(thumb(wrapper, 'max'), 'PageDown');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[45, 60]]);
    wrapper.unmount();
  });

  it('defaults the large step to ten steps', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 60] as [number, number], step: 2 },
    });
    press(thumb(wrapper, 'min'), 'PageUp');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[40, 60]]);
    wrapper.unmount();
  });

  it('sends Home and End to the focused thumb own limits', async () => {
    const wrapper = mountModel({ modelValue: [20, 60], min: 0, max: 100 });
    press(thumb(wrapper, 'min'), 'End');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[60, 60]]);
    press(thumb(wrapper, 'min'), 'Home');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[0, 60]]);
    press(thumb(wrapper, 'max'), 'End');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[0, 100]]);
    press(thumb(wrapper, 'max'), 'Home');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[0, 0]]);
    wrapper.unmount();
  });

  it('claims the keys it handles and leaves Tab alone', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 60] as [number, number] },
    });
    expect(press(thumb(wrapper, 'min'), 'ArrowRight').defaultPrevented).toBe(true);
    const tab = press(thumb(wrapper, 'min'), 'Tab');
    expect(tab.defaultPrevented).toBe(false);
    // ...and nothing moved on the Tab.
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    wrapper.unmount();
  });

  it('ignores every key while disabled', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 60] as [number, number], disabled: true },
    });
    expect(press(thumb(wrapper, 'min'), 'ArrowRight').defaultPrevented).toBe(false);
    press(thumb(wrapper, 'max'), 'PageDown');
    press(thumb(wrapper, 'min'), 'Home');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(thumb(wrapper, 'min').getAttribute('aria-disabled')).toBe('true');
    wrapper.unmount();
  });
});

describe('RangeSlider — the thumbs cannot cross', () => {
  it('stops the minimum thumb where the maximum is, by key', async () => {
    const wrapper = mountModel({ modelValue: [20, 25], step: 1, largeStep: 50 });
    press(thumb(wrapper, 'min'), 'ArrowRight', true);
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[25, 25]]);
    // Against its neighbour now: a further press moves nothing and emits nothing.
    press(thumb(wrapper, 'min'), 'ArrowRight');
    await settle();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    wrapper.unmount();
  });

  it('stops the maximum thumb where the minimum is, by key', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 25] as [number, number], step: 1, largeStep: 50 },
    });
    press(thumb(wrapper, 'max'), 'ArrowLeft', true);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[20, 20]]);
    wrapper.unmount();
  });

  it('stops a dragged thumb against the other rather than swapping them', async () => {
    const wrapper = mountModel({ modelValue: [20, 60], min: 0, max: 100 });
    layOutRail(wrapper);
    const rail = wrapper.find('[data-part="rail"]');
    // Press on the minimum thumb's own position, then drag it past the maximum.
    await rail.trigger('pointerdown', { clientX: 40 });
    await rail.trigger('pointermove', { clientX: 180 });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[60, 60]]);
    await rail.trigger('pointerup', { clientX: 180 });
    expect(wrapper.emitted('change')?.at(-1)).toEqual([[60, 60]]);
    wrapper.unmount();
  });

  it('orders and snaps a value the parent passes the wrong way round', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [75, 25] as [number, number], min: 0, max: 100, step: 10 },
    });
    expect(thumb(wrapper, 'min').getAttribute('aria-valuenow')).toBe('30');
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('80');
    wrapper.unmount();
  });
});

describe('RangeSlider — pointer', () => {
  it('moves the nearer thumb to the pressed value, snapped to the step', async () => {
    const wrapper = mountModel({ modelValue: [20, 80], min: 0, max: 100, step: 10 });
    layOutRail(wrapper);
    const rail = wrapper.find('[data-part="rail"]');
    // 37% of the rail: nearer the minimum thumb, and snapped to 40.
    await rail.trigger('pointerdown', { clientX: 74 });
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[40, 80]]);
    // 71%: nearer the maximum thumb, snapped to 70.
    await rail.trigger('pointerup', { clientX: 74 });
    await rail.trigger('pointerdown', { clientX: 142 });
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[40, 70]]);
    wrapper.unmount();
  });

  it('keeps dragging the thumb it started on, and reports change once on release', async () => {
    const wrapper = mountModel({ modelValue: [20, 80], min: 0, max: 100, step: 1 });
    layOutRail(wrapper);
    const rail = wrapper.find('[data-part="rail"]');
    await rail.trigger('pointerdown', { clientX: 50 });
    await settle();
    await rail.trigger('pointermove', { clientX: 60 });
    await settle();
    await rail.trigger('pointermove', { clientX: 90 });
    await settle();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    expect(wrapper.emitted('change')).toBeUndefined();
    await rail.trigger('pointerup', { clientX: 90 });
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect(wrapper.emitted('change')?.[0]).toEqual([[45, 80]]);
    // The drag is over: a move with no press moves nothing.
    await rail.trigger('pointermove', { clientX: 20 });
    await settle();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    wrapper.unmount();
  });

  it('focuses the thumb it starts dragging, so the keyboard carries on where the pointer left off', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 80] as [number, number], min: 0, max: 100 },
    });
    layOutRail(wrapper);
    await wrapper.find('[data-part="rail"]').trigger('pointerdown', { clientX: 150 });
    expect(document.activeElement).toBe(thumb(wrapper, 'max'));
    wrapper.unmount();
  });

  it('ignores a press while disabled, and a secondary button press', async () => {
    const disabled = mountWith(RangeSlider, {
      props: { modelValue: [20, 80] as [number, number], disabled: true },
    });
    layOutRail(disabled);
    await disabled.find('[data-part="rail"]').trigger('pointerdown', { clientX: 150 });
    expect(disabled.emitted('update:modelValue')).toBeUndefined();
    disabled.unmount();

    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 80] as [number, number] },
    });
    layOutRail(wrapper);
    await wrapper.find('[data-part="rail"]').trigger('pointerdown', { clientX: 150, button: 2 });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('RangeSlider — change', () => {
  it('fires once for a run of key presses, on the key release', async () => {
    const wrapper = mountModel({ modelValue: [20, 60], step: 1 });
    const min = thumb(wrapper, 'min');
    press(min, 'ArrowRight');
    await settle();
    press(min, 'ArrowRight');
    await settle();
    press(min, 'ArrowRight');
    await settle();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(3);
    expect(wrapper.emitted('change')).toBeUndefined();
    min.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect(wrapper.emitted('change')?.[0]).toEqual([[23, 60]]);
    // Nothing is pending now, so a second release reports nothing.
    min.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
    expect(wrapper.emitted('change')).toHaveLength(1);
    wrapper.unmount();
  });

  it('flushes a pending move when focus leaves the thumb mid-press', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [20, 60] as [number, number] },
    });
    press(thumb(wrapper, 'min'), 'ArrowRight');
    await wrapper.find('[data-thumb="min"]').trigger('blur');
    expect(wrapper.emitted('change')).toHaveLength(1);
    wrapper.unmount();
  });

  it('reports nothing at all when a key press moves nothing', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { modelValue: [0, 60] as [number, number], min: 0, max: 100 },
    });
    const min = thumb(wrapper, 'min');
    press(min, 'Home');
    min.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('RangeSlider — the typed fields', () => {
  it('shows the value, and the plain ungrouped number while being edited', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { inputs: true, min: 0, max: 10_000, modelValue: [1200, 4800] as [number, number] },
    });
    expect(field(wrapper, 'min').value).toBe('1,200');
    await wrapper.find('[data-input="min"]').trigger('focus');
    expect(field(wrapper, 'min').value).toBe('1200');
    wrapper.unmount();
  });

  it('commits on blur, not on a keystroke', async () => {
    const wrapper = mountModel({ inputs: true, min: 0, max: 100, modelValue: [20, 60] });
    const input = wrapper.find('[data-input="min"]');
    await input.trigger('focus');
    await input.setValue('35');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[35, 60]]);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([[35, 60]]);
    wrapper.unmount();
  });

  it('commits on Enter without leaving the field', async () => {
    const wrapper = mountModel({ inputs: true, min: 0, max: 100, modelValue: [20, 60] });
    const input = wrapper.find('[data-input="max"]');
    await input.trigger('focus');
    await input.setValue('44');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[20, 44]]);
    expect(wrapper.emitted('change')).toHaveLength(1);
    // Still editing: the field shows what it would show for the committed value, unformatted.
    expect(field(wrapper, 'max').value).toBe('44');
    wrapper.unmount();
  });

  it('snaps a typed value to the step and clamps it to the bounds', async () => {
    const wrapper = mountModel({ inputs: true, min: 0, max: 100, step: 10, modelValue: [0, 100] });
    const input = wrapper.find('[data-input="min"]');
    await input.trigger('focus');
    await input.setValue('37');
    await input.trigger('blur');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[40, 100]]);

    const max = wrapper.find('[data-input="max"]');
    await max.trigger('focus');
    await max.setValue('9999');
    await max.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[40, 100]]);
    wrapper.unmount();
  });

  it('snaps a typed value beyond the other thumb onto it', async () => {
    const wrapper = mountModel({ inputs: true, min: 0, max: 100, modelValue: [20, 60] });
    const input = wrapper.find('[data-input="min"]');
    await input.trigger('focus');
    await input.setValue('95');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[60, 60]]);
    expect(field(wrapper, 'min').value).toBe('60');
    wrapper.unmount();
  });

  it('falls back to that end of the range when a field is emptied', async () => {
    const wrapper = mountModel({ inputs: true, min: 10, max: 90, modelValue: [20, 60] });
    const min = wrapper.find('[data-input="min"]');
    await min.trigger('focus');
    await min.setValue('');
    await min.trigger('blur');
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[10, 60]]);

    const max = wrapper.find('[data-input="max"]');
    await max.trigger('focus');
    await max.setValue('');
    await max.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[10, 90]]);
    wrapper.unmount();
  });

  it('keeps the value when the text is not a number at all', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { inputs: true, min: 0, max: 100, modelValue: [20, 60] as [number, number] },
    });
    const input = wrapper.find('[data-input="min"]');
    await input.trigger('focus');
    await input.setValue('-');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(field(wrapper, 'min').value).toBe('20');
    wrapper.unmount();
  });

  it('moves with the thumbs: one value, two routes to it', async () => {
    const wrapper = mountModel({ inputs: true, min: 0, max: 100, modelValue: [20, 60] });
    press(thumb(wrapper, 'min'), 'PageUp');
    await settle();
    expect(field(wrapper, 'min').value).toBe('30');
    wrapper.unmount();
  });

  it('disables both fields with the control', () => {
    const wrapper = mountWith(RangeSlider, { props: { inputs: true, disabled: true } });
    expect(field(wrapper, 'min').disabled).toBe(true);
    expect(field(wrapper, 'max').disabled).toBe(true);
    wrapper.unmount();
  });
});

describe('RangeSlider — formatValue', () => {
  const price = (amount: number): string => `$${amount.toLocaleString('en-US')}`;

  it('formats the valuetext of both thumbs', () => {
    const wrapper = mountWith(RangeSlider, {
      props: {
        label: 'Price',
        min: 0,
        max: 10_000,
        modelValue: [1200, 4800] as [number, number],
        formatValue: price,
      },
    });
    expect(thumb(wrapper, 'min').getAttribute('aria-valuetext')).toBe('$1,200');
    expect(thumb(wrapper, 'max').getAttribute('aria-valuetext')).toBe('$4,800');
    // `aria-valuenow` stays the number itself.
    expect(thumb(wrapper, 'min').getAttribute('aria-valuenow')).toBe('1200');
    wrapper.unmount();
  });

  it('formats the fields at rest and takes a plain number back while editing', async () => {
    const wrapper = mountModel({
      inputs: true,
      min: 0,
      max: 10_000,
      modelValue: [1200, 4800],
      formatValue: price,
    });
    expect(field(wrapper, 'min').value).toBe('$1,200');
    const input = wrapper.find('[data-input="min"]');
    await input.trigger('focus');
    expect(field(wrapper, 'min').value).toBe('1200');
    await input.setValue('2000');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[2000, 4800]]);
    expect(field(wrapper, 'min').value).toBe('$2,000');
    wrapper.unmount();
  });

  it('formats a fractional step to the digits the step is written with', () => {
    const wrapper = mountWith(RangeSlider, {
      props: { min: 0, max: 10, step: 0.1, modelValue: [1.5, 8.2] as [number, number] },
    });
    expect(thumb(wrapper, 'min').getAttribute('aria-valuetext')).toBe('1.5');
    expect(thumb(wrapper, 'max').getAttribute('aria-valuetext')).toBe('8.2');
    wrapper.unmount();
  });
});

describe('RangeSlider — classes', () => {
  it('merges a per-part override over the part own classes', () => {
    const wrapper = mountWith(RangeSlider, {
      props: {
        label: 'Price',
        inputs: true,
        classes: {
          root: 'gap-6',
          label: 'text-h4',
          track: 'bg-surface',
          range: 'bg-accent',
          thumb: 'bg-primary',
          separator: 'text-text',
        },
      },
    });
    expect(wrapper.find('[data-part="root"]').classes()).toContain('gap-6');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('text-h4');
    expect(wrapper.find('[data-part="label"]').classes()).not.toContain('text-label');
    expect(wrapper.find('[data-part="track"]').classes()).toContain('bg-surface');
    expect(wrapper.find('[data-part="track"]').classes()).not.toContain('bg-surface-strong');
    expect(wrapper.find('[data-part="range"]').classes()).toContain('bg-accent');
    expect(thumb(wrapper, 'min').classList.contains('bg-primary')).toBe(true);
    expect(wrapper.find('[data-part="separator"]').classes()).toContain('text-text');
    wrapper.unmount();
  });

  it('changes a live thumb edge on hover, and never a disabled one', () => {
    const live = mountWith(RangeSlider, { props: { label: 'Price' } });
    // Spec → States, "Thumb hover": "a 0.25rem halo of `text` at 8%, edge `text`".
    expect(thumb(live, 'min').classList.contains('hover:border-text')).toBe(true);
    expect(thumb(live, 'min').classList.contains('border-border-strong')).toBe(true);
    live.unmount();

    const dead = mountWith(RangeSlider, { props: { label: 'Price', disabled: true } });
    // A dead thumb must not light up under the pointer: the hover variant is a different
    // tailwind-merge group from the rest colour, so it has to be absent rather than overridden.
    expect(thumb(dead, 'min').classList.contains('hover:border-text')).toBe(false);
    expect(thumb(dead, 'min').classList.contains('border-border')).toBe(true);
    dead.unmount();
  });

  it('is a width container, so its own touch rules measure the control, not the viewport', () => {
    const wrapper = mountWith(RangeSlider);
    expect(wrapper.find('[data-part="root"]').classes()).toContain('@container');
    expect(wrapper.find('[data-part="rail"]').classes()).toContain('eldra-range-rail');
    expect(thumb(wrapper, 'min').classList.contains('eldra-range-thumb')).toBe(true);
    wrapper.unmount();
  });
});

describe('RangeSlider — bounds that arrive after mount', () => {
  it('follows its bounds while unbound and untouched', async () => {
    // The price-filter shape: no `v-model`, and `facets.price` lands after the first render.
    const wrapper = mountWith(RangeSlider, { props: { label: 'Price', min: 0, max: 100 } });
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('100');

    await wrapper.setProps({ min: 1200, max: 48_000 });
    expect(thumb(wrapper, 'min').getAttribute('aria-valuenow')).toBe('1200');
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('48000');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[1200, 48_000]]);
    wrapper.unmount();
  });

  it('stops following once something has moved it', async () => {
    const wrapper = mountWith(RangeSlider, { props: { label: 'Price', min: 0, max: 100 } });
    press(thumb(wrapper, 'max'), 'PageDown');
    await settle();
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('90');

    await wrapper.setProps({ max: 200 });
    // A late facet refresh must not overwrite a shopper's own choice.
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('90');
    wrapper.unmount();
  });

  it('leaves a controlled slider to its parent', async () => {
    const wrapper = mountWith(RangeSlider, {
      props: { label: 'Price', min: 0, max: 100, modelValue: [20, 60] as [number, number] },
    });
    await wrapper.setProps({ min: 0, max: 1000 });
    expect(thumb(wrapper, 'max').getAttribute('aria-valuenow')).toBe('60');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('RangeSlider — inverted bounds', () => {
  it('draws an empty range at min, with a coherent value pair', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(RangeSlider, { props: { label: 'Price', min: 50, max: 10 } });
    for (const which of ['min', 'max'] as const) {
      const element = thumb(wrapper, which);
      // `aria-valuenow` below `aria-valuemin`, or `aria-valuemin` above `aria-valuemax`, is what
      // the raw props used to report.
      expect(element.getAttribute('aria-valuenow')).toBe('50');
      expect(element.getAttribute('aria-valuemin')).toBe('50');
      expect(element.getAttribute('aria-valuemax')).toBe('50');
    }
    // Nothing is movable, so nothing is reported.
    press(thumb(wrapper, 'min'), 'ArrowRight');
    press(thumb(wrapper, 'max'), 'End');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
    warn.mockRestore();
  });

  it('names the mistake once in dev', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(RangeSlider, { props: { label: 'Price', min: 50, max: 10 } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('max (10) below min (50)');
    wrapper.unmount();
    warn.mockRestore();
  });

  it('says nothing for bounds that are the right way round, or equal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = mountWith(RangeSlider, { props: { min: 0, max: 100 } });
    const collapsed = mountWith(RangeSlider, { props: { min: 40, max: 40 } });
    expect(warn).not.toHaveBeenCalled();
    ok.unmount();
    collapsed.unmount();
    warn.mockRestore();
  });
});

describe('RangeSlider — the keypad the fields ask for', () => {
  it('is numeric on a whole-number grid and decimal where the step has digits', () => {
    const whole = mountWith(RangeSlider, { props: { inputs: true, step: 1 } });
    expect(field(whole, 'min').getAttribute('inputmode')).toBe('numeric');
    whole.unmount();

    // A decimal separator the `beforeinput` filter accepts has to be on the keypad that opens.
    const fractional = mountWith(RangeSlider, {
      props: { inputs: true, min: 0, max: 10, step: 0.1 },
    });
    expect(field(fractional, 'min').getAttribute('inputmode')).toBe('decimal');
    fractional.unmount();
  });
});

describe('RangeSlider — a drag that ends without a pointerup', () => {
  it('ends on lostpointercapture, and reports the move once', async () => {
    const wrapper = mountModel({ modelValue: [20, 80], min: 0, max: 100 });
    layOutRail(wrapper);
    const rail = wrapper.find('[data-part="rail"]');
    await rail.trigger('pointerdown', { clientX: 50 });
    await settle();
    expect(wrapper.emitted('change')).toBeUndefined();

    // Capture revoked with no pointer event following it: another element taking the same pointer,
    // an OS gesture, the element being removed.
    await rail.trigger('lostpointercapture');
    expect(wrapper.emitted('change')).toHaveLength(1);

    // And the drag is really over: a bare move with no button held drags nothing.
    const moves = wrapper.emitted('update:modelValue')?.length ?? 0;
    await rail.trigger('pointermove', { clientX: 150 });
    expect(wrapper.emitted('update:modelValue')).toHaveLength(moves);
    wrapper.unmount();
  });

  it('does not hand the thumb over to a second contact mid-gesture', async () => {
    const wrapper = mountModel({ modelValue: [20, 80], min: 0, max: 100 });
    layOutRail(wrapper);
    const rail = wrapper.find('[data-part="rail"]');
    // A drag of the minimum thumb is in flight...
    await rail.trigger('pointerdown', { clientX: 50 });
    await settle();
    // ...and a second contact lands next to the maximum thumb.
    await rail.trigger('pointerdown', { clientX: 150 });
    await settle();
    // The drag still owns the minimum thumb: a move past the maximum parks it there rather than
    // dragging the maximum thumb away.
    await rail.trigger('pointermove', { clientX: 180 });
    await settle();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[80, 80]]);
    wrapper.unmount();
  });
});
