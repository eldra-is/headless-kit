import { ref, watch, type ComputedRef, type Ref } from 'vue';
import { computed } from '../../utils/scopedComputed';

/**
 * The room an absolutely positioned prefix or suffix row needs on a text field.
 *
 * The field's padding classes reserve room for **one** action (a 2rem button 0.25rem from the
 * edge, plus 0.25rem before the text). A row holding more than that — a spinner, a clear button
 * and a password toggle side by side — would sit over the text. So the row is measured, and only
 * when it is wider than what the class reserves does this return a `padding-inline-*` value: the
 * row's width plus the same 0.5rem the one-action case leaves (0.25rem inset, 0.25rem before the
 * text). A field with no row or one action keeps exactly the padding its classes give it.
 *
 * Client only: the row is measured once mounted and again whenever a `ResizeObserver` reports it
 * changed. On the server, and before the first measurement, the class padding applies.
 */
export function useAdornmentRoom(
  row: Ref<HTMLElement | null>,
  reservedRem: () => number
): ComputedRef<string | undefined> {
  const width = ref(0);
  const remPx = ref(16);

  function measure(): void {
    const el = row.value;
    width.value = el ? el.getBoundingClientRect().width : 0;
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
    if (Number.isFinite(root) && root > 0) remPx.value = root;
  }

  watch(
    row,
    (el, _previous, onCleanup) => {
      if (!el) {
        width.value = 0;
        return;
      }
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    },
    { flush: 'post' }
  );

  return computed(() => {
    if (width.value <= 0) return undefined;
    const needed = width.value + 0.5 * remPx.value;
    // Half a pixel of slack so sub-pixel rounding of a single 2rem action never trips it.
    if (needed <= reservedRem() * remPx.value + 0.5) return undefined;
    return `calc(${width.value}px + 0.5rem)`;
  });
}
