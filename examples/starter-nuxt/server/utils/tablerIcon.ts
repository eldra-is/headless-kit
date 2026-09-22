import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripStega } from '@eldra/theme-core/stega';

const require = createRequire(import.meta.url);
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// A theme's mocks and its real entries commonly reuse the same handful of
// icon names many times over (every "Fast"/"Secure"/… feature card, across
// every generated page). Memoize the resolved markup per name so `nuxi
// generate` reads and transforms each icon's SVG file at most once; the
// function's behavior/signature is unchanged (still pure — same input
// always yields the same output — just cached).
const cache = new Map<string, string | null>();

// @tabler/icons publishes a subpath-only export map (`"./*": ["./icons/*"]`)
// and does not export its own `package.json`, so the icons directory cannot
// be located by resolving the package root and joining a path (that resolve
// throws under Node's exports enforcement). Resolving the icon file itself
// through the same export map is both how the package expects to be
// consumed and how we detect a missing icon (resolve throws).
export const tablerIconSvg = (name: string): string | null => {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const svg = resolveTablerIconSvg(name);
  cache.set(name, svg);
  return svg;
};

function resolveTablerIconSvg(rawName: string): string | null {
  // In Studio's preview the icon name arrives from an entry field, which
  // carries the invisible stega click-tracking payload. Strip it before the
  // value is used as an identifier — `NAME` would otherwise reject every
  // icon the moment the theme is opened in the editor. Callers are expected
  // to strip too (see app/composables/useEldraIcon.ts, which keeps the
  // request URL clean); this is the last line of defence.
  const name = stripStega(rawName).trim();
  if (!NAME.test(name)) return null;
  let file: string;
  try {
    file = require.resolve(`@tabler/icons/outline/${name}.svg`);
  } catch {
    return null;
  }
  return readFileSync(file, 'utf8')
    .replace(/\s(width|height)="24"/g, '')
    .replace(/stroke="[^"]*"/, 'stroke="currentColor"')
    .trim();
}
