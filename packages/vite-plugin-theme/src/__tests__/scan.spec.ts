import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { scanTheme } from '../scan';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('scanTheme', () => {
  it('builds the frozen manifest shape for a valid theme', () => {
    const { manifest, errors, blockDirs } = scanTheme({
      themeDir: fixture('valid-theme'),
      framework: 'nuxt',
    });

    expect(errors).toEqual([]);
    expect(Object.keys(blockDirs)).toEqual(['footer', 'hero']);
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      theme: { name: 'marketing-theme', version: '1.2.0', framework: 'nuxt' },
      routes: [{ pattern: '/:path(.*)*', kind: 'page' }],
      customPages: [],
      tokens: {
        colors: {
          primary: {
            label: 'Primary',
            value: '#4f46e5',
            group: 'Brand',
            allowSiteOverride: true,
          },
        },
        containers: {
          narrow: { label: 'Narrow', maxWidth: '40rem' },
          content: { label: 'Content', maxWidth: '64rem' },
          wide: { label: 'Wide', maxWidth: '80rem' },
          full: { label: 'Full', maxWidth: 'none' },
        },
      },
    });
    expect(manifest?.blocks.map((block) => block.apiId)).toEqual(['footer', 'hero']);
    expect(manifest?.blocks[0]).toMatchObject({ category: 'general', previewImage: null });
    expect(manifest?.blocks[1]).toMatchObject({
      category: 'marketing',
      mock: { heading: 'Build faster' },
      previewImage: null,
    });
    expect(manifest).toMatchSnapshot();
  });

  it("never puts breakpoints on the manifest — that file is persisted/uploaded and Core's ingest rejects an unrecognized key", () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      breakpoints: { tablet: 600, normal: 900 },
    });
    expect(errors).toEqual([]);
    expect(manifest).not.toHaveProperty('breakpoints');
  });

  it('defaults the resolved breakpoints to 768/1024 when the theme configures none', () => {
    const { errors, breakpoints } = scanTheme({ themeDir: fixture('valid-theme') });
    expect(errors).toEqual([]);
    expect(breakpoints).toEqual({ tablet: 768, normal: 1024 });
  });

  it('resolves a theme-configured breakpoints pair — outside the manifest, on ScanResult', () => {
    const { errors, breakpoints } = scanTheme({
      themeDir: fixture('valid-theme'),
      breakpoints: { tablet: 600, normal: 900 },
    });
    expect(errors).toEqual([]);
    expect(breakpoints).toEqual({ tablet: 600, normal: 900 });
  });

  it('falls back to the default breakpoints, with a console warning, on an invalid pair — scanning still succeeds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { errors, breakpoints } = scanTheme({
      themeDir: fixture('valid-theme'),
      breakpoints: { tablet: 1200, normal: 900 }, // tablet >= normal
    });
    expect(errors).toEqual([]);
    expect(breakpoints).toEqual({ tablet: 768, normal: 1024 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('normalizes and emits declared custom pages', () => {
    const result = scanTheme({
      themeDir: fixture('valid-theme'),
      customPages: [
        { path: '/about', title: '  About\u0007 us  ', description: '  Company\u200b profile  ' },
        { path: '/', title: 'Home code route' },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.manifest?.customPages).toEqual([
      { path: '/about', title: 'About us', description: 'Company profile' },
      { path: '/', title: 'Home code route' },
    ]);
  });

  it('rejects bounded and malformed custom-page catalogs', () => {
    const invalid = scanTheme({
      themeDir: fixture('valid-theme'),
      customPages: [
        { path: '/articles/:slug', title: 'Dynamic' },
        { path: '/about/', title: '' },
        { path: '/about', title: 'About' },
        { path: '/about', title: 'Duplicate', description: 'x'.repeat(241) },
      ],
    });
    const joined = invalid.errors.join('\n');
    expect(invalid.manifest).toBeNull();
    expect(joined).toContain('customPages[0].path — invalid static path');
    expect(joined).toContain('customPages[1].path — invalid static path');
    expect(joined).toContain('customPages[1].title — must contain 1..80 characters');
    expect(joined).toContain('customPages[3].path — duplicate path "/about"');
    expect(joined).toContain('customPages[3].description — exceeds 240 characters');

    const tooMany = scanTheme({
      themeDir: fixture('valid-theme'),
      customPages: Array.from({ length: 101 }, (_, index) => ({
        path: `/p-${index}`,
        title: `Page ${index}`,
      })),
    });
    expect(tooMany.errors.join('\n')).toContain('customPages: contains 101 pages — exceeds 100');
  });

  it('reports precise path and semantic errors for an invalid theme', () => {
    const { manifest, errors } = scanTheme({ themeDir: fixture('invalid-theme') });
    const joined = errors.join('\n');

    expect(manifest).toBeNull();
    expect(joined).toContain('blocks/bad/block.json: apiId');
    expect(joined).toContain('^[a-z][a-z0-9-]{1,48}$');
    expect(joined).toContain('blocks/bad/block.json: name');
    expect(joined).toContain('blocks/bad/block.json: version');
    expect(joined).toContain('duplicate fieldId "a"');
    expect(joined).toContain('at most one field may set isTitle');
    expect(joined).toContain(
      'themes may use only relation.allowedTagIds, relation.allowProducts and relation.allowCollections'
    );
  });

  it('enforces the 64 KB per-block mock limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'scan-test', version: '1.0.0' })
    );
    mkdirSync(join(dir, 'blocks', 'hero'), { recursive: true });
    cpSync(join(fixture('valid-theme'), 'blocks', 'hero'), join(dir, 'blocks', 'hero'), {
      recursive: true,
    });
    writeFileSync(
      join(dir, 'blocks', 'hero', 'mock.json'),
      JSON.stringify({ value: 'x'.repeat(70 * 1024) })
    );

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('blocks/hero/mock.json: exceeds 64 KB');
  });

  it('rejects undeclared groups and composite nesting deeper than five', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-depth-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'scan-depth', version: '1.0.0' })
    );
    const blockDir = join(dir, 'blocks', 'nested');
    mkdirSync(blockDir, { recursive: true });
    let nested: Record<string, unknown> = { fieldId: 'leaf', name: 'Leaf', type: 'string' };
    for (let index = 0; index < 5; index += 1) {
      nested = {
        fieldId: `level${index}`,
        name: `Level ${index}`,
        type: 'composite',
        metadata: { fields: [nested] },
      };
    }
    writeFileSync(
      join(blockDir, 'block.json'),
      JSON.stringify({
        apiId: 'nested',
        name: 'Nested',
        version: 1,
        groups: [
          { groupId: 'duplicate', name: 'First' },
          { groupId: 'duplicate', name: 'Second' },
        ],
        fields: [{ ...nested, groupId: 'missing' }],
      })
    );
    writeFileSync(join(blockDir, 'mock.json'), '{}');
    writeFileSync(join(blockDir, 'Block.vue'), '<template><div /></template>');

    const { errors } = scanTheme({ themeDir: dir });
    expect(errors.join('\n')).toContain('references undeclared group "missing"');
    expect(errors.join('\n')).toContain('composite nesting depth 6 exceeds 5');
    expect(errors.join('\n')).toContain('duplicate groupId "duplicate"');
  });

  it('validates package semver and route kind/field coherence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-routes-'));
    cpSync(fixture('valid-theme'), dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'route-theme', version: 'next' })
    );

    const { manifest, errors } = scanTheme({
      themeDir: dir,
      routes: [
        { pattern: '/blog/:slug', kind: 'entry' },
        { pattern: '/page', kind: 'page', schemaApiId: 'article' },
        { pattern: '', kind: 'unknown' },
      ] as never,
    });

    const joined = errors.join('\n');
    expect(manifest).toBeNull();
    expect(joined).toContain('package.json: version — must be semver');
    expect(joined).toContain('routes[0].schemaApiId — required for entry routes');
    expect(joined).toContain('routes[0].field — required for entry routes');
    expect(joined).toContain('routes[1] — page routes must not set schemaApiId or field');
    expect(joined).toContain('routes[2].pattern — must be a non-empty string');
    expect(joined).toContain('routes[2].kind — must be "page" or "entry"');
  });

  it('rejects duplicate, prototype, and declaration-shaped token input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-tokens-'));
    cpSync(fixture('valid-theme'), dir, { recursive: true });
    writeFileSync(
      join(dir, 'tokens.json'),
      '{"colors":{"safe":{"label":"Safe","value":"#000000"},"safe":{"label":"Again","value":"#111111"}},"containers":{}}'
    );
    expect(scanTheme({ themeDir: dir }).errors.join('\n')).toContain('duplicate object key "safe"');

    writeFileSync(
      join(dir, 'tokens.json'),
      JSON.stringify({
        colors: { 'attack};body{': { label: 'Attack', value: '#000000' } },
        containers: {},
      })
    );
    expect(scanTheme({ themeDir: dir }).errors.join('\n')).toContain('INVALID_VALUE');

    writeFileSync(
      join(dir, 'tokens.json'),
      '{"colors":{"__proto__":{"label":"Attack","value":"#000000"}},"containers":{}}'
    );
    expect(scanTheme({ themeDir: dir }).errors.join('\n')).toContain('INVALID_VALUE');
  });

  it('preserves the deploy-compatible legacy token shape after strict normalization', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-legacy-tokens-'));
    cpSync(fixture('valid-theme'), dir, { recursive: true });
    writeFileSync(
      join(dir, 'tokens.json'),
      JSON.stringify({
        colors: { primary: '#4f46e5' },
        fonts: { body: 'system-ui' },
        spacing: { section: '4rem' },
      })
    );
    const result = scanTheme({ themeDir: dir });
    expect(result.errors).toEqual([]);
    expect(result.manifest?.tokens).toEqual({
      colors: { primary: '#4f46e5' },
      fonts: { body: 'system-ui' },
      spacing: { section: '4rem' },
    });
  });
});

