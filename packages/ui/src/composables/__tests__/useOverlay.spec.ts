import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, type PropType, type Ref } from 'vue';
import { mountWith } from '../../test/mount';
import { useOverlay, type UseOverlayOptions, type UseOverlayReturn } from '../useOverlay';

type ProbeOptions = Omit<UseOverlayOptions, 'open' | 'trigger' | 'content' | 'setOpen'>;

let api: UseOverlayReturn;

/**
 * The shape every consumer has: a trigger, a panel with two focusable rows in it (one of them
 * disabled, one of them out of the tab order), and a parent that owns `open`.
 */
const Probe = defineComponent({
  props: {
    open: { type: Object as PropType<Ref<boolean>>, required: true },
    setOpen: { type: Function as PropType<(open: boolean) => void>, required: true },
    options: { type: Object as PropType<ProbeOptions>, default: () => ({}) },
  },
  setup(props) {
    const trigger = ref<HTMLElement | null>(null);
    const content = ref<HTMLElement | null>(null);
    api = useOverlay({
      open: props.open,
      trigger,
      content,
      setOpen: props.setOpen,
      ...props.options,
    });
    return () =>
      h('div', [
        h('button', { ref: trigger, 'data-testid': 'trigger' }, 'Open'),
        props.open.value
          ? h('div', { ref: content, id: 'panel', 'data-testid': 'content' }, [
              h('button', { 'data-testid': 'first' }, 'First'),
              h('button', { 'data-testid': 'disabled', disabled: true }, 'Disabled'),
              h('span', { 'data-testid': 'untabbable', tabindex: '-1' }, 'Skipped'),
              h('button', { 'data-testid': 'untabbable-button', tabindex: '-1' }, 'Roving'),
              h('input', { 'data-testid': 'untabbable-input', tabindex: '-1' }),
              h('a', { 'data-testid': 'last', href: '#x' }, 'Last'),
            ])
          : null,
      ]);
  },
});

/**
 * Every mounted probe, torn down after each test. A `useOverlay` that is still mounted is still
 * listening on `document`, so leaving one behind would let it answer the next test's events.
 */
const mounted: VueWrapper[] = [];

function setup(options: ProbeOptions = {}, initiallyOpen = true) {
  const open = ref(initiallyOpen);
  const setOpen = vi.fn((next: boolean) => {
    open.value = next;
  });
  const wrapper = mountWith(Probe, { props: { open, setOpen, options } });
  mounted.push(wrapper as unknown as VueWrapper);
  const at = (testid: string) => wrapper.find(`[data-testid="${testid}"]`).element as HTMLElement;
  return { open, setOpen, wrapper, at };
}

/** An element that belongs to no overlay, standing in for the rest of the page. */
function outsideElement(): HTMLButtonElement {
  const button = document.createElement('button');
  button.dataset.testid = 'outside';
  document.body.append(button);
  return button;
}

