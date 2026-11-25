import { createRouter, toRouteMatcher } from 'radix3';

/** What a path with no built file is: a page gets the site's 404 page, anything else a bare 404. */
export function isPagePath(path: string): boolean {
  if (/\/\./.test(path)) return false;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return !/\.[a-z0-9]+$/i.test(last);
}

/** Matches route patterns in Nitro's syntax (`/api/**`, `/products/:slug`, `/coming-soon`). */
export function createLiveMatcher(patterns: readonly string[]): (path: string) => boolean {
  if (!patterns.length) return () => false;
  const router = createRouter({ routes: Object.fromEntries(patterns.map((route) => [route, {}])) });
  const rules = toRouteMatcher(router);
  // Nitro routes a handler with `lookup` (`/**:slug`, `/:name.xml`), route rules with `matchAll`.
  return (path) => {
    const pathname = path.split('?')[0] || '/';
    return router.lookup(pathname) !== null || rules.matchAll(pathname).length > 0;
  };
}
