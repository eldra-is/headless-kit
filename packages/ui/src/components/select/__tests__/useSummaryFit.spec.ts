import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { UNMEASURED_SUMMARY, useSummaryFit } from '../useSummaryFit';

/** Gives an element a fixed box, as layout would; happy-dom lays nothing out. */
function sized(el: Element, left: number, width: number): void {
  el.getBoundingClientRect = () =>
    ({ left, right: left + width, width, top: 0, bottom: 20, height: 20 }) as DOMRect;
}

/** Labels 50px wide each (", " included), a 30px pill and an 8px gap, in a cell `cellWidth` wide. */
async function fit(cellWidth: number, labels = ['A', 'B', 'C', 'D', 'E']) {
  let count = ref(0);
  let measure = () => {};
  const box = ref<HTMLElement | null>(null);
  const run = ref<HTMLElement | null>(null);
  const pill = ref<HTMLElement | null>(null);
  const Harness = defineComponent({
    setup() {
      ({ count, measure } = useSummaryFit(box, run, pill, () => labels));
      return () =>
        h('div', [
          h('span', { ref: box, style: 'column-gap: 8px' }),
          h(
            'span',
            { ref: run },
            labels.map((label) => h('span', { 'data-label': '' }, label))
          ),
          h('span', { ref: pill }),
        ]);
    },
  });
  const wrapper = mount(Harness, { attachTo: document.body });
  await nextTick();
  sized(box.value!, 0, cellWidth);
  sized(run.value!, 0, labels.length * 50);
  [...run.value!.querySelectorAll('[data-label]')].forEach((span, index) =>
    sized(span, index * 50, 50)
  );
  sized(pill.value!, 0, 30);
  // What a resize or a label change runs, now the boxes exist.
  measure();
  const result = count.value;
  wrapper.unmount();
  return result;
}

describe('useSummaryFit', () => {
  it('lists every label when they all fit, with no room kept for a pill', async () => {
    expect(await fit(250)).toBe(5);
  });

  it('lists as many as fit beside the gap and the pill', async () => {
    // Three labels (150) + gap (8) + pill (30) = 188; four would need 238.
    expect(await fit(200)).toBe(3);
    expect(await fit(238)).toBe(4);
  });

  it('never lists fewer than one label, which then truncates', async () => {
    expect(await fit(20)).toBe(1);
  });

  it('falls back to the unmeasured count where layout reports no width', async () => {
    expect(await fit(0)).toBe(UNMEASURED_SUMMARY);
  });
});
