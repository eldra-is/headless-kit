// Shared by scripts/previews.mjs (writes .eldra/previews.json) and
// test/previewsFresh.spec.ts (recomputes and compares it), so the two can
// never drift apart from independently-written hashing logic.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function listBlockIds(rootDir) {
  const blocksDir = join(rootDir, 'blocks');
  return readdirSync(blocksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => existsSync(join(blocksDir, id, 'block.json')))
    .sort();
}

/** sha256 of Block.vue + mock.json + app/assets/main.css, per the previews.json contract. */
export function hashBlock(rootDir, id) {
  const blockDir = join(rootDir, 'blocks', id);
  const hash = createHash('sha256');
  hash.update(readFileSync(join(blockDir, 'Block.vue')));
  hash.update(readFileSync(join(blockDir, 'mock.json')));
  hash.update(readFileSync(join(rootDir, 'app', 'assets', 'main.css')));
  return hash.digest('hex');
}
