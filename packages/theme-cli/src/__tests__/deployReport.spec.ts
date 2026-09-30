import { describe, expect, it } from 'vitest';
import { fieldMigrationLines, type FieldMigrationReport } from '../deployReport';

const RETIRED = {
  blockApiId: 'navigation',
  fieldId: 'links',
  retiredAs: 'links__v2',
  fromVersion: 2,
  reason: 'shape-changed' as const,
  migratedCount: 5,
};

/**
 * The gateway's own payload, key for key, so the printer is pinned to the
 * shape it actually receives rather than to a convenient paraphrase of it.
 * `converted` is always present and `[]` when nothing converted; `dropped` is
 * always present and `[]` when nothing was refused.
 */
const GATEWAY_REPORT: FieldMigrationReport = {
  convertedCount: 2,
  droppedCount: 3,
  converted: [
    {
      blockApiId: 'navigation',
      fieldId: 'links',
      from: 'links',
      convertedCount: 2,
      urlFallbacks: 44,
      dropped: [
        { reason: 'kind-not-offered', kind: 'none', count: 1 },
        { reason: 'kind-not-offered', kind: 'product', count: 2 },
      ],
    },
  ],
};

describe('fieldMigrationLines', () => {
  it('prints nothing when the deploy reports no field migrations', () => {
    expect(fieldMigrationLines(undefined)).toEqual([]);
    expect(fieldMigrationLines({})).toEqual([]);
    expect(fieldMigrationLines({ converted: [], convertedCount: 0, droppedCount: 0 })).toEqual([]);
  });

  it('prints one line per retired field', () => {
    expect(fieldMigrationLines({ retired: [RETIRED] })).toEqual([
      'retired navigation.links → links__v2 (shape-changed, 5 entries) — previous content is read-only in Studio',
    ]);
  });

  /**
   * The point of the whole report: the same deploy that retired a field is
   * usually the one that carried its values forward, and printing only the
   * retirement told the operator their content had become read-only while
   * saying nothing about the values the deploy had just rewritten.
   */
  it('prints the gateway payload as the conversion summary, beside the retirement', () => {
    expect(fieldMigrationLines({ ...GATEWAY_REPORT, retired: [RETIRED] })).toEqual([
      'retired navigation.links → links__v2 (shape-changed, 5 entries) — previous content is read-only in Studio',
      'converted navigation.links → links (2 entries, 44 links kept their URL)',
      'warning: dropped 1 "none" row from navigation.links — the field does not offer that kind',
      'warning: dropped 2 "product" rows from navigation.links — the field does not offer that kind',
    ]);
  });

  /**
   * The two counts are in different units — entry/variant units rewritten
   * against produced link rows — so the line names them separately rather than
   * under one noun, where 1 and 12 would read as a contradiction.
   */
  it('keeps the entry count and the row count in their own units', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            blockApiId: 'footer',
            fieldId: 'groups',
            from: 'groups',
            convertedCount: 1,
            urlFallbacks: 12,
          },
        ],
      })
    ).toEqual(['converted footer.groups → groups (1 entry, 12 links kept their URL)']);
  });

  it('says which field was read when it is not the one written', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            blockApiId: 'hero',
            fieldId: 'cta',
            from: 'ctaHref',
            convertedCount: 3,
            urlFallbacks: 1,
          },
        ],
      })
    ).toEqual(['converted hero.ctaHref → cta (3 entries, 1 link kept its URL)']);
  });

  it('leaves out the fallback clause when every row resolved to a real destination', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            blockApiId: 'navigation',
            fieldId: 'links',
            from: 'links',
            convertedCount: 4,
            urlFallbacks: 0,
            dropped: [],
          },
        ],
      })
    ).toEqual(['converted navigation.links → links (4 entries)']);
  });

  /**
   * A field that converted nothing and dropped everything still gets an entry
   * from the gateway — that is the case the report exists to make visible — so
   * it must still print, warnings and all.
   */
  it('prints a field whose every row was dropped', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            blockApiId: 'navigation',
            fieldId: 'links',
            from: 'links',
            convertedCount: 0,
            urlFallbacks: 0,
            dropped: [{ reason: 'kind-not-offered', kind: 'category', count: 5 }],
          },
        ],
      })
    ).toEqual([
      'converted navigation.links → links (0 entries)',
      'warning: dropped 5 "category" rows from navigation.links — the field does not offer that kind',
    ]);
  });

  it('prints one line per converted field', () => {
    expect(
      fieldMigrationLines({
        converted: [
          { blockApiId: 'navigation', fieldId: 'links', from: 'links', convertedCount: 4 },
          {
            blockApiId: 'footer',
            fieldId: 'legalLinks',
            from: 'legalLinks',
            convertedCount: 1,
            urlFallbacks: 1,
          },
        ],
      })
    ).toEqual([
      'converted navigation.links → links (4 entries)',
      'converted footer.legalLinks → legalLinks (1 entry, 1 link kept its URL)',
    ]);
  });

  /**
   * `reason` is a closed vocabulary today, but a later gateway may add to it.
   * An unknown code is printed raw rather than swallowed, the way an
   * unrecognised warning code is.
   */
  it('prints a drop reason it does not know as the code it was sent', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            blockApiId: 'navigation',
            fieldId: 'links',
            from: 'links',
            convertedCount: 1,
            dropped: [{ reason: 'unusable-href', kind: 'url', count: 2 }],
          },
        ],
      })
    ).toEqual([
      'converted navigation.links → links (1 entry)',
      'warning: dropped 2 "url" rows from navigation.links — unusable-href',
    ]);
  });

  it('falls back to the totals when a gateway reports no per-field breakdown', () => {
    expect(fieldMigrationLines({ convertedCount: 44, droppedCount: 2 })).toEqual([
      'converted 44 entries into link fields; 2 dropped',
    ]);
    expect(fieldMigrationLines({ convertedCount: 1 })).toEqual([
      'converted 1 entry into link fields',
    ]);
    expect(fieldMigrationLines({ droppedCount: 3 })).toEqual([
      'dropped 3 rows during the link conversion',
    ]);
  });

  it('does not repeat itself when the gateway sends the breakdown and the totals', () => {
    expect(
      fieldMigrationLines(GATEWAY_REPORT).filter((line) => line.startsWith('converted '))
    ).toEqual(['converted navigation.links → links (2 entries, 44 links kept their URL)']);
  });

  /**
   * Every part of the breakdown is optional and a newer gateway may add keys
   * this version does not know, so the printer reads what it recognises and
   * never throws on the rest.
   */
  it('tolerates a payload whose shape it does not fully know', () => {
    const report = {
      converted: [
        { block: 'navigation', field: 'links', count: 3, note: 'from the engine' },
        { count: 1, dropped: 'not an array' },
      ],
      somethingNew: { totals: 1 },
    } as unknown as FieldMigrationReport;

    expect(fieldMigrationLines(report)).toEqual([
      'converted navigation.links → links (3 entries)',
      'converted ?.? → ? (1 entry)',
    ]);
  });
});
