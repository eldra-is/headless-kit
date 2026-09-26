import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, type VNode } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import Select from '../../select/Select.vue';
import type { SelectOption } from '../../select/types';
import Popover from '../Popover.vue';

/**
 * `Popover` (operator addition, plan 3 task 5): a generic non-modal trigger + floating panel built
 * on `usePopover`, the same machinery `Select`/`MultiSelect`/`SearchBar` share. Unlike those three,
 * it draws no trigger and no default panel role at all — the `trigger` slot's `attrs` and the
 * panel's own fallthrough `$attrs` are how a consumer wires both, so most of these tests build a
 * plain menu-shaped trigger/panel pair through the slots rather than reaching for a fixture.
 */

type TriggerSlotProps = {
  open: boolean;
  toggle: () => void;
  attrs: Record<string, unknown>;
};
type PanelSlotProps = { close: () => void };

const mounted: VueWrapper[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A plain `<button>` trigger and a two-item menu — the shape every "Menu" story renders too. */
function defaultTrigger(props: TriggerSlotProps): VNode {
  return h('button', { ...props.attrs }, 'Actions');
}

function defaultPanel(props: PanelSlotProps): VNode {
  return h('div', [
    h('a', { href: '#one', 'data-testid': 'item-one' }, 'View order'),
    h(
      'button',
      { type: 'button', 'data-testid': 'item-two', onClick: props.close },
      'Cancel order'
    ),
  ]);
}

function mountPopover(
  props: Record<string, unknown> = {},
  slots: {
    trigger?: (p: TriggerSlotProps) => VNode;
    default?: (p: PanelSlotProps) => VNode;
  } = {},
  attachTo?: HTMLElement
) {
  const wrapper = mountWith(Popover, {
    props,
    slots: {
      trigger: (slots.trigger ?? defaultTrigger) as (p: unknown) => VNode,
      default: (slots.default ?? defaultPanel) as (p: unknown) => VNode,
    },
    ...(attachTo === undefined ? {} : { attachTo }),
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

const triggerOf = (wrapper: { find: (s: string) => { element: Element } }) =>
  wrapper.find('[data-part="trigger"]').element as HTMLButtonElement;

/** A pointer press followed by its click — what a real mouse does, and what the trigger reads. */
async function press(trigger: HTMLElement): Promise<void> {
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
}

// ---------------------------------------------------------------------------------------------

describe('the trigger slot', () => {
  it('gets a real button with the ARIA wiring, and no panel until it opens', () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(`${trigger.id}-panel`);
    expect(panelOf(trigger).exists()).toBe(false);
  });

  it('flips aria-expanded and renders the panel once opened', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = panelOf(trigger);
    expect(panel.exists()).toBe(true);
    expect(panel.attributes('id')).toBe(trigger.getAttribute('aria-controls'));
  });

  it('lets `toggle` open and close without touching `attrs` at all', async () => {
    mountPopover({}, { trigger: (p) => h('button', { onClick: p.toggle }, 'Go') });
    const trigger = document.querySelector('button') as HTMLButtonElement;
    const panel = () => document.querySelector('[data-part="panel"]');
    trigger.click();
    await flush();
    expect(panel()).not.toBeNull();
    trigger.click();
    await flush();
    expect(panel()).toBeNull();
  });
});

describe('open and close', () => {
  it('opens on a real trigger click and closes on a second one', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(panelOf(trigger).exists()).toBe(true);
    await press(trigger);
    expect(panelOf(trigger).exists()).toBe(false);
  });

  it('emits open/close and keeps an unbound modelValue in sync', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(wrapper.emitted('open')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    await press(trigger);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
  });

  it("closes through the default slot's `close`, and returns focus to the trigger", async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = panelOf(trigger);
    (panel.find('[data-testid="item-two"]').element as HTMLElement).click();
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('starts open when modelValue is true from the first render', () => {
    const opened = mountPopover({ modelValue: true });
    expect(panelOf(triggerOf(opened)).exists()).toBe(true);
  });

  it('opens and closes from an outside v-model write, same as a trigger click would', async () => {
    const wrapper = mountPopover({ modelValue: false });
    const trigger = triggerOf(wrapper);
    expect(panelOf(trigger).exists()).toBe(false);

    await wrapper.setProps({ modelValue: true });
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);

    await wrapper.setProps({ modelValue: false });
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    // An external close does not fight for focus the way Esc/outside-click do.
  });
});

describe('closing rules shared with every non-modal popup in this package', () => {
  it('closes on a press outside, and not on one inside the panel', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    hosts.push(outside);

    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = () => panelOf(trigger);

    panel().element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panel().exists()).toBe(true);

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panel().exists()).toBe(false);
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const item = panelOf(trigger).find('[data-testid="item-one"]').element as HTMLElement;
    item.focus();
    expect(document.activeElement).toBe(item);

    item.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('the Tab walk into a teleported panel with real tab stops', () => {
  const tab = (from: Element, shiftKey = false): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    from.dispatchEvent(event);
    return event;
  };

  it('walks from the trigger into the panel, and Shift+Tab back out', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    trigger.focus();
    await press(trigger);
    const panel = panelOf(trigger);
    const first = panel.find('[data-testid="item-one"]').element as HTMLElement;
    const second = panel.find('[data-testid="item-two"]').element as HTMLElement;

    const forward = tab(trigger);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(panelOf(trigger).exists()).toBe(true);

    // Between the panel's own rows, nothing is touched: the browser's order is already right.
    expect(tab(first).defaultPrevented).toBe(false);

    const back = tab(first, true);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(panelOf(trigger).exists()).toBe(true);

    // Forward off the panel's last row is left to the browser, which is the way out.
    second.focus();
    expect(tab(second).defaultPrevented).toBe(false);
  });

  it('does not redirect when the panel holds no focusable row', async () => {
    const wrapper = mountPopover({}, { default: () => h('p', 'Nothing to focus here.') });
    const trigger = triggerOf(wrapper);
    trigger.focus();
    await press(trigger);
    expect(tab(trigger).defaultPrevented).toBe(false);
  });

  it('does not redirect with teleport: false, since the panel is already after the trigger', async () => {
    const wrapper = mountPopover({ teleport: false });
    const trigger = triggerOf(wrapper);
    trigger.focus();
    await press(trigger);
    expect(tab(trigger).defaultPrevented).toBe(false);
  });
});

