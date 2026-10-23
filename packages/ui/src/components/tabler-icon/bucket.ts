// scripts/build-tabler-icons.mjs imports this file too, so generator and runtime agree on every bucket.
export const TABLER_BUCKET_COUNT = 512;

/** The data file holding an icon: FNV-1a over its export name, `000` to `511`. */
export function tablerBucketFile(name: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return String((hash >>> 0) % TABLER_BUCKET_COUNT).padStart(3, '0');
}
