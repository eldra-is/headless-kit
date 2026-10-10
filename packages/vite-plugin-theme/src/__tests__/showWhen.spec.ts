import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateBlockTypes } from '../blockTypes';
import { scanTheme } from '../scan';
import type { BlockDefinition, BlockField, ThemeManifest } from '../types';

const field = (fieldId: string, type = 'string', extra: Partial<BlockField> = {}): BlockField => ({
  fieldId,
  name: fieldId,
  type,
  ...extra,
});
const variant = (...options: string[]): BlockField =>
  field('variant', 'select', { metadata: { options } });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eldra-showwhen-'));
  cpSync(fileURLToPath(new URL('./fixtures/valid-theme', import.meta.url)), root, {
    recursive: true,
  });
  const write = (fields: BlockField[], version = 1) => {
    writeFileSync(
      join(root, 'blocks/hero/block.json'),
      JSON.stringify({ apiId: 'hero', name: 'Hero', version, fields })
    );
  };
  const scan = (previousManifest?: ThemeManifest) =>
    scanTheme({ themeDir: root, previousManifest });
  const heroFields = (previousManifest?: ThemeManifest): Array<Record<string, unknown>> => {
    const result = scan(previousManifest);
    expect(result.errors).toEqual([]);
    const hero = result.manifest?.blocks.find((block) => block.apiId === 'hero');
    return hero?.fields as Array<Record<string, unknown>>;
  };
  return { root, write, scan, heroFields };
}

describe('showWhen — the grammar', () => {
  it('accepts a condition on a sibling select and emits it verbatim in the manifest', () => {
    const f = fixture();
    f.write([
      variant('related', 'collection'),
      field('sourceCollection', 'reference', {
        relation: { allowCollections: true },
        showWhen: { field: 'variant', in: ['collection'] },
      }),
    ]);
    expect(f.heroFields()[1]).toMatchObject({
      fieldId: 'sourceCollection',
      showWhen: { field: 'variant', in: ['collection'] },
    });
  });

  it('leaves the generated block types untouched — visibility is not a storage shape', () => {
    const fields = (showWhen?: Record<string, unknown>): BlockField[] => [
      variant('related', 'collection'),
      field('sourceHandle', 'string', showWhen === undefined ? {} : ({ showWhen } as never)),
    ];
    const block = (children: BlockField[]): BlockDefinition => ({
      apiId: 'hero',
      name: 'Hero',
      version: 1,
      fields: children,
    });
    expect(generateBlockTypes([block(fields({ field: 'variant', in: ['collection'] }))])).toBe(
      generateBlockTypes([block(fields())])
    );
  });

  it('accepts a sibling bool and a sibling string', () => {
    const f = fixture();
    f.write([
      field('showLink', 'bool'),
      field('mode'),
      field('linkHref', 'string', { showWhen: { field: 'showLink', in: ['true'] } }),
      field('modeExtra', 'string', { showWhen: { field: 'mode', in: ['wide'] } }),
    ]);
    expect(f.scan().errors).toEqual([]);
  });

  it('normalizes `equals` sugar to a single-entry `in`, leaving no `equals` in the manifest', () => {
    const f = fixture();
    f.write([
      variant('related', 'collection'),
      field('sourceHandle', 'string', { showWhen: { field: 'variant', equals: 'collection' } }),
    ]);
    const emitted = f.heroFields()[1]!.showWhen;
    expect(emitted).toEqual({ field: 'variant', in: ['collection'] });
    expect(emitted).not.toHaveProperty('equals');
  });

  it.each([
    [
      'an unknown sibling',
      { field: 'nope', in: ['collection'] },
      'showWhen.field — references unknown sibling "nope"',
    ],
    [
      'itself',
      { field: 'sourceHandle', in: ['collection'] },
      'showWhen.field — a field cannot depend on itself',
    ],
    ['an empty `in`', { field: 'variant', in: [] }, 'showWhen.in — must list at least one value'],
    [
      'a value the sibling select does not offer',
      { field: 'variant', in: ['collection', 'nope'] },
      'showWhen.in — "nope" is not an option of sibling "variant"',
    ],
    [
      'neither `in` nor `equals`',
      { field: 'variant' },
      'showWhen — set exactly one of "in" or "equals"',
    ],
    [
      'both `in` and `equals`',
      { field: 'variant', in: ['collection'], equals: 'collection' },
      'showWhen — set exactly one of "in" or "equals"',
    ],
  ])('refuses %s', (_label, showWhen, message) => {
    const f = fixture();
    f.write([
      variant('related', 'collection'),
      field('sourceHandle', 'string', { showWhen } as Partial<BlockField>),
    ]);
    expect(f.scan().errors).toEqual([`blocks/hero/block.json: fields[1].${message}`]);
  });

  it('refuses a sibling that is not a select, bool or string', () => {
    const f = fixture();
    f.write([
      field('image', 'media'),
      field('caption', 'string', { showWhen: { field: 'image', in: ['x'] } }),
    ]);
    expect(f.scan().errors).toEqual([
      'blocks/hero/block.json: fields[1].showWhen.field — sibling "image" must be a select, bool or string field (got "media")',
    ]);
  });

  it('refuses a chain: a sibling that itself carries showWhen', () => {
    const f = fixture();
    f.write([
      variant('related', 'collection'),
      field('mode', 'select', {
        metadata: { options: ['a', 'b'] },
        showWhen: { field: 'variant', in: ['collection'] },
      }),
      field('detail', 'string', { showWhen: { field: 'mode', in: ['a'] } }),
    ]);
    expect(f.scan().errors).toEqual([
      'blocks/hero/block.json: fields[2].showWhen.field — sibling "mode" carries showWhen itself; conditions do not chain',
    ]);
  });

  it('refuses an unknown key inside showWhen, and a showWhen that is not an object', () => {
    const f = fixture();
    f.write([
      variant('related'),
      field('sourceHandle', 'string', {
        showWhen: { field: 'variant', in: ['related'], unless: ['x'] },
      } as Partial<BlockField>),
    ]);
    expect(f.scan().errors).toEqual([
      'blocks/hero/block.json: fields[1].showWhen — unknown property "unless"',
    ]);

    f.write([
      variant('related'),
      field('sourceHandle', 'string', { showWhen: 'variant' } as never),
    ]);
    expect(f.scan().errors.join('\n')).toContain('fields[1].showWhen');
  });

  describe('inside a composite and a list item — the field set is the nesting level', () => {
    const composite = (children: BlockField[]): BlockField =>
      field('slides', 'composite', { metadata: { fields: children } });
    const list = (children: BlockField[]): BlockField =>
      field('cards', 'list', {
        metadata: {
          item: {
            fieldId: 'item',
            name: 'Item',
            type: 'composite',
            metadata: { fields: children },
          },
        },
      });

    it('resolves a sibling declared beside it in the same composite', () => {
      const f = fixture();
      f.write([
        composite([
          variant('a', 'b'),
          field('extra', 'string', {
            showWhen: { field: 'variant', in: ['b'] },
          }),
        ]),
      ]);
      expect(f.scan().errors).toEqual([]);
    });

    it('refuses a composite child naming a top-level field — not its own field set', () => {
      const f = fixture();
      f.write([
        variant('a', 'b'),
        composite([field('extra', 'string', { showWhen: { field: 'variant', in: ['b'] } })]),
      ]);
      expect(f.scan().errors).toEqual([
        'blocks/hero/block.json: fields[1].metadata.fields[0].showWhen.field — references unknown sibling "variant"',
      ]);
    });

    it('checks a list item’s own fields the same way', () => {
      const f = fixture();
      f.write([
        list([
          variant('a', 'b'),
          field('extra', 'string', { showWhen: { field: 'variant', in: ['zzz'] } }),
        ]),
      ]);
      expect(f.scan().errors).toEqual([
        'blocks/hero/block.json: fields[0].metadata.item.metadata.fields[1].showWhen.in — "zzz" is not an option of sibling "variant"',
      ]);
    });
  });
});

