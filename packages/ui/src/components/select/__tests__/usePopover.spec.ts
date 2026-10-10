import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mountWith } from '../../../test/mount';
import { currentOpen } from '../openRegistry';
import { usePopover, type UsePopoverReturn } from '../usePopover';

/**
 * `usePopover` is the open/closed life `Select`, `MultiSelect` and `SearchBar` share. Most of it is
 * proven through those three components' own specs — this file covers the two parts that none of
 * them exercises end to end:
 *
 * - **"Only one open at a time"** *between* controls. `openRegistry`'s own spec calls the module
 *   directly, and each control's spec opens one control; nothing asserted that opening the second
 *   closes the first, which is the rule the spec's Behaviour section actually states.
 * - **`afterOpen` runs on a change, not on every call.** A control that asks to open while it is
 *   already open (the search bar does, on every keystroke) must not re-run whatever `afterOpen`
 *   does — moving focus into the panel, say.
 */

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * A bare host: one trigger, one panel, nothing else. The registry rule is about *any* two popups
 * on a page, so it is proven here rather than through two `Select`s — a pointer press on the second
 * select's trigger closes the first through `useOverlay` (the press is outside it), which would
 * pass whether or not the registry exists.
 */
function mountPopover(): UsePopoverReturn {
  let popover: UsePopoverReturn | undefined;
  const Host = defineComponent({
    setup() {
      const trigger = ref<HTMLElement | null>(null);
      const content = ref<HTMLElement | null>(null);
      popover = usePopover({ trigger, content });
      return () =>
        h('div', [
          h('button', { ref: trigger }, 'open'),
          popover?.isOpen.value === true ? h('div', { ref: content }, 'panel') : null,
        ]);
    },
  });
  const wrapper = mountWith(Host);
  mounted.push(wrapper as unknown as VueWrapper);
  if (popover === undefined) throw new Error('the host never ran setup');
  return popover;
}

describe('usePopover', () => {
  it('closes whichever popup was open when another one opens', async () => {
    const first = mountPopover();
    const second = mountPopover();

    first.setOpen(true);
    await flush();
    expect(first.isOpen.value).toBe(true);

    second.setOpen(true);
    await flush();
    expect(first.isOpen.value).toBe(false);
    expect(second.isOpen.value).toBe(true);
  });

  it('releases the registry slot when it closes, and when it unmounts while open', async () => {
    const first = mountPopover();
    first.setOpen(true);
    expect(currentOpen()).not.toBeNull();
    first.setOpen(false);
    expect(currentOpen()).toBeNull();

    // Unmounting an *open* popup has to release it too, or the slot would hold a close function
    // belonging to a component that no longer exists.
    const second = mountPopover();
    second.setOpen(true);
    expect(currentOpen()).not.toBeNull();
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    await flush();
    expect(currentOpen()).toBeNull();
  });

  it('runs afterOpen only when the call actually opened the popup', async () => {
    const afterOpen = vi.fn();
    let popover: UsePopoverReturn | undefined;

    const Host = defineComponent({
      setup() {
        const trigger = ref<HTMLElement | null>(null);
        const content = ref<HTMLElement | null>(null);
        popover = usePopover({ trigger, content, afterOpen });
        return () =>
          h('div', [
            h('button', { ref: trigger }, 'open'),
            popover?.isOpen.value === true ? h('div', { ref: content }, 'panel') : null,
          ]);
      },
    });

    const wrapper = mountWith(Host);
    mounted.push(wrapper as unknown as VueWrapper);

    popover?.open();
    await flush();
    expect(afterOpen).toHaveBeenCalledTimes(1);

    popover?.open();
    popover?.open();
    await flush();
    expect(afterOpen).toHaveBeenCalledTimes(1);

    popover?.close();
    popover?.open();
    await flush();
    expect(afterOpen).toHaveBeenCalledTimes(2);
  });

  it('never opens when the control says it cannot', async () => {
    let popover: UsePopoverReturn | undefined;
    const activate = vi.fn();

    const Host = defineComponent({
      setup() {
        const trigger = ref<HTMLElement | null>(null);
        const content = ref<HTMLElement | null>(null);
        popover = usePopover({ trigger, content, canOpen: () => false });
        return () => h('div', [h('button', { ref: trigger }, 'open')]);
      },
    });

    const wrapper = mountWith(Host);
    mounted.push(wrapper as unknown as VueWrapper);

    popover?.open(activate);
    popover?.setOpen(true);
    await flush();
    expect(popover?.isOpen.value).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });
});