describe('teleport target rules', () => {
  it('renders the panel on document.body by default', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = panelOf(trigger);
    expect(panel.element.parentElement).toBe(document.body);
    expect(wrapper.element.contains(panel.element)).toBe(false);
    expect(panel.attributes('style')).toContain('position: fixed');
  });

  it('keeps the panel in place, positioned absolutely, under teleport: false', async () => {
    const wrapper = mountPopover({ teleport: false });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const inPlace = wrapper.find('[data-part="panel"]');
    expect(inPlace.exists()).toBe(true);
    expect(wrapper.element.contains(inPlace.element)).toBe(true);
    expect(inPlace.attributes('style')).toContain('position: absolute');
  });

  it('teleports into an open native <dialog> rather than onto the body', async () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    hosts.push(dialog);
    dialog.showModal();

    const wrapper = mountPopover({}, {}, dialog);
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = panelOf(trigger);
    expect(panel.element.parentElement).toBe(dialog);
    expect(panel.element.parentElement).not.toBe(document.body);
  });
});

describe('one open at a time, shared with Select', () => {
  const OPTIONS: SelectOption[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('opening a Select closes an open Popover, and opening the Popover closes an open Select', async () => {
    const popover = mountPopover();
    const select = mountWith(Select, {
      props: { options: OPTIONS },
      attrs: { 'aria-label': 'Pick' },
    });
    mounted.push(select as unknown as VueWrapper);

    const popoverTrigger = triggerOf(popover);
    const selectTrigger = select.find('[data-part="trigger"]');

    await press(popoverTrigger);
    expect(panelOf(popoverTrigger).exists()).toBe(true);

    await selectTrigger.trigger('pointerdown');
    await selectTrigger.trigger('click');
    await flush();
    // The Select panel is teleported too, so it is found the same way the Popover's is — by id,
    // through `panelOf`, not `wrapper.find` (which only walks each component's own subtree).
    expect(panelOf(selectTrigger.element).exists()).toBe(true);
    expect(panelOf(popoverTrigger).exists()).toBe(false);

    await press(popoverTrigger);
    expect(panelOf(popoverTrigger).exists()).toBe(true);
    expect(panelOf(selectTrigger.element).exists()).toBe(false);
  });
});

describe('the panel has no default role', () => {
  it('renders a plain, role-free div by default', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(panelOf(trigger).attributes('role')).toBeUndefined();
  });

  it('forwards a role a consumer puts on the component, and sets aria-label from ariaLabel', async () => {
    const wrapper = mountPopover({ role: 'menu', ariaLabel: 'Order actions' });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = panelOf(trigger);
    expect(panel.attributes('role')).toBe('menu');
    expect(panel.attributes('aria-label')).toBe('Order actions');
  });
});

describe('accessibility', () => {
  it('has no violations open, named by aria-label and role="menu" on the panel', async () => {
    // `role="menu"` requires `menuitem`-shaped children (axe's `aria-required-children`) — the
    // consumer's responsibility once they opt into that role, not something Popover can supply on
    // their behalf since it never sees what is actually in the default slot.
    const wrapper = mountPopover(
      { role: 'menu', ariaLabel: 'Order actions' },
      {
        default: () =>
          h('div', [
            h('a', { href: '#one', role: 'menuitem' }, 'View order'),
            h('button', { type: 'button', role: 'menuitem' }, 'Cancel order'),
          ]),
      }
    );
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(await axe(panelOf(trigger).element)).toHaveNoViolations();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders in a 20rem container with no overflow-triggering error', () => {
    const wrapper = mountNarrow(Popover, {
      slots: {
        trigger: defaultTrigger as (p: unknown) => VNode,
        default: defaultPanel as (p: unknown) => VNode,
      },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(wrapper.find('[data-part="trigger"]').exists()).toBe(true);
  });
});

describe('dev warnings for a missing or ambiguous trigger', () => {
  it('warns when the trigger slot renders nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Popover, {
      slots: { trigger: () => [], default: defaultPanel as (p: unknown) => VNode },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no `trigger` slot content'));
    warn.mockRestore();
  });
});
