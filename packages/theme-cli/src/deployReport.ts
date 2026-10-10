/**
 * What a deploy did to existing content, in the words an author needs.
 *
 * A theme version bump can do two opposite things to a field's stored values,
 * and the response reports both in `syncResult.fieldMigrations`: it can
 * **retire** a field, parking its values under a new id where they are
 * read-only, and it can **convert** them, rewriting them into the new field's
 * own shape so nothing is lost and nothing has to be retyped. Printing only the
 * first half is what made a successful conversion read as data loss — several
 * lines saying the content had become read-only, and no mention of the values
 * the same deploy carried forward.
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

/**
 * One reason rows under a single field could not be carried forward, with the
 * link kind they named and how many rows it accounted for.
 *
 * `reason` is a closed vocabulary, so it prints as a sentence when it is one
 * this version knows and raw otherwise — the same way an unrecognised warning
 * code is still printed rather than swallowed.
 */
export interface DroppedLinkRows {
  reason?: string;
  kind?: string;
  count?: number;
}

/**
 * One field's conversion.
 *
 * The two counts are in **different units**, which is why the line names them
 * separately: `convertedCount` counts entry/variant units rewritten, while
 * `urlFallbacks` counts produced link **rows** stored as a plain url because
 * they named no catalog or CMS destination. One entry holding a twelve-row
 * navigation is one converted entry and up to twelve fallbacks, so printing
 * them under one noun would read as a contradiction.
 *
 * `from` is the outgoing field that was read and `fieldId` the link field that
 * was written; they are often the same id. The block and the field also accept
 * the shorter spellings a gateway may name them by.
 */
export interface ConvertedFieldMigration {
  blockApiId?: string;
  block?: string;
  fieldId?: string;
  field?: string;
  from?: string;
  convertedCount?: number;
  count?: number;
  urlFallbacks?: number;
  dropped?: DroppedLinkRows[];
}

export interface FieldMigrationReport {
  retired?: RetiredFieldMigration[];
  converted?: ConvertedFieldMigration[];
  convertedCount?: number;
  droppedCount?: number;
}

/** The drop reasons this version can say in words. Anything else prints as the
 *  code the gateway sent, so a reason added later is still reported. */
const DROP_REASONS: Readonly<Record<string, string>> = {
  'kind-not-offered': 'the field does not offer that kind',
};

/**
 * Every line a deploy's field migrations are worth printing: the retirements,
 * then for each converted field what it carried forward and one warning per
 * group of rows it could not.
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
  for (const entry of converted) {
    lines.push(convertedLine(entry));
    lines.push(...droppedWarnings(entry));
  }
  // A gateway that reports totals without the per-field breakdown still has
  // something worth saying; a gateway that reports both would repeat itself.
  if (converted.length === 0) {
    const totals = totalsLine(report);
    if (totals !== null) lines.push(totals);
  }
  return lines;
}

function convertedLine(entry: ConvertedFieldMigration): string {
  const parts = [units(count(entry.convertedCount ?? entry.count), 'entry', 'entries')];
  const fallbacks = count(entry.urlFallbacks);
  if (fallbacks > 0)
    parts.push(fallbacks === 1 ? '1 link kept its URL' : `${fallbacks} links kept their URL`);
  return `converted ${where(entry)} (${parts.join(', ')})`;
}

/**
 * One warning per group of dropped rows, naming the kind first: the kind is
 * what an author has to change, and the reason says why.
 */
function droppedWarnings(entry: ConvertedFieldMigration): string[] {
  const target = `${blockOf(entry)}.${fieldOf(entry)}`;
  return asArray(entry.dropped)
    .filter((row) => count(row.count) > 0)
    .map((row) => {
      const rows = count(row.count);
      const kind = typeof row.kind === 'string' && row.kind.trim() !== '' ? ` "${row.kind}"` : '';
      return `warning: dropped ${rows}${kind} ${rows === 1 ? 'row' : 'rows'} from ${target} — ${reasonText(row.reason)}`;
    });
}

/** `block.from → field`: which field was read and which was written. */
function where(entry: ConvertedFieldMigration): string {
  const field = fieldOf(entry);
  const from = typeof entry.from === 'string' && entry.from.trim() !== '' ? entry.from : field;
  return `${blockOf(entry)}.${from} → ${field}`;
}

function blockOf(entry: ConvertedFieldMigration): string {
  return nameOf(entry.blockApiId ?? entry.block);
}

function fieldOf(entry: ConvertedFieldMigration): string {
  return nameOf(entry.fieldId ?? entry.field);
}

function reasonText(reason: unknown): string {
  const code = nameOf(reason);
  return DROP_REASONS[code] ?? code;
}

function totalsLine(report: FieldMigrationReport): string | null {
  const converted = count(report.convertedCount);
  const dropped = count(report.droppedCount);
  if (converted === 0 && dropped === 0) return null;
  if (converted === 0) return `dropped ${units(dropped, 'row', 'rows')} during the link conversion`;
  const clauses = [`converted ${units(converted, 'entry', 'entries')} into link fields`];
  if (dropped > 0) clauses.push(`${dropped} dropped`);
  return clauses.join('; ');
}

function units(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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
