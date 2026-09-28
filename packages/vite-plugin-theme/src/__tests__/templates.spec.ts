import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanTheme } from '../scan';
import { seedLayout, validateTemplateSeeds } from '../templates';
import type { DeclaredTemplateSeed } from '../types';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const blocks = [
  {
    apiId: 'hero',
    fields: [{ fieldId: 'heading', name: 'Heading', type: 'string' }],
  },
  {
    apiId: 'gallery',
    fields: [{ fieldId: 'image', name: 'Image', type: 'media' }],
  },
];

const heroSeed = (): DeclaredTemplateSeed => ({
  routePattern: '/products/:slug',
  schemaApiId: 'catalog:product',
  title: 'Product',
  blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' } }],
});

const validate = (seeds: DeclaredTemplateSeed[]) => {
  const errors: string[] = [];
  const templates = validateTemplateSeeds(seeds, blocks, errors);
  return { templates, errors };
};

describe('validateTemplateSeeds', () => {
  it('generates a column layout with the header and footer roles around the blocks', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'story', apiId: 'hero', data: { heading: 'Our story' } });
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout).toEqual({
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'role-header', type: 'reusable', role: 'header' },
          { id: 'hero-1', type: 'block', entryId: 'hero-1' },
          { id: 'story', type: 'block', entryId: 'story' },
          { id: 'role-footer', type: 'reusable', role: 'footer' },
        ],
      },
    });
  });

  it('omits the header role when header is false, and never emits the header/footer booleans', () => {
    const { templates, errors } = validate([{ ...heroSeed(), header: false }]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      { id: 'hero-1', type: 'block', entryId: 'hero-1' },
      { id: 'role-footer', type: 'reusable', role: 'footer' },
    ]);
    expect(templates[0]).not.toHaveProperty('header');
    expect(templates[0]).not.toHaveProperty('footer');
  });

  it('omits the footer role when footer is false', () => {
    const { templates, errors } = validate([{ ...heroSeed(), footer: false }]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout.root.children).toEqual([
      { id: 'role-header', type: 'reusable', role: 'header' },
      { id: 'hero-1', type: 'block', entryId: 'hero-1' },
    ]);
  });

  it('errors on a seed block whose data fails the block field validation the scanner applies to mock.json', () => {
    const seed = heroSeed();
    seed.blocks.push({
      id: 'gallery-1',
      apiId: 'gallery',
      data: { image: { assetId: 'demo-hero', url: '/demo/hero.png' } },
    });
    const { errors } = validate([seed]);

    expect(errors).toEqual([
      'templates[0].blocks[1].data — image: media values must be {assetId: uuid} — use preview.json for demo imagery',
    ]);
  });

  it('accepts a write-valid media seed', () => {
    const seed = heroSeed();
    seed.blocks.push({
      id: 'gallery-1',
      apiId: 'gallery',
      data: { image: { assetId: '3f0b6b3e-5f1a-4a1e-9c2f-0b6d9f8a1c22' } },
    });

    expect(validate([seed]).errors).toEqual([]);
  });

  it('errors on a seed block naming an apiId the theme does not ship', () => {
    const seed = heroSeed();
    seed.blocks = [{ id: 'gone-1', apiId: 'gone', data: {} }];

    expect(validate([seed]).errors).toEqual([
      'templates[0].blocks[0].apiId — unknown block "gone"',
    ]);
  });

  it('errors on duplicate block ids within a seed', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'hero-1', apiId: 'hero', data: { heading: 'Again' } });

    expect(validate([seed]).errors).toEqual(['templates[0].blocks[1].id — duplicate id "hero-1"']);
  });

  it('errors on a block id that is not a valid node id', () => {
    const seed = heroSeed();
    seed.blocks = [{ id: 'Hero_1', apiId: 'hero', data: {} }];

    expect(validate([seed]).errors).toEqual([
      'templates[0].blocks[0].id — invalid id "Hero_1" (expected ^[a-z][a-z0-9-]{0,47}$)',
    ]);
  });

  it('errors above eight seeds and validates only the first eight', () => {
    const seeds = Array.from({ length: 9 }, (_, index) => ({
      ...heroSeed(),
      routePattern: `/p${index}/:slug`,
    }));
    const { templates, errors } = validate(seeds);

    expect(errors).toEqual(['templates: contains 9 templates — exceeds 8']);
    expect(templates).toHaveLength(8);
  });

  it('errors on an unknown schemaApiId, an invalid routePattern and a duplicate pattern', () => {
    const { errors } = validate([
      { ...heroSeed(), schemaApiId: 'page' as DeclaredTemplateSeed['schemaApiId'] },
      { ...heroSeed(), routePattern: 'products/:slug' },
      heroSeed(),
      { ...heroSeed(), title: '  ' },
    ]);

    expect(errors).toEqual([
      'templates[0].schemaApiId — must be "catalog:product", "catalog:collection" or "home"',
      'templates[1].routePattern — invalid route pattern',
      'templates[2].routePattern — duplicate pattern "/products/:slug"',
      'templates[3].title — must contain 1..80 characters',
      'templates[3].routePattern — duplicate pattern "/products/:slug"',
    ]);
  });

  it('errors on a seed with no blocks', () => {
    const seed = heroSeed();
    seed.blocks = [];

    expect(validate([seed]).errors).toEqual(['templates[0].blocks — must declare 1..50 blocks']);
  });

  it('keeps a declared layout and checks its nodes', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'site-footer', type: 'reusable', role: 'footer' },
        ],
      },
    };
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]?.layout).toEqual(seed.layout);
  });

  it('emits only the keys the deploy decodes, dropping anything else a seed carries', () => {
    const seed = { ...heroSeed(), seededBy: 'me' } as unknown as DeclaredTemplateSeed;
    seed.blocks = [
      { id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' }, note: 'why' },
    ] as unknown as DeclaredTemplateSeed['blocks'];
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' }, gap: { normal: '16px' } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1', style: { width: '10px' } }],
      },
    } as unknown as DeclaredTemplateSeed['layout'];
    const { templates, errors } = validate([seed]);

    expect(errors).toEqual([]);
    expect(templates[0]).toEqual({
      routePattern: '/products/:slug',
      schemaApiId: 'catalog:product',
      title: 'Product',
      blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Buy this' } }],
      layout: {
        version: 1,
        root: {
          id: 'root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
        },
      },
    });
  });

  it('errors on a layout node referencing an undeclared block, an unknown role or a duplicate id', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          { id: 'hero-node', type: 'block', entryId: 'hero-1' },
          { id: 'ghost', type: 'block', entryId: 'nope' },
          { id: 'ghost', type: 'reusable', role: 'sidebar' as 'header' },
        ],
      },
    };

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout.root.children[1].entryId — no seed block with id "nope"',
      'templates[0].layout.root.children[2].id — duplicate node id "ghost"',
      'templates[0].layout.root.children[2].role — must be "header" or "footer"',
    ]);
  });

  it('errors when a declared layout leaves a seed block unplaced', () => {
    const seed = heroSeed();
    seed.blocks.push({ id: 'orphan', apiId: 'hero', data: { heading: 'Nowhere' } });
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
      },
    };

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout — seed block "orphan" is not placed in the layout',
    ]);
  });

  it('refuses a declared layout whose root is not a column flex container', () => {
    const seed = heroSeed();
    seed.layout = {
      version: 1,
      root: {
        id: 'root',
        type: 'grid',
        layout: { columns: { normal: 2 } },
        children: [{ id: 'hero-node', type: 'block', entryId: 'hero-1' }],
      },
    } as unknown as DeclaredTemplateSeed['layout'];

    expect(validate([seed]).errors).toEqual([
      'templates[0].layout.root — must be a flex container with direction.normal "column"',
    ]);
  });
});

