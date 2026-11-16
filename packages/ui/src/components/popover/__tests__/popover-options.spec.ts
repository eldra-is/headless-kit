import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, type VNode } from 'vue';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import Select from '../../select/Select.vue';
import type { SelectOption } from '../../select/types';
import Popover from '../Popover.vue';

/**
 * The opt-in options a wrapping component library needs: positioning (`placement` followed,
 * `offset`, `viewportPadding`, `reference`), the trigger contract (`disabled`, `haspopup`,
 * `openOnArrowDown`, keyboard activation), focus (`focusOnOpen`, `returnFocus`,
 * `labelledByTrigger`), the closing switches, `closeWhenTriggerHidden`, `exclusive`, and nested
 * popups. Every default is covered by `popover.spec.ts`, which runs unchanged.
 */

type TriggerSlotProps = { open: boolean; toggle: () => void; attrs: Record<string, unknown> };
type PanelSlotProps = { close: () => void; open: boolean; toggle: () => void };

const mounted: VueWrapper[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const defaultTrigger = (props: TriggerSlotProps): VNode => h('button', props.attrs, 'Actions');

const defaultPanel = (props: PanelSlotProps): VNode =>
  h('div', [
    h('a', { href: '#one', 'data-testid': 'item-one' }, 'View order'),
    h('button', { type: 'button', 'data-testid': 'item-two', onClick: props.close }, 'Cancel'),
  ]);

function mountPopover(
  props: Record<string, unknown> = {},
  slots: {
    trigger?: ((p: TriggerSlotProps) => VNode) | null;
    default?: (p: PanelSlotProps) => VNode;
  } = {},
  attrs: Record<string, unknown> = {}
) {
  const wrapper = mountWith(Popover, {
    props,
    attrs,
    slots: {
      ...(slots.trigger === null
        ? {}
        : { trigger: (slots.trigger ?? defaultTrigger) as (p: unknown) => VNode }),
      default: (slots.default ?? defaultPanel) as (p: unknown) => VNode,
    },
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

const triggerOf = (wrapper: { find: (s: string) => { element: Element } }) =>
  wrapper.find('[data-part="trigger"]').element as HTMLButtonElement;

async function press(target: Element): Promise<void> {
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
}

const key = (target: Element, name: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

/** What a browser does when `Enter` activates a focused `<button>`: keydown, then a `detail: 0`
 *  click with no pointer press. */
async function activateWithEnter(trigger: HTMLElement): Promise<void> {
  key(trigger, 'Enter');
  trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  await flush();
}

function outsideButton(): HTMLButtonElement {
  const outside = document.createElement('button');
  outside.textContent = 'Elsewhere';
  document.body.append(outside);
  hosts.push(outside);
  return outside;
}

// ---------------------------------------------------------------------------------------------

describe('keyboard activation', () => {
  it('opens and closes from Enter on the trigger', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    trigger.focus();
    await activateWithEnter(trigger);
    expect(panelOf(trigger).exists()).toBe(true);
    await activateWithEnter(trigger);
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('still only focuses on a forwarded click with no key or pointer behind it', async () => {
    const wrapper = mountPopover();
    const trigger = triggerOf(wrapper);
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('opens on ArrowDown only with openOnArrowDown', async () => {
    const off = mountPopover();
    const offTrigger = triggerOf(off);
    expect(key(offTrigger, 'ArrowDown').defaultPrevented).toBe(false);
    await flush();
    expect(panelOf(offTrigger).exists()).toBe(false);

    const on = mountPopover({ openOnArrowDown: true });
    const onTrigger = triggerOf(on);
    expect(key(onTrigger, 'ArrowDown').defaultPrevented).toBe(true);
    await flush();
    expect(panelOf(onTrigger).exists()).toBe(true);
  });
});

describe('disabled', () => {
  it('marks the trigger disabled, ignores every open, and closes an open panel', async () => {
    const wrapper = mountPopover({ modelValue: true });
    const trigger = triggerOf(wrapper);
    expect(trigger.hasAttribute('disabled')).toBe(false);
    expect(panelOf(trigger).exists()).toBe(true);

    await wrapper.setProps({ disabled: true });
    await flush();
    expect(trigger.hasAttribute('disabled')).toBe(true);
    expect(panelOf(trigger).exists()).toBe(false);

    await press(trigger);
    await activateWithEnter(trigger);
    await wrapper.setProps({ modelValue: true });
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
  });

  it('has no axe violations while disabled', async () => {
    const wrapper = mountPopover({ disabled: true });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('the trigger and panel ARIA', () => {
  it('sets aria-haspopup from haspopup', () => {
    const wrapper = mountPopover({ haspopup: 'listbox' });
    expect(triggerOf(wrapper).getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('names the panel by its trigger with labelledByTrigger, unless ariaLabel names it', async () => {
    const labelled = mountPopover(
      { labelledByTrigger: true, modelValue: true },
      {},
      { role: 'dialog' }
    );
    const trigger = triggerOf(labelled);
    await flush();
    const panel = panelOf(trigger);
    expect(panel.attributes('aria-labelledby')).toBe(trigger.id);
    expect(await axe(panel.element)).toHaveNoViolations();

    const named = mountPopover({ labelledByTrigger: true, ariaLabel: 'Actions', modelValue: true });
    await flush();
    expect(panelOf(triggerOf(named)).attributes('aria-labelledby')).toBeUndefined();

    const explicit = mountPopover(
      { labelledByTrigger: true, modelValue: true },
      {},
      { 'aria-labelledby': 'elsewhere' }
    );
    await flush();
    expect(panelOf(triggerOf(explicit)).attributes('aria-labelledby')).toBe('elsewhere');
  });

  it('merges a consumer style (z-index, max-width) with the positioning style', async () => {
    const wrapper = mountPopover(
      { modelValue: true },
      {},
      { style: { zIndex: 70, maxWidth: '20rem' } }
    );
    await flush();
    const style = panelOf(triggerOf(wrapper)).attributes('style') ?? '';
    expect(style).toContain('z-index: 70');
    expect(style).toContain('max-width: 20rem');
    expect(style).toContain('position: fixed');
  });
});

describe('focus', () => {
  it('moves focus to the first tab stop with focusOnOpen, and to the panel when there is none', async () => {
    const wrapper = mountPopover({ focusOnOpen: true });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const panel = panelOf(trigger);
    expect(document.activeElement).toBe(panel.find('[data-testid="item-one"]').element);
    expect(panel.attributes('tabindex')).toBe('-1');
    expect(await axe(panel.element)).toHaveNoViolations();

    const empty = mountPopover(
      { focusOnOpen: true },
      { default: () => h('p', 'Nothing to focus.') },
      { role: 'dialog', 'aria-label': 'Note' }
    );
    const emptyTrigger = triggerOf(empty);
    await press(emptyTrigger);
    expect(document.activeElement).toBe(panelOf(emptyTrigger).element);
  });

  it('leaves the panel without a tabindex by default', async () => {
    const wrapper = mountPopover({ modelValue: true });
    await flush();
    expect(panelOf(triggerOf(wrapper)).attributes('tabindex')).toBeUndefined();
  });

  it('keeps focus where it is on Escape and close() with returnFocus: false', async () => {
    const wrapper = mountPopover({ returnFocus: false });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const item = panelOf(trigger).find('[data-testid="item-one"]').element as HTMLElement;
    item.focus();
    key(item, 'Escape');
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).not.toBe(trigger);

    await press(trigger);
    trigger.blur();
    (panelOf(trigger).find('[data-testid="item-two"]').element as HTMLElement).click();
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
  });
});

describe('closing switches', () => {
  it('stays open on an outside press with closeOnOutsideClick: false', async () => {
    const outside = outsideButton();
    const wrapper = mountPopover({ closeOnOutsideClick: false });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
  });

  it('closes on focus leaving unless closeOnFocusOutside is false', async () => {
    const outside = outsideButton();
    const leave = async (trigger: HTMLElement): Promise<void> => {
      trigger.focus();
      trigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
      await flush();
    };

    const closing = mountPopover();
    await press(triggerOf(closing));
    await leave(triggerOf(closing));
    expect(panelOf(triggerOf(closing)).exists()).toBe(false);

    const staying = mountPopover({ closeOnFocusOutside: false });
    await press(triggerOf(staying));
    await leave(triggerOf(staying));
    expect(panelOf(triggerOf(staying)).exists()).toBe(true);

    // The press itself still closes it: the two switches are independent.
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(triggerOf(staying)).exists()).toBe(false);
  });

  it('ignores Escape, without consuming it, with closeOnEscape: false', async () => {
    const wrapper = mountPopover({ closeOnEscape: false });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(key(trigger, 'Escape').defaultPrevented).toBe(false);
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
  });

  it('follows a switch changed while open', async () => {
    const wrapper = mountPopover({ closeOnEscape: false });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    await wrapper.setProps({ closeOnEscape: true });
    key(trigger, 'Escape');
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
  });
});

describe('closeWhenTriggerHidden', () => {
  type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;
  let observers: Array<{ callback: Callback; observed: Element[]; disconnected: boolean }> = [];

  function stubObserver(): void {
    observers = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        record: { callback: Callback; observed: Element[]; disconnected: boolean };
        constructor(callback: Callback) {
          this.record = { callback, observed: [], disconnected: false };
          observers.push(this.record);
        }
        observe(element: Element): void {
          this.record.observed.push(element);
        }
        disconnect(): void {
          this.record.disconnected = true;
        }
      }
    );
  }

  it('closes, without moving focus, once the trigger leaves the viewport', async () => {
    stubObserver();
    const wrapper = mountPopover({ closeWhenTriggerHidden: true });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const live = observers.find((entry) => !entry.disconnected);
    expect(live?.observed).toEqual([trigger]);

    const item = panelOf(trigger).find('[data-testid="item-one"]').element as HTMLElement;
    item.focus();
    live?.callback([{ isIntersecting: false }]);
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    expect(document.activeElement).not.toBe(trigger);
    expect(observers.every((entry) => entry.disconnected)).toBe(true);
  });

  it('observes nothing by default', async () => {
    stubObserver();
    const wrapper = mountPopover();
    await press(triggerOf(wrapper));
    expect(observers).toHaveLength(0);
  });
});

describe('positioning', () => {
  it('follows a placement changed while open', async () => {
    const wrapper = mountPopover({ modelValue: true, placement: 'bottom-start' });
    await flush();
    const trigger = triggerOf(wrapper);
    expect(panelOf(trigger).attributes('data-placement')).toBe('bottom-start');
    await wrapper.setProps({ placement: 'right-start' });
    await flush();
    expect(panelOf(trigger).attributes('data-placement')).toBe('right-start');
    expect(panelOf(trigger).attributes('style')).toContain('--eldra-popover-origin: top left');
    await wrapper.setProps({ placement: 'left' });
    await flush();
    expect(panelOf(trigger).attributes('style')).toContain('--eldra-popover-origin: top right');
  });

  it('puts the panel offset away from the trigger', async () => {
    const wrapper = mountPopover({ modelValue: true, placement: 'bottom-start', offset: 12 });
    await flush();
    expect(panelOf(triggerOf(wrapper)).attributes('style')).toContain('top: 12px');
  });

  it('positions against a virtual reference with no trigger, without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rect = { x: 100, y: 200, width: 0, height: 20 };
    const reference = {
      getBoundingClientRect: () => ({
        ...rect,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
      }),
    };
    const wrapper = mountPopover(
      { modelValue: true, reference, placement: 'bottom-start', offset: 0, viewportPadding: 0 },
      { trigger: null },
      { role: 'listbox', 'aria-label': 'Commands' }
    );
    await flush();
    const panel = document.querySelector<HTMLElement>('[data-part="panel"]');
    expect(panel).not.toBeNull();
    expect(panel?.parentElement).toBe(document.body);
    expect(panel?.style.top).not.toBe('');
    const top = Number.parseFloat(panel?.style.top ?? '');
    expect(top).toBeGreaterThanOrEqual(200);
    expect(warn).not.toHaveBeenCalled();

    // Nothing observes a virtual element, so the exposed `update()` is what follows it.
    rect.y += 100;
    (wrapper.vm as unknown as { update: () => void }).update();
    await flush();
    expect(Number.parseFloat(panel?.style.top ?? '')).toBe(top + 100);
    warn.mockRestore();
  });

  it('positions against a real reference element while the trigger stays the trigger', async () => {
    const anchor = document.createElement('div');
    document.body.append(anchor);
    hosts.push(anchor);
    const wrapper = mountPopover({ reference: anchor });
    const trigger = triggerOf(wrapper);
    await press(trigger);
    expect(panelOf(trigger).exists()).toBe(true);
    key(trigger, 'Escape');
    await flush();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('the default slot and exposed members', () => {
  it('hands the panel open and toggle as well as close', async () => {
    let seen: PanelSlotProps | undefined;
    const wrapper = mountPopover(
      { modelValue: true },
      {
        default: (p) => {
          seen = p;
          return h('button', { type: 'button', onClick: p.toggle }, 'Toggle');
        },
      }
    );
    await flush();
    expect(seen?.open).toBe(true);
    (document.querySelector('[data-part="panel"] button') as HTMLElement).click();
    await flush();
    expect(panelOf(triggerOf(wrapper)).exists()).toBe(false);
  });

  it('exposes open, close and toggle', async () => {
    const wrapper = mountPopover();
    const vm = wrapper.vm as unknown as { open: () => void; close: () => void; toggle: () => void };
    const trigger = triggerOf(wrapper);
    vm.open();
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
    vm.close();
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
    vm.toggle();
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
  });
});

describe('one open at a time, and nesting', () => {
  const OPTIONS: SelectOption[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];

  it('stays open beside an unrelated Select with exclusive: false', async () => {
    const popover = mountPopover({ exclusive: false, closeOnOutsideClick: false });
    const select = mountWith(Select, {
      props: { options: OPTIONS },
      attrs: { 'aria-label': 'Pick' },
    });
    mounted.push(select as unknown as VueWrapper);
    const trigger = triggerOf(popover);
    await press(trigger);
    const selectTrigger = select.find('[data-part="trigger"]').element;
    await press(selectTrigger);
    expect(panelOf(selectTrigger).exists()).toBe(true);
    expect(panelOf(trigger).exists()).toBe(true);
  });

  it('keeps a popover open while a Select opened from its panel is used', async () => {
    const outside = outsideButton();
    const wrapper = mountPopover(
      {},
      {
        default: () =>
          h(Select, { options: OPTIONS, 'aria-label': 'Status', 'data-testid': 'nested' }),
      },
      { role: 'dialog', 'aria-label': 'Filters' }
    );
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const selectTrigger = panelOf(trigger).find('[data-part="trigger"]').element;
    await press(selectTrigger);
    const selectPanel = panelOf(selectTrigger);
    expect(selectPanel.exists()).toBe(true);
    expect(panelOf(trigger).exists()).toBe(true);
    expect(panelOf(trigger).element.contains(selectPanel.element)).toBe(false);

    selectPanel.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
    expect(await axe(panelOf(trigger).element)).toHaveNoViolations();

    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
  });

  it('keeps a popover open while a popover nested two deep is used', async () => {
    const innerTrigger = (p: TriggerSlotProps): VNode => h('button', p.attrs, 'More');
    const deepest = defineComponent({
      setup: () => () =>
        h(Popover, null, {
          trigger: (p: TriggerSlotProps) => h('button', p.attrs, 'Deeper'),
          default: () => h('button', { type: 'button', 'data-testid': 'deep-item' }, 'Deep'),
        }),
    });
    const wrapper = mountPopover(
      {},
      {
        default: () => h(Popover, null, { trigger: innerTrigger, default: () => h(deepest) }),
      }
    );
    const trigger = triggerOf(wrapper);
    await press(trigger);
    const middleTrigger = panelOf(trigger).find('[data-part="trigger"]').element;
    await press(middleTrigger);
    const deepTrigger = panelOf(middleTrigger).find('[data-part="trigger"]').element;
    await press(deepTrigger);
    const deepItem = panelOf(deepTrigger).find('[data-testid="deep-item"]').element as HTMLElement;

    deepItem.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    deepItem.focus();
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);
    expect(panelOf(middleTrigger).exists()).toBe(true);
    expect(panelOf(deepTrigger).exists()).toBe(true);
  });

  it('counts a part teleported with an owner marker naming an element inside the panel', async () => {
    const picker = document.createElement('div');
    picker.setAttribute('data-eldra-overlay-owner', 'field-in-panel');
    document.body.append(picker);
    hosts.push(picker);
    const wrapper = mountPopover(
      {},
      { default: () => h('input', { id: 'field-in-panel', 'aria-label': 'Colour' }) }
    );
    const trigger = triggerOf(wrapper);
    await press(trigger);
    picker.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(true);

    const stray = document.createElement('div');
    stray.setAttribute('data-eldra-overlay-owner', 'nowhere');
    document.body.append(stray);
    hosts.push(stray);
    stray.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flush();
    expect(panelOf(trigger).exists()).toBe(false);
  });

  it('a nested popover still closes whatever is open outside its ancestors', async () => {
    const isolated = ref(false);
    const sibling = mountPopover();
    const host = mountPopover(
      {},
      {
        default: () =>
          h(
            Popover,
            { 'onUpdate:modelValue': (v: boolean) => (isolated.value = v) },
            {
              trigger: (p: TriggerSlotProps) => h('button', p.attrs, 'More'),
              default: () => h('p', 'Inner'),
            }
          ),
      }
    );
    const siblingTrigger = triggerOf(sibling);
    const hostTrigger = triggerOf(host);
    await press(hostTrigger);
    const innerTrigger = panelOf(hostTrigger).find('[data-part="trigger"]').element;
    await press(innerTrigger);
    expect(isolated.value).toBe(true);
    await press(siblingTrigger);
    // Two separately mounted apps share `useId()` values, so the host is read through its own
    // model rather than by panel id.
    expect(sibling.emitted('update:modelValue')?.at(-1)).toEqual([true]);
    expect(host.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    expect(isolated.value).toBe(false);
  });
});
