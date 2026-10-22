/**
 * `dist/components.css` is `dist/style.css` with Tailwind's preflight swapped for `reset`, so the
 * two can never disagree about a utility. Throws when the compiled layout is not the one this
 * expects, so a Tailwind upgrade that moves preflight fails the build instead of shipping it.
 *
 * @param {string} style the compiled `dist/style.css`
 * @param {string} reset the CSS that replaces preflight inside `@layer base`
 * @returns {string}
 */
export function withoutPreflight(style, reset) {
  const opening = '\n@layer base {\n';
  const start = style.indexOf(opening);
  if (start === -1 || style.indexOf(opening, start + 1) !== -1) {
    throw new Error('components.css: expected exactly one top-level `@layer base` in style.css');
  }
  const end = style.indexOf('\n}\n', start + opening.length);
  if (end === -1) throw new Error('components.css: `@layer base` in style.css never closes');
  const base = `\n@layer base {\n${reset.trim()}\n}\n`;
  return style.slice(0, start) + base + style.slice(end + '\n}\n'.length);
}