describe('seedLayout', () => {
  it('is the layout validateTemplateSeeds generates', () => {
    const seed = heroSeed();

    expect(seedLayout(seed)).toEqual(validate([seed]).templates[0]?.layout);
  });
});

describe('scanTheme templates', () => {
  it('emits the declared templates on the manifest', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        },
      ],
    });

    expect(errors).toEqual([]);
    expect(manifest?.templates).toEqual([
      {
        routePattern: '/products/:slug',
        schemaApiId: 'catalog:product',
        title: 'Product',
        blocks: [{ id: 'hero-1', apiId: 'hero', data: { heading: 'Build faster' } }],
        layout: {
          version: 1,
          root: {
            id: 'root',
            type: 'flex',
            layout: { direction: { normal: 'column' } },
            children: [
              { id: 'role-header', type: 'reusable', role: 'header' },
              { id: 'hero-1', type: 'block', entryId: 'hero-1' },
              { id: 'role-footer', type: 'reusable', role: 'footer' },
            ],
          },
        },
      },
    ]);
  });

  it('leaves the key off the manifest when the theme declares no templates', () => {
    const { manifest, errors } = scanTheme({ themeDir: fixture('valid-theme') });

    expect(errors).toEqual([]);
    expect(manifest).not.toHaveProperty('templates');
  });

  it('fails the scan when a seed does not validate against the scanned blocks', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      templates: [
        {
          routePattern: '/products/:slug',
          schemaApiId: 'catalog:product',
          title: 'Product',
          blocks: [{ id: 'hero-1', apiId: 'missing', data: {} }],
        },
      ],
    });

    expect(manifest).toBeNull();
    expect(errors).toContain('templates[0].blocks[0].apiId — unknown block "missing"');
  });
});
