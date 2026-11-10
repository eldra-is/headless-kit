import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { compile } from '@tailwindcss/node';

const stylesDir = fileURLToPath(new NodeURL('../styles/', import.meta.url));

/**
 * The package's own stylesheet, compiled the way `src/styles/style.css` builds it (`prefix(eldra)`,
 * the theme `inline reference`, utilities in the `components` layer), over exactly `candidates`
 * rather than over a scan of the sources. `extraCss` is appended after it, as a consumer's own
 * stylesheet would be.
 */
export async function compileKitCss(candidates: Iterable<string>, extraCss = ''): Promise<string> {
  const entry = readFileSync(`${stylesDir}style.css`, 'utf8').replace(/^@source .*$/m, '');
  const compiler = await compile(`${entry}\n${extraCss}`, { base: stylesDir, onDependency() {} });
  return compiler.build([...candidates]);
}

/** Every class token in the `class="…"` attributes of rendered `html`. */
export function classCandidates(html: string): Set<string> {
  const candidates = new Set<string>();
  for (const match of html.matchAll(/class="([^"]*)"/g)) {
    for (const name of match[1]!.split(/\s+/)) if (name) candidates.add(name);
  }
  return candidates;
}
