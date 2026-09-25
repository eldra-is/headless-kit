import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, inject } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Button from '../../button/Button.vue';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import Input from '../../input/Input.vue';
import { FORM_LAYOUT_KEY, FORM_SUBMITTING_KEY } from '../context';
import FormLayout from '../FormLayout.vue';
import type { FormLayoutVariant } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

const LAYOUTS: FormLayoutVariant[] = ['single', 'two', 'inline'];

/** A field the form can hold, with a real control so the mount has a named input. */
function field(label: string, props: Record<string, unknown> = {}) {
  return h(FieldWrapper, { label, ...props }, { default: () => h(Input, { modelValue: '' }) });
}

/** Reads what the form provides to everything below it. */
const Probe = defineComponent({
  setup() {
    const layout = inject(FORM_LAYOUT_KEY, null);
    const submitting = inject(FORM_SUBMITTING_KEY, null);
    return () =>
      h('output', {
        'data-testid': 'probe',
        'data-layout': layout?.value,
        'data-submitting': String(submitting?.value),
      });
  },
});

describe('FormLayout — element and parts', () => {
  it('renders a real form with a data-part on every part the spec anatomy names', () => {
    const wrapper = mountWith(FormLayout, {
      props: { heading: 'Ask the studio' },
      slots: {
        default: () => field('Name'),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send message'),
      },
    });
    expect(wrapper.element.tagName).toBe('FORM');
    expect(wrapper.attributes('data-part')).toBe('root');
    for (const part of ['heading', 'fields', 'actions']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists(), part).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders no heading or actions row when neither is given', () => {
    const wrapper = mountWith(FormLayout, { slots: { default: () => field('Name') } });
    expect(wrapper.find('[data-part="heading"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="actions"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('merges a per-part class override instead of appending it', () => {
    const wrapper = mountWith(FormLayout, {
      props: { classes: { root: 'gap-8' } },
      slots: { default: () => field('Name') },
    });
    expect(wrapper.classes()).toContain('gap-8');
    expect(wrapper.classes()).not.toContain('gap-4');
    wrapper.unmount();
  });

  it('is a container, so the md Buttons inside it grow on a narrow form and not a narrow page', () => {
    const wrapper = mountWith(FormLayout, { slots: { default: () => field('Name') } });
    expect(wrapper.classes()).toContain('@container');
    wrapper.unmount();
  });
});

describe('FormLayout — native form attributes', () => {
  it('sets novalidate by default, so the components own messages are what show', () => {
    const wrapper = mountWith(FormLayout, { slots: { default: () => field('Name') } });
    expect((wrapper.element as HTMLFormElement).noValidate).toBe(true);
    wrapper.unmount();
  });

  it('drops novalidate when the caller asks for the browser bubbles', () => {
    const wrapper = mountWith(FormLayout, {
      props: { novalidate: false },
      slots: { default: () => field('Name') },
    });
    expect(wrapper.attributes('novalidate')).toBeUndefined();
    wrapper.unmount();
  });

  it('passes action and method through, so the form posts without scripting', () => {
    const wrapper = mountWith(FormLayout, {
      props: { action: '/newsletter', method: 'post' },
      slots: { default: () => field('Email address') },
    });
    expect(wrapper.attributes('action')).toBe('/newsletter');
    expect(wrapper.attributes('method')).toBe('post');
    wrapper.unmount();
  });

  it('emits the native submit event', async () => {
    const wrapper = mountWith(FormLayout, { slots: { default: () => field('Name') } });
    await wrapper.trigger('submit');
    expect(wrapper.emitted('submit')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('FormLayout — accessible name', () => {
  it('names the form by its heading', () => {
    const wrapper = mountWith(FormLayout, {
      props: { heading: 'Shipping address' },
      slots: { default: () => field('First name') },
    });
    const headingId = wrapper.find('[data-part="heading"]').attributes('id');
    expect(headingId).toBeTruthy();
    expect(wrapper.attributes('aria-labelledby')).toBe(headingId);
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('names the form by ariaLabel when there is no visible heading', () => {
    const wrapper = mountWith(FormLayout, {
      props: { ariaLabel: 'Newsletter sign-up', layout: 'inline' },
      slots: { default: () => field('Email address') },
    });
    expect(wrapper.attributes('aria-label')).toBe('Newsletter sign-up');
    expect(wrapper.attributes('aria-labelledby')).toBeUndefined();
    wrapper.unmount();
  });

  it('prefers the visible heading when both are given', () => {
    const wrapper = mountWith(FormLayout, {
      props: { heading: 'Shipping address', ariaLabel: 'Address form' },
      slots: { default: () => field('First name') },
    });
    expect(wrapper.attributes('aria-labelledby')).toBeTruthy();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('FormLayout — layouts', () => {
  it('provides the layout name to every field below it', () => {
    for (const layout of LAYOUTS) {
      const wrapper = mountWith(FormLayout, {
        props: { layout, ariaLabel: 'Test' },
        slots: { default: () => h(Probe) },
      });
      expect(wrapper.find('[data-testid="probe"]').attributes('data-layout')).toBe(layout);
      wrapper.unmount();
    }
  });

  it('defaults to a single column', () => {
    const wrapper = mountWith(FormLayout, {
      props: { ariaLabel: 'Test' },
      slots: { default: () => field('Name') },
    });
    expect(wrapper.find('[data-part="fields"]').classes()).not.toContain('@two-col:grid-cols-2');
    wrapper.unmount();
  });

  it('pairs the fields from a 36rem container and stacks below it', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'two', ariaLabel: 'Test' },
      slots: { default: () => field('First name') },
    });
    const fields = wrapper.find('[data-part="fields"]').classes();
    // One column by default; the second column is a container query, so below 36rem it stacks.
    expect(fields).toContain('grid');
    expect(fields).toContain('@two-col:grid-cols-2');
    expect(fields).not.toContain('grid-cols-2');
    wrapper.unmount();
  });

  it('spans the actions row across both columns of a two-column form', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'two', ariaLabel: 'Test' },
      slots: {
        default: () => field('First name'),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Continue'),
      },
    });
    // `fields` and `actions` are rows of the form's own single-column grid, so the actions row
    // spans the field columns without a span utility of its own.
    expect(wrapper.find('[data-part="actions"]').classes()).not.toContain('@two-col:grid-cols-2');
    expect(wrapper.find('[data-part="fields"]').element.parentElement).toBe(wrapper.element);
    expect(wrapper.find('[data-part="actions"]').element.parentElement).toBe(wrapper.element);
    wrapper.unmount();
  });

  it('makes the inline field the row, so the button sits level with the control', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'inline', ariaLabel: 'Newsletter sign-up' },
      slots: {
        default: () =>
          field('Email address', {
            help: 'One letter a month.',
            error: 'Enter an email like name@example.com.',
          }),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Subscribe'),
      },
    });
    expect(wrapper.classes()).toContain('flex-wrap');
    expect(wrapper.classes()).toContain('items-end');
    // The `fields` box and the field's own root flatten away, so the label-and-control group, the
    // error and the foot row are items of this one flex row — alongside the button.
    expect(wrapper.find('[data-part="fields"]').classes()).toContain('contents');
    expect(wrapper.find('[data-part="fields"] > [data-part="root"]').classes()).toContain(
      'contents'
    );
    const group = wrapper.find('[data-part="label"]').element.parentElement as HTMLElement;
    expect(group.className).toContain('flex-[1_1_14rem]');
    // ...and the error and the foot wrap onto full-width rows of their own, after the button.
    for (const part of ['error', 'foot']) {
      const classes = wrapper.find(`[data-part="${part}"]`).classes();
      expect(classes, part).toContain('basis-full');
      expect(classes, part).toContain('order-1');
    }
    wrapper.unmount();
  });

  it('leaves the field an ordinary grid outside an inline form', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'single', ariaLabel: 'Test' },
      slots: { default: () => field('Email address', { help: 'One letter a month.' }) },
    });
    const root = wrapper.find('[data-part="fields"] > [data-part="root"]');
    expect(root.classes()).toContain('grid');
    expect(root.classes()).not.toContain('contents');
    expect(wrapper.find('[data-part="foot"]').classes()).not.toContain('basis-full');
    wrapper.unmount();
  });

  it('stacks the actions full width with the primary first on a narrow container', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'two', ariaLabel: 'Test' },
      slots: {
        default: () => field('First name'),
        actions: () => [
          h(Button, { variant: 'outline' }, () => 'Save for later'),
          h(Button, { variant: 'primary', type: 'submit' }, () => 'Continue to shipping'),
        ],
      },
    });
    const actions = wrapper.find('[data-part="actions"]').classes();
    // DOM order is secondary then primary (the primary is last on wide layouts); the narrow
    // container reverses the visual order so the primary is on top, and every button fills it.
    expect(actions).toContain('@max-two-col:flex-col-reverse');
    expect(actions).toContain('@max-two-col:*:w-full');
    wrapper.unmount();
  });
});

