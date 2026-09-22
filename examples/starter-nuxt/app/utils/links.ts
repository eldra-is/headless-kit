import { stripStega } from '@eldra/theme-core/stega';

/** Allow ordinary site links while rejecting executable and opaque URL schemes. */
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
