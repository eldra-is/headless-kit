/** Helpers shared by the scanner and the validators it calls. Kept in their own
 * module so nothing has to import back out of `scan.ts`, which would make the
 * graph circular. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drops Unicode Cc (control) and Cf (format) runes, mirroring Core's
 * stripControlRunes, so a title cannot smuggle invisible characters past a
 * length check. */
export function stripPlainTextControls(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '') : '';
}

/** Length in code points, not UTF-16 units: an emoji counts once. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}
