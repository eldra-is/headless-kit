import { stripStega } from '@eldrajs/theme-core/stega';

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

/**
 * A destination the site itself owns — a path (`/shop`) or an in-page hash
 * (`#main`). These are the links that should route client-side, which is what
 * `@eldrajs/ui`'s `Link` does when it is given Nuxt's `<NuxtLink>` as `as`
 * (see `app/components/EldraRouterLink.vue`); everything else (an absolute URL,
 * `mailto:`, `tel:`) is a document navigation and stays a plain `<a>`.
 *
 * Call it on the output of `safeHref`, never on a raw field value.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#');
}
