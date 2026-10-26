import { tablerIconName } from './tablerIconName';

const bodies = new Map<string, string | null>();
const warned = new Set<string>();

export function warnTablerIconOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[@eldrajs/ui] TablerIcon: ${message}`);
}

/** An icon's markup once loaded: a string, `null` for a name Tabler does not have, `undefined` before it loads. */
export function cachedTablerIcon(name: string): string | null | undefined {
  return bodies.get(name);
}

/** Loads an icon's markup by export name: `null` for an unknown name, `undefined` for a failed load. Never rejects. */
export async function loadTablerIcon(name: string): Promise<string | null | undefined> {
  const cached = bodies.get(name);
  if (cached !== undefined) return cached;
  try {
    const { tablerIconBody } = await import('./tablerIconData');
    const body = await tablerIconBody(name);
    bodies.set(name, body);
    if (body === null)
      warnTablerIconOnce(name, `no Tabler icon is named "${name}"; it renders empty.`);
    return body;
  } catch (error) {
    warnTablerIconOnce(`load:${name}`, `"${name}" could not be loaded (${String(error)}).`);
    return undefined;
  }
}

/** Loads the named icons ahead of render, so a page rendered in the browser draws them in its first frame. */
export async function preloadTablerIcons(
  values: string | Iterable<string | null | undefined>
): Promise<void> {
  const names = new Set<string>();
  for (const value of typeof values === 'string' ? [values] : values) {
    const name = value ? tablerIconName(value) : null;
    if (name !== null) names.add(name);
  }
  await Promise.all([...names].map(loadTablerIcon));
}
