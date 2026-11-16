import { nextTick, ref, watch, type Ref } from 'vue';

/**
 * How many chips an inside tag list shows before `maxRows` would be exceeded, or `null` for all.
 *
 * Every chip is rendered and its row read from its top. When they take more than `maxRows` rows,
 * the chips on the rows allowed are kept and the "+N" chip added, then one chip at a time is
 * dropped until the "+N" fits on those rows as well (never below one chip).
 *
 * Re-measured when `watched` changes (the selection) and when the field's **width** changes; a height change alone is ignored, because hiding chips is what changes the
 * height, and reacting to it would loop.
 *
 * Client only. On the server and wherever layout reports no boxes, every chip shows.
 */
export function useTagRows(
  field: Ref<HTMLElement | null>,
  maxRows: () => number,
  enabled: () => boolean,
  watched: () => unknown
): { visible: Ref<number | null>; measure: () => Promise<void> } {
  const visible = ref<number | null>(null);
  let pending = 0;

  /** The distinct row tops of `selector`'s elements in the field, in order, within a pixel. */
  function rowsOf(el: HTMLElement, selector: string): number[][] {
    const rows: number[] = [];
    const indexes: number[][] = [];
    [...el.querySelectorAll<HTMLElement>(selector)].forEach((item, index) => {
      const top = Math.round(item.getBoundingClientRect().top);
      let row = rows.findIndex((seen) => Math.abs(seen - top) <= 1);
      if (row === -1) {
        rows.push(top);
        indexes.push([]);
        row = rows.length - 1;
      }
      indexes[row]!.push(index);
    });
    return indexes;
  }

  async function measure(): Promise<void> {
    const run = ++pending;
    if (!enabled() || maxRows() <= 0) {
      visible.value = null;
      return;
    }
    visible.value = null;
    await nextTick();
    if (run !== pending || !field.value) return;
    const chipRows = rowsOf(field.value, '[data-part="tag"]');
    if (chipRows.length <= maxRows()) return;
    // Every chip on the rows allowed, then one fewer at a time until the "+N" fits there too.
    let shown = chipRows.slice(0, maxRows()).flat().length;
    while (shown > 1) {
      visible.value = shown;
      await nextTick();
      if (run !== pending || !field.value) return;
      if (rowsOf(field.value, '[data-part="tag"], [data-part="tagMore"]').length <= maxRows())
        return;
      shown -= 1;
    }
    visible.value = 1;
  }

  let lastWidth = -1;
  watch(
    field,
    (el, _previous, onCleanup) => {
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        const width = Math.round(el.getBoundingClientRect().width);
        if (width === lastWidth) return;
        lastWidth = width;
        void measure();
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    },
    { flush: 'post' }
  );

  watch([watched, maxRows, enabled], () => void measure(), { flush: 'post' });

  return { visible, measure };
}
