import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import Accordion from '../Accordion.vue';
import AccordionItem from '../AccordionItem.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

/** Every `<details data-part="root">` a mounted group renders, in document order. */
function detailsOf(wrapper: { findAll: (selector: string) => { element: Element }[] }) {
  return wrapper
    .findAll('details[data-part="root"]')
    .map((item) => item.element as HTMLDetailsElement);
}

/** See `AccordionItem.spec.ts`'s own copy of this helper: gives an element the three motion
 *  tokens `heightTransition.ts` reads, which no test in this file's suite otherwise ships. */
function giveMotionTokens(el: HTMLElement): void {
  el.style.setProperty('--eldra-duration-base', '20ms');
  el.style.setProperty('--eldra-ease-out', 'cubic-bezier(0.2,0,0,1)');
  el.style.setProperty('--eldra-ease-in', 'cubic-bezier(0.4,0,1,1)');
}

describe('Accordion — element and structure', () => {
  it('renders a plain div root with the top divider', () => {
    const wrapper = mountWith(Accordion, {
      slots: { default: '<AccordionItem title="One">Body</AccordionItem>' },
      global: { components: { AccordionItem } },
    });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.classes()).toContain('border-t');
    wrapper.unmount();
  });

  it('passes a `classes.root` override through tailwind-merge', () => {
    const wrapper = mountWith(Accordion, {
      props: { classes: { root: 'border-t-0' } },
      slots: { default: '<AccordionItem title="One">Body</AccordionItem>' },
      global: { components: { AccordionItem } },
    });
    expect(wrapper.classes()).toContain('border-t-0');
    expect(wrapper.classes()).not.toContain('border-t');
    wrapper.unmount();
  });
});

describe('Accordion — multiple (default)', () => {
  it('gives every item no `name` attribute, so each opens independently', () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion>
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    for (const details of detailsOf(wrapper)) {
      expect(details.hasAttribute('name')).toBe(false);
    }
    wrapper.unmount();
  });

  it('opening one item leaves a sibling already open untouched', async () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion>
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    const summaries = wrapper.findAll('[data-part="summary"]');
    await summaries[0]!.trigger('click');
    await summaries[1]!.trigger('click');
    const [first, second] = detailsOf(wrapper);
    expect(first!.open).toBe(true);
    expect(second!.open).toBe(true);
    wrapper.unmount();
  });

  it('an explicit `name` is ignored while `multiple` is true (spec: name is only used when multiple is false)', () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion name="care">
            <AccordionItem title="One">Body one</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    expect(detailsOf(wrapper)[0]!.hasAttribute('name')).toBe(false);
    wrapper.unmount();
  });
});

describe('Accordion — single-open (`multiple="false"`)', () => {
  it('gives every item the same explicit `name`', () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion :multiple="false" name="care">
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    const [first, second] = detailsOf(wrapper);
    expect(first!.getAttribute('name')).toBe('care');
    expect(second!.getAttribute('name')).toBe('care');
    wrapper.unmount();
  });

  it('generates a shared `name` when none is given, the same for every item', () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion :multiple="false">
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    const [first, second] = detailsOf(wrapper);
    const name = first!.getAttribute('name');
    expect(name).toBeTruthy();
    expect(second!.getAttribute('name')).toBe(name);
    wrapper.unmount();
  });

  it('opening the second item closes the first (native exclusivity, or the JS fallback where the platform lacks it)', async () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion :multiple="false">
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    const summaries = wrapper.findAll('[data-part="summary"]');
    const [first, second] = detailsOf(wrapper);
    await summaries[0]!.trigger('click');
    expect(first!.open).toBe(true);
    await summaries[1]!.trigger('click');
    expect(second!.open).toBe(true);
    expect(first!.open).toBe(false);
    wrapper.unmount();
  });

  it('the sibling that native (or fallback) exclusivity closes is not itself height-animated — it closes instantly, the documented gap (README Deviations)', async () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion :multiple="false">
            <AccordionItem title="One">Body one</AccordionItem>
            <AccordionItem title="Two">Body two</AccordionItem>
          </Accordion>
        `,
      },
      {}
    );
    const panels = wrapper
      .findAll('[data-part="panel"]')
      .map((item) => item.element as HTMLElement);
    for (const panel of panels) giveMotionTokens(panel);
    const animateSpies = panels.map((panel) =>
      vi
        .spyOn(panel, 'animate')
        .mockReturnValue({ finished: Promise.resolve() } as unknown as Animation)
    );

    const summaries = wrapper.findAll('[data-part="summary"]');
    const [first, second] = detailsOf(wrapper);
    await summaries[0]!.trigger('click');
    expect(first!.open).toBe(true);
    expect(animateSpies[0]).toHaveBeenCalledTimes(1); // the opening animation

    await summaries[1]!.trigger('click');
    expect(second!.open).toBe(true);
    expect(first!.open).toBe(false); // closed by exclusivity, not by its own summary click
    // The first item's own `animate` was never called a second time: `onSummaryClick` only
    // intercepts a click on *that* item's own summary, and this closure went through
    // `closeOtherOpenSiblings`/native exclusivity instead, which flips `open` directly.
    expect(animateSpies[0]).toHaveBeenCalledTimes(1);
    expect(animateSpies[1]).toHaveBeenCalledTimes(1); // the second item's own opening animation
    vi.restoreAllMocks();
    wrapper.unmount();
  });

  it('a standalone item outside any Accordion gets no shared name, whatever the group elsewhere says', () => {
    const wrapper = mountWith(AccordionItem, {
      props: { title: 'Standalone' },
      slots: { default: 'Body' },
    });
    expect(wrapper.find('[data-part="root"]').attributes('name')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Accordion — accessibility', () => {
  it('has no axe violations, open or closed', async () => {
    const wrapper = mountWith(
      {
        components: { Accordion, AccordionItem },
        template: `
          <Accordion>
            <AccordionItem title="Materials & care" help="Machine washable at 30°C">
              100% organic cotton, pre-shrunk.
            </AccordionItem>
            <AccordionItem title="Shipping & returns" :model-value="true">
              Free returns within 30 days.
            </AccordionItem>
            <AccordionItem title="Size guide" href="/pages/size-guide" />
          </Accordion>
        `,
      },
      {}
    );
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