function pointerDown(target: Element): void {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

function focusOut(target: Element, relatedTarget: Element | null): void {
  const event = new FocusEvent('focusout', { bubbles: true, relatedTarget });
  target.dispatchEvent(event);
}

function escape(target: Element = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useOverlay', () => {
  describe('outside pointer presses', () => {
    it('closes on a pointer press outside the trigger and the content', () => {
      const { setOpen } = setup();
      pointerDown(outsideElement());
      expect(setOpen).toHaveBeenCalledWith(false);
    });

    it('does not close on a pointer press inside the content', () => {
      const { setOpen, at } = setup();
      pointerDown(at('first'));
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('does not close on a pointer press on the trigger, so the trigger can toggle', () => {
      const { setOpen, at } = setup();
      pointerDown(at('trigger'));
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('does not close on a press inside a teleported panel that claims the content id', () => {
      const { setOpen } = setup();
      const teleported = document.createElement('div');
      teleported.dataset.eldraOverlayOwner = 'panel';
      teleported.innerHTML = '<button>In the portal</button>';
      document.body.append(teleported);

      pointerDown(teleported.querySelector('button')!);
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('closes on a press inside a portal that claims a different overlay', () => {
      const { setOpen } = setup();
      const teleported = document.createElement('div');
      teleported.dataset.eldraOverlayOwner = 'someone-else';
      document.body.append(teleported);

      pointerDown(teleported);
      expect(setOpen).toHaveBeenCalledWith(false);
    });

    it('leaves focus where the pointer put it rather than pulling it back to the trigger', () => {
      const { setOpen, at } = setup();
      const outside = outsideElement();
      at('first').focus();

      pointerDown(outside);
      expect(setOpen).toHaveBeenCalledWith(false);
      expect(document.activeElement).toBe(at('first')); // the close itself moved nothing

      outside.focus(); // what the browser does next, once the press completes
      expect(document.activeElement).toBe(outside);
    });

    it('ignores outside presses when closeOnOutsideClick is false', () => {
      const { setOpen } = setup({ closeOnOutsideClick: false });
      pointerDown(outsideElement());
      expect(setOpen).not.toHaveBeenCalled();
    });
  });

  describe('focus leaving the overlay', () => {
    it('closes when focus moves to an unrelated element', () => {
      const { setOpen, at } = setup();
      const outside = outsideElement();
      focusOut(at('first'), outside);
      expect(setOpen).toHaveBeenCalledWith(false);
    });

    it('does not steal focus from the element focus moved to', () => {
      const { at } = setup();
      const outside = outsideElement();
      outside.focus();
      focusOut(at('first'), outside);
      expect(document.activeElement).toBe(outside);
    });

    it('returns focus to the trigger when focus went nowhere', () => {
      const { at } = setup();
      focusOut(at('first'), null);
      expect(document.activeElement).toBe(at('trigger'));
    });

    it('leaves focus on the body when returnFocus is false', () => {
      const { at, setOpen } = setup({ returnFocus: false });
      focusOut(at('first'), null);
      expect(setOpen).toHaveBeenCalledWith(false);
      expect(document.activeElement).not.toBe(at('trigger'));
    });

    it('stays open when focus moves within the content', () => {
      const { setOpen, at } = setup();
      focusOut(at('first'), at('last'));
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('stays open when focus moves from the content to the trigger', () => {
      const { setOpen, at } = setup();
      focusOut(at('first'), at('trigger'));
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('ignores focus moving between two elements that are both outside', () => {
      const { setOpen } = setup();
      const from = outsideElement();
      const to = outsideElement();
      focusOut(from, to);
      expect(setOpen).not.toHaveBeenCalled();
    });
  });

  describe('Escape', () => {
    it('closes and returns focus to the trigger', () => {
      const { setOpen, at } = setup();
      at('first').focus();
      escape(at('first'));
      expect(setOpen).toHaveBeenCalledWith(false);
      expect(document.activeElement).toBe(at('trigger'));
    });

    it('prevents the default and stops propagation, so an enclosing dialog does not also close', () => {
      const { at } = setup();
      const onWindow = vi.fn();
      window.addEventListener('keydown', onWindow);

      const event = escape(at('first'));

      expect(event.defaultPrevented).toBe(true);
      expect(onWindow).not.toHaveBeenCalled();
      window.removeEventListener('keydown', onWindow);
    });

    it('lets Escape through untouched while the overlay is closed', () => {
      const { setOpen } = setup({}, false);
      const onWindow = vi.fn();
      window.addEventListener('keydown', onWindow);

      const event = escape();

      expect(event.defaultPrevented).toBe(false);
      expect(onWindow).toHaveBeenCalledTimes(1);
      expect(setOpen).not.toHaveBeenCalled();
      window.removeEventListener('keydown', onWindow);
    });

    it('closes without moving focus when returnFocus is false', () => {
      const { setOpen, at } = setup({ returnFocus: false });
      at('first').focus();
      escape(at('first'));
      expect(setOpen).toHaveBeenCalledWith(false);
      expect(document.activeElement).not.toBe(at('trigger'));
    });

    it('ignores Escape when closeOnEscape is false', () => {
      const { setOpen } = setup({ closeOnEscape: false });
      const event = escape();
      expect(setOpen).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('ignores every other key', () => {
      const { setOpen } = setup();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      );
      expect(setOpen).not.toHaveBeenCalled();
    });
  });

  describe('focus helpers', () => {
    it('lists the focusable elements in the content, skipping disabled and untabbable ones', () => {
      const { at } = setup();
      expect(api.focusables()).toEqual([at('first'), at('last')]);
    });

    it('skips natively focusable elements that are out of the tab sequence', () => {
      // A roving-tabindex row or a `tabindex="-1"` field is programmatically focusable, and the
      // element selector matches it on its tag alone — but it is not where a keyboard user lands.
      const { at } = setup();
      expect(at('untabbable-button').tabIndex).toBe(-1);
      expect(at('untabbable-input').tabIndex).toBe(-1);
      expect(api.focusables()).not.toContain(at('untabbable-button'));
      expect(api.focusables()).not.toContain(at('untabbable-input'));
    });

    it('focuses the first of them', () => {
      const { at } = setup();
      api.focusFirst();
      expect(document.activeElement).toBe(at('first'));
    });

    it('returns an empty list while there is no content', () => {
      setup({}, false);
      expect(api.focusables()).toEqual([]);
      expect(() => api.focusFirst()).not.toThrow();
    });

    it('closes through close()', () => {
      const { setOpen } = setup();
      api.close();
      expect(setOpen).toHaveBeenCalledWith(false);
    });
  });

  describe('listeners', () => {
    it('adds none while the overlay is closed', () => {
      const add = vi.spyOn(document, 'addEventListener');
      setup({}, false);
      expect(add).not.toHaveBeenCalled();
    });

    it('removes every listener it added when the overlay closes', async () => {
      const { open, setOpen } = setup();
      const remove = vi.spyOn(document, 'removeEventListener');

      open.value = false;
      await nextTick();

      expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual([
        'focusout',
        'keydown',
        'pointerdown',
      ]);

      setOpen.mockClear();
      pointerDown(outsideElement());
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('removes every listener it added when the component unmounts', () => {
      const { wrapper, setOpen } = setup();
      mounted.length = 0; // this test unmounts it itself
      const remove = vi.spyOn(document, 'removeEventListener');

      wrapper.unmount();

      expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual([
        'focusout',
        'keydown',
        'pointerdown',
      ]);

      setOpen.mockClear();
      pointerDown(outsideElement());
      escape();
      expect(setOpen).not.toHaveBeenCalled();
    });

    it('adds them again when the overlay reopens', async () => {
      const { open, setOpen } = setup({}, false);
      open.value = true;
      await nextTick();

      pointerDown(outsideElement());
      expect(setOpen).toHaveBeenCalledWith(false);
    });
  });
});
