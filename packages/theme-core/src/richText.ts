import { stripStega } from './stega';

/**
 * Ordered ids of every rich-text toolbar control a `block.json` may request
 * in `metadata.toolbar`. §18 v3: the theme no longer renders a toolbar —
 * Studio's overlay editor does — but the list stays here as the single
 * source of truth for the vite-plugin-theme scanner's build-time
 * `metadata.toolbar` validation and theme-vue's block field lookup, so Theme
 * Kit never carries two copies of it.
 *
 * Must stay in sync with the `metadata.toolbar` control ids Core's
 * `richtext.go` validator accepts; a theme whose manifest names an id Core
 * rejects fails ingest.
 */
export const RICH_TEXT_TOOLBAR_CONTROLS = [
  'heading',
  'bold',
  'italic',
  'strike',
  'underline',
  'link',
  'bulletList',
  'orderedList',
  'blockquote',
  'code',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'image',
  'embed',
  'highlight',
  'textColor',
  'undo',
  'redo',
  'table',
] as const;

export type RichTextToolbarControl = (typeof RICH_TEXT_TOOLBAR_CONTROLS)[number];

/**
 * Allow ordinary site links while rejecting executable and opaque URL
 * schemes. Framework-neutral so both the theme-vue rich-text renderer and
 * hand-rolled theme code can share one link/asset-src allowlist. Values are
 * stega-stripped before validation since a themed link target can carry the
 * click-tracking payload from `encodeStega`.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = stripStega(value).trim();
  if (
    href.length === 0 ||
    href.length > 2048 ||
    href.includes('\\') ||
    Array.from(href).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }
  if (href.startsWith('/')) return href.startsWith('//') ? null : href;
  if (href.startsWith('#')) return href;

  try {
    const protocol = new URL(href).protocol;
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(protocol) ? href : null;
  } catch {
    return null;
  }
}
