const CHUNK_ERROR =
  /dynamically imported module|importing a module script failed|error loading dynamically imported module/i;

export function isChunkError(error: unknown): boolean {
  return CHUNK_ERROR.test(error instanceof Error ? error.message : String(error));
}

/** One reload per window of `windowMs`, so a chunk that stays missing cannot reload the page forever. */
export function shouldReload(now: number, lastReloadAt: number | null, windowMs = 30_000): boolean {
  return lastReloadAt === null || now - lastReloadAt > windowMs;
}
