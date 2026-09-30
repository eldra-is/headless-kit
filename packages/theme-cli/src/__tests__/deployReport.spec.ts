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

describe('fieldMigrationLines', () => {
  it('prints nothing when the deploy reports no field migrations', () => {
    expect(fieldMigrationLines(undefined)).toEqual([]);
    expect(fieldMigrationLines({})).toEqual([]);
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
   * saying nothing about the 44 values the deploy had just rewritten.
   */
  it('prints the conversion beside the retirement', () => {
    expect(
      fieldMigrationLines({
        retired: [RETIRED],
        converted: [{ block: 'navigation', field: 'links', count: 44, urlFallbacks: 44 }],
      })
    ).toEqual([
      'retired navigation.links → links__v2 (shape-changed, 5 entries) — previous content is read-only in Studio',
      'converted 44 values in navigation.links; 44 kept as plain URLs',
    ]);
  });

  it('names every drop reason with its count', () => {
    expect(
      fieldMigrationLines({
        converted: [
          {
            block: 'footer',
            field: 'groups',
            count: 12,
            urlFallbacks: 3,
            dropped: [
              { reason: 'kind not offered by the field', count: 2 },
              { reason: 'href the platform does not store', count: 1 },
            ],
          },
        ],
      })
    ).toEqual([
      'converted 12 values in footer.groups; 3 kept as plain URLs; 3 dropped: kind not offered by the field ×2, href the platform does not store ×1',
    ]);
  });

  it('prints one line per converted field', () => {
    expect(
      fieldMigrationLines({
        converted: [
          { block: 'navigation', field: 'links', count: 4 },
          { block: 'footer', field: 'legalLinks', count: 1, urlFallbacks: 1 },
        ],
      })
    ).toEqual([
      'converted 4 values in navigation.links',
      'converted 1 value in footer.legalLinks; 1 kept as a plain URL',
    ]);
  });

  it('leaves out a clause the deploy has nothing to say under', () => {
    expect(
      fieldMigrationLines({
        converted: [{ block: 'hero', field: 'cta', count: 2, urlFallbacks: 0, dropped: [] }],
      })
    ).toEqual(['converted 2 values in hero.cta']);
  });

  it('falls back to the totals when a gateway reports no per-field breakdown', () => {
    expect(fieldMigrationLines({ convertedCount: 44, droppedCount: 2 })).toEqual([
      'converted 44 values into link fields; 2 dropped',
    ]);
    expect(fieldMigrationLines({ convertedCount: 44 })).toEqual([
      'converted 44 values into link fields',
    ]);
  });

  it('does not repeat itself when the gateway sends the breakdown and the totals', () => {
    expect(
      fieldMigrationLines({
        converted: [{ block: 'navigation', field: 'links', count: 44, urlFallbacks: 44 }],
        convertedCount: 44,
        droppedCount: 0,
      })
    ).toEqual(['converted 44 values in navigation.links; 44 kept as plain URLs']);
  });

  /**
   * The retirement half of the same report names a field
   * `blockApiId`/`fieldId`, so a gateway may name the conversion half either
   * way. Both read the same line rather than one of them reading `?.?`.
   */
  it('reads the block and the field under either spelling', () => {
    expect(
      fieldMigrationLines({
        converted: [
          { blockApiId: 'footer', fieldId: 'legalLinks', convertedCount: 2 },
          {
            blockApiId: 'navigation',
            fieldId: 'links',
            convertedCount: 6,
            dropped: [{ kind: 'category', count: 1 }],
          },
        ],
      })
    ).toEqual([
      'converted 2 values in footer.legalLinks',
      'converted 6 values in navigation.links; 1 dropped: category ×1',
    ]);
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
        { count: 1 },
      ],
      dropped: 'not an array',
      somethingNew: { totals: 1 },
    } as unknown as FieldMigrationReport;

    expect(fieldMigrationLines(report)).toEqual([
      'converted 3 values in navigation.links',
      'converted 1 value in ?.?',
    ]);
  });
});