describe('showWhen — not a stored-compatibility key', () => {
  /**
   * Visibility is authoring UX, not storage: adding, changing or removing
   * `showWhen` must never make `eldra-theme validate` (or the plugin's own
   * advisory local-history check) demand a version bump.
   *
   * Mutation proof: add `old.showWhen` vs `next.showWhen` to `storageCompatible`
   * in `migrations.ts` and every case below fails with
   * "field sourceHandle changed storage shape … bump "version" to 2".
   */
  const previous = (fields: BlockField[]): ThemeManifest =>
    ({
      manifestVersion: 1,
      theme: {
        name: 'marketing-theme',
        version: '1.2.0',
        framework: 'nuxt',
        sdk: { core: '0.1.0', vitePlugin: '0.1.0' },
      },
      blocks: [{ apiId: 'hero', name: 'Hero', version: 1, fields, mock: {}, previewImage: null }],
      routes: [],
      customPages: [],
      tokens: { colors: {}, fonts: {}, spacing: {} },
    }) as unknown as ThemeManifest;

  const withCondition = (showWhen?: Record<string, unknown>): BlockField[] => [
    variant('related', 'collection'),
    field('sourceHandle', 'string', showWhen === undefined ? {} : ({ showWhen } as never)),
  ];

  it.each([
    ['adding', undefined, { field: 'variant', in: ['collection'] }],
    ['changing', { field: 'variant', in: ['collection'] }, { field: 'variant', in: ['related'] }],
    ['removing', { field: 'variant', in: ['collection'] }, undefined],
  ])('%s showWhen alone keeps the same version valid', (_label, before, after) => {
    const f = fixture();
    f.write(withCondition(after), 1);
    expect(f.scan(previous(withCondition(before))).errors).toEqual([]);
  });
});
