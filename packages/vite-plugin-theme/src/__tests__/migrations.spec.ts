import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanTheme } from '../scan';
import type { BlockField, ThemeManifest } from '../types';

const field = (fieldId: string, type = 'string', extra = {}): BlockField => ({
  fieldId,
  name: fieldId,
  type,
  ...extra,
});
const step = (version = 2, from = 'titl', to = 'title') => ({ version, renames: [{ from, to }] });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eldra-migrations-'));
  cpSync(fileURLToPath(new URL('./fixtures/valid-theme', import.meta.url)), root, {
    recursive: true,
  });
  const write = (fields: BlockField[], version: number, migrations?: unknown) => {
    writeFileSync(
      join(root, 'blocks/hero/block.json'),
      JSON.stringify({
        apiId: 'hero',
        name: 'Hero',
        version,
        fields,
        ...(migrations === undefined ? {} : { migrations }),
      })
    );
  };
  const scan = (previousManifest?: ThemeManifest) =>
    scanTheme({ themeDir: root, previousManifest });
  return { root, write, scan };
}

describe('block field migrations', () => {
  it('emits valid declarations without inventing previous schema history', () => {
    const f = fixture();
    f.write([field('title')], 2, [step()]);
    const result = f.scan();
    expect(result.errors).toEqual([]);
    expect(result.manifest?.blocks.find((b) => b.apiId === 'hero')?.migrations).toEqual([step()]);
    f.write([field('title')], 2, [{ version: 2, renames: [] }]);
    expect(f.scan().errors).toEqual([]);
  });

  it.each([
    ['null array', null],
    ['object array', {}],
    ['null step', [null]],
    ['missing renames', [{ version: 2 }]],
    ['null renames', [{ version: 2, renames: null }]],
    ['null pair', [{ version: 2, renames: [null] }]],
    ['extra step key', [{ ...step(), conversion: 'string' }]],
    ['extra rename key', [{ version: 2, renames: [{ from: 'titl', to: 'title', default: '' }] }]],
    ['nonstring source', [{ version: 2, renames: [{ from: 1, to: 'title' }] }]],
    ['nonstring target', [{ version: 2, renames: [{ from: 'titl', to: false }] }]],
    ['nested source', [step(2, 'outer.titl')]],
    ['nested target', [step(2, 'titl', 'outer.title')]],
    ['wrong casing', [{ Version: 2, renames: [{ from: 'titl', to: 'title' }] }]],
    ['fractional version', [step(2.5)]],
    ['version one', [step(1)]],
    [
      'too many renames',
      [
        {
          version: 2,
          renames: Array.from({ length: 33 }, (_, i) => ({ from: `old${i}`, to: 'title' })),
        },
      ],
    ],
  ])('rejects malformed %s without crashing', (_name, migrations) => {
    const f = fixture();
    f.write([field('title')], 3, migrations);
    expect(() => f.scan()).not.toThrow();
    expect(f.scan().manifest).toBeNull();
    expect(f.scan().errors.join('\n')).toContain('blocks/hero/block.json:');
  });

  it.each([
    ['future step', [step(3)], 'version'],
    ['duplicate versions', [step(), step()], 'unique'],
    ['same field', [step(2, 'title')], 'distinct'],
    ['missing destination', [step(2, 'titl', 'missing')], 'destination'],
    [
      'duplicate source',
      [
        {
          version: 2,
          renames: [
            { from: 'titl', to: 'title' },
            { from: 'titl', to: 'other' },
          ],
        },
      ],
      'unique',
    ],
    [
      'duplicate target',
      [
        {
          version: 2,
          renames: [
            { from: 'titl', to: 'title' },
            { from: 'other', to: 'title' },
          ],
        },
      ],
      'unique',
    ],
  ])('rejects declaration semantics: %s', (_name, migrations, reason) => {
    const f = fixture();
    f.write([field('title'), field('other')], 2, migrations);
    expect(f.scan().manifest).toBeNull();
    expect(f.scan().errors.join('\n')).toContain(reason);
  });

  it('checks pending sources against the prior local schema and accepts unchanged redeploys', () => {
    const f = fixture();
    f.write([field('titl')], 1);
    const previous = f.scan().manifest!;
    f.write([field('title')], 2, [step()]);
    const current = f.scan(previous);
    expect(current.errors).toEqual([]);
    expect(f.scan(current.manifest!).errors).toEqual([]);
    f.write([field('title')], 3, [step(3, 'missing')]);
    expect(f.scan(previous).errors.join('\n')).toContain('source');
    f.write([field('title')], 2, [step()]);
    const noBump = {
      ...previous,
      blocks: previous.blocks.map((b) => (b.apiId === 'hero' ? { ...b, version: 2 } : b)),
    };
    expect(f.scan(noBump).errors.join('\n')).toContain('new version bump');
  });

  it.each([
    ['repeated source', [step(3, 'titl', 'other'), step()]],
    ['repeated target', [step(3, 'other'), step()]],
    ['chain', [step(3, 'title', 'other'), step()]],
  ])('rejects pending %s without intermediate history', (_name, migrations) => {
    const f = fixture();
    f.write([field('titl'), field('title'), field('other')], 1);
    const previous = f.scan().manifest!;
    f.write([field('title'), field('other')], 3, migrations);
    expect(f.scan(previous).errors.join('\n')).toContain('intermediate');
    expect(f.scan().errors).toEqual([]); // No installed history can be inferred in fresh CI.
  });

  it.each([
    ['scalar type', field('titl'), field('title', 'number'), false],
    ['localization', field('titl', 'string', { localized: true }), field('title'), false],
    [
      'media default true',
      field('titl', 'media'),
      field('title', 'media', { metadata: { multiple: true } }),
      true,
    ],
    [
      'media cardinality',
      field('titl', 'media'),
      field('title', 'media', { metadata: { multiple: false } }),
      false,
    ],
    [
      'select default false',
      field('titl', 'select'),
      field('title', 'select', { metadata: { multiple: false, options: ['new'] } }),
      true,
    ],
    [
      'select cardinality',
      field('titl', 'select'),
      field('title', 'select', { metadata: { multiple: true } }),
      false,
    ],
    [
      'reference cardinality',
      field('titl', 'reference', { relation: { allowedTagIds: ['old'] } }),
      field('title', 'reference', { relation: { allowedTagIds: ['new'], multiple: true } }),
      false,
    ],
    [
      'presentation',
      field('titl'),
      field('title', 'string', { localized: false, name: 'New', validators: { required: true } }),
      true,
    ],
  ])('preserves storage shape: %s', (_name, oldField, nextField, compatible) => {
    const f = fixture();
    f.write([oldField], 1);
    const previous = f.scan().manifest!;
    f.write([nextField], 2, [step()]);
    const result = f.scan(previous);
    if (compatible) expect(result.errors).toEqual([]);
    else expect(result.errors.join('\n')).toContain('storage shape');
  });

  it('compares recursive list/composite children by identity, not order or labels', () => {
    const nested = (id: string, children: BlockField[]) =>
      field(id, 'list', {
        metadata: { item: field('item', 'composite', { metadata: { fields: children } }) },
      });
    const f = fixture();
    f.write([nested('titl', [field('first'), field('second', 'media')])], 1);
    const previous = f.scan().manifest!;
    f.write([nested('title', [field('second', 'media'), { ...field('first'), name: 'New' }])], 2, [
      step(),
    ]);
    expect(f.scan(previous).errors).toEqual([]);
    f.write([nested('title', [field('first')])], 2, [step()]);
    expect(f.scan(previous).errors.join('\n')).toContain('storage shape');
  });

  it('rejects invalid advisory history instead of assuming a source schema', () => {
    const f = fixture();
    f.write([field('title')], 2, [step()]);
    expect(
      f.scan({ manifestVersion: 99, blocks: [] } as unknown as ThemeManifest).errors.join('\n')
    ).toContain('previous manifest');
    const previous = f.scan().manifest!;
    const corrupted = {
      ...previous,
      blocks: previous.blocks.map((b) =>
        b.apiId === 'hero'
          ? { ...b, fields: [field('titl', 'composite', { metadata: { fields: null } })] }
          : b
      ),
    };
    expect(f.scan(corrupted).errors.join('\n')).toContain('previous manifest');
  });

  it('requires a version bump for a same-id type change', () => {
    const f = fixture();
    f.write([field('title')], 1);
    const previous = f.scan().manifest!;
    f.write([field('title', 'media')], 1);
    expect(f.scan(previous).errors.join('\n')).toContain(
      'field title changed type (string → media); bump "version" to 2 so Core retires the previous content'
    );
    f.write([field('title', 'media')], 2);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('requires a version bump for a same-id localization change', () => {
    const f = fixture();
    f.write([field('title')], 1);
    const previous = f.scan().manifest!;
    f.write([field('title', 'string', { localized: true })], 1);
    expect(f.scan(previous).errors.join('\n')).toContain(
      'field title changed localization; bump "version" to 2 so Core retires the previous content'
    );
    f.write([field('title', 'string', { localized: true })], 2);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('requires a version bump for a same-id nested child change', () => {
    const composite = (children: BlockField[]) =>
      field('group', 'composite', { metadata: { fields: children } });
    const f = fixture();
    f.write([composite([field('image', 'media')])], 1);
    const previous = f.scan().manifest!;
    f.write([composite([field('image', 'string')])], 1);
    expect(f.scan(previous).errors.join('\n')).toContain(
      'field group changed storage shape (media multiplicity / nested field); bump "version" to 2 so Core retires the previous content'
    );
    f.write([composite([field('image', 'string')])], 2);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('requires a version bump for a same-id cardinality-only change', () => {
    const f = fixture();
    f.write([field('gallery', 'media', { metadata: { multiple: true } })], 1);
    const previous = f.scan().manifest!;
    f.write([field('gallery', 'media', { metadata: { multiple: false } })], 1);
    expect(f.scan(previous).errors.join('\n')).toContain(
      'field gallery changed storage shape (media multiplicity / nested field); bump "version" to 2 so Core retires the previous content'
    );
    f.write([field('gallery', 'media', { metadata: { multiple: false } })], 2);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('requires a version bump for a field removed without a declared rename', () => {
    const f = fixture();
    f.write([field('title'), field('subtitle')], 1);
    const previous = f.scan().manifest!;
    f.write([field('title')], 1);
    expect(f.scan(previous).errors.join('\n')).toContain(
      'field subtitle was removed; bump "version" to 2 so Core retires the previous content'
    );
    f.write([field('title')], 2);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('does not double-report a field removed via a declared rename', () => {
    // A rename declared at the previous local version, without a bump, is
    // already refused by the existing "destructive rename" check — this must
    // not *also* report the source field as an unrelated "was removed".
    const f = fixture();
    f.write([field('titl')], 2);
    const previous = f.scan().manifest!;
    f.write([field('title')], 2, [step()]);
    const result = f.scan(previous);
    expect(result.errors.join('\n')).toContain('destructive rename requires a new version bump');
    expect(result.errors.join('\n')).not.toContain('was removed');
  });

  it('rejects duplicate migration JSON keys using the existing file parser', () => {
    const f = fixture();
    writeFileSync(
      join(f.root, 'blocks/hero/block.json'),
      '{"apiId":"hero","name":"Hero","version":2,"fields":[{"fieldId":"title","name":"Title","type":"string"}],"migrations":[{"version":2,"version":2,"renames":[]}]}'
    );
    expect(f.scan().errors.join('\n')).toContain('duplicate object key');
  });
});

it('accepts 32 unique renames and rejects the 33rd at the schema boundary', () => {
  const f = fixture();
  const renames = Array.from({ length: 33 }, (_, index) => ({
    from: `old${index}`,
    to: `next${index}`,
  }));
  const fields = renames.map((rename) => field(rename.to));
  f.write(fields, 2, [{ version: 2, renames: renames.slice(0, 32) }]);
  expect(f.scan().errors).toEqual([]);
  f.write(fields, 2, [{ version: 2, renames }]);
  expect(f.scan().errors.join('\n')).toContain('must NOT have more than 32 items');
});

it.each([
  ['child type', field('image', 'string')],
  ['child localization', field('image', 'media', { localized: true })],
  ['child cardinality', field('image', 'media', { metadata: { multiple: false } })],
  ['child identity', field('renamed', 'media')],
])('rejects nested %s changes', (_name, child) => {
  const composite = (id: string, inner: BlockField) =>
    field(id, 'composite', { metadata: { fields: [inner] } });
  const f = fixture();
  f.write([composite('titl', field('image', 'media'))], 1);
  const previous = f.scan().manifest!;
  f.write([composite('title', child)], 2, [step()]);
  expect(f.scan(previous).errors.join('\n')).toContain('storage shape');
});

it('keeps reference default cardinality while allowing tag changes', () => {
  const f = fixture();
  f.write([field('titl', 'reference', { relation: { allowedTagIds: ['old'] } })], 1);
  const previous = f.scan().manifest!;
  f.write(
    [field('title', 'reference', { relation: { allowedTagIds: ['new'], multiple: false } })],
    2,
    [step()]
  );
  expect(f.scan(previous).errors).toEqual([]);
});

describe.each(['composite', 'list'])('stored %s children', (container) => {
  const nested = (id: string, child: BlockField) =>
    field(id, container, {
      metadata: container === 'list' ? { item: child } : { fields: [child] },
    });

  it.each([
    ['unknown type', field('child', 'unknown')],
    ['array metadata', field('child', 'media', { metadata: [] })],
    ['scalar metadata', field('child', 'select', { metadata: false })],
    ['array relation', field('child', 'reference', { relation: [] })],
    ['scalar relation', field('child', 'reference', { relation: 'single' })],
    [
      'string relation cardinality',
      field('child', 'reference', { relation: { multiple: 'false' } }),
    ],
    ['numeric relation cardinality', field('child', 'reference', { relation: { multiple: 0 } })],
    ['invalid product flag', field('child', 'reference', { relation: { allowProducts: 'false' } })],
    ['invalid tag container', field('child', 'reference', { relation: { allowedTagIds: 'old' } })],
    [
      'invalid schema identity',
      field('child', 'reference', { relation: { allowedSchemaIds: [42] } }),
    ],
    ['invalid description', field('child', 'string', { description: [] })],
    ['invalid title flag', field('child', 'string', { isTitle: 'false' })],
    ['array validators', field('child', 'string', { validators: [] })],
    ['invalid validator number', field('child', 'string', { validators: { min: '1' } })],
    ['invalid validator boolean', field('child', 'string', { validators: { required: 1 } })],
    ['invalid pattern container', field('child', 'string', { validators: { match: [] } })],
    [
      'invalid pattern string',
      field('child', 'string', { validators: { prohibit: { custom: 42 } } }),
    ],
    ['unknown validator', field('child', 'string', { validators: { obsolete: true } })],
    [
      'cased relation cardinality',
      field('child', 'reference', { relation: { Multiple: 'false' } }),
    ],
    ['cased relation container', field('child', 'reference', { Relation: [] })],
    ['cased metadata container', field('child', 'media', { Metadata: [] })],
    ['cased optional string', field('child', 'string', { DESCRIPTION: 42 })],
    ['cased localization', field('child', 'string', { Localized: 'false' })],
    ['cased pattern string', field('child', 'string', { validators: { match: { Custom: 42 } } })],
    ['Unicode-folded optional string', field('child', 'string', { deſcription: 42 })],
    [
      'ambiguous relation aliases',
      field('child', 'reference', { relation: { multiple: false, Multiple: true } }),
    ],
    ['ambiguous field aliases', field('child', 'string', { localized: false, Localized: true })],
    [
      'ambiguous pattern aliases',
      field('child', 'string', { validators: { match: { custom: 'old', Custom: 'new' } } }),
    ],
  ])('rejects historical %s before comparing storage', (_name, child) => {
    const f = fixture();
    const type = child.type === 'unknown' ? 'string' : child.type;
    f.write([nested('titl', field('child', type))], 1);
    const previous = f.scan().manifest!;
    previous.blocks.find((b) => b.apiId === 'hero')!.fields = [nested('titl', child)];
    f.write([nested('title', field('child', type))], 2, [step()]);
    const result = f.scan(previous);
    expect(result.manifest).toBeNull();
    expect(result.errors.join('\n')).toContain('previous manifest:');
    expect(result.errors.join('\n')).toContain('invalid recursive field storage shape');
  });

  it.each([
    [
      'media fallback',
      field('child', 'media', { metadata: { multiple: 'legacy', options: [] } }),
      field('child', 'media'),
    ],
    [
      'select fallback',
      field('child', 'select', { metadata: { multiple: 'legacy', options: { old: true } } }),
      field('child', 'select'),
    ],
    [
      'nullable containers',
      field('child', 'reference', { metadata: null, relation: null, validators: null }),
      field('child', 'reference'),
    ],
    ['null localization', field('child', 'string', { localized: null }), field('child')],
    [
      'old relation options',
      field('child', 'reference', {
        relation: {
          allowedSchemaIds: [],
          allowedTagIds: null,
          multiple: null,
          allowProducts: null,
          oldOption: true,
        },
      }),
      field('child', 'reference'),
    ],
    [
      'old presentation policies',
      field('child', 'string', {
        groupId: 'undeclared',
        default: { old: true },
        description: null,
        validators: { min: 10, max: 1, match: { preset: 'legacy', custom: '[', oldOption: true } },
      }),
      { ...field('child'), name: 'New label' },
    ],
  ])('preserves decodable historical %s', (_name, oldChild, nextChild) => {
    const f = fixture();
    f.write([nested('titl', oldChild)], 1);
    const previous = f.scan().manifest!;
    f.write([nested('title', nextChild)], 2, [step()]);
    expect(f.scan(previous).errors).toEqual([]);
  });

  it('rejects a cased invalid relation from an actual previous scan', () => {
    const f = fixture();
    f.write([nested('titl', field('child', 'reference', { relation: { Multiple: 'false' } }))], 1);
    const previous = f.scan().manifest!;
    expect(previous).not.toBeNull();
    f.write([nested('title', field('child', 'reference'))], 2, [step()]);
    expect(f.scan(previous).errors.join('\n')).toContain('invalid recursive field storage shape');
  });

  it('normalizes unambiguous typed aliases for child identity and storage comparisons', () => {
    const child = {
      FieldID: 'child',
      Name: 'Child',
      Type: 'reference',
      Localized: true,
      Relation: { MULTIPLE: true, AllowedTagIDs: ['old'], unrelated: [] },
      Validators: { match: { PRESET: 'legacy', Custom: '[', unrelated: [] } },
    } as unknown as BlockField;
    const f = fixture();
    f.write([nested('titl', child)], 1);
    const previous = f.scan().manifest!;
    f.write(
      [
        nested(
          'title',
          field('child', 'reference', { localized: true, relation: { multiple: true } })
        ),
      ],
      2,
      [step()]
    );
    expect(f.scan(previous).errors).toEqual([]);
    f.write([nested('title', field('child', 'reference', { localized: true }))], 2, [step()]);
    expect(f.scan(previous).errors.join('\n')).toContain('storage shape');
    f.write([nested('title', field('child', 'reference', { relation: { multiple: true } }))], 2, [
      step(),
    ]);
    expect(f.scan(previous).errors.join('\n')).toContain('storage shape');
    expect((previous.blocks.find((b) => b.apiId === 'hero')!.fields as BlockField[])[0]).toEqual(
      nested('titl', child)
    );
  });

  it('keeps arbitrary metadata keys case-sensitive', () => {
    const f = fixture();
    f.write([nested('titl', field('child', 'media', { Metadata: { Multiple: false } }))], 1);
    const previous = f.scan().manifest!;
    f.write([nested('title', field('child', 'media'))], 2, [step()]);
    expect(f.scan(previous).errors).toEqual([]);
  });
});