function makeTheme(blocks: Array<Record<string, unknown>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-slots-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'slots-theme', version: '1.0.0' })
  );
  for (const block of blocks) {
    const blockDir = join(dir, 'blocks', String(block.apiId));
    mkdirSync(blockDir, { recursive: true });
    writeFileSync(join(blockDir, 'block.json'), JSON.stringify(block));
    writeFileSync(join(blockDir, 'mock.json'), '{}');
    writeFileSync(join(blockDir, 'Block.vue'), '<template><div /></template>');
  }
  return dir;
}

describe('scanTheme block slots', () => {
  const baseBlock = {
    apiId: 'hero',
    name: 'Hero',
    version: 1,
    fields: [{ fieldId: 'heading', name: 'Heading', type: 'string' }],
  };

  it('scans a valid slots catalog and lands slots in the manifest', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [
          {
            id: 'actions',
            label: 'Actions',
            description: 'Primary calls to action',
            minItems: 0,
            maxItems: 3,
            allowedBlockApiIds: ['sidebar'],
          },
          { id: 'content', label: 'Content', maxItems: 5 },
        ],
      },
      {
        apiId: 'sidebar',
        name: 'Sidebar',
        version: 1,
        fields: [{ fieldId: 'title', name: 'Title', type: 'string' }],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.blocks[0].slots).toEqual([
      {
        id: 'actions',
        label: 'Actions',
        description: 'Primary calls to action',
        minItems: 0,
        maxItems: 3,
        allowedBlockApiIds: ['sidebar'],
      },
      { id: 'content', label: 'Content', maxItems: 5 },
    ]);
  });

  it('strips control characters from slot labels and descriptions', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [
          {
            id: 'actions',
            label: 'Act ions',
            description: 'Calls to action',
            maxItems: 1,
          },
        ],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.blocks[0].slots).toEqual([
      { id: 'actions', label: 'Actions', description: 'Calls to action', maxItems: 1 },
    ]);
  });

  it('rejects more than twelve slots', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: Array.from({ length: 13 }, (_, index) => ({
          id: `slot${index}`,
          label: `Slot ${index}`,
          maxItems: 1,
        })),
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('slots');
    expect(errors.join('\n')).toContain('more than 12 items');
  });

  it('rejects duplicate slot ids', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [
          { id: 'actions', label: 'First', maxItems: 1 },
          { id: 'actions', label: 'Second', maxItems: 2 },
        ],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('duplicate slot id "actions"');
  });

  it('rejects invalid slot ids', () => {
    const dir = makeTheme([
      { ...baseBlock, slots: [{ id: 'Action-1', label: 'Actions', maxItems: 1 }] },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('invalid slot id "Action-1"');
  });

  it('rejects maxItems below one', () => {
    const dir = makeTheme([
      { ...baseBlock, slots: [{ id: 'actions', label: 'Actions', maxItems: 0 }] },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('slots[0].maxItems');
    expect(errors.join('\n')).toContain('must be >= 1');
  });

  it('rejects minItems other than zero', () => {
    const dir = makeTheme([
      { ...baseBlock, slots: [{ id: 'actions', label: 'Actions', minItems: 1, maxItems: 2 }] },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('slots[0].minItems');
    expect(errors.join('\n')).toContain('must be equal to one of the allowed values');
  });

  it('rejects a self-host allowlist', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [{ id: 'actions', label: 'Actions', maxItems: 1, allowedBlockApiIds: ['hero'] }],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('allowedBlockApiIds may not contain the host block "hero"');
  });

  it('rejects allowlisted ids unknown to the manifest', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [{ id: 'actions', label: 'Actions', maxItems: 1, allowedBlockApiIds: ['ghost'] }],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('unknown allowlisted block "ghost"');
  });

  it('rejects duplicate allowlist ids', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [
          {
            id: 'actions',
            label: 'Actions',
            maxItems: 1,
            allowedBlockApiIds: ['sidebar', 'sidebar'],
          },
        ],
      },
      {
        apiId: 'sidebar',
        name: 'Sidebar',
        version: 1,
        fields: [{ fieldId: 'title', name: 'Title', type: 'string' }],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('slots[0].allowedBlockApiIds');
    expect(errors.join('\n')).toContain('duplicate items');
  });

  it('rejects unknown slot keys', () => {
    const dir = makeTheme([
      {
        ...baseBlock,
        slots: [{ id: 'actions', label: 'Actions', maxItems: 1, unexpected: true }],
      },
    ]);

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('unknown property "unexpected"');
  });
});

/** Builds a single-field "hero" block theme so `fields[0]` is deterministic. */
function withHeroField(field: Record<string, unknown>): string {
  return makeTheme([{ apiId: 'hero', name: 'Hero', version: 1, fields: [field] }]);
}

describe('scanTheme media framing metadata', () => {
  it('validates media framing metadata', () => {
    const accept = withHeroField({
      fieldId: 'image',
      name: 'Image',
      type: 'media',
      metadata: { multiple: false, framing: true, framingAspectRatio: '16/9' },
    });
    expect(scanTheme({ themeDir: accept, framework: 'nuxt' }).errors).toEqual([]);

    const ratioWithoutFraming = withHeroField({
      fieldId: 'image',
      name: 'Image',
      type: 'media',
      metadata: { multiple: false, framingAspectRatio: '16/9' },
    });
    expect(scanTheme({ themeDir: ratioWithoutFraming, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.framingAspectRatio — requires metadata.framing: true',
    ]);

    const badRatio = withHeroField({
      fieldId: 'image',
      name: 'Image',
      type: 'media',
      metadata: { multiple: false, framing: true, framingAspectRatio: '16:9' },
    });
    expect(scanTheme({ themeDir: badRatio, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.framingAspectRatio — must be "W/H" with positive integers (got "16:9")',
    ]);

    const notBoolean = withHeroField({
      fieldId: 'image',
      name: 'Image',
      type: 'media',
      metadata: { multiple: false, framing: 'yes' },
    });
    expect(scanTheme({ themeDir: notBoolean, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.framing — must be a boolean',
    ]);

    const wrongType = withHeroField({
      fieldId: 'title',
      name: 'Title',
      type: 'string',
      metadata: { framing: true },
    });
    expect(scanTheme({ themeDir: wrongType, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.framing — only allowed on type "media"',
    ]);
  });
});

describe('scanTheme rich-text toolbar metadata', () => {
  it('accepts a valid control list on a rich-text field', () => {
    const dir = withHeroField({
      fieldId: 'body',
      name: 'Body',
      type: 'rich-text',
      metadata: { toolbar: ['bold', 'italic', 'link'] },
    });
    const { manifest, errors } = scanTheme({ themeDir: dir, framework: 'nuxt' });
    expect(errors).toEqual([]);
    expect(manifest?.blocks[0]!.fields as Array<Record<string, unknown>>).toEqual([
      {
        fieldId: 'body',
        name: 'Body',
        type: 'rich-text',
        metadata: { toolbar: ['bold', 'italic', 'link'] },
      },
    ]);
  });

  it('rejects toolbar metadata on a field type other than rich-text', () => {
    const dir = withHeroField({
      fieldId: 'title',
      name: 'Title',
      type: 'string',
      metadata: { toolbar: ['bold'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.toolbar — only allowed on type "rich-text"',
    ]);
  });

  it('rejects a toolbar that is not an array of strings', () => {
    const notArray = withHeroField({
      fieldId: 'body',
      name: 'Body',
      type: 'rich-text',
      metadata: { toolbar: 'bold' },
    });
    expect(scanTheme({ themeDir: notArray, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.toolbar — must be an array of control ids',
    ]);

    const badItem = withHeroField({
      fieldId: 'body',
      name: 'Body',
      type: 'rich-text',
      metadata: { toolbar: ['bold', 1] },
    });
    expect(scanTheme({ themeDir: badItem, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.toolbar — must be an array of control ids',
    ]);
  });

  it('rejects unknown control ids', () => {
    const dir = withHeroField({
      fieldId: 'body',
      name: 'Body',
      type: 'rich-text',
      metadata: { toolbar: ['bold', 'sparkle'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.toolbar — unknown control "sparkle"',
    ]);
  });

  it('rejects duplicate control ids', () => {
    const dir = withHeroField({
      fieldId: 'body',
      name: 'Body',
      type: 'rich-text',
      metadata: { toolbar: ['bold', 'bold'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].metadata.toolbar — duplicate control "bold"',
    ]);
  });
});

describe("scanTheme mock.json media contract (Studio seeds an inserted block's entry from it)", () => {
  const VALID_UUID = '2e4f6d0a-2f8a-4a3e-9f7d-9c6a0f5b6a11';

  function makeMediaTheme(
    fields: Array<Record<string, unknown>>,
    mock: Record<string, unknown>
  ): string {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-mock-media-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'mock-media-theme', version: '1.0.0' })
    );
    const blockDir = join(dir, 'blocks', 'widget');
    mkdirSync(blockDir, { recursive: true });
    writeFileSync(
      join(blockDir, 'block.json'),
      JSON.stringify({ apiId: 'widget', name: 'Widget', version: 1, fields })
    );
    writeFileSync(join(blockDir, 'mock.json'), JSON.stringify(mock));
    writeFileSync(join(blockDir, 'Block.vue'), '<template><div /></template>');
    return dir;
  }

  const mediaField = { fieldId: 'image', name: 'Image', type: 'media' };

  it('accepts a media field that is absent entirely (the seed Studio writes)', () => {
    const dir = makeMediaTheme([mediaField], { heading: 'Hi' });
    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.blocks[0]?.mock).toEqual({ heading: 'Hi' });
  });

  it('accepts a media field shaped {assetId: uuid}', () => {
    const dir = makeMediaTheme([mediaField], { image: { assetId: VALID_UUID } });
    expect(scanTheme({ themeDir: dir }).errors).toEqual([]);
  });

  it('accepts a media field shaped {assetId: uuid, framing}', () => {
    const dir = makeMediaTheme([mediaField], {
      image: { assetId: VALID_UUID, framing: { x: 0, y: 0, zoom: 1 } },
    });
    expect(scanTheme({ themeDir: dir }).errors).toEqual([]);
  });

  it('rejects the Storybook fixture shape ({assetId: "demo-<name>", url, altText})', () => {
    const dir = makeMediaTheme([mediaField], {
      image: { assetId: 'demo-hero', url: '/demo/hero.svg', altText: 'A cup of coffee' },
    });
    expect(scanTheme({ themeDir: dir }).errors).toEqual([
      'blocks/widget/mock.json: image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('rejects a non-uuid assetId', () => {
    const dir = makeMediaTheme([mediaField], { image: { assetId: 'demo-hero' } });
    expect(scanTheme({ themeDir: dir }).errors).toEqual([
      'blocks/widget/mock.json: image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('rejects null (must be absent, not null)', () => {
    const dir = makeMediaTheme([mediaField], { image: null });
    expect(scanTheme({ themeDir: dir }).errors).toEqual([
      'blocks/widget/mock.json: image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('checks every value of a multiple:true media field (gallery-style)', () => {
    const dir = makeMediaTheme(
      [{ fieldId: 'images', name: 'Images', type: 'media', metadata: { multiple: true } }],
      { images: [{ assetId: VALID_UUID }, { assetId: 'demo-gallery-2', url: '/demo/g2.svg' }] }
    );
    expect(scanTheme({ themeDir: dir }).errors).toEqual([
      'blocks/widget/mock.json: images[1]: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('checks a media field nested inside a list of composites (feature-grid items-style)', () => {
    const dir = makeMediaTheme(
      [
        {
          fieldId: 'items',
          name: 'Items',
          type: 'list',
          metadata: {
            item: {
              fieldId: 'item',
              name: 'Item',
              type: 'composite',
              metadata: {
                fields: [
                  { fieldId: 'title', name: 'Title', type: 'string' },
                  { fieldId: 'image', name: 'Image', type: 'media' },
                ],
              },
            },
          },
        },
      ],
      {
        items: [
          { title: 'One', image: { assetId: VALID_UUID } },
          { title: 'Two', image: { assetId: 'demo-feature-2', url: '/demo/feature-2.svg' } },
        ],
      }
    );
    expect(scanTheme({ themeDir: dir }).errors).toEqual([
      'blocks/widget/mock.json: items[1].image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });
});

describe('scanTheme reference relation targets', () => {
  const NO_TARGET =
    'blocks/hero/block.json: fields[0] — relation requires one of allowedTagIds, allowProducts or allowCollections';

  function heroRelation(relation: unknown): string {
    return withHeroField({ fieldId: 'source', name: 'Source', type: 'reference', relation });
  }

  it.each([
    ['catalog collections only', { allowCollections: true }],
    ['catalog products only', { allowProducts: true }],
    ['semantic tags only', { allowedTagIds: ['article'] }],
    [
      'every target at once, multiple',
      { allowedTagIds: ['article'], allowProducts: true, allowCollections: true, multiple: true },
    ],
  ])('accepts a relation naming %s', (_label, relation) => {
    const { manifest, errors } = scanTheme({ themeDir: heroRelation(relation), framework: 'nuxt' });
    expect(errors).toEqual([]);
    // The relation reaches the manifest verbatim — it is what Studio's picker
    // and Core's publish-time validation both read.
    const fields = manifest!.blocks[0]!.fields as Array<Record<string, unknown>>;
    expect(fields[0]!.relation).toEqual(relation);
  });

  it.each([
    ['an empty relation', {}],
    ['cardinality with no target', { multiple: true }],
    ['both catalog flags turned off', { allowProducts: false, allowCollections: false }],
  ])('rejects %s with the shared no-target wording', (_label, relation) => {
    const { manifest, errors } = scanTheme({ themeDir: heroRelation(relation), framework: 'nuxt' });
    expect(errors).toEqual([NO_TARGET]);
    expect(manifest).toBeNull();
  });

  it('still refuses allowedSchemaIds — schema ids are not portable across organizations', () => {
    const { errors } = scanTheme({
      themeDir: heroRelation({ allowedSchemaIds: ['hero'], allowCollections: true }),
      framework: 'nuxt',
    });
    expect(errors.join('\n')).toContain(
      'themes may use only relation.allowedTagIds, relation.allowProducts and relation.allowCollections'
    );
  });

  it('keeps an empty allowedTagIds array a schema error as well as a no-target one', () => {
    const { errors } = scanTheme({
      themeDir: heroRelation({ allowedTagIds: [] }),
      framework: 'nuxt',
    });
    expect(errors.join('\n')).toContain('fields[0].relation.allowedTagIds');
    expect(errors).toContain(NO_TARGET);
  });

  it('keeps relation itself a reference-only key', () => {
    const dir = withHeroField({
      fieldId: 'title',
      name: 'Title',
      type: 'string',
      relation: { allowCollections: true },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].relation — only allowed on type "reference" (got "string")',
    ]);
  });
});

describe('scanTheme link field metadata', () => {
  const AT = 'blocks/hero/block.json: fields[0]';

  function linkList(item: Record<string, unknown>): string {
    return withHeroField({
      fieldId: 'links',
      name: 'Links',
      type: 'list',
      metadata: { item },
    });
  }

  it('accepts a bare link field with no metadata at all', () => {
    const dir = withHeroField({ fieldId: 'cta', name: 'Button link', type: 'link' });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([]);
  });

  it('accepts a link declaring kinds and allowed entry schemas', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: ['collection', 'entry', 'url'], allowedEntrySchemaApiIds: ['article'] },
    });
    const { manifest, errors } = scanTheme({ themeDir: dir, framework: 'nuxt' });
    expect(errors).toEqual([]);
    // The metadata reaches the manifest verbatim: it is what Studio's picker
    // and Core's publish-time validation both read.
    expect((manifest!.blocks[0]!.fields as Array<Record<string, unknown>>)[0]!.metadata).toEqual({
      kinds: ['collection', 'entry', 'url'],
      allowedEntrySchemaApiIds: ['article'],
    });
  });

  it.each(['kinds', 'allowedEntrySchemaApiIds', 'tree'])(
    'rejects metadata.%s on a field type other than link',
    (key) => {
      const dir = withHeroField({
        fieldId: 'title',
        name: 'Title',
        type: 'string',
        metadata: { [key]: key === 'tree' ? true : ['product'] },
      });
      expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
        `${AT}.metadata.${key} — only allowed on type "link"`,
      ]);
    }
  );

  it('accepts "none" as a declared kind — the heading a tree item may be', () => {
    const dir = linkList({
      fieldId: 'link',
      name: 'Link',
      type: 'link',
      metadata: { tree: true, kinds: ['none', 'collection', 'url'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([]);
  });

  it('rejects an unknown kind', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: ['collection', 'blog'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.kinds — unknown kind "blog"`,
    ]);
  });

  it('rejects an empty kinds list — a link an author can never fill in', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: [] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.kinds — must list at least one kind`,
    ]);
  });

  it('rejects kinds that is not an array, and a duplicated kind', () => {
    const notArray = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: 'collection' },
    });
    expect(scanTheme({ themeDir: notArray, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.kinds — must be an array of link kinds`,
    ]);

    const duplicate = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: ['url', 'url'] },
    });
    expect(scanTheme({ themeDir: duplicate, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.kinds — duplicate kind "url"`,
    ]);
  });

  it('rejects allowedEntrySchemaApiIds when kinds excludes "entry"', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { kinds: ['collection'], allowedEntrySchemaApiIds: ['article'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.allowedEntrySchemaApiIds — requires metadata.kinds to include "entry"`,
    ]);
  });

  it('rejects an empty or malformed allowedEntrySchemaApiIds', () => {
    const empty = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { allowedEntrySchemaApiIds: [] },
    });
    expect(scanTheme({ themeDir: empty, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.allowedEntrySchemaApiIds — must list at least one schema apiId`,
    ]);

    const bad = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { allowedEntrySchemaApiIds: ['Article'] },
    });
    expect(scanTheme({ themeDir: bad, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.allowedEntrySchemaApiIds — invalid schema apiId "Article"`,
    ]);
  });

  it("accepts metadata.tree on a link that is a list's item", () => {
    const dir = linkList({
      fieldId: 'link',
      name: 'Link',
      type: 'link',
      localized: true,
      metadata: { tree: true, kinds: ['collection', 'page', 'url'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([]);
  });

  it('refuses metadata.tree on a top-level link — a list is what a tree is authored in', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      metadata: { tree: true },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT} — metadata.tree is only allowed on a link that is a list's item`,
    ]);
  });

  it("refuses metadata.tree on a link inside a composite's fields", () => {
    const dir = withHeroField({
      fieldId: 'card',
      name: 'Card',
      type: 'composite',
      metadata: {
        fields: [{ fieldId: 'cta', name: 'Link', type: 'link', metadata: { tree: true } }],
      },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.fields[0] — metadata.tree is only allowed on a link that is a list's item`,
    ]);
  });

  it('rejects a non-boolean tree', () => {
    const dir = linkList({
      fieldId: 'link',
      name: 'Link',
      type: 'link',
      metadata: { tree: 'yes' },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.item.metadata.tree — must be a boolean`,
    ]);
  });

  it("reports a bad kind on a list's link item with the item's own path", () => {
    const dir = linkList({
      fieldId: 'link',
      name: 'Link',
      type: 'link',
      metadata: { tree: true, kinds: ['blog'] },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      `${AT}.metadata.item.metadata.kinds — unknown kind "blog"`,
    ]);
  });

  it('keeps relation a reference-only key for a link field too', () => {
    const dir = withHeroField({
      fieldId: 'cta',
      name: 'Button link',
      type: 'link',
      relation: { allowCollections: true },
    });
    expect(scanTheme({ themeDir: dir, framework: 'nuxt' }).errors).toEqual([
      'blocks/hero/block.json: fields[0].relation — only allowed on type "reference" (got "link")',
    ]);
  });
});

describe('scanTheme theme messages', () => {
  /** A fresh theme with one block and whatever `i18n/*.json` files are
   * passed — the validation-rule cases below each need their own locale
   * content, so they build a theme directly rather than cloning the checked-
   * in `theme-with-messages` fixture. */
  function messagesTheme(
    localeFiles: Record<string, string>,
    packageJson: Record<string, unknown> = { name: 'messages-theme', version: '1.0.0' }
  ): string {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-messages-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson));
    mkdirSync(join(dir, 'blocks', 'footer'), { recursive: true });
    cpSync(join(fixture('valid-theme'), 'blocks', 'footer'), join(dir, 'blocks', 'footer'), {
      recursive: true,
    });
    mkdirSync(join(dir, 'i18n'), { recursive: true });
    for (const [name, content] of Object.entries(localeFiles)) {
      writeFileSync(join(dir, 'i18n', name), content);
    }
    return dir;
  }

  it('flattens nested i18n/<tag>.json files into manifest.messages, defaulting to en-US when undeclared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-messages-happy-'));
    cpSync(fixture('theme-with-messages'), dir, { recursive: true });

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.messages).toEqual({
      defaultLocale: 'en-US',
      locales: {
        'en-US': {
          'header.menu': 'Menu',
          'cart.empty.title': 'Your cart is empty',
          'items.count': '{count} items',
        },
        'is-IS': {
          'header.menu': 'Valmynd',
          'cart.empty.title': 'Karfan þín er tóm',
          'items.count': '{count} hlutir',
        },
      },
    });
  });

  it('omits manifest.messages entirely when the theme has no i18n/ directory, keeping the manifest byte-identical', () => {
    // valid-theme ships no i18n/ directory; the snapshot test above ("builds
    // the frozen manifest shape for a valid theme") already proves the whole
    // manifest is unaffected by this feature — this asserts the specific key.
    const { manifest, errors } = scanTheme({ themeDir: fixture('valid-theme'), framework: 'nuxt' });
    expect(errors).toEqual([]);
    expect(manifest).not.toHaveProperty('messages');
  });

  it("honors a declared eldra.defaultLocale over the fallback rules", () => {
    const dir = mkdtempSync(join(tmpdir(), 'eldra-scan-messages-declared-'));
    cpSync(fixture('theme-with-messages'), dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'messages-theme',
        version: '1.0.0',
        eldra: { defaultLocale: 'is-IS' },
      })
    );

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.messages?.defaultLocale).toBe('is-IS');
  });

  it('prefers en-US over an alphabetically earlier locale when no default is declared', () => {
    // "da-DK" sorts before "en-US", so this is distinct from the plain
    // alphabetical-fallback case below: en-US must win on its own rule, not
    // by coincidence of sort order.
    const dir = messagesTheme({
      'da-DK.json': JSON.stringify({ header: { menu: 'Menu' } }),
      'en-US.json': JSON.stringify({ header: { menu: 'Menu' } }),
    });

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.messages?.defaultLocale).toBe('en-US');
  });

  it('falls back to the alphabetically first locale when en-US is absent and no default is declared', () => {
    const dir = messagesTheme({
      'fr-FR.json': JSON.stringify({ header: { menu: 'Menu' } }),
      'is-IS.json': JSON.stringify({ header: { menu: 'Valmynd' } }),
    });

    const { manifest, errors } = scanTheme({ themeDir: dir });
    expect(errors).toEqual([]);
    expect(manifest?.messages?.defaultLocale).toBe('fr-FR');
  });

  it('rejects invalid message key grammar and an overlong key', () => {
    const dir = messagesTheme({
      'en-US.json': JSON.stringify({ Header: { menu: 'Menu' }, [`a${'b'.repeat(130)}`]: 'x' }),
      'is-IS.json': '{}',
    });

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain('i18n/en-US.json: "Header.menu" — key must match');
    expect(joined).toContain(`i18n/en-US.json: "a${'b'.repeat(130)}" — key must match`);
    expect(joined).toContain('at most 128 characters');
  });

  it('rejects a non-string message value and an overlong one', () => {
    const dir = messagesTheme({
      'en-US.json': JSON.stringify({ count: 5, long: 'x'.repeat(2001) }),
      'is-IS.json': '{}',
    });

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain('i18n/en-US.json: "count" — value must be a string (got number)');
    expect(joined).toContain('i18n/en-US.json: "long" — value exceeds 2000 characters');
  });

  it('enforces the 2000-key bound on a locale file', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: 2001 }, (_, index) => [`key${index}`, 'x'])
    );
    const dir = messagesTheme({
      'en-US.json': JSON.stringify(tooMany),
      'is-IS.json': '{}',
    });

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain('i18n/en-US.json: contains 2001 keys — exceeds 2000');
  });

  it('enforces the 20-locale bound', () => {
    const localeFiles: Record<string, string> = {};
    for (let index = 0; index < 21; index += 1) {
      const letter = String.fromCharCode(97 + index);
      localeFiles[`${letter}${letter}-${letter.toUpperCase()}${letter.toUpperCase()}.json`] = '{}';
    }
    const dir = messagesTheme(localeFiles);

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain('i18n: contains 21 locale files — exceeds 20');
  });

  it('rejects a locale file name that is not a canonical BCP-47 "ll-RR" tag', () => {
    // A different-case spelling of a tag already present (e.g. "en-us.json"
    // beside "en-US.json") would collide on a case-insensitive filesystem,
    // so this uses an unrelated malformed tag instead.
    const dir = messagesTheme({
      'en-US.json': JSON.stringify({ header: { menu: 'Menu' } }),
      'en_US.json': '{}',
    });

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain(
      'i18n/en_US.json: file name — must be a BCP-47 locale tag in canonical "ll-RR" form'
    );
  });

  it("rejects a non-default locale whose keys are not a subset of the default locale's, naming the locale and the first offending key", () => {
    const dir = messagesTheme({
      'en-US.json': JSON.stringify({
        header: { menu: 'Menu' },
        cart: { empty: { title: 'Your cart is empty' } },
      }),
      'is-IS.json': JSON.stringify({
        header: { menu: 'Valmynd' },
        zzzBad: 'Nope',
        cart: { empty: { title: 'Karfan þín er tóm' } },
        aaaBad: 'Nope2',
      }),
    });

    const joined = scanTheme({ themeDir: dir }).errors.join('\n');
    expect(joined).toContain(
      'i18n/is-IS.json: "zzzBad" is not a key of the default locale "en-US"'
    );
    // Only the first offending key (in file order) is named, not every one.
    expect(joined).not.toContain('aaaBad');
  });
});
