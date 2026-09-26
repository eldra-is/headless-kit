import { onMounted, watch, type Ref } from 'vue';
import { useEldra } from '@eldrajs/theme-vue';

/**
 * Contract addition #6 (design doc "Contract additions this sub-project
 * makes"): the spec wants every rich-text `<table>` wrapped in a
 * `<div role="region" tabindex="0" aria-label="…">` that scrolls
 * horizontally (blocks spec "Table" → Wrapper) and every `<pre>` focusable
 * so keyboard users can scroll it (blocks spec "Code block" → `<pre>`).
 * `theme-core`'s `richTextTree.ts` renderer emits neither — that package is
 * out of scope for this starter change — so a block that renders
 * `EldraRichText` calls this composable with a ref to that render's root
 * element, and it applies the DOM surgery itself. Documented as a
 * theme-side enhancement, not a renderer change.
 *
 * Runs once on mount and again every time `preview.richTextRenderRevision`
 * changes (§18 v3 — bumped whenever theme-core replaces the rendered rich
 * text, e.g. after a Studio edit), so a re-render's fresh `<table>`/`<pre>`
 * elements get the same treatment. Idempotent: a table already wrapped (or
 * a `<pre>` already marked) is left alone rather than wrapped again.
 *
 * `label` receives the table's own `<caption>` text (`null` when there is
 * none) and returns the wrapper's `aria-label` — callers pass something
 * like `(caption) => caption ? \`${caption} table\` : t('richText.tableRegion')`.
 */
export function useRichTextScrollRegions(
  root: Ref<HTMLElement | null>,
  label: (caption: string | null) => string
): void {
  const context = tryUseEldra();

  function apply(): void {
    const el = root.value;
    if (el === null) return;
    for (const table of Array.from(el.querySelectorAll('table'))) {
      wrapTableInRegion(table, label);
    }
    for (const pre of Array.from(el.querySelectorAll('pre'))) {
      if (!pre.hasAttribute('tabindex')) pre.setAttribute('tabindex', '0');
    }
  }

  onMounted(apply);

  if (context !== undefined) {
    watch(() => context.preview.richTextRenderRevision, apply);
  }
}

const REGION_MARKER = 'data-rich-text-scroll-region';

function wrapTableInRegion(
  table: HTMLTableElement,
  label: (caption: string | null) => string
): void {
  const parent = table.parentElement;
  if (parent === null) return;
  // Idempotent: a table whose immediate parent is already this composable's
  // own wrapper is left alone — never wrapped a second time.
  if (parent.hasAttribute(REGION_MARKER)) return;

  const caption = table.querySelector('caption');
  const captionText = caption?.textContent?.trim() || null;

  const wrapper = document.createElement('div');
  wrapper.setAttribute(REGION_MARKER, '');
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('aria-label', label(captionText));

  parent.insertBefore(wrapper, table);
  wrapper.appendChild(table);
}

function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    return undefined;
  }
}