describe('FormLayout — submitting', () => {
  it('provides submitting to every button below it', () => {
    const wrapper = mountWith(FormLayout, {
      props: { submitting: true, ariaLabel: 'Test' },
      slots: { default: () => h(Probe) },
    });
    expect(wrapper.find('[data-testid="probe"]').attributes('data-submitting')).toBe('true');
    wrapper.unmount();
  });

  it('makes the submit button busy and disables the other actions', async () => {
    const wrapper = mountWith(FormLayout, {
      props: { ariaLabel: 'Test' },
      slots: {
        default: () => field('Email address'),
        actions: () => [
          h(Button, { variant: 'outline' }, () => 'Save for later'),
          h(
            Button,
            { variant: 'primary', type: 'submit', label: 'Subscribing' },
            () => 'Subscribe'
          ),
        ],
      },
    });
    const buttons = wrapper.findAll('button');
    const [outline, submit] = buttons;
    expect(submit?.attributes('aria-busy')).toBeUndefined();
    expect(outline?.attributes('disabled')).toBeUndefined();

    await wrapper.setProps({ submitting: true });
    expect(submit?.attributes('aria-busy')).toBe('true');
    expect(submit?.attributes('disabled')).toBeUndefined();
    expect(outline?.attributes('disabled')).toBeDefined();

    await wrapper.setProps({ submitting: false });
    expect(submit?.attributes('aria-busy')).toBeUndefined();
    expect(outline?.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('leaves the fields editable while submitting', async () => {
    const wrapper = mountWith(FormLayout, {
      props: { submitting: true, ariaLabel: 'Test' },
      slots: { default: () => field('Email address') },
    });
    expect((wrapper.find('input').element as HTMLInputElement).disabled).toBe(false);
    wrapper.unmount();
  });
});

describe('FormLayout — fields inside it', () => {
  it('lets a full field span both columns of a two-column form', () => {
    const wrapper = mountWith(FormLayout, {
      props: { layout: 'two', heading: 'Shipping address' },
      slots: {
        default: () => [field('First name'), field('Address', { full: true })],
      },
    });
    const fields = wrapper.findAll('[data-part="fields"] > [data-part="root"]');
    expect(fields).toHaveLength(2);
    expect(fields[0]?.classes()).not.toContain('@two-col:col-span-2');
    expect(fields[1]?.classes()).toContain('@two-col:col-span-2');
    wrapper.unmount();
  });

  it('has no axe violations in any of the three layouts', async () => {
    for (const layout of LAYOUTS) {
      const wrapper = mountWith(FormLayout, {
        props: { layout, heading: 'Shipping address' },
        slots: {
          default: () => [
            field('First name'),
            field('Address', { full: true, help: 'House number and street.' }),
            field('Postcode', { error: 'Enter a full postcode.' }),
          ],
          actions: () =>
            h(Button, { variant: 'primary', type: 'submit' }, () => 'Continue to shipping'),
        },
      });
      expect(await axe(wrapper.element), layout).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  it('renders in a 20rem container with no optional content at all', async () => {
    const wrapper = mountNarrow(FormLayout, {
      props: { layout: 'two', ariaLabel: 'Shipping address' },
      slots: { default: () => [field('First name'), field('Last name')] },
    });
    expect(wrapper.find('[data-part="heading"]').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders twice the example content without throwing', () => {
    const long = 'Continue to shipping and review your order before paying. '.repeat(2);
    const wrapper = mountWith(FormLayout, {
      props: { heading: `Shipping address ${long}` },
      slots: {
        default: () => field('Address', { help: long }),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => long),
      },
    });
    expect(wrapper.find('[data-part="heading"]').text()).toContain('Shipping address');
    wrapper.unmount();
  });
});
