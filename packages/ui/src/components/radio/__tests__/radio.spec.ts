import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Radio from '../Radio.vue';
import RadioGroup from '../RadioGroup.vue';

function input(wrapper: { find: (s: string) => { element: Element } }): HTMLInputElement {
  return wrapper.find('input').element as HTMLInputElement;
}

/** Two radios sharing one `name`, rendered apart, both bound to one parent model. */
function siblings(initial: string | undefined, accept = true) {
  const model = ref<string | undefined>(initial);
  const Host = defineComponent({
    setup: () => () =>
      h('div', [
        h('div', { class: 'a' }, [
          h(Radio, {
            name: 'fit',
            value: 'slim',
            label: 'Slim',
            modelValue: model.value,
            'onUpdate:modelValue': (v: string | number) => {
              if (accept) model.value = String(v);
            },
          }),
        ]),
        h('div', { class: 'b' }, [
          h(Radio, {
            name: 'fit',
            value: 'regular',
            label: 'Regular',
            modelValue: model.value,
            'onUpdate:modelValue': (v: string | number) => {
              if (accept) model.value = String(v);
            },
          }),
        ]),
      ]),
  });
  return { model, wrapper: mountWith(Host) };
}

describe('Radio — element and parts', () => {
  it('is a label holding one native radio, in the RadioGroup option parts', () => {
    const wrapper = mountWith(Radio, {
      props: { value: 'slim', label: 'Slim', hint: 'Close fit' },
    });
    expect(wrapper.element.tagName).toBe('LABEL');
    expect(wrapper.attributes('data-eldra-ui')).toBeDefined();
    expect(wrapper.attributes('data-part')).toBe('option');
    expect(wrapper.find('[data-part="radio"] input[type="radio"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="label"]').text()).toBe('Slim');
    expect(wrapper.find('[data-part="hint"]').text()).toBe('Close fit');
    expect(input(wrapper).value).toBe('slim');
    wrapper.unmount();
  });

  it('draws exactly what a RadioGroup plain option draws, in every state', async () => {
    const group = mountWith(RadioGroup, {
      props: {
        legend: 'Fit',
        modelValue: 'b',
        invalid: true,
        options: [
          { value: 'a', label: 'A', hint: 'h' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C', disabled: true },
        ],
      },
    });
    const parts = ['option', 'radio', 'label'] as const;
    const cases = [{ value: 'a', hint: 'h' }, { value: 'b' }, { value: 'c', disabled: true }];
    for (const [index, extra] of cases.entries()) {
      const single = mountWith(Radio, {
        props: { modelValue: 'b', invalid: true, label: 'X', ...extra },
      });
      for (const part of parts) {
        expect(single.find(`[data-part="${part}"]`).element.className).toBe(
          group.findAll(`[data-part="${part}"]`)[index].element.className
        );
      }
      expect(input(single).className).toBe(
        (group.findAll('input')[index].element as HTMLElement).className
      );
      expect(input(single).nextElementSibling?.className).toBe(
        group.findAll('input')[index].element.nextElementSibling?.className
      );
      single.unmount();
    }
    expect(
      mountWith(Radio, { props: { value: 'a', hint: 'h', label: 'X' } }).find('[data-part="hint"]')
        .element.className
    ).toBe(group.find('[data-part="hint"]').element.className);
    group.unmount();
  });

  it('renders the default and hint slots over the props', () => {
    const wrapper = mountWith(Radio, {
      props: { value: 'a', label: 'ignored' },
      slots: { default: '<b>Bold</b>', hint: '<em>Note</em>' },
    });
    expect(wrapper.find('[data-part="label"] b').text()).toBe('Bold');
    expect(wrapper.find('[data-part="hint"] em').text()).toBe('Note');
    wrapper.unmount();
  });

  it('draws the circle alone with no label or hint', () => {
    const wrapper = mountWith(Radio, { props: { value: 'a' }, attrs: { 'aria-label': 'Pick' } });
    expect(wrapper.find('[data-part="label"]').exists()).toBe(false);
    expect(wrapper.classes()).toContain('eldra:grid-cols-[auto]');
    wrapper.unmount();
  });

  it('draws the lg circle', () => {
    const wrapper = mountWith(Radio, { props: { value: 'a', label: 'A', size: 'lg' } });
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('eldra:size-6');
    wrapper.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(Radio, {
      attrs: { class: 'o-x' },
      props: {
        value: 'a',
        label: 'A',
        hint: 'h',
        classes: {
          radio: 'r-x',
          input: 'i-x',
          dot: 'd-x',
          label: 'l-x',
          hint: 'h-x',
        },
      },
    });
    expect(wrapper.classes()).toContain('o-x');
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('r-x');
    expect(input(wrapper).classList.contains('i-x')).toBe(true);
    expect(input(wrapper).nextElementSibling?.classList.contains('d-x')).toBe(true);
    expect(wrapper.find('[data-part="label"]').classes()).toContain('l-x');
    expect(wrapper.find('[data-part="hint"]').classes()).toContain('h-x');
    wrapper.unmount();
  });
});

describe('Radio — value and v-model', () => {
  it('is checked only when modelValue equals value, numbers included', () => {
    const on = mountWith(Radio, { props: { value: 2, modelValue: 2, label: 'Two' } });
    expect(input(on).checked).toBe(true);
    expect(on.find('[data-part="radio"]').classes()).toContain('eldra:bg-primary');
    on.unmount();
    const off = mountWith(Radio, { props: { value: 2, modelValue: '2', label: 'Two' } });
    expect(input(off).checked).toBe(false);
    off.unmount();
    const none = mountWith(Radio, { props: { value: 'a', label: 'A' } });
    expect(input(none).checked).toBe(false);
    none.unmount();
  });

  it('emits update:modelValue and change with its own value when chosen', async () => {
    const wrapper = mountWith(Radio, { props: { value: 7, modelValue: 1, label: 'Seven' } });
    await wrapper.find('input').setValue(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[7]]);
    expect(wrapper.emitted('change')).toEqual([[7]]);
    wrapper.unmount();
  });

  it('moves the selection between siblings rendered apart', async () => {
    const { model, wrapper } = siblings('slim');
    const [slim, regular] = wrapper.findAll('input').map((w) => w.element as HTMLInputElement);
    expect(slim.checked).toBe(true);
    await wrapper.findAll('input')[1].setValue(true);
    await nextTick();
    expect(model.value).toBe('regular');
    expect(regular.checked).toBe(true);
    expect(slim.checked).toBe(false);
    expect(wrapper.findAll('[data-part="radio"]')[0].classes()).not.toContain('eldra:bg-primary');
    expect(wrapper.findAll('[data-part="radio"]')[1].classes()).toContain('eldra:bg-primary');
    wrapper.unmount();
  });

  it('never steals the selection back from a sibling on a later render', async () => {
    const { model, wrapper } = siblings('slim');
    await wrapper.findAll('input')[1].setValue(true);
    await nextTick();
    model.value = 'regular';
    await nextTick();
    const [slim, regular] = wrapper.findAll('input').map((w) => w.element as HTMLInputElement);
    expect(slim.checked).toBe(false);
    expect(regular.checked).toBe(true);
    wrapper.unmount();
  });

  it('unchecks itself when the parent refuses the change', async () => {
    const { model, wrapper } = siblings(undefined, false);
    await wrapper.findAll('input')[0].setValue(true);
    await nextTick();
    expect(model.value).toBeUndefined();
    expect((wrapper.findAll('input')[0].element as HTMLInputElement).checked).toBe(false);
    wrapper.unmount();
  });
});

