import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useTagRows } from '../useTagRows';

/**
 * A field `width` wide that lays its chips and its "+N" out in rows the way flex-wrap does, with a
 * gap of 0: each element's top is written to `data-top`, which the patched `getBoundingClientRect`
 * reads (happy-dom lays nothing out).
 */
async function visibleFor(widths: number[], maxRows: number, width = 300, moreWidth = 30) {
  const field = ref<HTMLElement | null>(null);
  let rows!: ReturnType<typeof useTagRows>;
  const Harness = defineComponent({
    setup() {
      rows = useTagRows(
        field,
        () => maxRows,
        () => true,
        () => widths.length
      );
      return () => {
        const shown = rows.visible.value ?? widths.length;
        const items = widths.slice(0, shown).map((w) => ({ w, part: 'tag' }));
        if (shown < widths.length) items.push({ w: moreWidth, part: 'tagMore' });
        let x = 0;
        let top = 0;
        return h(
          'div',
          { ref: field },
          items.map((item) => {
            if (x > 0 && x + item.w > width) {
              x = 0;
              top += 34;
            }
            x += Math.min(item.w, width);
            return h('span', { 'data-part': item.part, 'data-top': top });
          })
        );
      };
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  await nextTick();
  await rows.measure();
  const visible = rows.visible.value;
  wrapper.unmount();
  return visible;
}

const original = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const top = Number(this.getAttribute('data-top') ?? 0);
    return { top, bottom: top + 28, left: 0, right: 0, width: 0, height: 28 } as DOMRect;
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = original;
});

describe('useTagRows', () => {
  it('shows every chip when they fit in the rows allowed', async () => {
    expect(await visibleFor([100, 100, 100, 100], 2)).toBeNull();
  });

  it('keeps a long chip on the last row when the "+N" fits beside it', async () => {
    // 150 | 200 | 250 takes three rows; 150 | 200 +N fits two, so only the third chip hides.
    expect(await visibleFor([150, 200, 250], 2)).toBe(2);
  });

  it('drops the last chip on the rows allowed when the "+N" cannot fit beside it', async () => {
    // 150 | 290: "+1" would need a third row, so the 290 chip goes too.
    expect(await visibleFor([150, 290, 200], 2)).toBe(1);
  });

  it('always shows at least one chip', async () => {
    expect(await visibleFor([300, 300, 300], 1)).toBe(1);
  });

  it('shows everything when the cap is 0', async () => {
    expect(await visibleFor([300, 300, 300, 300], 0)).toBeNull();
  });
});
