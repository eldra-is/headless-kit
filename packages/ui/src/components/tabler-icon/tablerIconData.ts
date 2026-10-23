import { tablerBucketFile } from './bucket';

const buckets = import.meta.glob<Record<string, string>>('./data/*.json', { import: 'default' });

/** The inner SVG markup of an icon by export name, or `null` when Tabler has no such icon. */
export async function tablerIconBody(name: string): Promise<string | null> {
  const load = buckets[`./data/${tablerBucketFile(name)}.json`];
  const bucket = load ? await load() : {};
  return Object.hasOwn(bucket, name) ? (bucket[name] ?? null) : null;
}
