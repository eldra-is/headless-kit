import { onMounted, ref, watch, type Ref } from 'vue';

/** How many labels a summary lists before the trigger has been measured (server, first paint). */
export const UNMEASURED_SUMMARY = 2;

/**
 * How many of a multi-select's chosen labels fit in its trigger beside the "+N" pill.
 *
 * `box` is the summary cell, whose width is set by the trigger alone (it carries
 * `contain: inline-size`, so its labels never widen it and the count cannot feed back into the
 * width it is measured against). `run` is an invisible copy of every label, each in its own
 * `[data-label]` span, laid out on one line; `pill` is an invisible pill holding the widest count.
 * The count is the most labels whose run, plus the gap and the pill when any are left over, fits
 * the cell's content box; never fewer than one, which then truncates with an ellipsis.
 *
 * Client only, re-measured whenever the cell resizes or `labels` change. On the server, before the
 * first measurement, and where layout reports no width (a test DOM), it is `UNMEASURED_SUMMARY`.
 */
export function useSummaryFit(
  box: Ref<HTMLElement | null>,
  run: Ref<HTMLElement | null>,
  pill: Ref<HTMLElement | null>,
  labels: () => readonly string[]
): { count: Ref<number>; mounted: Ref<boolean>; measure: () => void } {
  const count = ref(UNMEASURED_SUMMARY);
  const mounted = ref(false);

  function measure(): void {
    const cell = box.value;
    const line = run.value;
    if (!cell || !line) return;
    const style = getComputedStyle(cell);
    const available =
      cell.getBoundingClientRect().width -
      (parseFloat(style.paddingInlineStart) || 0) -
      (parseFloat(style.paddingInlineEnd) || 0);
    const spans = [...line.querySelectorAll<HTMLElement>('[data-label]')];
    if (available <= 0 || spans.length === 0) {
      count.value = UNMEASURED_SUMMARY;
      return;
    }
    const start = line.getBoundingClientRect().left;
    const gap = parseFloat(style.columnGap) || 0;
    const pillWidth = pill.value?.getBoundingClientRect().width ?? 0;
    let fit = 1;
    for (let shown = spans.length; shown >= 1; shown -= 1) {
      const labelsWidth = spans[shown - 1]!.getBoundingClientRect().right - start;
      const needed = labelsWidth + (shown < spans.length ? gap + pillWidth : 0);
      // Half a pixel of slack so sub-pixel rounding never drops a label that exactly fits.
      if (needed <= available + 0.5) {
        fit = shown;
        break;
      }
    }
    count.value = fit;
  }

  onMounted(() => {
    mounted.value = true;
  });

  watch(
    box,
    (el, _previous, onCleanup) => {
      if (!el || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    },
    { flush: 'post' }
  );

  watch([run, () => labels().join('\u0000')], measure, { flush: 'post' });

  return { count, mounted, measure };
}
