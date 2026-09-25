import { afterEach, describe, expect, it } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, type PropType } from 'vue';
import { mountWith } from '../../test/mount';
import { useFloating, type UseFloatingOptions, type UseFloatingReturn } from '../useFloating';

type Box = { x: number; y: number; width: number; height: number };

/**
 * happy-dom has no layout: every box is 0×0 at the origin, and the viewport reads 0×0 through
 * `documentElement.clientWidth`/`clientHeight`, which is what `@floating-ui/dom` measures against.
 * So the specs below stub both. Everything else — `computePosition`, `flip`, `shift`, `size` and
 * `autoUpdate` — is the real library working on those numbers, not a mock of it.
 */
function stubViewport(width: number, height: number): void {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: width,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    value: height,
    configurable: true,
  });
}

function stubBox(element: HTMLElement, box: Box): void {
  // `@floating-ui/dom` measures the *floating* element through `offsetWidth`/`offsetHeight`, not
  // its client rect, so both have to be stubbed or the panel measures 0x0 and always fits.
  Object.defineProperty(element, 'offsetWidth', { value: box.width, configurable: true });
  Object.defineProperty(element, 'offsetHeight', { value: box.height, configurable: true });
  element.getBoundingClientRect = () =>
    ({
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      right: box.x + box.width,
      bottom: box.y + box.height,
      width: box.width,
      height: box.height,
      toJSON: () => box,
    }) as DOMRect;
}

/** `computePosition` is a promise; `autoUpdate` schedules it. Let both settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

let api: UseFloatingReturn;

const Probe = defineComponent({
  props: { options: { type: Object as PropType<UseFloatingOptions>, default: () => ({}) } },
  setup(props) {
    const reference = ref<HTMLElement | null>(null);
    const floating = ref<HTMLElement | null>(null);
    api = useFloating(reference, floating, props.options);
    return () =>
      h('div', [
        h('button', { ref: reference, 'data-testid': 'reference' }, 'Open'),
        h('div', { ref: floating, 'data-testid': 'floating' }, 'Panel'),
      ]);
  },
});

const mounted: VueWrapper[] = [];

async function setup(
  options: UseFloatingOptions = {},
  layout: { reference?: Box; floating?: Box } = {}
) {
  stubViewport(1024, 768);
  const wrapper = mountWith(Probe, { props: { options } });
  mounted.push(wrapper as unknown as VueWrapper);
  const at = (testid: string) => wrapper.find(`[data-testid="${testid}"]`).element as HTMLElement;
  const reference = at('reference');
  stubBox(reference, layout.reference ?? { x: 100, y: 100, width: 240, height: 40 });
  stubBox(at('floating'), layout.floating ?? { x: 0, y: 0, width: 200, height: 300 });
  await settle();
  return { wrapper, reference, floating: at('floating') };
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

describe('useFloating', () => {
  it('positions the panel below the start edge of the reference, absolutely', async () => {
    await setup();
    expect(api.styles.value).toEqual({ position: 'absolute', left: '100px', top: '144px' });
    expect(api.placement.value).toBe('bottom-start');
  });

  it('takes the gap from offset', async () => {
    await setup({ offset: 12 });
    expect(api.styles.value.top).toBe('152px');
  });

  it('adds no width unless matchWidth asks for one', async () => {
    await setup();
    expect(api.styles.value).not.toHaveProperty('width');
  });

  it('matches the reference width when matchWidth is set', async () => {
    await setup({ matchWidth: true });
    expect(api.styles.value.width).toBe('240px');
  });

  describe('placement', () => {
    it("flips above when 'auto' runs out of room below", async () => {
      await setup({ placement: 'auto' }, { reference: { x: 100, y: 700, width: 240, height: 40 } });
      expect(api.placement.value).toBe('top-start');
    });

    it("stays below when 'auto' has the room", async () => {
      await setup({ placement: 'auto' });
      expect(api.placement.value).toBe('bottom-start');
    });

    it("keeps 'above' above even with no room there, because it does not flip", async () => {
      await setup({ placement: 'above' }, { reference: { x: 100, y: 0, width: 240, height: 40 } });
      expect(api.placement.value).toBe('top-start');
    });

    it("lets flip: true opt 'above' back into flipping", async () => {
      await setup(
        { placement: 'above', flip: true },
        { reference: { x: 100, y: 0, width: 240, height: 40 } }
      );
      expect(api.placement.value).toBe('bottom-start');
    });

    it("lets flip: false pin 'auto' below", async () => {
      await setup(
        { placement: 'auto', flip: false },
        { reference: { x: 100, y: 700, width: 240, height: 40 } }
      );
      expect(api.placement.value).toBe('bottom-start');
    });

    it('passes a concrete floating-ui placement straight through', async () => {
      await setup({ placement: 'top', flip: false });
      expect(api.placement.value).toBe('top');
    });
  });

  it('recomputes on update() when the reference has moved', async () => {
    const { reference } = await setup();
    expect(api.styles.value.top).toBe('144px');

    stubBox(reference, { x: 300, y: 200, width: 240, height: 40 });
    api.update();
    await settle();

    expect(api.styles.value).toEqual({ position: 'absolute', left: '300px', top: '244px' });
  });

  it('survives an unmount with no elements ever measured', () => {
    const wrapper = mountWith(Probe, { props: { options: {} } });
    expect(() => wrapper.unmount()).not.toThrow();
  });
});