describe('Radio — states', () => {
  it('is disabled natively, dashed and muted, and cannot be chosen', async () => {
    const wrapper = mountWith(Radio, { props: { value: 'a', label: 'A', disabled: true } });
    expect(input(wrapper).disabled).toBe(true);
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('eldra:border-dashed');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('eldra:text-muted');
    expect(wrapper.classes()).toContain('eldra:cursor-not-allowed');
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('sets aria-invalid and the danger boundary when invalid', async () => {
    const wrapper = mountWith(Radio, { props: { value: 'a', label: 'A', invalid: true } });
    expect(input(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('eldra:border-danger');
    await wrapper.setProps({ invalid: false });
    expect(input(wrapper).hasAttribute('aria-invalid')).toBe(false);
    wrapper.unmount();
  });

  it('sets no native required of its own', () => {
    const wrapper = mountWith(Radio, { props: { value: 'a', label: 'A' } });
    expect(input(wrapper).required).toBe(false);
    wrapper.unmount();
  });
});

describe('Radio — attributes', () => {
  it('puts every attribute but class on the input, and keeps its own type and name', async () => {
    const seen: FocusEvent[] = [];
    const wrapper = mountWith(Radio, {
      props: { value: 'a', label: 'A', name: 'fit' },
      attrs: {
        id: 'fit-a',
        class: 'extra',
        'data-option-id': 'a',
        'aria-describedby': 'help',
        type: 'checkbox',
        onBlur: (e: FocusEvent) => seen.push(e),
      },
    });
    const el = input(wrapper);
    expect(el.id).toBe('fit-a');
    expect(el.classList.contains('extra')).toBe(false);
    expect(el.classList.contains('eldra:opacity-0')).toBe(true);
    expect(el.getAttribute('data-option-id')).toBe('a');
    expect(el.getAttribute('aria-describedby')).toBe('help');
    expect(el.type).toBe('radio');
    expect(el.name).toBe('fit');
    expect(wrapper.attributes('id')).toBeUndefined();
    expect(wrapper.classes()).toContain('extra');
    await wrapper.find('input').trigger('blur');
    expect(seen).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Radio — accessibility', () => {
  it.each([
    ['labelled', { value: 'a', label: 'Slim' }],
    ['checked', { value: 'a', modelValue: 'a', label: 'Slim' }],
    ['with a hint', { value: 'a', label: 'Slim', hint: 'Close fit' }],
    ['disabled', { value: 'a', label: 'Slim', disabled: true }],
    ['invalid', { value: 'a', label: 'Slim', invalid: true }],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(Radio, { props });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations as a circle named by aria-label', async () => {
    const wrapper = mountWith(Radio, { props: { value: 'a' }, attrs: { 'aria-label': 'Slim' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations as siblings sharing a name', async () => {
    const { wrapper } = siblings('slim');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('is keyboard-reachable natively: no tabindex, and the focus ring on the circle', () => {
    const wrapper = mountWith(Radio, { props: { value: 'a', label: 'A' } });
    expect(input(wrapper).hasAttribute('tabindex')).toBe(false);
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('eldra:eldra-focus-proxy');
    wrapper.unmount();
  });

  it('renders a long label in a 20rem container', () => {
    const wrapper = mountNarrow(Radio, {
      props: {
        value: 'a',
        label: 'Deliver to the address already on my account rather than a new one',
      },
    });
    expect(wrapper.find('[data-part="label"]').classes()).toContain('eldra:min-w-0');
    wrapper.unmount();
  });
});
