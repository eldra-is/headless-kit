/**
 * What a deploy did to existing content, in the words an author needs.
 *
 * A theme version bump can do two opposite things to a field's stored values,
 * and the response reports both in `syncResult.fieldMigrations`: it can
 * **retire** a field, parking its values under a new id where they are
 * read-only, and it can **convert** them, rewriting them into the new field's
 * own shape so nothing is lost and nothing has to be retyped. Printing only the
 * first half is what made a successful conversion read as data loss — five
 * lines saying content was retired, and no mention of the values the same
 * deploy carried forward.
 *
 * The shape is read defensively on purpose: every part of the breakdown is
 * optional, so a newer CLI against an older gateway prints what it is given and
 * a newer gateway may add keys this version does not know.
 */

export interface RetiredFieldMigration {
  blockApiId: string;
  fieldId: string;
  retiredAs: string;
  fromVersion: number;
  reason: 'type-changed' | 'localization-changed' | 'shape-changed' | 'removed';
  migratedCount: number;
}

/** One reason values under a single field could not be carried forward, with
 *  how many rows it accounted for. */
export interface DroppedLinkRows {
  reason?: string;
  /** What a gateway that names the shape rather than the cause calls it. */
  kind?: string;
  count?: number;
}

/** One field's conversion: how many values were rewritten, how many of them
 *  kept their plain href because no catalog object matched, and what was left
 *  behind. The block and the field each accept both spellings a gateway may
 *  name them by, so the line reads correctly either way. */
export interface ConvertedFieldMigration {
  block?: string;
  blockApiId?: string;
  field?: string;
  fieldId?: string;
  count?: number;
  convertedCount?: number;
  urlFallbacks?: number;
  dropped?: DroppedLinkRows[];
}

export interface FieldMigrationReport {
  retired?: RetiredFieldMigration[];
  converted?: ConvertedFieldMigration[];
  convertedCount?: number;
  droppedCount?: number;
}

/**
 * Every line a deploy's field migrations are worth printing, in order: the
 * retirements first, then one line per converted field.
 *
 * Returned rather than logged so the wording is testable on its own — the
 * deploy command only forwards these to its logger.
 */
export function fieldMigrationLines(report: FieldMigrationReport | undefined | null): string[] {
  if (report === undefined || report === null || typeof report !== 'object') return [];
  const lines: string[] = [];
  for (const retired of asArray(report.retired)) {
    lines.push(
      `retired ${retired.blockApiId}.${retired.fieldId} → ${retired.retiredAs} (${retired.reason}, ${retired.migratedCount} entries) — previous content is read-only in Studio`
    );
  }
  const converted = asArray(report.converted);
  for (const entry of converted) lines.push(convertedLine(entry));
  // A gateway that reports totals without the per-field breakdown still has
  // something worth saying; a gateway that reports both would repeat itself.
  if (converted.length === 0) {
    const totals = totalsLine(report);
    if (totals !== null) lines.push(totals);
  }
  return lines;
}

function convertedLine(entry: ConvertedFieldMigration): string {
  const where = `${nameOf(entry.block ?? entry.blockApiId)}.${nameOf(entry.field ?? entry.fieldId)}`;
  const clauses = [`converted ${values(count(entry.count ?? entry.convertedCount))} in ${where}`];
  const fallbacks = count(entry.urlFallbacks);
  if (fallbacks > 0)
    clauses.push(`${fallbacks} kept as ${fallbacks === 1 ? 'a plain URL' : 'plain URLs'}`);
  const dropped = asArray(entry.dropped).filter((row) => count(row.count) > 0);
  const droppedTotal = dropped.reduce((total, row) => total + count(row.count), 0);
  if (droppedTotal > 0) {
    const reasons = dropped
      .map((row) => `${nameOf(row.reason ?? row.kind)} ×${count(row.count)}`)
      .join(', ');
    clauses.push(`${droppedTotal} dropped: ${reasons}`);
  }
  return clauses.join('; ');
}

function totalsLine(report: FieldMigrationReport): string | null {
  const converted = count(report.convertedCount);
  const dropped = count(report.droppedCount);
  if (converted === 0 && dropped === 0) return null;
  const clauses = [`converted ${values(converted)} into link fields`];
  if (dropped > 0) clauses.push(`${dropped} dropped`);
  return clauses.join('; ');
}

function values(n: number): string {
  return `${n} ${n === 1 ? 'value' : 'values'}`;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function nameOf(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value : '?';
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
